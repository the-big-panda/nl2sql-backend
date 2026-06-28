// util/check-db.js
const mysql = require("mysql2/promise");
const { Client } = require("pg");
require("dotenv").config();

async function getAvailableDB() {

   try {
    const client = new Client({
      host: process.env.PG_DATABASE_HOST || "localhost",
      user: process.env.PG_DATABASE_USER || "postgres",
      password: process.env.PG_DATABASE_PASSWORD || "",
      database: "postgres",
      port: Number(process.env.PG_DATABASE_PORT || 5432),
    });
    await client.connect();
    await client.end();
    return "postgres";
  } catch (err) {
    // PostgreSQL not available
  }
  // Try MySQL first
  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_DATABASE_HOST || "localhost",
      user: process.env.MYSQL_DATABASE_USER || "root",
      password: process.env.MYSQL_DATABASE_PASSWORD || "root",
      port: Number(process.env.MYSQL_DATABASE_PORT || 3306),
    });
    await connection.end();
    return "mysql";
  } catch (err) {
    // MySQL not available, try PostgreSQL
  }

  // Try PostgreSQL
 

  return null; // No database available
}

module.exports = { getAvailableDB };
