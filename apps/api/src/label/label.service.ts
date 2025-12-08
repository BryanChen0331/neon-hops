import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { SaveLabelDto } from './dto/save-label.dto';
import type {
  ILabelQueueRepository,
  ILabelDataRepository,
  ILabelValidator,
} from './interfaces/label.interfaces';
import { LabelQueuePayload, QueuedLabelResponse, QueueMetrics } from './types/label.types';
import { LABEL_DATA_REPO, LABEL_QUEUE_REPO, LABEL_VALIDATOR } from './label.constants';

@Injectable()
export class LabelService {
  private readonly logger = new Logger(LabelService.name);
  private readonly BATCH_SIZE = 50;
  private readonly MAX_RETRIES = 3;
  private readonly MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  private readonly LOCK_KEY = 'label:processing:lock';
  private readonly LOCK_TTL = 30;

  constructor(
    @Inject(LABEL_QUEUE_REPO) private readonly queueRepo: ILabelQueueRepository,
    @Inject(LABEL_DATA_REPO) private readonly dataRepo: ILabelDataRepository,
    @Inject(LABEL_VALIDATOR) private readonly validator: ILabelValidator
  ) {}

  async queueLabel(userId: string, dto: SaveLabelDto): Promise<QueuedLabelResponse> {
    const payload: LabelQueuePayload = {
      taskId: uuidv4(),
      userId,
      imageUrl: dto.imageUrl,
      timestamp: Date.now(),
      retryCount: 0,
    };

    await this.queueRepo.enqueue(payload);

    return {
      status: 'queued',
      taskId: payload.taskId,
      message: 'Label is processing in background',
    };
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processLabelQueue(): Promise<void> {
    const acquired = await this.queueRepo.acquireLock(this.LOCK_KEY, this.LOCK_TTL);

    if (!acquired) {
      this.logger.debug('⏭️ Could not acquire lock, skipping this run...');
      return;
    }

    try {
      const rawPayloads = await this.queueRepo.dequeueBatch(this.BATCH_SIZE);

      if (rawPayloads.length === 0) return;

      const { valid, invalid, expired } = this.classifyPayloads(rawPayloads);

      if (invalid.length > 0) {
        this.logger.warn(`⚠️ Skipped ${invalid.length} invalid payloads`);
      }

      if (expired.length > 0) {
        this.logger.warn(`⏰ Skipped ${expired.length} expired payloads`);
        await this.queueRepo.moveToDeadLetterQueue(expired);
      }

      if (valid.length === 0) return;

      await this.saveToDatabase(valid);
    } catch (error) {
      this.logger.error('❌ Critical error in consumer loop', error);
    } finally {
      await this.queueRepo.releaseLock(this.LOCK_KEY);
    }
  }

  async getQueueMetrics(): Promise<QueueMetrics> {
    const [queueLength, dlqLength] = await Promise.all([
      this.queueRepo.getQueueLength(),
      this.queueRepo.getDeadLetterQueueLength(),
    ]);

    return {
      queueLength,
      dlqLength,
      isProcessing: false,
      batchSize: this.BATCH_SIZE,
      estimatedWaitTime: Math.ceil(queueLength / this.BATCH_SIZE) * 5,
    };
  }

  private classifyPayloads(payloads: LabelQueuePayload[]) {
    const valid: LabelQueuePayload[] = [];
    const invalid: unknown[] = [];
    const expired: LabelQueuePayload[] = [];

    for (const payload of payloads) {
      if (!this.validator.isValidPayload(payload)) {
        invalid.push(payload);
        continue;
      }
      if (this.validator.isExpired(payload.timestamp, this.MAX_AGE_MS)) {
        expired.push(payload);
        continue;
      }
      valid.push(payload);
    }
    return { valid, invalid, expired };
  }

  private async saveToDatabase(batch: LabelQueuePayload[]): Promise<void> {
    try {
      const createData = batch.map((item) => ({
        userId: item.userId,
        imageUrl: item.imageUrl,
      }));

      await this.dataRepo.createMany(createData);
    } catch (error) {
      this.logger.error('❌ Failed to save batch to DB', error);
      await this.handleSaveFailure(batch);
    }
  }

  private async handleSaveFailure(batch: LabelQueuePayload[]): Promise<void> {
    try {
      const toRetry: LabelQueuePayload[] = [];
      const toDLQ: LabelQueuePayload[] = [];

      for (const item of batch) {
        const nextRetryCount = item.retryCount + 1;

        if (nextRetryCount > this.MAX_RETRIES) {
          toDLQ.push(item);
          this.logger.error(
            `💀 Task ${item.taskId} moved to DLQ after ${this.MAX_RETRIES} retries`
          );
        } else {
          toRetry.push({
            ...item,
            retryCount: nextRetryCount,
          });
        }
      }

      await Promise.all([
        toRetry.length > 0 ? this.queueRepo.requeueToHead(toRetry) : Promise.resolve(),
        toDLQ.length > 0 ? this.queueRepo.moveToDeadLetterQueue(toDLQ) : Promise.resolve(),
      ]);

      if (toRetry.length > 0) {
        this.logger.warn(
          `🔄 Re-queued ${toRetry.length} items for retry (attempt ${toRetry[0].retryCount}/${this.MAX_RETRIES})`
        );
      }
    } catch (error) {
      // 如果連 Redis 都掛了，把資料印出來防止完全遺失
      this.logger.error('🔥 FATAL: Failed to recover items. RAW DATA:', JSON.stringify(batch));
      this.logger.error(error);
    }
  }
}
