const express = require('express');
const router = express.Router();

module.exports = (whatsappService, messageQueue) => {
  // Middleware to validate API key
  const validateApiKey = async (req, res, next) => {
    const apiKey = req.body.apiKey || req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required'
      });
    }

    try {
      const isValid = await whatsappService.dbService.validateApiKey(apiKey);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid API key'
        });
      }
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error validating API key'
      });
    }
  };

  // Check WhatsApp connection status
  router.get('/status', (req, res) => {
    const status = whatsappService.getConnectionStatus();
    res.json({
      success: true,
      data: status
    });
  });

  // Get QR code
  router.get('/qr', (req, res) => {
    const qrCode = whatsappService.getQRCode();
    res.json({
      success: true,
      data: {
        qrCode: qrCode
      }
    });
  });

  // Disconnect WhatsApp
  router.post('/disconnect', async (req, res) => {
    try {
      await whatsappService.disconnect();
      res.json({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error disconnecting WhatsApp',
        error: error.message
      });
    }
  });

  // Send private message
  router.post('/send-private', validateApiKey, async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({
        success: false,
        message: 'Number and message are required'
      });
    }

    try {
      // Log message to database
      const messageId = await whatsappService.dbService.logMessage(
        number.includes('@') ? number : `${number}@s.whatsapp.net`,
        message,
        'sent',
        'pending'
      );

      // Add to queue
      const result = await messageQueue.addPrivateMessage({
        number,
        message,
        messageId
      });

      res.json({
        success: true,
        message: 'Private message queued successfully',
        data: {
          messageId,
          queueResult: result
        }
      });
    } catch (error) {
      console.error('Error queuing private message:', error);
      res.status(500).json({
        success: false,
        message: 'Error sending private message',
        error: error.message
      });
    }
  });

  // Send group message
  router.post('/send-group', validateApiKey, async (req, res) => {
    const { groupId, message } = req.body;

    if (!groupId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Group ID and message are required'
      });
    }

    try {
      // Log message to database
      const messageId = await whatsappService.dbService.logMessage(
        groupId.includes('@') ? groupId : `${groupId}@g.us`,
        message,
        'sent',
        'pending'
      );

      // Add to queue
      const result = await messageQueue.addGroupMessage({
        groupId,
        message,
        messageId
      });

      res.json({
        success: true,
        message: 'Group message queued successfully',
        data: {
          messageId,
          queueResult: result
        }
      });
    } catch (error) {
      console.error('Error queuing group message:', error);
      res.status(500).json({
        success: false,
        message: 'Error sending group message',
        error: error.message
      });
    }
  });

  // Get groups (optional feature)
  router.get('/groups', validateApiKey, async (req, res) => {
    try {
      const groups = await whatsappService.getGroups();
      res.json({
        success: true,
        data: groups
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching groups',
        error: error.message
      });
    }
  });

  // Get message history
  router.get('/messages', validateApiKey, async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    
    try {
      const messages = await whatsappService.dbService.getMessages(limit);
      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching messages',
        error: error.message
      });
    }
  });

  // Get queue statistics
  router.get('/queue-stats', validateApiKey, async (req, res) => {
    try {
      const stats = await messageQueue.getQueueStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching queue stats',
        error: error.message
      });
    }
  });

  return router;
};
