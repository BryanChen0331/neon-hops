import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../../redis/redis.module';
import Redis from 'ioredis';

@Injectable()
export class TicketRedisRepository {
  private readonly logger = new Logger(TicketRedisRepository.name);

  private readonly LUA_RESERVE_STOCK = `
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

  private readonly LUA_ROLLBACK_STOCK = `
    if redis.call('sismember', KEYS[2], ARGV[1]) == 1 then
      redis.call('incr', KEYS[1])
      redis.call('srem', KEYS[2], ARGV[1])
      return 1
    end
    return 0
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getKeys(poolId: string) {
    return {
      stock: `ticket:pool:${poolId}:stock`,
      buyers: `ticket:pool:${poolId}:buyers`,
      lock: `ticket:pool:${poolId}:lock:init`,
    };
  }

  async tryReserveStock(userId: string, poolId: string): Promise<number> {
    const { stock, buyers } = this.getKeys(poolId);
    return (await this.redis.eval(this.LUA_RESERVE_STOCK, 2, stock, buyers, userId)) as number;
  }

  async rollbackStock(userId: string, poolId: string): Promise<void> {
    const { stock, buyers } = this.getKeys(poolId);
    try {
      await this.redis.eval(this.LUA_ROLLBACK_STOCK, 2, stock, buyers, userId);
    } catch (error) {
      // 修正：正確處理 Error 物件，避免 log 出現 [object Object]
      const errorMessage = error instanceof Error ? error.stack : JSON.stringify(error);
      this.logger.error(
        `CRITICAL: Redis rollback failed for user ${userId} pool ${poolId}`,
        errorMessage
      );
    }
  }

  /**
   * 回傳 true 代表成功執行初始化，false 代表鎖獲取失敗
   */
  async initializeStockWithLock(
    poolId: string,
    count: number,
    callback: () => Promise<void>
  ): Promise<boolean> {
    const { stock, buyers, lock } = this.getKeys(poolId);

    const acquired = await this.redis.set(lock, '1', 'EX', 30, 'NX');
    if (!acquired) return false;

    try {
      await callback();

      const pipeline = this.redis.multi();
      pipeline.set(stock, count);
      pipeline.del(buyers);
      await pipeline.exec();

      return true;
    } finally {
      await this.redis.del(lock);
    }
  }
}
