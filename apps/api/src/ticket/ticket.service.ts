import {
  Inject,
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  async purchaseTicket(userId: string, poolId: string, designId: string) {
    const stockKey = `ticket:pool:${poolId}:stock`;
    const buyersKey = `ticket:pool:${poolId}:buyers`;

    // 1. Redis 原子預扣 (Lua Script)
    const luaScript = `
      if redis.call('sismember', KEYS[2], ARGV[1]) == 1 then
        return -2
      end
      local stock = tonumber(redis.call('get', KEYS[1]) or '0')
      if stock > 0 then
        redis.call('decr', KEYS[1])
        redis.call('sadd', KEYS[2], ARGV[1])
        return 1
      else
        return -1
      end
    `;

    const result = (await this.redis.eval(luaScript, 2, stockKey, buyersKey, userId)) as number;

    if (result === -1) {
      throw new BadRequestException('Sold out');
    }
    if (result === -2) {
      throw new ConflictException('You have already purchased a ticket');
    }

    // 2. 進入 DB 交易
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.ticketPool.updateMany({
          where: {
            id: poolId,
            remainingCount: { gt: 0 },
          },
          data: {
            remainingCount: { decrement: 1 },
            version: { increment: 1 },
          },
        });

        if (count === 0) {
          throw new Error('DB_SOLD_OUT');
        }

        return await tx.ticket.create({
          data: {
            userId,
            poolId,
            designId,
            // 修正：強制轉型為 string，消除 ESLint 的 Unsafe assignment 警告
            qrCode: uuidv4(),
          },
        });
      });
    } catch (rawError: unknown) {
      // <--- 修正：使用 unknown
      // 將 unknown 轉型為標準 Error 以讀取 message
      const error = rawError as Error;

      this.logger.error(`Purchase failed for user ${userId}: ${error.message}`);

      // 3. 錯誤處理與原子回滾

      // 情境 A: P2002 (重複購買)
      // 使用 instanceof 檢查是否為 Prisma 錯誤
      if (rawError instanceof Prisma.PrismaClientKnownRequestError && rawError.code === 'P2002') {
        throw new ConflictException('You have already purchased a ticket (DB Check)');
      }

      // 其他錯誤 -> 執行原子回滾
      await this.rollbackRedis(stockKey, buyersKey, userId);

      if (error.message === 'DB_SOLD_OUT') {
        throw new BadRequestException('Sold out (DB Sync)');
      }

      throw new InternalServerErrorException('System busy, please try again');
    }
  }

  private async rollbackRedis(stockKey: string, buyersKey: string, userId: string) {
    const rollbackScript = `
      redis.call('incr', KEYS[1])
      redis.call('srem', KEYS[2], ARGV[1])
      return 1
    `;
    try {
      await this.redis.eval(rollbackScript, 2, stockKey, buyersKey, userId);
    } catch (e) {
      this.logger.error(`CRITICAL: Failed to rollback Redis for user ${userId}`, e);
    }
  }

  async initializeStock(poolId: string, count: number) {
    const stockKey = `ticket:pool:${poolId}:stock`;
    const buyersKey = `ticket:pool:${poolId}:buyers`;
    const lockKey = `lock:init:${poolId}`;

    const acquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

    if (!acquired) {
      throw new BadRequestException('Another initialization in progress');
    }

    try {
      const pool = await this.prisma.ticketPool.findUnique({ where: { id: poolId } });
      if (!pool) {
        throw new BadRequestException('Ticket Pool not found');
      }

      await this.prisma.ticketPool.update({
        where: { id: poolId },
        data: { remainingCount: count, totalCount: count },
      });

      const pipeline = this.redis.multi();
      pipeline.set(stockKey, count);
      pipeline.del(buyersKey);
      await pipeline.exec();
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
