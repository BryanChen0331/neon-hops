export interface LabelQueuePayload {
  taskId: string;
  userId: string;
  imageUrl: string;
  timestamp: number;
  retryCount: number;
}

export interface QueueMetrics {
  queueLength: number;
  dlqLength: number;
  isProcessing: boolean;
  batchSize: number;
  estimatedWaitTime: number;
}

export interface LabelCreateData {
  userId: string;
  imageUrl: string;
}

export interface QueuedLabelResponse {
  status: 'queued';
  taskId: string;
  message: string;
}
