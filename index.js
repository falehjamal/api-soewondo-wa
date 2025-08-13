require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const WhatsAppService = require('./services/whatsappService');
const DatabaseService = require('./services/databaseService');
const SimpleMessageQueue = require('./services/simpleMessageQueue');
const RedisMessageQueue = require('./services/messageQueue');
const apiRoutes = require('./routes/api');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
app.use(express.json({ limit: '10mb' })); // Add size limit to prevent abuse
app.use(express.static(path.join(__dirname, 'public')));

// Initialize services
const dbService = new DatabaseService();
const useRedisQueue = String(process.env.USE_REDIS || '').toLowerCase() === 'true';
const messageQueue = useRedisQueue ? new RedisMessageQueue() : new SimpleMessageQueue();
console.log(`Message queue selected: ${useRedisQueue ? 'Redis/Bull' : 'In-memory (SimpleMessageQueue)'}`);
const whatsappService = new WhatsAppService(io, dbService);

// Initialize database first
async function initializeServices() {
  try {
    await dbService.init();
    
    // Set service references for queue processing
    messageQueue.setServices(whatsappService, dbService);
    
    // Start message queue processing after services are ready
    messageQueue.process();
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Error initializing services:', error);
  }
}

// Initialize services
initializeServices();

// Routes
app.use('/api', apiRoutes(whatsappService, messageQueue));

// Serve HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Queue monitor page
app.get('/queue', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'queue.html'));
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Client subscribes to queue updates (supports interval and limit)
  socket.on('subscribe-queue', async (params = {}) => {
    const isNumber = typeof params === 'number';
    const intervalMs = isNumber ? params : Number(params.intervalMs) || 2000;
    const limit = isNumber ? 50 : Math.max(1, Math.min(500, Number(params.limit) || 50));
    const clamped = Math.max(1000, Math.min(10000, intervalMs));

    // Clear any existing timer for this socket
    if (socket.data && socket.data.queueTimer) {
      clearInterval(socket.data.queueTimer);
    } else if (!socket.data) {
      socket.data = {};
    }

    const timer = setInterval(async () => {
      try {
        const details = await messageQueue.getQueueDetails(limit);
        socket.emit('queue:update', details);
      } catch (e) {
        socket.emit('queue:error', { message: 'Failed to load queue details' });
      }
    }, clamped);

    socket.data.queueTimer = timer;
    socket.data.queueLimit = limit;

    const clear = () => {
      if (socket.data && socket.data.queueTimer) {
        clearInterval(socket.data.queueTimer);
        socket.data.queueTimer = null;
      }
    };

    socket.once('unsubscribe-queue', clear);
    socket.once('disconnect', clear);
  });

  // Retry a job by id and queue type
  socket.on('queue:retry', async ({ queue, id }) => {
    try {
      const result = await messageQueue.retryJob(queue, id);
      socket.emit('queue:retry:done', { ok: true, result });
    } catch (err) {
      socket.emit('queue:retry:done', { ok: false, error: err?.message || 'Retry failed' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start message queue processing - moved to after services init
// messageQueue.process(); // This is now called in initializeServices()

const PORT = process.env.PORT || 3000;
server.listen(PORT,'0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to scan QR code`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await whatsappService.disconnect();
  await messageQueue.close();
  process.exit(0);
});
