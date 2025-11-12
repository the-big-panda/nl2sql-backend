import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";

/**
 * Get all database names from a MySQL or PostgreSQL server.
 * @param {"mysql"|"postgres"} dbType - Type of database server.
 * @param {object} config - Connection config (host, user, password, etc.)
 * @returns {Promise<string[]>} List of database names.
 */
export async function getDatabaseNames(dbType, config) {
  if (dbType === "mysql") {
    const conn = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
    });

    const [rows] = await conn.query("SHOW DATABASES;");
    await conn.end();

    // Filter out system databases if desired
    return rows.map(r => r.Database).filter(db => !["information_schema", "performance_schema", "mysql", "sys"].includes(db));
  }

  else if (dbType === "postgres") {
    const client = new PgClient({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port || 5432,
      database: "postgres" // connect to default DB
    });
    await client.connect();

    const res = await client.query(`
      SELECT datname
      FROM pg_database
      WHERE datistemplate = false;
    `);

    await client.end();
    return res.rows.map(r => r.datname);
  }

  else {
    throw new Error("Unsupported dbType. Use 'mysql' or 'postgres'.");
  }
}

/**
 * Get all table names from a specific database.
 * @param {"mysql"|"postgres"} dbType - Type of database.
 * @param {object} config - Connection config including database name.
 * @returns {Promise<string[]>} List of table names.
 */
export async function getTableNames(dbType, config) {
  if (dbType === "mysql") {
    const conn = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database
    });

    const [rows] = await conn.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE();
    `);

    await conn.end();
    return rows.map(r => r.table_name);
  }

  else if (dbType === "postgres") {
    const client = new PgClient({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port || 5432
    });
    await client.connect();

    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    await client.end();
    return res.rows.map(r => r.table_name);
  }

  else {
    throw new Error("Unsupported dbType. Use 'mysql' or 'postgres'.");
  }
}


module.exports={getDatabaseNames,getTableNames}