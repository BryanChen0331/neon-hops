import { Test, TestingModule } from '@nestjs/testing';
import { LabelService } from './label.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

describe('LabelService', () => {
  let service: LabelService;
  let prismaMock: DeepMockProxy<PrismaClient>;
  let redisMock: DeepMockProxy<Redis>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClient>();
    redisMock = mockDeep<Redis>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<LabelService>(LabelService);
  });

  /* eslint-disable @typescript-eslint/unbound-method */
  describe('queueLabel (Producer)', () => {
    it('should push data to redis list (RPUSH)', async () => {
      const dto = { userId: 'uuid', imageUrl: 'http://img.com' };
      redisMock.rpush.mockResolvedValue(1);

      const result = await service.queueLabel(dto);

      expect(result.status).toBe('queued');
      expect(redisMock.rpush).toHaveBeenCalledWith(
        'label:upload:queue',
        expect.stringContaining(dto.userId)
      );
    });
  });

  describe('processLabelQueue (Consumer)', () => {
    it('should batch process items from redis to db (LPOP Count)', async () => {
      const mockRedisData = [
        JSON.stringify({ userId: 'u1', imageUrl: 'img1' }),
        JSON.stringify({ userId: 'u2', imageUrl: 'img2' }),
      ];

      // Fix 3: 使用正確的型別斷言取代 @ts-ignore
      (redisMock.lpop as jest.Mock).mockResolvedValue(mockRedisData);

      await service.processLabelQueue();

      expect(prismaMock.labelDesign.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'u1', imageUrl: 'img1' },
          { userId: 'u2', imageUrl: 'img2' },
        ],
        skipDuplicates: true,
      });
    });

    it('should handle invalid JSON gracefully', async () => {
      const mockRedisData = [JSON.stringify({ userId: 'u1', imageUrl: 'img1' }), '{ bad json }'];
      (redisMock.lpop as jest.Mock).mockResolvedValue(mockRedisData);

      await service.processLabelQueue();

      expect(prismaMock.labelDesign.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'u1', imageUrl: 'img1' }],
        skipDuplicates: true,
      });
    });

    it('should do nothing if queue is empty', async () => {
      (redisMock.lpop as jest.Mock).mockResolvedValue(null);

      await service.processLabelQueue();

      expect(prismaMock.labelDesign.createMany).not.toHaveBeenCalled();
    });
  });
  /* eslint-enable @typescript-eslint/unbound-method */
});
