import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import Redis from 'ioredis';
import { SaveLabelDto } from './dto/save-label.dto';

@Injectable()
export class LabelService {
  private readonly logger = new Logger(LabelService.name);
  private readonly QUEUE_KEY = 'label:upload:queue';
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  async queueLabel(dto: SaveLabelDto) {
    const payload = JSON.stringify(dto);
    await this.redis.rpush(this.QUEUE_KEY, payload);
    return { status: 'queued', message: 'Label is processing in background' };
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processLabelQueue() {
    // 1. 原子批量取出
    const rawItems = await this.redis.lpop(this.QUEUE_KEY, this.BATCH_SIZE);

    if (!rawItems) return;

    // Fix 1: 防禦性轉型，確保一定是陣列 (處理 ioredis 潛在的型別不一致)
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    if (items.length === 0) return;

    // 2. 安全解析
    const validData: SaveLabelDto[] = [];

    for (const raw of items) {
      try {
        const parsed = JSON.parse(raw) as unknown;

        // 確保它是一個物件，且擁有我們需要的屬性
        if (parsed && typeof parsed === 'object' && 'userId' in parsed && 'imageUrl' in parsed) {
          // 通過檢查後，才安全地轉型為 SaveLabelDto 並放入陣列
          validData.push(parsed as SaveLabelDto);
        }
      } catch {
        this.logger.error(`❌ Skipped invalid JSON in queue: ${raw}`);
      }
    }

    // 3. 批量寫入
    try {
      await this.prisma.labelDesign.createMany({
        data: validData.map((item) => ({
          userId: item.userId,
          imageUrl: item.imageUrl,
        })),
        skipDuplicates: true,
      });

      this.logger.log(`✅ Successfully saved ${validData.length} labels to DB.`);
    } catch (error) {
      this.logger.error('❌ Failed to save batch', error);

      // 在沒有 DLQ 的情況下，將失敗的資料印出，以便維運人員手動恢復
      this.logger.error(`📝 Failed Payload (Save for retry): ${JSON.stringify(validData)}`);
    }
  }
}
