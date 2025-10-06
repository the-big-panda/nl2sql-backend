// check-dbs.js
const mysql = require("mysql2/promise");
const { Client } = require("pg");

async function checkMySQL() {
  try {
    const conn = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: ""
    });
    await conn.end();
    return true;
  } catch {
    return false;
  }
}

async function checkPostgres() {
  const client = new Client({
    host: "localhost",
    user: "postgres",
    password: "",
    port: 5432,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function getAvailableDB() {
  const [mysqlUp, pgUp] = await Promise.all([checkMySQL(), checkPostgres()]);
  if (mysqlUp) return "mysql";
  if (pgUp) return "postgres";
  return null;
}

module.exports = { getAvailableDB };
