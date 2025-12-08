import { Test, TestingModule } from '@nestjs/testing';
import { LabelQueueRepository } from '../label-queue.repository';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import Redis, { ChainableCommander } from 'ioredis';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { LabelQueuePayload } from '../../types/label.types';

describe('LabelQueueRepository', () => {
  let repository: LabelQueueRepository;
  let redisMock: DeepMockProxy<Redis>;

  beforeEach(async () => {
    redisMock = mockDeep<Redis>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [LabelQueueRepository, { provide: REDIS_CLIENT, useValue: redisMock }],
    }).compile();

    repository = module.get<LabelQueueRepository>(LabelQueueRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueue', () => {
    it('should push payload to queue', async () => {
      const payload: LabelQueuePayload = {
        taskId: 't1',
        userId: 'u1',
        imageUrl: 'https://img.com/1.png',
        timestamp: Date.now(),
        retryCount: 0,
      };

      redisMock.rpush.mockResolvedValue(1);

      await repository.enqueue(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(redisMock.rpush).toHaveBeenCalledWith('label:upload:queue', JSON.stringify(payload));
    });

    it('should throw error if Redis fails', async () => {
      const payload: LabelQueuePayload = {
        taskId: 't1',
        userId: 'u1',
        imageUrl: 'https://img.com/1.png',
        timestamp: Date.now(),
        retryCount: 0,
      };

      redisMock.rpush.mockRejectedValue(new Error('Redis down'));

      await expect(repository.enqueue(payload)).rejects.toThrow('Failed to enqueue task to Redis');
    });
  });

  describe('dequeueBatch', () => {
    it('should dequeue batch using pipeline', async () => {
      const mockPayloads = [
        JSON.stringify({
          taskId: 't1',
          userId: 'u1',
          imageUrl: 'img1',
          timestamp: 1,
          retryCount: 0,
        }),
        JSON.stringify({
          taskId: 't2',
          userId: 'u2',
          imageUrl: 'img2',
          timestamp: 1,
          retryCount: 0,
        }),
      ];

      // 🚀 Fix: 使用 mockDeep 建立 Pipeline Mock，確保型別正確
      const pipelineMock = mockDeep<ChainableCommander>();

      // 設定 Chaining 行為 (return this)
      pipelineMock.lpop.mockReturnThis();

      const emptyResults = Array(48).fill([null, null]) as [null, null][];

      // 設定 exec 回傳值 (注意 ioredis 的結構是 [error, result])
      pipelineMock.exec.mockResolvedValue([
        [null, mockPayloads[0]],
        [null, mockPayloads[1]],
        // 模擬其餘為 null (空)
        ...emptyResults,
      ]);

      redisMock.pipeline.mockReturnValue(pipelineMock);

      const result = await repository.dequeueBatch(50);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(redisMock.pipeline).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(pipelineMock.lpop).toHaveBeenCalledTimes(50);
      expect(result).toHaveLength(2);
      expect(result[0].taskId).toBe('t1');
    });

    it('should handle JSON parse errors gracefully', async () => {
      const pipelineMock = mockDeep<ChainableCommander>();
      pipelineMock.lpop.mockReturnThis();
      pipelineMock.exec.mockResolvedValue([
        [null, 'invalid json'],
        [null, '{"valid": "json", "taskId": "t1"}'], // 這是無效的 Payload (缺 userId)，Repository 只負責轉 JSON
      ]);

      redisMock.pipeline.mockReturnValue(pipelineMock);

      const result = await repository.dequeueBatch(2);

      // Repository 層只負責 JSON.parse，不管 Schema，所以這裡會有一筆 (雖然是不完整的)
      // Service 層的 Validator 才會擋下它
      expect(result).toHaveLength(1);
    });
  });

  describe('requeueToHead', () => {
    it('should push items back to queue head in reverse order', async () => {
      const payloads: LabelQueuePayload[] = [
        { taskId: 't1', userId: 'u1', imageUrl: 'img1', timestamp: 1, retryCount: 1 },
        { taskId: 't2', userId: 'u2', imageUrl: 'img2', timestamp: 1, retryCount: 1 },
      ];

      const pipelineMock = mockDeep<ChainableCommander>();
      pipelineMock.lpush.mockReturnThis();
      pipelineMock.exec.mockResolvedValue([
        [null, 1],
        [null, 2],
      ]);

      redisMock.pipeline.mockReturnValue(pipelineMock);

      await repository.requeueToHead(payloads);

      // 應該反向推入以保持順序
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(pipelineMock.lpush).toHaveBeenNthCalledWith(
        1,
        'label:upload:queue',
        JSON.stringify(payloads[1])
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(pipelineMock.lpush).toHaveBeenNthCalledWith(
        2,
        'label:upload:queue',
        JSON.stringify(payloads[0])
      );
    });
  });

  describe('acquireLock', () => {
    it('should acquire lock successfully', async () => {
      redisMock.set.mockResolvedValue('OK');

      const result = await repository.acquireLock('test-lock', 30);

      expect(result).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(redisMock.set).toHaveBeenCalledWith('test-lock', expect.any(String), 'EX', 30, 'NX');
    });

    it('should fail to acquire lock if already held', async () => {
      redisMock.set.mockResolvedValue(null);

      const result = await repository.acquireLock('test-lock', 30);

      expect(result).toBe(false);
    });
  });
});
