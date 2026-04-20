/**
 * Database schema migration to add workspace table
 * Run this to add workspace management to your database
 */

// PostgreSQL Schema
const postgresSchema = `
CREATE TABLE IF NOT EXISTS workspace (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES userinfos(user_id) ON DELETE CASCADE,
  db_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_user_id ON workspace(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_id ON workspace(workspace_id);

CREATE TABLE IF NOT EXISTS messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  sequence_number INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_workspace_id ON messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(workspace_id, sequence_number);
`;

// MySQL Schema
const mysqlSchema = `
CREATE TABLE IF NOT EXISTS workspace (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id VARCHAR(255) NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  db_id TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES userinfos(user_id) ON DELETE CASCADE,
  INDEX idx_workspace_user_id (user_id),
  INDEX idx_workspace_id (workspace_id)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  content LONGTEXT NOT NULL,
  sequence_number INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspace(workspace_id) ON DELETE CASCADE,
  INDEX idx_messages_workspace_id (workspace_id),
  INDEX idx_messages_sequence (workspace_id, sequence_number)
);
`;

// SQLite Schema
const sqliteSchema = `
CREATE TABLE IF NOT EXISTS workspace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  db_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES userinfos(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_user_id ON workspace(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_id ON workspace(workspace_id);

CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sequence_number INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspace(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_workspace_id ON messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(workspace_id, sequence_number);
`;

module.exports = {
  postgresSchema,
  mysqlSchema,
  sqliteSchema,
};
