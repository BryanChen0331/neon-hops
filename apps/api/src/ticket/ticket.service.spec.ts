import { Test, TestingModule } from '@nestjs/testing';
import { TicketService } from './ticket.service';
import { TicketRedisRepository } from './repository/ticket.redis.repository';
import { TicketRepository } from './repository/ticket.repository';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Ticket, TicketStatus } from '@prisma/client';

describe('TicketService', () => {
  let service: TicketService;
  let redisRepoMock: DeepMockProxy<TicketRedisRepository>;
  let dbRepoMock: DeepMockProxy<TicketRepository>;

  beforeEach(async () => {
    redisRepoMock = mockDeep<TicketRedisRepository>();
    dbRepoMock = mockDeep<TicketRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: TicketRedisRepository, useValue: redisRepoMock },
        { provide: TicketRepository, useValue: dbRepoMock },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
  });

  describe('purchaseTicket', () => {
    const userId = 'user-uuid';
    const poolId = 'pool-uuid';
    const designId = 'design-uuid';

    it('should purchase ticket successfully (Happy Path)', async () => {
      // Arrange
      redisRepoMock.tryReserveStock.mockResolvedValue(1);

      const mockTicket = {
        id: 'ticket-id',
        status: TicketStatus.VALID,
        userId,
        poolId,
        designId,
        qrCode: 'mock-qr',
        usedAt: null,
        createdAt: new Date(),
      } as unknown as Ticket;

      dbRepoMock.createTicketWithOptimisticLock.mockResolvedValue(mockTicket);

      // Act
      const result = await service.purchaseTicket(userId, poolId, designId);

      // Assert
      expect(result).toEqual(mockTicket);

      const redisCallOrder = redisRepoMock.tryReserveStock.mock.invocationCallOrder[0];
      const dbCallOrder = dbRepoMock.createTicketWithOptimisticLock.mock.invocationCallOrder[0];
      expect(redisCallOrder).toBeLessThan(dbCallOrder);
    });

    it('should throw BadRequestException when sold out (Redis returns -1)', async () => {
      // Arrange
      redisRepoMock.tryReserveStock.mockResolvedValue(-1);

      // Act & Assert
      await expect(service.purchaseTicket(userId, poolId, designId)).rejects.toThrow(
        BadRequestException
      );

      // Verify
      /* eslint-disable @typescript-eslint/unbound-method */
      expect(dbRepoMock.createTicketWithOptimisticLock).not.toHaveBeenCalled();
      /* eslint-enable @typescript-eslint/unbound-method */
    });

    it('should throw ConflictException when duplicate purchase (Redis returns -2)', async () => {
      // Arrange
      redisRepoMock.tryReserveStock.mockResolvedValue(-2);

      // Act & Assert
      await expect(service.purchaseTicket(userId, poolId, designId)).rejects.toThrow(
        ConflictException
      );
    });

    it('should rollback Redis when DB fails (Atomic Rollback) with correct order', async () => {
      // Arrange
      redisRepoMock.tryReserveStock.mockResolvedValue(1);
      // 模擬 DB 拋出一般系統錯誤
      dbRepoMock.createTicketWithOptimisticLock.mockRejectedValue(new Error('Random DB Error'));

      // Act & Assert
      await expect(service.purchaseTicket(userId, poolId, designId)).rejects.toThrow(
        InternalServerErrorException
      );

      // Verify
      /* eslint-disable @typescript-eslint/unbound-method */
      expect(redisRepoMock.rollbackStock).toHaveBeenCalledWith(userId, poolId);

      const dbCallOrder = dbRepoMock.createTicketWithOptimisticLock.mock.invocationCallOrder[0];
      const rollbackCallOrder = redisRepoMock.rollbackStock.mock.invocationCallOrder[0];

      expect(dbCallOrder).toBeLessThan(rollbackCallOrder);
      /* eslint-enable @typescript-eslint/unbound-method */
    });

    it('should NOT rollback Redis when DB throws ConflictException (P2002)', async () => {
      // Arrange
      redisRepoMock.tryReserveStock.mockResolvedValue(1);

      // Repository 已經將 Prisma 錯誤轉為 ConflictException
      dbRepoMock.createTicketWithOptimisticLock.mockRejectedValue(
        new ConflictException('Duplicate')
      );

      // Act & Assert
      await expect(service.purchaseTicket(userId, poolId, designId)).rejects.toThrow(
        ConflictException
      );

      // Verify
      /* eslint-disable @typescript-eslint/unbound-method */
      expect(redisRepoMock.rollbackStock).not.toHaveBeenCalled();
      /* eslint-enable @typescript-eslint/unbound-method */
    });
  });
});
