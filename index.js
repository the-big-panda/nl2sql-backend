const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { Pool } = require('pg');
const mysql2 = require('mysql2/promise');

const app = express();

// Allows local development (Vite on 8080, this API on 8000).
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:9001';

// Basic request logging for debugging local flows.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// In-memory workspace store (MVP). Later we can persist to disk securely.
// workspace: { id, dbType, dbPath, schema }
const workspaces = new Map();

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
  // UI currently asks for host/username/password/database. For SQLite we interpret one of:
  // - `database` as the sqlite file path
  // - otherwise `host` as the sqlite file path
  const candidateDbPath = looksLikePath(database)
    ? database
    : (looksLikePath(host) ? host : database);
  if (!candidateDbPath) return null;
  return path.isAbsolute(candidateDbPath)
    ? candidateDbPath
    : path.resolve(process.cwd(), candidateDbPath);
}

async function getSqliteSchema(dbPath) {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    // Pull CREATE TABLE statements; they are compact and prompt-friendly.
    const rows = await db.all(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    const schema = rows
      .map((r) => r.sql)
      .filter(Boolean)
      .join('\n\n');

    // Cap size to keep prompts smaller.
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
    // Ensures mysql2 can handle modern MySQL auth plugins.
    // (mysql2 has built-in support for caching_sha2_password, etc.)
  });

  try {
    // NOTE: On some MySQL installations/users, information_schema filtering can behave unexpectedly.
    // `SHOW FULL TABLES` is a more reliable way to enumerate objects in the currently selected DB.
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
      // SHOW COLUMNS works for BASE TABLE; for views it also returns columns.
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

async function getMySqlTablesPreview({ host, username, password, database, port = 3306 }) {
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
    const [tablesRes] = await connection.query(
      "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema=? ORDER BY table_name LIMIT 30;",
      [dbName]
    );
    return tablesRes;
  } finally {
    await connection.end();
  }
}

async function getMySqlShowTablesPreview({ host, username, password, database, port = 3306 }) {
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
    const [dbRes] = await connection.query("SELECT DATABASE() as db;");
    const [showTablesRes] = await connection.query("SHOW TABLES;");
    const [showFullTablesRes] = await connection.query("SHOW FULL TABLES;");
    return {
      database: dbRes && dbRes[0] ? dbRes[0].db : dbName,
      showTables: showTablesRes,
      showFullTables: showFullTablesRes,
    };
  } finally {
    await connection.end();
  }
}

function cleanSql(text) {
  if (!text) return '';
  let s = String(text).trim();

  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) s = fence[1].trim();

  s = s.replace(/^\s*(SQL|Query)\s*:\s*/i, '').trim();

  const idx = s.search(/\b(SELECT|WITH)\b/i);
  if (idx !== -1) s = s.slice(idx).trim();

  if (s.endsWith(';')) s = s.slice(0, -1).trim();
  return s;
}

const DANGEROUS_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "truncate",
  "grant",
  "revoke",
  "merge",
  "replace",
  "call",
  "vacuum",
  "attach",
  "detach",
  "pragma",
];

function validateSqlReadOnly(sql) {
  const cleaned = cleanSql(sql);
  if (!cleaned) return { ok: false, reason: 'Empty SQL', sql: '' };

  // Reject multiple statements.
  if (cleaned.includes(';')) return { ok: false, reason: 'Multiple statements detected', sql: cleaned };

  if (!/^(SELECT|WITH)\b/i.test(cleaned)) {
    return { ok: false, reason: 'Only SELECT or WITH queries allowed', sql: cleaned };
  }

  for (const kw of DANGEROUS_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(cleaned)) return { ok: false, reason: `Forbidden keyword: ${kw}`, sql: cleaned };
  }

  return { ok: true, reason: 'OK', sql: cleaned };
}

function postJson(url, payload, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);

    const req = http.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed?.error || `AI service error: ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error(`AI service returned non-JSON: ${e.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('AI service timeout'));
    });
    req.on('error', reject);

    req.write(body);
    req.end();
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Create or update a workspace by connecting to a DB and extracting schema.
app.post('/api/workspaces/connect', async (req, res) => {
  try {
    const { workspaceId, type, host, username, password, database } = req.body || {};

    if (!type) return res.status(400).json({ error: 'Missing `type`.' });

    const id = workspaceId ? Number(workspaceId) : Date.now();
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: 'Invalid workspaceId.' });

    // Never log password.
    console.log(`[WORKSPACE_CONNECT] id=${id} type=${type} host=${host} username=${username} database=${database}`);

    // NOTE: We only need DB credentials during schema extraction; SQL generation is schema-only.
    let schema = '';
    let dbPath = undefined;

    if (type === 'sqlite') {
      dbPath = getSqliteDbPath({ host, database });
      if (!dbPath) return res.status(400).json({ error: 'Missing SQLite database path.' });
      if (!fs.existsSync(dbPath)) return res.status(400).json({ error: `SQLite file not found: ${dbPath}` });

      schema = await getSqliteSchema(dbPath);
      console.log(`[WORKSPACE_CONNECT] sqlite dbPath=${dbPath} schemaLen=${schema.length}`);
    } else if (type === 'postgresql') {
      schema = await getPostgresSchema({ host, username, password, database });
      console.log(`[WORKSPACE_CONNECT] postgres schemaLen=${schema.length}`);
    } else if (type === 'mysql') {
      schema = await getMySqlSchema({ host, username, password, database });
      console.log(`[WORKSPACE_CONNECT] mysql schemaLen=${schema.length}`);
    } else {
      return res.status(501).json({
        error: `DB type '${type}' not supported in MVP yet.`,
      });
    }

    if (!schema || !schema.trim()) {
      if (type === 'mysql') {
        try {
          const tablesPreview = await getMySqlTablesPreview({
            host,
            username,
            password,
            database,
          });
          const names = (tablesPreview || []).map((t) => t.table_name).filter(Boolean);
          const shown = names.slice(0, 10).join(', ');
          const dbName = String(database || '').trim();

          const showTables = await getMySqlShowTablesPreview({
            host,
            username,
            password,
            database,
          });

          console.log(`[WORKSPACE_CONNECT][MYSQL_EMPTY] db=${dbName} detectedTables=${names.length} first=${shown}`);
          return res.status(400).json({
            error: `Failed to extract schema from '${dbName}'. information_schema tables: ${shown || 'none'}. SHOW TABLES count: ${
              (showTables?.showTables || []).length
            }. SHOW TABLES first: ${
              (showTables?.showTables || []).slice(0, 10).map((r) => r[Object.keys(r)[0]]).filter(Boolean).join(', ') || 'none'
            }`,
          });
        } catch {
          // Fallback to generic message below.
        }
      }

      return res.status(400).json({ error: 'Failed to extract schema (no tables found).' });
    }

    workspaces.set(id, {
      id,
      dbType: type,
      dbPath,
      schema,
      createdAt: Date.now(),
    });

    console.log(`[WORKSPACE_CONNECT] success id=${id} schemaLen=${schema.length}`);
    return res.json({
      workspaceId: id,
      connected: true,
      schemaPreview: schema.slice(0, 400),
    });
  } catch (e) {
    console.error(`[WORKSPACE_CONNECT][ERROR] ${e && e.stack ? e.stack : e}`);
    return res.status(500).json({ error: e.message || 'Failed to connect workspace.' });
  }
});

app.get('/api/workspaces/:id/schema', (req, res) => {
  const id = Number(req.params.id);
  const ws = workspaces.get(id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
  res.json({ schema: ws.schema });
});

app.post('/api/workspaces/:id/generate-sql', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { question, modelPolicy } = req.body || {};

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'Missing `question`.' });
    }

    const ws = workspaces.get(id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found. Connect DB first.' });

    console.log(`[GENERATE_SQL] workspaceId=${id} question=${String(question).slice(0, 200)}`);
    console.log(`[GENERATE_SQL] schemaLen=${ws.schema.length} dbType=${ws.dbType}`);

    const aiUrl = new URL(AI_SERVICE_URL);
    aiUrl.pathname = aiUrl.pathname.replace(/\/$/, '') + '/generate-sql';

    const aiResponse = await postJson(aiUrl.toString(), {
      dbType: ws.dbType,
      schema: ws.schema,
      question: String(question),
      modelPolicy: modelPolicy || null,
    });

    if (!aiResponse || !aiResponse.sql) {
      return res.status(502).json({ error: 'AI service did not return SQL.' });
    }

    const validation = validateSqlReadOnly(aiResponse.sql);
    if (!validation.ok) {
      console.error(`[GENERATE_SQL][UNSAFE] reason=${validation.reason} raw=${String(aiResponse.sql).slice(0, 200)}`);
      return res.status(422).json({
        error: 'Unsafe SQL returned by AI service',
        validation: { ok: false, reason: validation.reason },
      });
    }

    console.log(
      `[GENERATE_SQL][OK] chosenModel=${aiResponse.chosenModel || null} sql=${String(validation.sql).slice(0, 200)}`
    );
    return res.json({
      sql: validation.sql,
      chosenModel: aiResponse.chosenModel || null,
      validation: aiResponse.validation || { ok: true, reason: 'OK' },
      candidates: aiResponse.candidates || null,
    });
  } catch (e) {
    console.error(`[GENERATE_SQL][ERROR] ${e && e.stack ? e.stack : e}`);
    return res.status(500).json({ error: e.message || 'Failed to generate SQL.' });
  }
});

app.listen(PORT, () => {
  console.log(`Application running on port ${PORT}`);
});