import { Injectable, Logger } from '@nestjs/common';
import { ILabelValidator } from '../interfaces/label.interfaces';
import { LabelQueuePayload } from '../types/label.types';

@Injectable()
export class LabelValidator implements ILabelValidator {
  private readonly logger = new Logger(LabelValidator.name);

  isValidPayload(obj: unknown): obj is LabelQueuePayload {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const record = obj as Record<string, unknown>;

    // 基本類型檢查
    if (
      typeof record.userId !== 'string' ||
      typeof record.imageUrl !== 'string' ||
      typeof record.taskId !== 'string' ||
      typeof record.timestamp !== 'number' ||
      typeof record.retryCount !== 'number'
    ) {
      this.logger.warn('Invalid payload structure');
      return false;
    }

    // URL 格式驗證
    if (!this.isValidUrl(record.imageUrl)) {
      this.logger.warn(`Invalid URL format: ${record.imageUrl}`);
      return false;
    }

    // 重試次數合理性檢查
    if (record.retryCount < 0 || record.retryCount > 10) {
      this.logger.warn(`Invalid retryCount: ${record.retryCount}`);
      return false;
    }

    return true;
  }

  isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      // 只允許 http/https 協議
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  isExpired(timestamp: number, maxAgeMs: number): boolean {
    const age = Date.now() - timestamp;
    return age > maxAgeMs;
  }
}
