// util/check-db.js
const mysql = require("mysql2/promise");
const { Client } = require("pg");

async function getAvailableDB() {

   try {
    const client = new Client({
      host: "localhost",
      user: "postgres",
      password: "",
      database: "postgres",
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
      host: "localhost",
      user: "root",
      password: "424354",
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