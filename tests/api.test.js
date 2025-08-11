const request = require('supertest');
const express = require('express');
const apiRoutes = require('../routes/api');

describe('API endpoints', () => {
  let app;
  let whatsappService;
  let messageQueue;

  beforeEach(() => {
    whatsappService = {
      getConnectionStatus: jest.fn().mockReturnValue('connected'),
      dbService: {
        validateApiKey: jest.fn().mockResolvedValue(true),
        logMessage: jest.fn().mockResolvedValue('msg123')
      }
    };

    messageQueue = {
      addPrivateMessage: jest.fn().mockResolvedValue('queued-private'),
      addGroupMessage: jest.fn().mockResolvedValue('queued-group')
    };

    app = express();
    app.use(express.json());
    app.use('/api', apiRoutes(whatsappService, messageQueue));
  });

  test('GET /api/status returns connection status', async () => {
    const res = await request(app).get('/api/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: 'connected' });
  });

  test('POST /api/send-private requires API key', async () => {
    const res = await request(app)
      .post('/api/send-private')
      .send({ number: '123', message: 'hi' });
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/send-private queues message', async () => {
    const res = await request(app)
      .post('/api/send-private')
      .send({ apiKey: 'key', number: '123', message: 'hi' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Private message queued successfully');
  });

  test('POST /api/send-group requires API key', async () => {
    const res = await request(app)
      .post('/api/send-group')
      .send({ groupId: 'group1', message: 'hi' });
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/send-group queues message', async () => {
    const res = await request(app)
      .post('/api/send-group')
      .send({ apiKey: 'key', groupId: 'group1', message: 'hi' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Group message queued successfully');
  });
});

