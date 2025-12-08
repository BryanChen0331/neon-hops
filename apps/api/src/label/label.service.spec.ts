import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { LabelService } from './label.service';
import {
  ILabelQueueRepository,
  ILabelDataRepository,
  ILabelValidator,
} from './interfaces/label.interfaces';
import { LABEL_QUEUE_REPO, LABEL_DATA_REPO, LABEL_VALIDATOR } from './label.constants';
import { LabelQueuePayload } from './types/label.types';
import { SaveLabelDto } from './dto/save-label.dto';

describe('LabelService', () => {
  let service: LabelService;
  let queueRepoMock: DeepMockProxy<ILabelQueueRepository>;
  let dataRepoMock: DeepMockProxy<ILabelDataRepository>;
  let validatorMock: DeepMockProxy<ILabelValidator>;

  beforeEach(async () => {
    // 創建 Mock 實現
    queueRepoMock = mockDeep<ILabelQueueRepository>();
    dataRepoMock = mockDeep<ILabelDataRepository>();
    validatorMock = mockDeep<ILabelValidator>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelService,
        // 使用常數 Token 確保 DI 正確
        { provide: LABEL_QUEUE_REPO, useValue: queueRepoMock },
        { provide: LABEL_DATA_REPO, useValue: dataRepoMock },
        { provide: LABEL_VALIDATOR, useValue: validatorMock },
      ],
    }).compile();

    service = module.get<LabelService>(LabelService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('queueLabel', () => {
    it('should enqueue label with taskId and return response', async () => {
      // Arrange
      const userId = 'user-123';
      const dto: SaveLabelDto = { imageUrl: 'https://cdn.example.com/image.png' };

      queueRepoMock.enqueue.mockResolvedValue();

      // Act
      const result = await service.queueLabel(userId, dto);

      // Assert
      expect(result.status).toBe('queued');
      expect(result.taskId).toBeDefined();
      expect(result.message).toBe('Label is processing in background');

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          imageUrl: dto.imageUrl,
          retryCount: 0,
          taskId: expect.any(String) as unknown as string,
          timestamp: expect.any(Number) as unknown as string,
        })
      );
    });

    it('should propagate errors from queue repository', async () => {
      queueRepoMock.enqueue.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        service.queueLabel('user-123', {
          imageUrl: 'https://cdn.example.com/image.png',
        })
      ).rejects.toThrow('Redis connection failed');
    });
  });

  describe('processLabelQueue', () => {
    const mockPayload1: LabelQueuePayload = {
      taskId: 't1',
      userId: 'u1',
      imageUrl: 'https://img.com/1.png',
      timestamp: Date.now(),
      retryCount: 0,
    };

    const mockPayload2: LabelQueuePayload = {
      taskId: 't2',
      userId: 'u2',
      imageUrl: 'https://img.com/2.png',
      timestamp: Date.now(),
      retryCount: 0,
    };

    it('should skip if cannot acquire lock', async () => {
      queueRepoMock.acquireLock.mockResolvedValue(false);

      await service.processLabelQueue();

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.acquireLock).toHaveBeenCalledWith('label:processing:lock', 30);
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.dequeueBatch).not.toHaveBeenCalled();
    });

    it('should process valid payloads and save to database', async () => {
      queueRepoMock.acquireLock.mockResolvedValue(true);
      queueRepoMock.dequeueBatch.mockResolvedValue([mockPayload1, mockPayload2]);
      queueRepoMock.releaseLock.mockResolvedValue();

      // Mock Validator 行為
      validatorMock.isValidPayload.mockReturnValue(true);
      validatorMock.isExpired.mockReturnValue(false);

      dataRepoMock.createMany.mockResolvedValue();

      await service.processLabelQueue();

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.dequeueBatch).toHaveBeenCalledWith(50);
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(validatorMock.isValidPayload).toHaveBeenCalledTimes(2);
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(dataRepoMock.createMany).toHaveBeenCalledWith([
        { userId: 'u1', imageUrl: 'https://img.com/1.png' },
        { userId: 'u2', imageUrl: 'https://img.com/2.png' },
      ]);
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.releaseLock).toHaveBeenCalled();
    });

    it('should skip invalid payloads', async () => {
      const invalidPayload = {
        ...mockPayload1,
        imageUrl: 'not-a-url',
      } as unknown as LabelQueuePayload;

      queueRepoMock.acquireLock.mockResolvedValue(true);
      queueRepoMock.dequeueBatch.mockResolvedValue([mockPayload1, invalidPayload]);
      queueRepoMock.releaseLock.mockResolvedValue();

      validatorMock.isValidPayload
        .mockReturnValueOnce(true) // mockPayload1
        .mockReturnValueOnce(false); // invalidPayload

      validatorMock.isExpired.mockReturnValue(false);
      dataRepoMock.createMany.mockResolvedValue();

      await service.processLabelQueue();

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(dataRepoMock.createMany).toHaveBeenCalledWith([
        { userId: 'u1', imageUrl: 'https://img.com/1.png' },
      ]);
    });

    it('should move expired payloads to DLQ', async () => {
      const expiredPayload = {
        ...mockPayload1,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8天前
      };

      queueRepoMock.acquireLock.mockResolvedValue(true);
      queueRepoMock.dequeueBatch.mockResolvedValue([expiredPayload]);
      queueRepoMock.releaseLock.mockResolvedValue();
      queueRepoMock.moveToDeadLetterQueue.mockResolvedValue();

      validatorMock.isValidPayload.mockReturnValue(true);
      validatorMock.isExpired.mockReturnValue(true);

      await service.processLabelQueue();

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.moveToDeadLetterQueue).toHaveBeenCalledWith([expiredPayload]);
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(dataRepoMock.createMany).not.toHaveBeenCalled();
    });

    it('should requeue items when DB save fails (retry logic)', async () => {
      queueRepoMock.acquireLock.mockResolvedValue(true);
      queueRepoMock.dequeueBatch.mockResolvedValue([mockPayload1]);
      queueRepoMock.releaseLock.mockResolvedValue();
      queueRepoMock.requeueToHead.mockResolvedValue();

      validatorMock.isValidPayload.mockReturnValue(true);
      validatorMock.isExpired.mockReturnValue(false);

      dataRepoMock.createMany.mockRejectedValue(new Error('DB connection failed'));

      await service.processLabelQueue();

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.requeueToHead).toHaveBeenCalledWith([
        { ...mockPayload1, retryCount: 1 },
      ]);
    });

    it('should move to DLQ after max retries', async () => {
      const maxRetriedPayload = { ...mockPayload1, retryCount: 3 }; // 已重試3次

      queueRepoMock.acquireLock.mockResolvedValue(true);
      queueRepoMock.dequeueBatch.mockResolvedValue([maxRetriedPayload]);
      queueRepoMock.releaseLock.mockResolvedValue();
      queueRepoMock.moveToDeadLetterQueue.mockResolvedValue();

      validatorMock.isValidPayload.mockReturnValue(true);
      validatorMock.isExpired.mockReturnValue(false);

      dataRepoMock.createMany.mockRejectedValue(new Error('DB connection failed'));

      await service.processLabelQueue();

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.moveToDeadLetterQueue).toHaveBeenCalledWith([maxRetriedPayload]);
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.requeueToHead).not.toHaveBeenCalled();
    });

    it('should release lock even if processing fails', async () => {
      queueRepoMock.acquireLock.mockResolvedValue(true);
      queueRepoMock.dequeueBatch.mockRejectedValue(new Error('Redis error'));
      queueRepoMock.releaseLock.mockResolvedValue();

      await service.processLabelQueue();

      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      expect(queueRepoMock.releaseLock).toHaveBeenCalled();
    });
  });

  describe('getQueueMetrics', () => {
    it('should return queue metrics', async () => {
      queueRepoMock.getQueueLength.mockResolvedValue(150);
      queueRepoMock.getDeadLetterQueueLength.mockResolvedValue(5);

      const metrics = await service.getQueueMetrics();

      expect(metrics).toEqual({
        queueLength: 150,
        dlqLength: 5,
        isProcessing: false,
        batchSize: 50,
        estimatedWaitTime: 15,
      });
    });
  });
});
