// Message queue service for handling background persistence and recovery

export interface PendingMessage {
  id: string;
  sessionId: string;
  message: any;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  timestamp: number;
  retryCount: number;
}

const STORAGE_KEY = 'arc_pending_messages';
const MAX_RETRIES = 3;

class MessageQueueService {
  private queue: PendingMessage[] = [];

  constructor() {
    this.loadQueue();
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load message queue:', e);
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.error('Failed to save message queue:', e);
    }
  }

  addMessage(sessionId: string, message: any): string {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const pendingMsg: PendingMessage = {
      id,
      sessionId,
      message,
      status: 'pending',
      timestamp: Date.now(),
      retryCount: 0,
    };
    this.queue.push(pendingMsg);
    this.saveQueue();
    return id;
  }

  updateStatus(id: string, status: PendingMessage['status']) {
    const msg = this.queue.find(m => m.id === id);
    if (msg) {
      msg.status = status;
      this.saveQueue();
    }
  }

  incrementRetry(id: string): boolean {
    const msg = this.queue.find(m => m.id === id);
    if (msg) {
      msg.retryCount++;
      if (msg.retryCount >= MAX_RETRIES) {
        msg.status = 'failed';
        this.saveQueue();
        return false; // Don't retry anymore
      }
      msg.status = 'pending';
      this.saveQueue();
      return true; // Can retry
    }
    return false;
  }

  removeMessage(id: string) {
    this.queue = this.queue.filter(m => m.id !== id);
    this.saveQueue();
  }

  getPendingMessages(): PendingMessage[] {
    return this.queue.filter(m => m.status === 'pending' || m.status === 'failed');
  }

  getAllMessages(): PendingMessage[] {
    return [...this.queue];
  }

  clearQueue() {
    this.queue = [];
    this.saveQueue();
  }

  // Clean up old successful messages (older than 1 hour)
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.queue = this.queue.filter(m => 
      m.status !== 'sent' || m.timestamp > oneHourAgo
    );
    this.saveQueue();
  }
}

export const messageQueue = new MessageQueueService();
