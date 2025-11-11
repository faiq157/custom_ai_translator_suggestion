/**
 * Processing Queue
 * Manages audio chunk processing queue to prevent dropping chunks when transcription is slow
 */

import logger from '../config/logger.js';

export class ProcessingQueue {
  constructor(maxConcurrent = 2, maxQueueSize = 10) {
    this.queue = [];
    this.processing = new Set();
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalDropped: 0,
      totalErrors: 0
    };
  }

  /**
   * Add a task to the queue
   * @param {Function} task - Async function to execute
   * @param {Object} metadata - Metadata about the task
   * @returns {Promise} Promise that resolves when task completes
   */
  async enqueue(task, metadata = {}) {
    return new Promise((resolve, reject) => {
      // Check if queue is full
      if (this.queue.length >= this.maxQueueSize) {
        logger.warn('Processing queue full, dropping oldest task', {
          queueSize: this.queue.length,
          maxSize: this.maxQueueSize,
          metadata
        });
        this.stats.totalDropped++;
        
        // Remove oldest task
        const oldest = this.queue.shift();
        if (oldest) {
          oldest.reject(new Error('Queue full, task dropped'));
        }
      }

      const queueItem = {
        task,
        metadata,
        resolve,
        reject,
        enqueuedAt: Date.now()
      };

      this.queue.push(queueItem);
      this.stats.totalQueued++;
      
      logger.debug('Task enqueued', {
        queueSize: this.queue.length,
        processing: this.processing.size,
        metadata
      });

      // Try to process immediately
      this._processNext();
    });
  }

  /**
   * Process next item in queue
   * @private
   */
  async _processNext() {
    // Check if we can process more items
    if (this.processing.size >= this.maxConcurrent) {
      return;
    }

    // Check if queue is empty
    if (this.queue.length === 0) {
      return;
    }

    // Get next item from queue
    const item = this.queue.shift();
    if (!item) {
      return;
    }

    // Add to processing set
    this.processing.add(item);
    const waitTime = Date.now() - item.enqueuedAt;
    
    logger.debug('Processing task', {
      queueSize: this.queue.length,
      processing: this.processing.size,
      waitTime: `${waitTime}ms`,
      metadata: item.metadata
    });

    // Execute task
    try {
      const result = await item.task();
      this.stats.totalProcessed++;
      
      logger.debug('Task completed successfully', {
        waitTime: `${waitTime}ms`,
        processingTime: `${Date.now() - item.enqueuedAt}ms`,
        metadata: item.metadata
      });
      
      item.resolve(result);
    } catch (error) {
      this.stats.totalErrors++;
      
      logger.error('Task failed', {
        error: error.message,
        waitTime: `${waitTime}ms`,
        metadata: item.metadata
      });
      
      item.reject(error);
    } finally {
      // Remove from processing set
      this.processing.delete(item);
      
      // Process next item
      this._processNext();
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      processing: this.processing.size,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    const cleared = this.queue.length;
    this.queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    
    logger.info('Queue cleared', { cleared });
  }

  /**
   * Wait for all tasks to complete
   * @returns {Promise} Promise that resolves when all tasks complete
   */
  async waitForCompletion() {
    while (this.queue.length > 0 || this.processing.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export default ProcessingQueue;

