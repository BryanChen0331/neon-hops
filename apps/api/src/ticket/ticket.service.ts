import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import Redis from 'ioredis';

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  async purchaseTicket(userId: string, poolId: string, designId: string) {
    const redisKey = `ticket:pool:${poolId}:stock`;

    const stock = await this.redis.decr(redisKey);

    if (stock < 0) {
      throw new BadRequestException('Sold out');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.ticketPool.update({
          where: { id: poolId, remainingCount: { gt: 0 } },
          data: {
            remainingCount: { decrement: 1 },
            version: { increment: 1 },
          },
        });

        return await tx.ticket.create({
          data: {
            userId,
            poolId,
            qrCode: `${userId}-${poolId}-${Date.now()}`,
            designId,
          },
        });
      });
    } catch {
      await this.redis.incr(redisKey);
      throw new BadRequestException('System busy, please try again');
    }
  }

  async initializeStock(poolId: string, count: number) {
    await this.redis.set(`ticket:pool:${poolId}:stock`, count);
  }
}
