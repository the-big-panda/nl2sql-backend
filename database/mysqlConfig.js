const mysql = require("mysql2");

// Create a connection to the MySQL database
const mysql_db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "424354", // or your password
  database: "local_setup_db",
  port: 3306, // default MySQL port
});

// Connect to MySQL
mysql_db.connect((err) => {
  if (err) {
    console.error("❌ Connection error:", err);
  } else {
    console.log("✅ Connected to MySQL");
  }
});

module.exports = mysql_db;
