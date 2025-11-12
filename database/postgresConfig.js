const { Client } = require("pg");

const pg_db = new Client({
  user: "postgres",
  host: "localhost",
  database: "local_setup_db",
  password: "", // or your password
  port: 5432,
  ssl: false, // ✅ disable SSL for local
});

pg_db.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ Connection error", err));

module.exports = pg_db
