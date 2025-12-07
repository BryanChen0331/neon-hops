import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { TicketRedisRepository } from './repository/ticket.redis.repository';
import { TicketRepository } from './repository/ticket.repository';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly redisRepo: TicketRedisRepository,
    private readonly dbRepo: TicketRepository
  ) {}

  async purchaseTicket(userId: string, poolId: string, designId: string) {
    // 1. Redis Gatekeeper
    const result = await this.redisRepo.tryReserveStock(userId, poolId);

    if (result === -1) throw new BadRequestException('Sold out');
    if (result === -2) {
      throw new ConflictException('You have already purchased a ticket');
    }

    // 2. DB Persistence
    try {
      return await this.dbRepo.createTicketWithOptimisticLock(userId, poolId, designId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Purchase failed for user ${userId}: ${errorMsg}`);

      // 3. Compensation

      // 重複購買不需回滾 Redis
      if (error instanceof ConflictException) {
        throw error;
      }

      // 執行原子回滾
      await this.redisRepo.rollbackStock(userId, poolId);

      // 如果是已知的 HTTP Exception (如 Sold out)，直接往外拋
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException('System busy, please try again');
    }
  }

  async initializeStock(poolId: string, count: number) {
    const success = await this.redisRepo.initializeStockWithLock(poolId, count, async () => {
      await this.dbRepo.findPoolOrThrow(poolId).catch(() => {
        throw new BadRequestException('Ticket Pool not found');
      });
      await this.dbRepo.resetPoolStock(poolId, count);
    });

    if (!success) {
      throw new BadRequestException('Another initialization in progress');
    }
  }
}
