const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'nl2sql_workspace',
  user: process.env.DB_USER || 'nl2sql_user',
  password: process.env.DB_PASSWORD,
  max: 20, // maximum number of connections in the pool
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // how long to wait when connecting a new client
});

// Password hashing utilities
class SecurityManager {
  static async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }
  
  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }
  
  // Simple encryption for storing external DB passwords (in production, use proper encryption)
  static encryptConnectionPassword(password) {
    if (!password) return password;
    if (!process.env.ENCRYPTION_KEY) {
      console.warn('ENCRYPTION_KEY not set, storing password in plain text (development mode)');
      return password;
    }
    // Basic XOR encryption (replace with proper encryption in production)
    const key = process.env.ENCRYPTION_KEY;
    let encrypted = '';
    for (let i = 0; i < password.length; i++) {
      encrypted += String.fromCharCode(password.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(encrypted).toString('base64');
  }
  
  static decryptConnectionPassword(encryptedPassword) {
    if (!encryptedPassword) return encryptedPassword;
    if (!process.env.ENCRYPTION_KEY) {
      return encryptedPassword;
    }
    try {
      const key = process.env.ENCRYPTION_KEY;
      const decoded = Buffer.from(encryptedPassword, 'base64').toString();
      let decrypted = '';
      for (let i = 0; i < decoded.length; i++) {
        decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return decrypted;
    } catch (error) {
      console.error('Error decrypting password:', error);
      return encryptedPassword;
    }
  }
}

// Database query helper
class DatabaseManager {
  static async query(text, params) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Database query error', { text, error });
      throw error;
    }
  }
  
  static async getClient() {
    return await pool.connect();
  }
  
  static async testConnection() {
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return { success: true, message: 'Database connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  
  static async close() {
    await pool.end();
  }
}

// Initialize database connection
const initializeDatabase = async () => {
  try {
    const testResult = await DatabaseManager.testConnection();
    if (testResult.success) {
      console.log('✅ PostgreSQL database connected successfully');
    } else {
      console.error('❌ Database connection failed:', testResult.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    process.exit(1);
  }
};

module.exports = {
  pool,
  SecurityManager,
  DatabaseManager,
  initializeDatabase
};
