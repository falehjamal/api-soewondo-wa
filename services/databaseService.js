const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseService {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'database.sqlite');
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  createTables() {
    return new Promise((resolve, reject) => {
      const createSessionsTable = `
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          whatsapp_id TEXT UNIQUE,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createMessagesTable = `
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          jid TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT NOT NULL, -- 'sent' or 'received'
          status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createApiKeysTable = `
        CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key_value TEXT UNIQUE NOT NULL,
          name TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // Create default API key
      const insertDefaultApiKey = `
        INSERT OR IGNORE INTO api_keys (key_value, name) 
        VALUES ('tes123', 'Default API Key')
      `;

      this.db.serialize(() => {
        this.db.run(createSessionsTable);
        this.db.run(createMessagesTable);
        this.db.run(createApiKeysTable);
        this.db.run(insertDefaultApiKey, (err) => {
          if (err) {
            console.error('Error creating default API key:', err);
            reject(err);
          } else {
            console.log('Database tables created successfully');
            resolve();
          }
        });
      });
    });
  }

  async saveSession(whatsappId, name) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO sessions (whatsapp_id, name, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `;
      
      this.db.run(sql, [whatsappId, name], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async logMessage(jid, message, type, status = 'pending') {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO messages (jid, message, type, status) 
        VALUES (?, ?, ?, ?)
      `;
      
      this.db.run(sql, [jid, message, type, status], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async updateMessageStatus(messageId, status) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE messages SET status = ? WHERE id = ?`;
      
      this.db.run(sql, [status, messageId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  async validateApiKey(apiKey) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM api_keys WHERE key_value = ? AND is_active = 1`;
      
      this.db.get(sql, [apiKey], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  async getMessages(limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM messages 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

module.exports = DatabaseService;
