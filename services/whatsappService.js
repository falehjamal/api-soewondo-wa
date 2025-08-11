const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
  DisconnectReason, 
  useMultiFileAuthState, 
  Browsers,
  isJidBroadcast,
  isJidGroup,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

class WhatsAppService {
  constructor(io, dbService) {
    this.io = io;
    this.dbService = dbService;
    this.socket = null;
    this.qrCode = null;
    this.isConnected = false;
    this.authDir = path.join(__dirname, '..', 'auth');
    
    this.init();
  }

  async init() {
    try {
      await this.connect();
    } catch (error) {
      console.error('Failed to initialize WhatsApp service:', error);
    }
  }

  async connect() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
      });

      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('QR Code received');
          this.qrCode = await QRCode.toDataURL(qr);
          this.io.emit('qr-code', this.qrCode);
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
          
          this.isConnected = false;
          this.io.emit('connection-status', { status: 'disconnected' });
          
          // Check if it's a 401 error (session expired)
          if (lastDisconnect?.error?.output?.statusCode === 401) {
            console.log('Session expired, clearing auth and starting fresh...');
            this.clearAuth();
            setTimeout(() => this.connect(), 5000);
          } else if (shouldReconnect) {
            setTimeout(() => this.connect(), 3000);
          }
        } else if (connection === 'open') {
          console.log('WhatsApp connected successfully');
          this.isConnected = true;
          this.qrCode = null;
          this.io.emit('connection-status', { status: 'connected' });
          
          // Save connection info to database
          const user = this.socket.user;
          if (user) {
            await this.dbService.saveSession(user.id, user.name || 'Unknown');
          }
        }
      });

      this.socket.ev.on('creds.update', saveCreds);

      // Handle incoming messages (optional - for logging and auto-reply)
      this.socket.ev.on('messages.upsert', async (m) => {
        const messages = m.messages;
        for (const message of messages) {
          if (message.key.fromMe) continue;
          
          const textMessage = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
          const sender = message.key.remoteJid;
          
          // Log incoming message
          console.log('📥 Incoming message:', {
            from: sender,
            message: textMessage.substring(0, 50) + (textMessage.length > 50 ? '...' : ''),
            isGroup: sender.endsWith('@g.us')
          });

          // Log ke database jika ada pesan masuk
          try {
            await this.dbService.logMessage(sender, textMessage, 'received', 'received');
          } catch (dbError) {
            console.error('Error logging incoming message:', dbError);
          }

          // Auto-reply untuk keyword "id" di grup
          if (sender.endsWith('@g.us') && textMessage.trim().toLowerCase() === 'id') {
            try {
              const replyMessage = `ID Grup ini adalah: ${sender}`;
              await this.socket.sendMessage(sender, 
                { text: replyMessage }, 
                { quoted: message }
              );
              console.log(`📤 Auto-reply sent to group: ${sender}`);
              
              // Log auto-reply ke database
              await this.dbService.logMessage(sender, replyMessage, 'sent', 'sent');
            } catch (err) {
              console.error('❌ Gagal kirim pesan auto-reply:', err);
            }
          }
        }
      });

    } catch (error) {
      console.error('Error connecting to WhatsApp:', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async sendMessage(jid, message) {
    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp is not connected');
    }

    try {
      const result = await this.socket.sendMessage(jid, { text: message });
      
      // Log sent message to database
      await this.dbService.logMessage(jid, message, 'sent');
      
      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async sendPrivateMessage(number, message) {
    // Format number
    const formattedNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`;
    return await this.sendMessage(formattedNumber, message);
  }

  async sendGroupMessage(groupId, message) {
    // Format group ID
    const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    return await this.sendMessage(formattedGroupId, message);
  }

  async getGroups() {
    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp is not connected');
    }

    try {
      const chats = await this.socket.groupFetchAllParticipating();
      return Object.values(chats).map(chat => ({
        id: chat.id,
        name: chat.subject,
        participants: chat.participants.length
      }));
    } catch (error) {
      console.error('Error fetching groups:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
      this.isConnected = false;
      this.qrCode = null;
      this.io.emit('connection-status', { status: 'disconnected' });
    }
  }

  // Clear auth directory for fresh start
  clearAuth() {
    try {
      if (fs.existsSync(this.authDir)) {
        const files = fs.readdirSync(this.authDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.authDir, file));
        }
        console.log('Auth directory cleared');
      }
    } catch (error) {
      console.error('Error clearing auth directory:', error);
    }
  }

  getQRCode() {
    return this.qrCode;
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      qrCode: this.qrCode
    };
  }
}

module.exports = WhatsAppService;
