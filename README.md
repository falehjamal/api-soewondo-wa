# WhatsApp Bot API

Layanan API sederhana untuk mengirim pesan WhatsApp dengan antrean menggunakan Baileys, Express, dan Redis.

## Fitur
- Koneksi ke WhatsApp Web menggunakan Baileys.
- Antrean pengiriman pesan dengan Bull dan Redis.
- Penyimpanan sesi dan log pesan pada SQLite.
- Validasi API key dan riwayat pesan.

## Prasyarat
- Node.js 16 atau lebih baru.
- Redis server (opsional; akan fallback ke memori jika Redis tidak tersedia).

## Instalasi
```bash
npm install
```

## Konfigurasi
Atur variabel lingkungan sesuai kebutuhan:

| Variable     | Default    | Keterangan             |
|--------------|-----------|------------------------|
| `PORT`       | `3000`    | Port server HTTP       |
| `REDIS_HOST` | `localhost` | Host Redis            |
| `REDIS_PORT` | `6379`    | Port Redis             |
| `DELAY_QUEUE`| `500`     | Jeda antar pesan (ms)  |

Saat pertama kali berjalan, database akan membuat API key bawaan `tes123`.

## Menjalankan
```bash
npm start
# atau untuk hot reload
npm run dev
```
Buka `http://localhost:PORT` untuk memindai QR dan menghubungkan akun WhatsApp.

## Endpoint API
| Method | Endpoint           | Keterangan |
|--------|-------------------|-----------|
| GET    | `/api/status`      | Cek status koneksi WhatsApp |
| GET    | `/api/qr`          | Ambil QR code untuk login |
| POST   | `/api/disconnect`  | Putuskan sesi WhatsApp |
| POST   | `/api/send-private`| Kirim pesan ke nomor pribadi (butuh API key) |
| POST   | `/api/send-group`  | Kirim pesan ke grup (butuh API key) |
| GET    | `/api/groups`      | Daftar grup (butuh API key) |
| GET    | `/api/messages`    | Riwayat pesan (butuh API key, opsi `limit`) |
| GET    | `/api/queue-stats` | Statistik antrean pesan (butuh API key) |

`send-private` dan `send-group` akan menjeda eksekusi pesan sesuai nilai
`DELAY_QUEUE` (milidetik). Jika variabel ini tidak disetel, nilai default adalah
`500` ms.

## Testing
```bash
npm test
```

## Lisensi
ISC
