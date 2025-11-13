import mysql from "mysql2/promise";
import { Client as PGClient } from "pg";
import pg_db from "../util/pg-pool.js"; // adjust path

export async function handleQueryExecution(db_name, user_id, sql_query) {
  try {
    if (!db_name || !user_id || !sql_query) {
      return {
        success: false,
        error: "db_name, user_id, and sql_query are required."
      };
    }

    // Fetch workspace details
    const query = `
      SELECT *
      FROM dbinfos
      WHERE user_id = $1 AND db_name = $2
    `;

    const result = await pg_db.query(query, [user_id, db_name]);

    if (result.rowCount === 0) {
      return {
        success: false,
        error: "Workspace not found for this user."
      };
    }

    const workspace = result.rows[0];

    const {
      db_service,
      db_host,
      db_user,
      db_password,
      db_name: workspaceDBName
    } = workspace;

    let connection;
    let rows;
    let fields;

    // Connect and execute query based on db type
    if (db_service === "postgres") {
      connection = new PGClient({
        host: db_host,
        user: db_user,
        password: db_password,
        database: workspaceDBName,
        port: 5432
      });

      await connection.connect();

      const result = await connection.query(sql_query);
      rows = result.rows;
      fields = result.fields?.map(f => f.name);

      await connection.end();
    }

    else if (db_service === "mysql") {
      connection = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: workspaceDBName,
        port: 3306
      });

      const [resultRows, resultFields] = await connection.query(sql_query);
      rows = resultRows;
      fields = resultFields?.map(f => f.name);

      await connection.end();
    }

    else {
      return {
        success: false,
        error: `Unsupported DB service: ${db_service}`
      };
    }

    return {
      success: true,
      db_service,
      db_name: workspaceDBName,
      fields: fields || [],
      rows: rows || []
    };

  } catch (error) {
    console.error("Query Execution Error:", error);

    return {
      success: false,
      error: error.message
    };
  }
}


module.exports = handleQueryExecution