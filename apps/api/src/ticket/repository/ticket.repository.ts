import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createTicketWithOptimisticLock(userId: string, poolId: string, designId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. 樂觀鎖扣庫存
        const { count } = await tx.ticketPool.updateMany({
          where: { id: poolId, remainingCount: { gt: 0 } },
          data: {
            remainingCount: { decrement: 1 },
            version: { increment: 1 },
          },
        });

        if (count === 0) {
          // 修正：直接拋出具體的 HTTP Exception，避免 Service 層依賴字串比對
          throw new BadRequestException('Sold out (DB Sync)');
        }

        // 2. 建立票券
        return await tx.ticket.create({
          data: {
            userId,
            poolId,
            designId,
            qrCode: uuidv4(),
          },
        });
      });
    } catch (error) {
      // 處理 P2002 重複購買
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already purchased a ticket (DB Check)');
      }
      // 其他錯誤直接往上拋 (包含剛剛的 BadRequestException)
      throw error;
    }
  }

  async findPoolOrThrow(poolId: string) {
    const pool = await this.prisma.ticketPool.findUnique({
      where: { id: poolId },
    });
    if (!pool) throw new Error('POOL_NOT_FOUND');
    return pool;
  }

  async resetPoolStock(poolId: string, count: number) {
    await this.prisma.ticketPool.update({
      where: { id: poolId },
      data: { remainingCount: count, totalCount: count },
    });
  }
}
