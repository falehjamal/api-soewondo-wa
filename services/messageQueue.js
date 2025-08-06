const Queue = require('bull');
const redis = require('redis');

class MessageQueue {
  constructor() {
    // Initialize pending messages array for in-memory fallback
    this.pendingMessages = [];
    this.useInMemory = false;

    // Redis configuration
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      // password: process.env.REDIS_PASSWORD || undefined,
    };

    try {
      // Test Redis connection first
      const testClient = redis.createClient(redisConfig);
      testClient.on('error', (err) => {
        console.log('Redis not available, using in-memory processing');
        this.useInMemory = true;
        testClient.quit();
      });

      testClient.on('connect', () => {
        console.log('Redis connected, using queue processing');
        testClient.quit();
        this.initializeQueues(redisConfig);
      });

      testClient.connect().catch(() => {
        console.log('Redis connection failed, using in-memory processing');
        this.useInMemory = true;
      });
    } catch (error) {
      console.error('Error testing Redis connection:', error);
      this.useInMemory = true;
    }

    // If Redis fails, start with in-memory processing
    setTimeout(() => {
      if (!this.privateMessageQueue && !this.useInMemory) {
        console.log('Falling back to in-memory processing');
        this.useInMemory = true;
      }
    }, 5000);
  }

  initializeQueues(redisConfig) {
    try {
      // Create queues only if Redis is available
      this.privateMessageQueue = new Queue('private messages', {
        redis: redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      this.groupMessageQueue = new Queue('group messages', {
        redis: redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      console.log('Message queues initialized successfully');
    } catch (error) {
      console.error('Error initializing message queues:', error);
      this.useInMemory = true;
    }
  }

  async addPrivateMessage(data) {
    if (this.useInMemory) {
      return this.processInMemory('private', data);
    }

    // Wait for queue to be initialized
    let retries = 0;
    while (!this.privateMessageQueue && !this.useInMemory && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!this.privateMessageQueue) {
      console.log('Queue not available, falling back to in-memory');
      return this.processInMemory('private', data);
    }

    try {
      // Clean data to avoid circular references
      const cleanData = {
        number: data.number,
        message: data.message,
        messageId: data.messageId
      };
      
      const job = await this.privateMessageQueue.add('send-private-message', cleanData, {
        delay: 1000 // 1 second delay to prevent spam
      });
      return { jobId: job.id };
    } catch (error) {
      console.error('Error adding private message to queue:', error);
      return this.processInMemory('private', data);
    }
  }

  async addGroupMessage(data) {
    if (this.useInMemory) {
      return this.processInMemory('group', data);
    }

    // Wait for queue to be initialized
    let retries = 0;
    while (!this.groupMessageQueue && !this.useInMemory && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!this.groupMessageQueue) {
      console.log('Queue not available, falling back to in-memory');
      return this.processInMemory('group', data);
    }

    try {
      // Clean data to avoid circular references
      const cleanData = {
        groupId: data.groupId,
        message: data.message,
        messageId: data.messageId
      };
      
      const job = await this.groupMessageQueue.add('send-group-message', cleanData, {
        delay: 1000 // 1 second delay to prevent spam
      });
      return { jobId: job.id };
    } catch (error) {
      console.error('Error adding group message to queue:', error);
      return this.processInMemory('group', data);
    }
  }

  async processInMemory(type, data) {
    // Fallback in-memory processing
    this.pendingMessages.push({ type, data, timestamp: Date.now() });
    
    // Process immediately in development or when Redis is not available
    setTimeout(async () => {
      try {
        if (type === 'private') {
          if (!this.whatsappService) {
            throw new Error('WhatsApp service not available');
          }
          await this.whatsappService.sendPrivateMessage(data.number, data.message);
        } else {
          if (!this.whatsappService) {
            throw new Error('WhatsApp service not available');
          }
          await this.whatsappService.sendGroupMessage(data.groupId, data.message);
        }
        
        // Update message status in database
        if (data.messageId && this.dbService) {
          await this.dbService.updateMessageStatus(data.messageId, 'sent');
        }
        
        console.log(`${type} message sent successfully (in-memory)`);
      } catch (error) {
        console.error(`Error sending ${type} message (in-memory):`, error);
        
        if (data.messageId && this.dbService) {
          await this.dbService.updateMessageStatus(data.messageId, 'failed');
        }
      }
    }, 1000);

    return { success: true, method: 'in-memory' };
  }

  process() {
    if (this.useInMemory) {
      console.log('Using in-memory message processing (Redis not available)');
      return;
    }

    // Wait for queues to be initialized
    if (!this.privateMessageQueue || !this.groupMessageQueue) {
      console.log('Queues not ready yet, will retry...');
      setTimeout(() => this.process(), 2000);
      return;
    }

    // Process private messages
    this.privateMessageQueue.process('send-private-message', 1, async (job) => {
      const { number, message, messageId } = job.data;
      
      try {
        // Get services from the main app context
        if (!this.whatsappService) {
          throw new Error('WhatsApp service not available');
        }
        
        await this.whatsappService.sendPrivateMessage(number, message);
        
        if (messageId && this.dbService) {
          await this.dbService.updateMessageStatus(messageId, 'sent');
        }
        
        console.log(`Private message sent to ${number}`);
        return { success: true };
      } catch (error) {
        console.error(`Error sending private message to ${number}:`, error);
        
        if (messageId && this.dbService) {
          await this.dbService.updateMessageStatus(messageId, 'failed');
        }
        
        throw error;
      }
    });

    // Process group messages
    this.groupMessageQueue.process('send-group-message', 1, async (job) => {
      const { groupId, message, messageId } = job.data;
      
      try {
        // Get services from the main app context
        if (!this.whatsappService) {
          throw new Error('WhatsApp service not available');
        }
        
        await this.whatsappService.sendGroupMessage(groupId, message);
        
        if (messageId && this.dbService) {
          await this.dbService.updateMessageStatus(messageId, 'sent');
        }
        
        console.log(`Group message sent to ${groupId}`);
        return { success: true };
      } catch (error) {
        console.error(`Error sending group message to ${groupId}:`, error);
        
        if (messageId && this.dbService) {
          await this.dbService.updateMessageStatus(messageId, 'failed');
        }
        
        throw error;
      }
    });

    // Event listeners for queue monitoring
    this.privateMessageQueue.on('completed', (job, result) => {
      console.log(`Private message job ${job.id} completed:`, result);
    });

    this.privateMessageQueue.on('failed', (job, err) => {
      console.error(`Private message job ${job.id} failed:`, err.message);
    });

    this.groupMessageQueue.on('completed', (job, result) => {
      console.log(`Group message job ${job.id} completed:`, result);
    });

    this.groupMessageQueue.on('failed', (job, err) => {
      console.error(`Group message job ${job.id} failed:`, err.message);
    });

    console.log('Message queue processing started');
  }

  // Method to set service references for queue processing
  setServices(whatsappService, dbService) {
    this.whatsappService = whatsappService;
    this.dbService = dbService;
  }

  async getQueueStats() {
    if (this.useInMemory) {
      return {
        privateMessages: { waiting: this.pendingMessages.filter(m => m.type === 'private').length },
        groupMessages: { waiting: this.pendingMessages.filter(m => m.type === 'group').length },
        method: 'in-memory'
      };
    }

    if (!this.privateMessageQueue || !this.groupMessageQueue) {
      return {
        privateMessages: { waiting: 0, active: 0 },
        groupMessages: { waiting: 0, active: 0 },
        method: 'redis-initializing'
      };
    }

    try {
      const [privateWaiting, privateActive, groupWaiting, groupActive] = await Promise.all([
        this.privateMessageQueue.getWaiting(),
        this.privateMessageQueue.getActive(),
        this.groupMessageQueue.getWaiting(),
        this.groupMessageQueue.getActive()
      ]);

      return {
        privateMessages: { 
          waiting: privateWaiting.length,
          active: privateActive.length 
        },
        groupMessages: { 
          waiting: groupWaiting.length,
          active: groupActive.length 
        },
        method: 'redis'
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return { error: 'Unable to fetch queue stats' };
    }
  }

  async close() {
    if (!this.useInMemory && this.privateMessageQueue && this.groupMessageQueue) {
      try {
        await Promise.all([
          this.privateMessageQueue.close(),
          this.groupMessageQueue.close()
        ]);
        console.log('Message queues closed');
      } catch (error) {
        console.error('Error closing message queues:', error);
      }
    }
  }
}

module.exports = MessageQueue;
