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

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
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
