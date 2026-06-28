// setup-localdb.js
const os = require("os");
const { Client } = require("pg");
const mysql = require("mysql2/promise");
require("dotenv").config();

/**
 * Initialize the `local_setup_db` database and ensure required tables exist.
 * Returns a connected DB client/connection depending on the chosen DB.
 */
async function setupLocalDB(dbType) {
  if (!dbType) {
    console.log("No database available for setup.");
    return null;
  }

  const localDBName = process.env.PG_DATABASE_NAME || process.env.MYSQL_DATABASE_NAME || "local_setup_db";

  if (dbType === "postgres") {
    // Connect to admin DB to create database if needed
    const admin = new Client({
      user: process.env.PG_DATABASE_USER || "postgres",
      host: process.env.PG_DATABASE_HOST || "localhost",
      database: "postgres",
      password: process.env.PG_DATABASE_PASSWORD || "",
      port: Number(process.env.PG_DATABASE_PORT || 5432),
    });
    await admin.connect();
    try {
      const existsRes = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [localDBName],
      );
      if (existsRes.rowCount === 0) {
        await admin.query(`CREATE DATABASE ${localDBName};`);
        console.log(`✅ Created ${localDBName} database`);
      } else {
        console.log("✅ Database already exists");
      }
    } catch (err) {
      console.log("⚠️", err.message || err);
    } finally {
      await admin.end();
    }

    // Use the project's postgresConfig (connects to local_setup_db)
    const pg_db = require("../database/postgresConfig");

    // Create tables if they don't exist
    await pg_db.query(`
      CREATE TABLE IF NOT EXISTS userinfos (
        user_id TEXT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        useremail VARCHAR(255) UNIQUE NOT NULL,
        user_password VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await pg_db.query(`CREATE TABLE IF NOT EXISTS workspace (
    workspace_id UUID PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES userinfos(user_id) ON DELETE CASCADE,
    db_id TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`);

    await pg_db.query(`CREATE INDEX IF NOT EXISTS idx_workspace_user_id ON workspace(user_id);`);

    await pg_db.query(`
        CREATE TABLE IF NOT EXISTS dbinfos (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES userinfos(user_id) ON DELETE CASCADE,
          db_workspace TEXT NOT NULL,
          db_service TEXT NOT NULL,
          db_host TEXT NOT NULL,
          db_user TEXT NOT NULL,
          db_password TEXT NOT NULL,
          db_name TEXT NOT NULL,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
    `);

    await pg_db.query(`CREATE TABLE IF NOT EXISTS messages (
    message_id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    generated_sql TEXT,
    result_metadata JSONB,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT fk_workspace
        FOREIGN KEY(workspace_id)
        REFERENCES workspace(workspace_id)
        ON DELETE CASCADE,

    CONSTRAINT unique_sequence_per_workspace
        UNIQUE(workspace_id, sequence_number)
);`)

    await pg_db.query(`
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
    `);

    await pg_db.query(`CREATE INDEX IF NOT EXISTS idx_containers_user_id ON containers(user_id);`);

    // Seed initial user if empty
    const countRes = await pg_db.query("SELECT COUNT(*) FROM userinfos;");
    const count = parseInt(countRes.rows[0].count, 10);
    if (count === 0) {
      await pg_db.query(
        `INSERT INTO userinfos (user_id, username, useremail, user_password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [
          "local_user_1",
          os.userInfo().username,
          `${os.userInfo().username}@local.dev`,
          "password123",
        ],
      );
      console.log("Inserted initial local setup info.");
    } else {
      console.log("Local setup info already exists.");
    }

    return pg_db;
  }

  if (dbType === "mysql") {
    // Connect to server without database to create the DB if needed
    const admin = await mysql.createConnection({
      host: process.env.MYSQL_DATABASE_HOST || "localhost",
      user: process.env.MYSQL_DATABASE_USER || "root",
      password: process.env.MYSQL_DATABASE_PASSWORD || "root",
      multipleStatements: true,
    });
    try {
      await admin.query(`CREATE DATABASE IF NOT EXISTS ${localDBName};`);
      console.log(`✅ Ensured ${localDBName} exists`);
    } catch (err) {
      console.log("⚠️", err.message || err);
    } finally {
      await admin.end();
    }

    // Use mysql2 module to create an on-demand connection to local_setup_db
    const mysqlModule = require("../database/mysqlConfig");

    const conn = await mysqlModule.createConnection({
      host: process.env.MYSQL_DATABASE_HOST || "localhost",
      user: process.env.MYSQL_DATABASE_USER || "root",
      password: process.env.MYSQL_DATABASE_PASSWORD || "root",
      database: localDBName,
      port: Number(process.env.MYSQL_DATABASE_PORT || 3306),
    });

    // Ensure tables exist (use the promise API)
    await conn.promise().query(`
      CREATE TABLE IF NOT EXISTS userinfos (
        user_id TEXT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        useremail VARCHAR(255) UNIQUE NOT NULL,
        user_password VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    await conn.promise().query(`
      CREATE TABLE IF NOT EXISTS workspace (
        workspace_id CHAR(36) PRIMARY KEY,
        user_id TEXT NOT NULL,
        db_id TEXT NOT NULL,
        title TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES userinfos(user_id) ON DELETE CASCADE
      );
    `);

    await conn.promise().query(`
      CREATE TABLE IF NOT EXISTS dbinfos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id TEXT,
        db_workspace CHAR(36) UNIQUE NOT NULL,
        db_service TEXT NOT NULL,
        db_host TEXT NOT NULL,
        db_user TEXT NOT NULL,
        db_password TEXT NOT NULL,
        db_name TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES userinfos(user_id) ON DELETE CASCADE,
        FOREIGN KEY (db_workspace) REFERENCES workspace(workspace_id) ON DELETE CASCADE
      );
    `);

    await conn.promise().query(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id CHAR(36) PRIMARY KEY,
        workspace_id CHAR(36) NOT NULL,
        role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
        content LONGTEXT NOT NULL,
        generated_sql LONGTEXT,
        result_metadata JSON,
        sequence_number INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_sequence_per_workspace (workspace_id, sequence_number),
        FOREIGN KEY (workspace_id) REFERENCES workspace(workspace_id) ON DELETE CASCADE
      );
    `);

    await conn.promise().query(`
      CREATE TABLE IF NOT EXISTS containers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL UNIQUE,
        container_id VARCHAR(255) NOT NULL UNIQUE,
        container_host TEXT NOT NULL,
        container_port INT NOT NULL,
        container_ws_url TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES userinfos(user_id) ON DELETE CASCADE,
        INDEX idx_containers_user_id (user_id)
      );
    `);

    // Seed initial user if empty
    const [rows] = await conn.promise().query("SELECT COUNT(*) as cnt FROM userinfos;");
    const count = rows && rows[0] ? rows[0].cnt : 0;
    if (count === 0) {
      await conn
        .promise()
        .query(
          `INSERT INTO userinfos (user_id, username, useremail, user_password, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [
            "local_user_1",
            os.userInfo().username,
            `${os.userInfo().username}@local.dev`,
            "password123",
          ],
        );
      console.log("Inserted initial local setup info.");
    } else {
      console.log("Local setup info already exists.");
    }

    await conn.end();

    // Return the mysql module so callers can create connections when needed
    return mysqlModule;
  }

  console.log("Unsupported DB type for setupLocalDB:", dbType);
  return null;
}

module.exports = { setupLocalDB };
