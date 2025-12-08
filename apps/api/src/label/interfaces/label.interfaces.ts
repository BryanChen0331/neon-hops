import { LabelQueuePayload, LabelCreateData } from '../types/label.types';

/**
 * 隊列倉儲接口 - 負責 Redis 操作
 */
export interface ILabelQueueRepository {
  /**
   * 將任務加入隊列尾部
   */
  enqueue(payload: LabelQueuePayload): Promise<void>;

  /**
   * 從隊列頭部批量取出任務
   */
  dequeueBatch(batchSize: number): Promise<LabelQueuePayload[]>;

  /**
   * 將任務重新加入隊列頭部(用於重試)
   */
  requeueToHead(payloads: LabelQueuePayload[]): Promise<void>;

  /**
   * 將失敗任務移至死信隊列
   */
  moveToDeadLetterQueue(payloads: LabelQueuePayload[]): Promise<void>;

  /**
   * 獲取隊列長度
   */
  getQueueLength(): Promise<number>;

  /**
   * 獲取死信隊列長度
   */
  getDeadLetterQueueLength(): Promise<number>;

  /**
   * 獲取或設置分佈式鎖
   */
  acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean>;

  /**
   * 釋放分佈式鎖
   */
  releaseLock(lockKey: string): Promise<void>;
}

/**
 * 標籤數據倉儲接口 - 負責數據庫操作
 */
export interface ILabelDataRepository {
  /**
   * 批量創建標籤(冪等性)
   */
  createMany(data: LabelCreateData[]): Promise<void>;
}

/**
 * 驗證器接口
 */
export interface ILabelValidator {
  /**
   * 驗證隊列 Payload 是否合法
   */
  isValidPayload(obj: unknown): obj is LabelQueuePayload;

  /**
   * 驗證 URL 格式
   */
  isValidUrl(url: string): boolean;

  /**
   * 檢查任務是否過期
   */
  isExpired(timestamp: number, maxAgeMs: number): boolean;
}
