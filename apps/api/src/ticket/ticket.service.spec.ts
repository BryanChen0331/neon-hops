import { Test, TestingModule } from '@nestjs/testing';
import { TicketService } from './ticket.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, Ticket, TicketPool } from '@prisma/client';
import Redis from 'ioredis';

describe('TicketService', () => {
  let service: TicketService;
  let prismaMock: DeepMockProxy<PrismaClient>;
  let redisMock: DeepMockProxy<Redis>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClient>();
    redisMock = mockDeep<Redis>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
  });

  it('should purchase ticket successfully when stock is available', async () => {
    // Arrange
    const userId = 'user-uuid';
    const poolId = 'pool-uuid';
    const designId = 'design-uuid';

    redisMock.decr.mockResolvedValue(9);

    (prismaMock.$transaction as jest.Mock).mockImplementation(
      (callback: (client: PrismaClient) => Promise<unknown>) => {
        return callback(prismaMock);
      }
    );

    // Mock Prisma 回傳值
    prismaMock.ticketPool.update.mockResolvedValue({
      id: poolId,
      remainingCount: 9,
    } as unknown as TicketPool);

    prismaMock.ticket.create.mockResolvedValue({
      id: 'new-ticket-id',
      status: 'VALID',
    } as unknown as Ticket);

    // Act
    const result = await service.purchaseTicket(userId, poolId, designId);

    // Assert
    expect(result.id).toBe('new-ticket-id');

    /* eslint-disable @typescript-eslint/unbound-method */
    expect(redisMock.decr).toHaveBeenCalledWith(`ticket:pool:${poolId}:stock`);
    expect(prismaMock.ticket.create).toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('should throw BadRequestException when redis stock is empty', async () => {
    // Arrange
    redisMock.decr.mockResolvedValue(-1);

    // Act & Assert
    await expect(service.purchaseTicket('u1', 'p1', 'd1')).rejects.toThrow(BadRequestException);

    // Verify
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });
});
