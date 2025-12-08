import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../../redis/redis.module';
import Redis from 'ioredis';
import { ILabelQueueRepository } from '../interfaces/label.interfaces';
import { LabelQueuePayload } from '../types/label.types';

@Injectable()
export class LabelQueueRepository implements ILabelQueueRepository {
  private readonly logger = new Logger(LabelQueueRepository.name);
  private readonly QUEUE_KEY = 'label:upload:queue';
  private readonly DLQ_KEY = 'label:upload:dead_letter';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async enqueue(payload: LabelQueuePayload): Promise<void> {
    try {
      await this.redis.rpush(this.QUEUE_KEY, JSON.stringify(payload));
    } catch (error) {
      this.logger.error('Failed to enqueue task', error);
      throw new Error('Failed to enqueue task to Redis');
    }
  }

  async dequeueBatch(batchSize: number): Promise<LabelQueuePayload[]> {
    try {
      const pipeline = this.redis.pipeline();

      for (let i = 0; i < batchSize; i++) {
        pipeline.lpop(this.QUEUE_KEY);
      }

      const results = await pipeline.exec();

      const rawItems =
        results
          ?.map(([err, result]) => (err ? null : result))
          .filter((item): item is string => typeof item === 'string') || [];

      return rawItems
        .map((raw) => {
          try {
            return JSON.parse(raw) as LabelQueuePayload;
          } catch {
            this.logger.error(`Failed to parse JSON: ${raw}`);
            return null;
          }
        })
        .filter((item): item is LabelQueuePayload => item !== null);
    } catch (error) {
      this.logger.error('Failed to dequeue batch', error);
      throw new Error('Failed to dequeue batch from Redis');
    }
  }

  async requeueToHead(payloads: LabelQueuePayload[]): Promise<void> {
    if (payloads.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();

      // 反向遍歷以保持原本順序
      for (let i = payloads.length - 1; i >= 0; i--) {
        pipeline.lpush(this.QUEUE_KEY, JSON.stringify(payloads[i]));
      }

      await pipeline.exec();
      this.logger.warn(`🔄 Re-queued ${payloads.length} items to queue head`);
    } catch (error) {
      this.logger.error('💀 FATAL: Failed to re-queue items', error);
      throw new Error('Failed to re-queue items to Redis');
    }
  }

  async moveToDeadLetterQueue(payloads: LabelQueuePayload[]): Promise<void> {
    if (payloads.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();

      for (const payload of payloads) {
        const dlqEntry = {
          ...payload,
          failedAt: Date.now(),
          reason: 'Max retries exceeded',
        };
        pipeline.rpush(this.DLQ_KEY, JSON.stringify(dlqEntry));
      }

      await pipeline.exec();
      this.logger.error(`💀 Moved ${payloads.length} items to DLQ`);
    } catch (error) {
      this.logger.error('Failed to move items to DLQ', error);
      throw new Error('Failed to move items to dead letter queue');
    }
  }

  async getQueueLength(): Promise<number> {
    try {
      return await this.redis.llen(this.QUEUE_KEY);
    } catch (error) {
      this.logger.error('Failed to get queue length', error);
      return 0;
    }
  }

  async getDeadLetterQueueLength(): Promise<number> {
    try {
      return await this.redis.llen(this.DLQ_KEY);
    } catch (error) {
      this.logger.error('Failed to get DLQ length', error);
      return 0;
    }
  }

  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(lockKey, process.pid.toString(), 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error('Failed to acquire lock', error);
      return false;
    }
  }

  async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.del(lockKey);
    } catch (error) {
      this.logger.error('Failed to release lock', error);
    }
  }
}
