// Expose the mysql2 module for on-demand connections (do not auto-connect on require)
const mysql = require("mysql2");

module.exports = mysql;
