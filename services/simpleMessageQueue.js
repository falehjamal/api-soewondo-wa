class SimpleMessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.whatsappService = null;
    this.dbService = null;
    this.maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE) || 1000; // Prevent memory leaks
    this.droppedMessages = 0; // Track dropped messages for monitoring
  }

  setServices(whatsappService, dbService) {
    this.whatsappService = whatsappService;
    this.dbService = dbService;
  }

  async addPrivateMessage(data) {
    const { delay = parseInt(process.env.DELAY_QUEUE) || 500, ...rest } = data;
    
    // Check queue size limit to prevent memory leaks
    if (this.queue.length >= this.maxQueueSize) {
      this.droppedMessages++;
      console.warn(`Queue full (${this.maxQueueSize}), dropping message. Total dropped: ${this.droppedMessages}`);
      return { 
        success: false, 
        method: 'simple-queue',
        error: 'Queue is full, message dropped'
      };
    }
    
    this.queue.push({
      type: 'private',
      data: rest,
      delay,
      timestamp: Date.now()
    });

    if (!this.processing) {
      this.processQueue();
    }

    return { success: true, method: 'simple-queue' };
  }

  async addGroupMessage(data) {
    const { delay = parseInt(process.env.DELAY_QUEUE) || 500, ...rest } = data;
    
    // Check queue size limit to prevent memory leaks
    if (this.queue.length >= this.maxQueueSize) {
      this.droppedMessages++;
      console.warn(`Queue full (${this.maxQueueSize}), dropping message. Total dropped: ${this.droppedMessages}`);
      return { 
        success: false, 
        method: 'simple-queue',
        error: 'Queue is full, message dropped'
      };
    }
    
    this.queue.push({
      type: 'group',
      data: rest,
      delay,
      timestamp: Date.now()
    });

    if (!this.processing) {
      this.processQueue();
    }

    return { success: true, method: 'simple-queue' };
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        // Add delay to prevent spam
        await new Promise(resolve => setTimeout(resolve, item.delay));

        if (item.type === 'private') {
          await this.sendPrivateMessage(item.data);
        } else if (item.type === 'group') {
          await this.sendGroupMessage(item.data);
        }
      } catch (error) {
        console.error(`Error processing ${item.type} message:`, error);
        
        // Update message status to failed
        if (item.data.messageId && this.dbService) {
          try {
            await this.dbService.updateMessageStatus(item.data.messageId, 'failed');
          } catch (dbError) {
            console.error('Error updating message status:', dbError);
          }
        }
      }
    }

    this.processing = false;
  }

  async sendPrivateMessage(data) {
    if (!this.whatsappService) {
      throw new Error('WhatsApp service not available');
    }

    await this.whatsappService.sendPrivateMessage(data.number, data.message);
    
    if (data.messageId && this.dbService) {
      await this.dbService.updateMessageStatus(data.messageId, 'sent');
    }

    console.log(`Private message sent to ${data.number}`);
  }

  async sendGroupMessage(data) {
    if (!this.whatsappService) {
      throw new Error('WhatsApp service not available');
    }

    await this.whatsappService.sendGroupMessage(data.groupId, data.message);
    
    if (data.messageId && this.dbService) {
      await this.dbService.updateMessageStatus(data.messageId, 'sent');
    }

    console.log(`Group message sent to ${data.groupId}`);
  }

  async getQueueStats() {
    return {
      privateMessages: { 
        waiting: this.queue.filter(item => item.type === 'private').length 
      },
      groupMessages: { 
        waiting: this.queue.filter(item => item.type === 'group').length 
      },
      processing: this.processing,
      method: 'simple-queue',
      maxQueueSize: this.maxQueueSize,
      droppedMessages: this.droppedMessages
    };
  }

  process() {
    console.log('Simple message queue processing started');
    // No need to do anything here, processing happens on demand
  }

  async close() {
    // Wait for current processing to finish
    while (this.processing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('Simple message queue closed');
  }
}

module.exports = SimpleMessageQueue;
