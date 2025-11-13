import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import fs from "fs";

/**
 * Extracts the database schema for either MySQL or PostgreSQL.
 * @param {"mysql"|"postgres"} dbType - Type of database.
 * @param {object} config - Connection configuration.
 * @param {string} outputPath - Optional path to save JSON schema.
 * @returns {Promise<object>} The schema object.
 */
export async function extractSchema(dbType, config) {
  console.log("\nExtracting Schema\n")
  let rows;

  if (dbType === "mysql") {
    const conn = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database
    });

    const [result] = await conn.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
      ORDER BY table_name, ordinal_position;
    `);
    rows = result;
    await conn.end();
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
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);
    rows = res.rows;
    await client.end();
  }

  else {
    throw new Error("Unsupported dbType. Use 'mysql' or 'postgres'.");
  }

  // Build schema object
  const schema = {};
  for (const r of rows) {
    if (!schema[r.table_name]) schema[r.table_name] = [];
    schema[r.table_name].push({
      column: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable,
      default: r.column_default
    });
  }



  // Optionally save to file
  
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    console.log(`✅ Schema exported to ${outputPath}`);


  return schema;
}
