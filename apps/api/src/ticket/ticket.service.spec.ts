import { Test, TestingModule } from '@nestjs/testing';
import { TicketService } from './ticket.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, Ticket } from '@prisma/client'; // 修正：移除未使用的 TicketPool
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

  it('should purchase ticket successfully when stock is available (Lua=1)', async () => {
    // Arrange
    const userId = 'user-uuid';
    const poolId = 'pool-uuid';
    const designId = 'design-uuid';

    // 1. Mock Redis Lua (eval) 回傳 1 (成功)
    (redisMock.eval as jest.Mock).mockResolvedValue(1);

    // 2. Mock Transaction
    (prismaMock.$transaction as jest.Mock).mockImplementation(
      (callback: (client: PrismaClient) => Promise<unknown>) => {
        return callback(prismaMock);
      }
    );

    // 3. Mock Prisma updateMany
    prismaMock.ticketPool.updateMany.mockResolvedValue({
      count: 1,
    });

    // 4. Mock Prisma create
    prismaMock.ticket.create.mockResolvedValue({
      id: 'new-ticket-id',
      status: 'VALID',
    } as unknown as Ticket);

    // Act
    const result = await service.purchaseTicket(userId, poolId, designId);

    // Assert
    expect(result.id).toBe('new-ticket-id');

    // 修正：補上 ESLint 忽略註解，解決 unbound-method 紅字
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(redisMock.eval).toHaveBeenCalled();
    expect(prismaMock.ticketPool.updateMany).toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('should throw BadRequestException when redis stock is empty (Lua=-1)', async () => {
    // Arrange
    (redisMock.eval as jest.Mock).mockResolvedValue(-1);

    // Act & Assert
    await expect(service.purchaseTicket('u1', 'p1', 'd1')).rejects.toThrow(BadRequestException);

    // Verify
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('should throw ConflictException when user already bought (Lua=-2)', async () => {
    // Arrange
    (redisMock.eval as jest.Mock).mockResolvedValue(-2);

    // Act & Assert
    await expect(service.purchaseTicket('u1', 'p1', 'd1')).rejects.toThrow(ConflictException);

    // Verify
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });
});
