const { Client } = require("pg");
require("dotenv").config();

const pg_db = new Client({
  user: process.env.PG_DATABASE_USER || "postgres",
  host: process.env.PG_DATABASE_HOST || "localhost",
  database: process.env.PG_DATABASE_NAME || "local_setup_db",
  password: process.env.PG_DATABASE_PASSWORD || "",
  port: Number(process.env.PG_DATABASE_PORT || 5432),
  ssl: false, // ✅ disable SSL for local
});

pg_db.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ Connection error", err));

module.exports = pg_db
