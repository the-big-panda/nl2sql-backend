const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { SecurityManager, DatabaseManager, initializeDatabase } = require('./database/connection');
const { Pool } = require('pg');
const mysql2 = require('mysql2/promise');
const ChromaService = require('./services/chromaService');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Constants
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:9001';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_in_production';

// Initialize ChromaService
const chromaService = new ChromaService(AI_SERVICE_URL);

// Request logging
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Helper Functions
function looksLikePath(s) {
  if (!s) return false;
  return (
    s.includes('\\') ||
    s.includes('/') ||
    s.endsWith('.db') ||
    s.endsWith('.sqlite') ||
    s.endsWith('.sqlite3')
  );
}

function getSqliteDbPath({ host, database }) {
  const candidateDbPath = looksLikePath(database)
    ? database
    : (looksLikePath(host) ? host : database);
  if (!candidateDbPath) return null;
  return require('path').isAbsolute(candidateDbPath)
    ? candidateDbPath
    : require('path').resolve(process.cwd(), candidateDbPath);
}

// Schema Extraction Functions
async function getSqliteSchema(dbPath) {
  const { open } = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    const rows = await db.all(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    const schema = rows
      .map((r) => r.sql)
      .filter(Boolean)
      .join('\n\n');
    return schema.length > 20000 ? schema.slice(0, 20000) : schema;
  } finally {
    await db.close();
  }
}

async function getPostgresSchema({ host, username, password, database, port = 5432 }) {
  const pool = new Pool({
    host,
    port,
    user: username,
    password,
    database,
    connectionTimeoutMillis: 8000,
  });

  try {
    const tablesRes = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;"
    );
    const tables = tablesRes.rows.map((r) => r.table_name).slice(0, 80);

    const parts = [];
    for (const tableName of tables) {
      const colsRes = await pool.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position;",
        [tableName]
      );
      const cols = colsRes.rows;

      if (!cols.length) continue;

      const colsText = cols.map((c) => `${c.column_name} ${c.data_type}`).join(', ');
      parts.push(`CREATE TABLE ${tableName} (\n  ${colsText}\n);`);

      if (parts.join('\n\n').length > 20000) break;
    }

    return parts.join('\n\n');
  } finally {
    await pool.end();
  }
}

async function getMySqlSchema({ host, username, password, database, port = 3306 }) {
  const dbName = String(database || "").trim();
  const connection = await mysql2.createConnection({
    host,
    port,
    user: username,
    password,
    database: dbName,
    connectTimeout: 8000,
  });

  try {
    const [fullTablesRes] = await connection.query("SHOW FULL TABLES;");
    const tableNameKey = fullTablesRes?.[0] ? Object.keys(fullTablesRes[0])[0] : null;
    const tableTypeKey = fullTablesRes?.[0] ? Object.keys(fullTablesRes[0])[1] : null;

    const tables = (fullTablesRes || [])
      .map((r) => ({
        name: tableNameKey ? r[tableNameKey] : null,
        type: tableTypeKey ? r[tableTypeKey] : null,
      }))
      .filter((t) => t.name)
      .slice(0, 80);

    const parts = [];
    for (const t of tables) {
      const [colsRes] = await connection.query("SHOW COLUMNS FROM ??;", [t.name]);
      if (!colsRes || !colsRes.length) continue;
      
      const colsText = colsRes
        .map((c) => `${c.Field} ${c.Type}`)
        .join(', ');
      const objectLabel = t.type && String(t.type).toUpperCase() === "VIEW" ? "VIEW" : "TABLE";
      parts.push(`CREATE ${objectLabel} ${t.name} (\n  ${colsText}\n);`);

      if (parts.join('\n\n').length > 20000) break;
    }

    return parts.join('\n\n');
  } finally {
    await connection.end();
  }
}

// Database Schema Extraction with Table-level Details
async function getDetailedSchema(connectionConfig, dbType) {
  let schema = '';
  let tableDetails = [];

  switch (dbType.toLowerCase()) {
    case 'sqlite':
      schema = await getSqliteSchema(connectionConfig.dbPath);
      break;
    case 'postgresql':
    case 'postgres':
      schema = await getPostgresSchema(connectionConfig);
      // Extract table details for ChromaDB
      const pool = new Pool({
        host: connectionConfig.host,
        port: connectionConfig.port || 5432,
        user: connectionConfig.username,
        password: connectionConfig.password,
        database: connectionConfig.database,
        connectionTimeoutMillis: 8000,
      });
      
      try {
        const tablesRes = await pool.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;"
        );
        
        for (const table of tablesRes.rows) {
          const colsRes = await pool.query(
            "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position;",
            [table.table_name]
          );
          
          tableDetails.push({
            table_name: table.table_name,
            columns: colsRes.rows,
            schema_text: `CREATE TABLE ${table.table_name} (\n  ${colsRes.rows.map(c => `${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ` DEFAULT ${c.column_default}` : ''}`).join(',\n  ')}\n);`
          });
        }
      } finally {
        await pool.end();
      }
      break;
    case 'mysql':
      schema = await getMySqlSchema(connectionConfig);
      // Extract table details for MySQL
      const connection = await mysql2.createConnection({
        host: connectionConfig.host,
        port: connectionConfig.port || 3306,
        user: connectionConfig.username,
        password: connectionConfig.password,
        database: connectionConfig.database,
        connectTimeout: 8000,
      });
      
      try {
        const [tablesRes] = await connection.query("SHOW TABLES;");
        const tableField = Object.keys(tablesRes[0])[0];
        
        for (const tableRow of tablesRes) {
          const tableName = tableRow[tableField];
          const [colsRes] = await connection.query("SHOW COLUMNS FROM ??;", [tableName]);
          
          tableDetails.push({
            table_name: tableName,
            columns: colsRes.map(c => ({
              column_name: c.Field,
              data_type: c.Type,
              is_nullable: c.Null === 'YES' ? 'YES' : 'NO',
              column_default: c.Default
            })),
            schema_text: `CREATE TABLE ${tableName} (\n  ${colsRes.map(c => `${c.Field} ${c.Type}${c.Null === 'NO' ? ' NOT NULL' : ''}${c.Default ? ` DEFAULT ${c.Default}` : ''}`).join(',\n  ')}\n);`
          });
        }
      } finally {
        await connection.end();
      }
      break;
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }

  return { schema, tableDetails };
}

// Test Database Connection
async function testConnection(connectionConfig, dbType) {
  try {
    switch (dbType.toLowerCase()) {
      case 'sqlite':
        const fs = require('fs');
        if (!fs.existsSync(connectionConfig.dbPath)) {
          return { success: false, error: 'Database file not found' };
        }
        await getSqliteSchema(connectionConfig.dbPath);
        return { success: true };
      case 'postgresql':
      case 'postgres':
        await getPostgresSchema(connectionConfig);
        return { success: true };
      case 'mysql':
        await getMySqlSchema(connectionConfig);
        return { success: true };
      default:
        return { success: false, error: 'Unsupported database type' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== AUTHENTICATION ROUTES ====================

// Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check if user exists
    const existingUser = await DatabaseManager.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Hash password and create user
    const passwordHash = await SecurityManager.hashPassword(password);
    const result = await DatabaseManager.query(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, passwordHash, email || null]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      user: { id: user.id, username: user.username, email: user.email },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find user
    const result = await DatabaseManager.query(
      'SELECT id, username, password_hash, email FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await SecurityManager.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      user: { id: user.id, username: user.username, email: user.email },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== WORKSPACE ROUTES ====================

// Get User Workspaces
app.get('/api/workspaces', authenticateToken, async (req, res) => {
  try {
    const result = await DatabaseManager.query(
      'SELECT id, name, db_type, connection_config, created_at, updated_at FROM workspaces WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    const workspaces = result.rows.map(ws => {
      let dbName = null;
      let isActive = true;
      if (ws.connection_config) {
        const config = typeof ws.connection_config === 'string' 
          ? JSON.parse(ws.connection_config) 
          : ws.connection_config;
          
        dbName = config.database || config.dbPath || config.host || null;
        if (config.isActive !== undefined) {
          isActive = config.isActive;
        }
      }
      return {
        id: ws.id,
        name: ws.name,
        db_type: ws.db_type,
        created_at: ws.created_at,
        updated_at: ws.updated_at,
        db_name: dbName,
        is_active: isActive
      };
    });

    res.json(workspaces);
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create Workspace
app.post('/api/workspaces', authenticateToken, async (req, res) => {
  try {
    const { name, dbType, connectionConfig } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    let workspace;
    
    if (dbType && connectionConfig) {
      // Create workspace with database connection
      // Test connection first
      const connectionTest = await testConnection(connectionConfig, dbType);
      if (!connectionTest.success) {
        return res.status(400).json({ error: `Connection test failed: ${connectionTest.error}` });
      }

      // Encrypt password in connection config
      const encryptedConfig = { ...connectionConfig };
      if (encryptedConfig.password) {
        encryptedConfig.password = SecurityManager.encryptConnectionPassword(encryptedConfig.password);
      }

      // Create workspace with database connection
      const result = await DatabaseManager.query(
        'INSERT INTO workspaces (name, user_id, db_type, connection_config) VALUES ($1, $2, $3, $4) RETURNING id, name, db_type, created_at',
        [name, req.user.userId, dbType, JSON.stringify(encryptedConfig)]
      );

      workspace = result.rows[0];

      // Create connection record
      await DatabaseManager.query(
        'INSERT INTO connections (workspace_id, host, port, database, username, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          workspace.id,
          connectionConfig.host || null,
          connectionConfig.port || null,
          connectionConfig.database || null,
          connectionConfig.username || null,
          connectionConfig.password ? SecurityManager.encryptConnectionPassword(connectionConfig.password) : null
        ]
      );
    } else {
      // Create workspace without database connection
      const result = await DatabaseManager.query(
        'INSERT INTO workspaces (name, user_id, db_type, connection_config) VALUES ($1, $2, $3, $4) RETURNING id, name, db_type, created_at',
        [name, req.user.userId, 'none', null]
      );

      workspace = result.rows[0];
    }

    res.status(201).json(workspace);
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Workspace
app.put('/api/workspaces/:id', authenticateToken, async (req, res) => {
  try {
    const { dbType, connectionConfig } = req.body;
    const workspaceId = req.params.id;

    // Validate workspace ownership
    const workspaceResult = await DatabaseManager.query(
      'SELECT id FROM workspaces WHERE id = $1 AND user_id = $2',
      [workspaceId, req.user.userId]
    );

    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Encrypt password in connection config
    if (connectionConfig.password) {
      connectionConfig.password = SecurityManager.encryptConnectionPassword(connectionConfig.password);
    }

    // Update workspace with database connection
    await DatabaseManager.query(
      'UPDATE workspaces SET db_type = $1, connection_config = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [dbType, connectionConfig, workspaceId]
    );

    // Update connections table
    // `connections.workspace_id` may not have a UNIQUE constraint in existing DBs,
    // so don't use `ON CONFLICT` here.
    const updateResult = await DatabaseManager.query(
      `UPDATE connections
       SET host = $2,
           port = $3,
           database = $4,
           username = $5,
           password_hash = $6
       WHERE workspace_id = $1`,
      [
        workspaceId,
        connectionConfig.host,
        connectionConfig.port,
        connectionConfig.database,
        connectionConfig.username,
        connectionConfig.password
      ]
    );

    if (updateResult.rowCount === 0) {
      await DatabaseManager.query(
        `INSERT INTO connections (workspace_id, host, port, database, username, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          connectionConfig.host,
          connectionConfig.port,
          connectionConfig.database,
          connectionConfig.username,
          connectionConfig.password
        ]
      );
    }

    res.json({ 
      success: true, 
      message: 'Database connection updated successfully' 
    });
  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle Workspace Connection
app.put('/api/workspaces/:id/toggle-connection', authenticateToken, async (req, res) => {
  try {
    const { isActive } = req.body;
    const workspaceId = req.params.id;

    const workspaceResult = await DatabaseManager.query(
      'SELECT id, connection_config FROM workspaces WHERE id = $1 AND user_id = $2',
      [workspaceId, req.user.userId]
    );

    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    let config = workspaceResult.rows[0].connection_config || {};
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch (e) { config = {}; }
    }

    config.isActive = Boolean(isActive);

    await DatabaseManager.query(
      'UPDATE workspaces SET connection_config = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(config), workspaceId]
    );

    res.json({ 
      success: true, 
      message: `Database connection ${isActive ? 'activated' : 'deactivated'} successfully`,
      is_active: config.isActive
    });
  } catch (error) {
    console.error('Toggle connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Workspace Details
app.get('/api/workspaces/:id', authenticateToken, async (req, res) => {
  try {
    const result = await DatabaseManager.query(
      'SELECT id, name, db_type, connection_config, created_at, updated_at FROM workspaces WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const workspace = result.rows[0];
    let dbName = null;
    let isActive = true;

    // Decrypt connection config but hide password
    if (workspace.connection_config) {
      const config = typeof workspace.connection_config === 'string'
        ? JSON.parse(workspace.connection_config)
        : workspace.connection_config;

      dbName = config.database || config.dbPath || config.host || null;
      if (config.isActive !== undefined) {
          isActive = config.isActive;
      }

      if (config.password) {
        config.password = SecurityManager.decryptConnectionPassword(config.password);
        // Hide password in response
        config.password = '***';
      }
      workspace.connection_config = config;
    }

    workspace.db_name = dbName;
    workspace.is_active = isActive;

    res.json(workspace);
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test Database Connection
app.post('/api/workspaces/:id/test-connection', authenticateToken, async (req, res) => {
  try {
    const workspaceResult = await DatabaseManager.query(
      'SELECT connection_config, db_type FROM workspaces WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const workspace = workspaceResult.rows[0];
    const connectionConfig = workspace.connection_config;
    
    // Decrypt password
    if (connectionConfig.password) {
      connectionConfig.password = SecurityManager.decryptConnectionPassword(connectionConfig.password);
    }

    const testResult = await testConnection(connectionConfig, workspace.db_type);
    res.json(testResult);
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Connect to Database (Alias for test-connection)
app.post('/api/workspaces/connect', authenticateToken, async (req, res) => {
  try {
    const { dbType, connectionConfig } = req.body;
    
    if (!dbType || !connectionConfig) {
      return res.status(400).json({ error: 'Database type and connection config required' });
    }

    // Test connection without saving
    const testResult = await testConnection(connectionConfig, dbType);
    
    if (testResult.success) {
      res.json({ 
        success: true, 
        message: 'Connection successful',
        dbType,
        // Don't return the password in response
        connectionConfig: {
          ...connectionConfig,
          password: connectionConfig.password ? '***' : undefined
        }
      });
    } else {
      res.status(400).json(testResult);
    }
  } catch (error) {
    console.error('Connect error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Workspace Schema
app.get('/api/workspaces/:id/schema', authenticateToken, async (req, res) => {
  try {
    const workspaceResult = await DatabaseManager.query(
      'SELECT connection_config, db_type FROM workspaces WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const workspace = workspaceResult.rows[0];
    const connectionConfig = workspace.connection_config;
    
    // Decrypt password
    if (connectionConfig.password) {
      connectionConfig.password = SecurityManager.decryptConnectionPassword(connectionConfig.password);
    }

    const { schema, tableDetails } = await getDetailedSchema(connectionConfig, workspace.db_type);
    
    res.json({ 
      schema, 
      tableDetails,
      dbType: workspace.db_type 
    });
  } catch (error) {
    console.error('Get schema error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh Workspace Schema (updates ChromaDB)
app.post('/api/workspaces/:id/refresh-schema', authenticateToken, async (req, res) => {
  try {
    const workspaceId = req.params.id;

    // Validate workspace ownership and get workspace details
    const workspaceResult = await DatabaseManager.query(
      'SELECT connection_config, db_type FROM workspaces WHERE id = $1 AND user_id = $2',
      [workspaceId, req.user.userId]
    );

    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const workspace = workspaceResult.rows[0];
    const connectionConfig = workspace.connection_config;
    
    // Decrypt password
    if (connectionConfig.password) {
      connectionConfig.password = SecurityManager.decryptConnectionPassword(connectionConfig.password);
    }

    // Get detailed schema with table information
    const { schema, tableDetails } = await getDetailedSchema(connectionConfig, workspace.db_type);
    
    if (!schema || schema.length === 0) {
      return res.status(400).json({ error: 'No schema found for this workspace' });
    }

    // Update ChromaDB with new schema
    let chromaUpdateResult = { success: false, error: 'ChromaDB not available' };
    if (tableDetails && tableDetails.length > 0) {
      try {
        chromaUpdateResult = await chromaService.updateWorkspaceSchema(
          workspaceId, 
          tableDetails, 
          workspace.db_type
        );
      } catch (chromaError) {
        console.warn(`ChromaDB update failed: ${chromaError.message}`);
        chromaUpdateResult = { success: false, error: chromaError.message };
      }
    }

    res.json({ 
      success: true, 
      message: 'Schema refreshed successfully',
      schema,
      tableCount: tableDetails.length,
      chromaUpdated: chromaUpdateResult.success,
      chromaError: chromaUpdateResult.success ? null : chromaUpdateResult.error
    });
  } catch (error) {
    console.error('Refresh schema error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate SQL (existing endpoint with authentication)
app.post('/api/workspaces/:id/generate-sql', authenticateToken, async (req, res) => {
  try {
    const { question } = req.body;
    const workspaceId = req.params.id;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Get workspace details
    const workspaceResult = await DatabaseManager.query(
      'SELECT connection_config, db_type FROM workspaces WHERE id = $1 AND user_id = $2',
      [workspaceId, req.user.userId]
    );

    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const workspace = workspaceResult.rows[0];
    const connectionConfig = workspace.connection_config;
    
    // Decrypt password
    if (connectionConfig.password) {
      connectionConfig.password = SecurityManager.decryptConnectionPassword(connectionConfig.password);
    }

    // Get schema
    const { schema } = await getDetailedSchema(connectionConfig, workspace.db_type);

    // Call AI service with workspace_id for context-aware generation
    const aiResponse = await fetch(`${AI_SERVICE_URL}/generate-sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        schema,
        dbType: workspace.db_type,
        workspace_id: workspaceId // Include for ChromaDB context
      })
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      throw new Error(aiData.error || 'AI service error');
    }

    // Save to history
    await DatabaseManager.query(
      'INSERT INTO query_history (workspace_id, question, generated_sql, success) VALUES ($1, $2, $3, $4)',
      [workspaceId, question, aiData.sql, true]
    );

    res.json(aiData);
  } catch (error) {
    console.error('Generate SQL error:', error);
    
    // Save failed attempt to history
    try {
      await DatabaseManager.query(
        'INSERT INTO query_history (workspace_id, question, success, error_message) VALUES ($1, $2, $3, $4)',
        [req.params.id, req.body.question, false, error.message]
      );
    } catch (historyError) {
      console.error('Failed to save to history:', historyError);
    }

    res.status(500).json({ error: error.message });
  }
});

// Delete Workspace
app.delete('/api/workspaces/:id', authenticateToken, async (req, res) => {
  try {
    const workspaceId = req.params.id;

    // Validate workspace ownership
    const workspaceResult = await DatabaseManager.query(
      'SELECT id FROM workspaces WHERE id = $1 AND user_id = $2',
      [workspaceId, req.user.userId]
    );

    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Delete workspace from database (cascading will handle related records)
    await DatabaseManager.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);

    // Clean up ChromaDB data for this workspace
    try {
      const chromaResult = await chromaService.deleteWorkspaceData(workspaceId);
      if (chromaResult.success) {
        console.log(`✅ ChromaDB data cleaned up for workspace ${workspaceId}`);
      } else {
        console.warn(`⚠️ ChromaDB cleanup failed for workspace ${workspaceId}: ${chromaResult.error}`);
      }
    } catch (chromaError) {
      console.warn(`⚠️ ChromaDB cleanup error for workspace ${workspaceId}: ${chromaError.message}`);
      // Don't fail the deletion if ChromaDB cleanup fails
    }

    res.json({ 
      success: true, 
      message: 'Workspace deleted successfully' 
    });
  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Query History
app.get('/api/workspaces/:id/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await DatabaseManager.query(
      'SELECT id, question, generated_sql, success, results_count, execution_time_ms, created_at FROM query_history WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.params.id, limit, offset]
    );

    const countResult = await DatabaseManager.query(
      'SELECT COUNT(*) FROM query_history WHERE workspace_id = $1',
      [req.params.id]
    );

    res.json({
      history: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Initialize Database and Start Server
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 NL2SQL Backend Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🤖 AI Service URL: ${AI_SERVICE_URL}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
