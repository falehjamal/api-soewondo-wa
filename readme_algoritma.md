# Algoritma Proyek WhatsApp Bot API

Dokumen ini menjelaskan alur kerja utama proyek serta contoh potongan kode yang menjadi implementasi setiap flow.

## 1. Inisialisasi Server dan Layanan
Aplikasi Express, Socket.IO, dan layanan pendukung diinisialisasi pada saat start-up.

```javascript
// index.js (25-39)
const dbService = new DatabaseService();
const messageQueue = new SimpleMessageQueue();
const whatsappService = new WhatsAppService(io, dbService);

async function initializeServices() {
  await dbService.init();
  messageQueue.setServices(whatsappService, dbService);
  messageQueue.process();
}
initializeServices();
```

## 2. Pembuatan Tabel dan API Key Default
Database SQLite membuat tabel sesi, pesan, dan API key, lalu menyisipkan API key bawaan `tes123`.

```javascript
// services/databaseService.js (24-76)
createTables() {
  const createSessionsTable = `...`;
  const createMessagesTable = `...`;
  const createApiKeysTable = `...`;
  const insertDefaultApiKey = `INSERT OR IGNORE INTO api_keys (key_value, name) VALUES ('tes123', 'Default API Key')`;

  this.db.serialize(() => {
    this.db.run(createSessionsTable);
    this.db.run(createMessagesTable);
    this.db.run(createApiKeysTable);
    this.db.run(insertDefaultApiKey);
  });
}
```

## 3. Validasi API Key dan Endpoint
Setiap permintaan ke endpoint yang membutuhkan otentikasi melewati middleware `validateApiKey`.

```javascript
// routes/api.js (5-31)
const validateApiKey = async (req, res, next) => {
  const apiKey = req.body.apiKey || req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ message: 'API key is required' });
  const isValid = await whatsappService.dbService.validateApiKey(apiKey);
  if (!isValid) return res.status(401).json({ message: 'Invalid API key' });
  next();
};
```

## 4. Antrian Pengiriman Pesan
Pesan pribadi dan grup dimasukkan ke antrian sederhana agar dikirim satu per satu.

```javascript
// services/simpleMessageQueue.js (14-40)
async addPrivateMessage(data) {
  this.queue.push({ type: 'private', data, timestamp: Date.now() });
  if (!this.processing) this.processQueue();
}

async addGroupMessage(data) {
  this.queue.push({ type: 'group', data, timestamp: Date.now() });
  if (!this.processing) this.processQueue();
}
```

Pemrosesan antrian dilakukan secara berurutan dengan jeda 1 detik untuk menghindari spam.

```javascript
// services/simpleMessageQueue.js (42-75)
async processQueue() {
  this.processing = true;
  while (this.queue.length > 0) {
    const item = this.queue.shift();
    await new Promise(r => setTimeout(r, 1000));
    if (item.type === 'private') await this.sendPrivateMessage(item.data);
    else await this.sendGroupMessage(item.data);
  }
  this.processing = false;
}
```

## 5. Koneksi dan Pengiriman Pesan WhatsApp
Layanan WhatsApp menggunakan Baileys untuk koneksi, pemantauan status, dan pengiriman pesan.

```javascript
// services/whatsappService.js (47-84)
this.socket.ev.on('connection.update', async (update) => {
  const { connection, lastDisconnect, qr } = update;
  if (qr) { this.qrCode = await QRCode.toDataURL(qr); }
  if (connection === 'close') { /* reconnect logic */ }
  else if (connection === 'open') { this.isConnected = true; }
});
```

Pengiriman pesan privat dan grup memanfaatkan method umum `sendMessage`.

```javascript
// services/whatsappService.js (154-164)
async sendPrivateMessage(number, message) {
  const formattedNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`;
  return await this.sendMessage(formattedNumber, message);
}

async sendGroupMessage(groupId, message) {
  const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
  return await this.sendMessage(formattedGroupId, message);
}
```

## 6. Endpoint Pengiriman Pesan
Contoh endpoint untuk mengirim pesan privat menggunakan middleware dan antrian.

```javascript
// routes/api.js (70-112)
router.post('/send-private', validateApiKey, async (req, res) => {
  const { number, message } = req.body;
  const messageId = await whatsappService.dbService.logMessage(
    number.includes('@') ? number : `${number}@s.whatsapp.net`,
    message,
    'sent',
    'pending'
  );
  const result = await messageQueue.addPrivateMessage({ number, message, messageId });
  res.json({ success: true, message: 'Private message queued successfully', data: { messageId, queueResult: result } });
});
```

Endpoint serupa tersedia untuk pesan grup, melihat status, daftar grup, riwayat pesan, dan statistik antrian.

---
Dokumen ini merangkum alur utama dan implementasi kode pada proyek.
