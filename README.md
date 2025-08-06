# WhatsApp Bot dengan Baileys, Express, dan Redis Queue

Bot WhatsApp yang dibangun dengan teknologi modern untuk pengiriman pesan yang stabil dan scalable.

## 🚀 Fitur Utama

- **QR Code Scanner**: Interface web untuk scan QR code WhatsApp
- **API Endpoints**: REST API untuk mengirim pesan pribadi dan grup
- **Auto-Reply Features**: Bot otomatis membalas pesan dengan keyword tertentu
- **Redis Queue**: Queue system untuk pengiriman pesan yang reliable
- **SQLite Database**: Penyimpanan session dan log pesan
- **Real-time Updates**: WebSocket untuk update status real-time

## 🤖 Auto-Reply Features

### **Group ID Auto-Reply**
Bot akan otomatis membalas dengan ID grup ketika ada yang mengirim pesan mengandung keyword **"id"** di grup manapun.

**Contoh:**
- User kirim: `"Halo admin, minta id grup dong"`
- Bot reply: `"ID Grup ini adalah: 120363374154864152@g.us"`

**Fitur ini berguna untuk:**
- Member grup bisa mudah mendapatkan ID grup
- Admin tidak perlu repot memberikan ID grup manual
- Otomatis bekerja di semua grup tempat bot berada

## 📋 Prerequisites

Sebelum menjalankan bot, pastikan Anda sudah menginstall:

- **Node.js** (v16 atau lebih tinggi)
- **Redis Server** (untuk queue system)
- **NPM** atau **Yarn**

### Install Redis di Windows:

1. Download Redis dari: https://redis.io/docs/getting-started/installation/install-redis-on-windows/
2. Atau gunakan WSL/Docker:
```bash
# Menggunakan Docker
docker run -d -p 6379:6379 redis:alpine

# Atau dengan WSL
sudo apt update
sudo apt install redis-server
redis-server
```

## 🔧 Instalasi

1. **Clone atau download project ini**
2. **Install dependencies**:
```bash
npm install
```

3. **Jalankan Redis server** (jika belum berjalan)
4. **Start aplikasi**:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

5. **Buka browser** dan akses: http://localhost:3000

## 🖥️ Menggunakan Bot

### 1. Koneksi WhatsApp
- Buka http://localhost:3000
- Scan QR code dengan WhatsApp di HP Anda
- Status akan berubah menjadi "Connected" jika berhasil

### 2. Kirim Pesan Pribadi
```bash
POST http://localhost:3000/api/send-private
Content-Type: application/json

{
    "apiKey": "tes123",
    "number": "6285281411550",
    "message": "Halo, ini adalah pesan pribadi."
}
```

### 3. Kirim Pesan Grup
```bash
POST http://localhost:3000/api/send-group
Content-Type: application/json

{
    "apiKey": "tes123",
    "groupId": "120363374154864152@g.us",
    "message": "Halo, ini adalah pesan ke grup."
}
```

## 🔑 API Endpoints

### Autentikasi
Semua endpoint API membutuhkan API key. Default API key: `tes123`

### Endpoints Available:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Cek status koneksi WhatsApp |
| GET | `/api/qr` | Ambil QR code |
| POST | `/api/disconnect` | Disconnect WhatsApp |
| POST | `/api/send-private` | Kirim pesan pribadi |
| POST | `/api/send-group` | Kirim pesan grup |
| GET | `/api/groups` | List semua grup |
| GET | `/api/messages` | History pesan |
| GET | `/api/queue-stats` | Status Redis queue |

### **Auto-Reply Commands:**
| Keyword | Response | Scope |
|---------|----------|-------|
| `id` | ID Grup ini adalah: [group-id] | Hanya di grup |

## 🗄️ Database

Bot menggunakan SQLite dengan tabel:
- **sessions**: Menyimpan session WhatsApp
- **messages**: Log semua pesan yang dikirim
- **api_keys**: Manajemen API keys

## 🔄 Queue System

Bot menggunakan Redis Bull Queue untuk:
- Mencegah spam pesan
- Retry otomatis jika gagal
- Scalable message processing
- Background job processing

**Fitur Queue:**
- Automatic retry (3x attempts)
- Exponential backoff delay
- Job prioritization
- Queue monitoring

## ⚙️ Konfigurasi

### Environment Variables (opsional):
```env
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=yourpassword
```

### Fallback Mode:
Jika Redis tidak tersedia, bot akan otomatis menggunakan in-memory processing.

## 🛠️ Troubleshooting

### 1. QR Code Tidak Muncul
- Pastikan WhatsApp tidak login di device lain
- Refresh halaman browser
- Restart aplikasi

### 2. Redis Connection Error
- Pastikan Redis server berjalan
- Cek konfigurasi Redis
- Bot akan fallback ke in-memory mode

### 3. Circular JSON Structure Error
- ✅ **FIXED**: Service references sekarang dibersihkan sebelum dikirim ke queue
- Restart aplikasi jika masih terjadi

### 4. WhatsApp 401 Connection Failure
- ✅ **FIXED**: Session yang expired akan otomatis di-clear dan reconnect
- Scan QR code ulang jika diminta
- Pastikan WhatsApp Web tidak digunakan di tempat lain

### 5. Pesan Tidak Terkirim
- Cek status koneksi WhatsApp
- Pastikan nomor/grup ID valid
- Lihat log di console untuk error details

### 6. Format Nomor/Grup ID
```javascript
// Nomor pribadi (otomatis ditambah @s.whatsapp.net)
"number": "6285281411550"

// Grup ID (otomatis ditambah @g.us jika perlu)  
"groupId": "120363374154864152@g.us"
```

## 🧪 Testing API

Untuk test API, jalankan:
```bash
# Install axios untuk testing
npm install

# Test semua endpoint
npm run test-api

# Test private message saja
node test-api.js private

# Test group message saja  
node test-api.js group
```

**Edit file `test-api.js`** dan ganti:
- `TEST_NUMBER` dengan nomor WhatsApp Anda
- `TEST_GROUP_ID` dengan ID grup WhatsApp Anda

## 📁 Struktur Project

```
bot-wa-new/
├── index.js              # Main server file
├── package.json          # Dependencies
├── services/
│   ├── whatsappService.js # WhatsApp connection logic
│   ├── databaseService.js # SQLite database operations
│   └── messageQueue.js    # Redis queue management
├── routes/
│   └── api.js            # API route handlers  
├── public/
│   └── index.html        # QR scanner web interface
├── auth/                 # WhatsApp session files (auto-generated)
└── database.sqlite       # SQLite database (auto-generated)
```

## 🚀 Production Deployment

Untuk production, disarankan:
1. Gunakan Process Manager (PM2)
2. Setup Redis cluster untuk high availability
3. Gunakan reverse proxy (Nginx)
4. Setup SSL certificate
5. Configure firewall dan security

## 📄 License

ISC License - bebas untuk digunakan dan dimodifikasi.

## 🤝 Support

Jika ada pertanyaan atau masalah, silakan:
1. Cek bagian Troubleshooting
2. Lihat log error di console
3. Create issue di repository

---

**Happy Coding! 🎉**
