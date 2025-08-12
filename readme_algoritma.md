# Algoritma Proyek WhatsApp Bot API

Dokumen ini menjelaskan alur kerja utama proyek serta contoh potongan kode yang menjadi implementasi setiap flow. Dokumen ini juga telah diperbarui agar sesuai dengan implementasi terbaru (pemuatan `.env` dan konfigurasi delay antrean melalui `DELAY_QUEUE`).

## 1. Inisialisasi Server, Pemuatan .env, dan Layanan
Aplikasi Express, Socket.IO, dan layanan pendukung diinisialisasi pada saat start-up. Variabel lingkungan dimuat menggunakan `dotenv`.

```javascript
// index.js (bagian atas)
require('dotenv').config();
const express = require('express');
// ... inisialisasi http server dan socket.io ...

// Inisialisasi layanan
const dbService = new DatabaseService();
const messageQueue = new SimpleMessageQueue(); // default menggunakan antrean sederhana in-memory
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

## 4. Antrian Pengiriman Pesan (Queue)
Terdapat dua implementasi antrean di proyek ini:
- Antrean sederhana in-memory (`services/simpleMessageQueue.js`) yang digunakan secara default di `index.js`.
- Antrean berbasis Redis/Bull (`services/messageQueue.js`) yang siap dipakai bila Anda ingin beralih ke Redis.

### 4.1 Antrean Sederhana (in-memory)
Pesan pribadi dan grup dimasukkan ke antrean dan diproses satu per satu. Jeda antar pesan mengikuti `DELAY_QUEUE` (ms), default `500` bila tidak disetel.

```javascript
// services/simpleMessageQueue.js (14-44, 46-65)
async addPrivateMessage(data) {
  const { delay = parseInt(process.env.DELAY_QUEUE) || 500, ...rest } = data;
  this.queue.push({ type: 'private', data: rest, delay, timestamp: Date.now() });
  if (!this.processing) this.processQueue();
}

async addGroupMessage(data) {
  const { delay = parseInt(process.env.DELAY_QUEUE) || 500, ...rest } = data;
  this.queue.push({ type: 'group', data: rest, delay, timestamp: Date.now() });
  if (!this.processing) this.processQueue();
}

async processQueue() {
  if (this.processing || this.queue.length === 0) return;
  this.processing = true;
  while (this.queue.length > 0) {
    const item = this.queue.shift();
    await new Promise(resolve => setTimeout(resolve, item.delay));
    if (item.type === 'private') await this.sendPrivateMessage(item.data);
    else if (item.type === 'group') await this.sendGroupMessage(item.data);
  }
  this.processing = false;
}
```

### 4.2 Antrean Bull/Redis (opsional)
Implementasi ini menggunakan Bull dan Redis. Nilai `DELAY_QUEUE` juga dihormati saat enqueue dan saat eksekusi job.

```javascript
// services/messageQueue.js (ringkasan)
// Menentukan delay bawaan
const resolvedDelay = data.delay !== undefined ? data.delay : (parseInt(process.env.DELAY_QUEUE) || 500);

// Enqueue private message
const cleanData = { number: data.number, message: data.message, messageId: data.messageId, delay: resolvedDelay };
const job = await this.privateMessageQueue.add('send-private-message', cleanData);

// Saat memproses job
const waitTime = delay !== undefined ? delay : (parseInt(process.env.DELAY_QUEUE) || 500);
await new Promise(resolve => setTimeout(resolve, waitTime));
```

Jika Redis tidak tersedia, kelas ini memiliki mekanisme fallback ke in-memory dengan pola delay yang sama.

## 5. Koneksi dan Pengiriman Pesan WhatsApp
Layanan WhatsApp menggunakan Baileys untuk koneksi, pemantauan status, dan pengiriman pesan, termasuk auto-reply sederhana untuk kata kunci tertentu di grup.

```javascript
// services/whatsappService.js (47-84)
this.socket.ev.on('connection.update', async (update) => {
  const { connection, lastDisconnect, qr } = update;
  if (qr) { this.qrCode = await QRCode.toDataURL(qr); }
  if (connection === 'close') { /* reconnect logic */ }
  else if (connection === 'open') { this.isConnected = true; }
});

// Auto-reply "id" di grup untuk menampilkan ID grup
// services/whatsappService.js (111-126)
if (sender.endsWith('@g.us') && textMessage.trim().toLowerCase() === 'id') {
  const replyMessage = `ID Grup ini adalah: ${sender}`;
  await this.socket.sendMessage(sender, { text: replyMessage }, { quoted: message });
}
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
Contoh endpoint untuk mengirim pesan privat menggunakan middleware dan antrian. Perhatikan bahwa `delay` dipasang dari `DELAY_QUEUE`.

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
  const result = await messageQueue.addPrivateMessage({
    number,
    message,
    messageId,
    delay: parseInt(process.env.DELAY_QUEUE) || 500
  });
  res.json({ success: true, message: 'Private message queued successfully', data: { messageId, queueResult: result } });
});

// routes/api.js (116-159)
router.post('/send-group', validateApiKey, async (req, res) => {
  const { groupId, message } = req.body;
  const messageId = await whatsappService.dbService.logMessage(
    groupId.includes('@') ? groupId : `${groupId}@g.us`,
    message,
    'sent',
    'pending'
  );
  const result = await messageQueue.addGroupMessage({
    groupId,
    message,
    messageId,
    delay: parseInt(process.env.DELAY_QUEUE) || 500
  });
  res.json({ success: true, message: 'Group message queued successfully', data: { messageId, queueResult: result } });
});
```

## 7. Endpoint Statistik Antrean

```javascript
// routes/api.js (198-206)
router.get('/queue-stats', validateApiKey, async (req, res) => {
  const stats = await messageQueue.getQueueStats();
  res.json({ success: true, data: stats });
});
```

## 8. Konfigurasi Delay via .env
Gunakan file `.env` di root proyek untuk mengatur jeda antar pesan:

```bash
DELAY_QUEUE=10000
```

Nilai dibaca saat enqueue/pemrosesan pesan dan diaplikasikan konsisten di semua jalur antrean. Bila tidak disetel atau tidak valid, default ke `500` ms.

## 9. Verifikasi dan Testing Singkat
Pengujian memastikan endpoint mengantrekan pesan dan menghormati `DELAY_QUEUE`:

```javascript
// tests/api.test.js (55-66)
process.env.DELAY_QUEUE = '2000';
expect(messageQueue.addPrivateMessage).toHaveBeenCalledWith(
  expect.objectContaining({ delay: 2000 })
);
```

---
Dokumen ini merangkum alur utama dan implementasi kode pada proyek, termasuk konfigurasi delay antrean berbasis `DELAY_QUEUE` dari `.env`.
