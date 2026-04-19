/**
 * Database schema migration to add containers table
 * Run this to add container management to your database
 */

// PostgreSQL Schema
const postgresSchema = `
CREATE TABLE IF NOT EXISTS containers (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES userinfos(user_id) ON DELETE CASCADE,
  container_id TEXT NOT NULL UNIQUE,
  container_host TEXT NOT NULL,
  container_port INTEGER NOT NULL,
  container_ws_url TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_containers_user_id ON containers(user_id);
`;

// MySQL Schema
const mysqlSchema = `
CREATE TABLE IF NOT EXISTS containers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  container_id TEXT NOT NULL UNIQUE,
  container_host TEXT NOT NULL,
  container_port INT NOT NULL,
  container_ws_url TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES userinfos(user_id) ON DELETE CASCADE,
  INDEX idx_containers_user_id (user_id)
);
`;

// SQLite Schema
const sqliteSchema = `
CREATE TABLE IF NOT EXISTS containers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  container_id TEXT NOT NULL UNIQUE,
  container_host TEXT NOT NULL,
  container_port INTEGER NOT NULL,
  container_ws_url TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES userinfos(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_containers_user_id ON containers(user_id);
`;

module.exports = {
  postgresSchema,
  mysqlSchema,
  sqliteSchema,
};
