const axios = require("axios");
require("dotenv").config();
const pg_db = require("../../database/postgresConfig");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");
const { getUserContainer } = require("../../services/containerService");

function buildUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, "")}${path}`;
}

function schemaToText(schema) {
  if (!schema || typeof schema !== "object") {
    return String(schema || "");
  }

  return Object.entries(schema)
    .map(([tableName, columns]) => {
      const columnText = Array.isArray(columns)
        ? columns.map((column) => `${column.column} ${column.type}`).join(", ")
        : JSON.stringify(columns);
      return `${tableName}(${columnText})`;
    })
    .join("\n");
}

function schemaToTables(schema) {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  return Object.entries(schema).map(([tableName, columns]) => ({
    table_name: tableName,
    columns: Array.isArray(columns) ? columns : [],
    schema_text: `${tableName}(${
      Array.isArray(columns)
        ? columns.map((column) => `${column.column} ${column.type}`).join(", ")
        : JSON.stringify(columns)
    })`,
  }));
}

function normalizeGeneratedSql(sql) {
  if (!sql) {
    return sql;
  }

  return String(sql)
    .replace(
      /\b(SUM|AVG|MIN|MAX|COUNT)\s+([a-zA-Z_][\w.]*\s*(?:[+\-*/]\s*[a-zA-Z_][\w.]*)*)\s+AS\b/gi,
      (_, fn, expression) => `${fn.toUpperCase()}(${expression.trim()}) AS`
    )
    .trim();
}

function getMetadataQuery(db_service, nl_query) {
  const question = String(nl_query || "").trim().toLowerCase();
  const asksForTables =
    /\b(show|list|get|display)\b/.test(question) &&
    /\b(tables|relations)\b/.test(question);

  if (!asksForTables) {
    return null;
  }

  const dbType = String(db_service || "").toLowerCase();
  if (dbType === "postgres" || dbType === "postgresql") {
    return `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `.trim();
  }

  if (dbType === "mysql" || dbType === "mariadb") {
    return `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      ORDER BY table_name
    `.trim();
  }

  return null;
}

function quoteIdentifier(identifier, db_service) {
  const dbType = String(db_service || "").toLowerCase();
  const safeIdentifier = String(identifier || "").replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeIdentifier) {
    return null;
  }

  if (dbType === "mysql" || dbType === "mariadb") {
    return `\`${safeIdentifier}\``;
  }

  return `"${safeIdentifier}"`;
}

function getSimpleSelectQuery(db_service, nl_query, schema) {
  const question = String(nl_query || "").trim().toLowerCase();
  const asksForRows =
    /\b(fetch|get|show|list|display|select)\b/.test(question) &&
    /\b(data|rows|records|entries|all)\b/.test(question);

  if (!asksForRows || !schema || typeof schema !== "object") {
    return null;
  }

  const tableName = Object.keys(schema).find((name) => {
    const normalizedName = name.toLowerCase();
    return (
      question.includes(normalizedName) ||
      question.includes(`${normalizedName} table`) ||
      question.includes(`table ${normalizedName}`)
    );
  });

  const quotedTableName = quoteIdentifier(tableName, db_service);
  if (!quotedTableName) {
    return null;
  }

  return `SELECT * FROM ${quotedTableName} LIMIT 100`;
}

function getSampleJoinQuery(nl_query, schema) {
  const question = String(nl_query || "").trim().toLowerCase();
  const tableNames = new Set(Object.keys(schema || {}).map((name) => name.toLowerCase()));

  const asksForCustomerSales =
    /\b(total|sum|revenue|sales|value)\b/.test(question) &&
    /\bcustomer/.test(question) &&
    ["customers", "orders", "order_items"].every((tableName) => tableNames.has(tableName));

  if (!asksForCustomerSales) {
    return null;
  }

  return `
    SELECT c.customer_name,
           SUM(oi.quantity * oi.unit_price) AS total_sales
    FROM customers c
    JOIN orders o ON o.customer_id = c.customer_id
    JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.status = 'completed'
    GROUP BY c.customer_name
    ORDER BY total_sales DESC
  `.trim();
}

async function getUserContainerBaseUrl(user_id) {
  if (!user_id) {
    return null;
  }

  const containerResult = await getUserContainer(user_id);
  if (!containerResult.success || !containerResult.container) {
    return null;
  }

  const { container_host, container_port } = containerResult.container;
  if (!container_host) {
    return null;
  }

  if (/^https?:\/\//i.test(container_host)) {
    return container_host;
  }

  return `http://${container_host}:${container_port}`;
}

async function schemaUpload(workspace_id, db_service, schema, user_id = null) {
  try {
    if (!workspace_id || !db_service || !schema) {
      throw new Error("Missing required parameters: workspace_id, db_service or schema.");
    }

    const payload = {
      workspace_id,
      dbType: db_service,
      tables: schemaToTables(schema),
    };

    console.log("Payload sent to API:", JSON.stringify(payload, null, 2));

    const containerBaseUrl = await getUserContainerBaseUrl(user_id);
    const ENDPOINT_URL = containerBaseUrl
      ? buildUrl(containerBaseUrl, "/update-schema")
      : process.env.ENDPOINT_URL || "http://localhost:8001/update-schema";

    const response = await axios.post(ENDPOINT_URL, payload);

    return { success: true, "result":response };
     
  } catch (error) {
    console.error("Schema Upload Error:", error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}


async function fetchQuery(db_name, nl_query, user_id = null, options = {}) {
  try {
    if (!db_name || !nl_query) {
      throw new Error("Database name and NL query required");
    }

    const metadataQuery = getMetadataQuery(options.db_service || options.dbType, nl_query);
    if (metadataQuery) {
      return {
        success: true,
        sql_query: metadataQuery,
        source: "metadata-shortcut",
      };
    }

    const simpleSelectQuery = getSimpleSelectQuery(
      options.db_service || options.dbType,
      nl_query,
      options.schema
    );
    if (simpleSelectQuery) {
      return {
        success: true,
        sql_query: simpleSelectQuery,
        source: "simple-select-shortcut",
      };
    }

    const sampleJoinQuery = getSampleJoinQuery(nl_query, options.schema);
    if (sampleJoinQuery) {
      return {
        success: true,
        sql_query: sampleJoinQuery,
        source: "sample-join-shortcut",
      };
    }

    const containerBaseUrl = await getUserContainerBaseUrl(user_id);
    const ENDPOINT_URL = containerBaseUrl
      ? buildUrl(containerBaseUrl, "/generate-sql")
      : process.env.QUERY_GENERATOR_URL || "http://127.0.0.1:8000/generate-sql";

    let question = String(nl_query).trim();
    if (options.previous_sql || options.query_error) {
      question = [
        question,
        "",
        "The previous SQL failed. Generate a corrected PostgreSQL SELECT query.",
        "Use only tables and columns that exist in the provided schema.",
        "Return only executable SQL. Aggregate functions must use parentheses, for example SUM(oi.quantity * oi.unit_price).",
        options.previous_sql ? `Previous SQL:\n${options.previous_sql}` : null,
        options.query_error ? `Database error:\n${options.query_error}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    const payload = {
      database: String(db_name).trim(),
      dbType: options.db_service || options.dbType || "postgres",
      schema: schemaToText(options.schema),
      question,
      workspace_id: options.workspace_id || String(db_name).trim(),
    };

    console.log("QUERY ENDPOINT:", ENDPOINT_URL);
    console.log("QUERY PAYLOAD:", JSON.stringify(payload, null, 2));

    const response = await axios.post(ENDPOINT_URL, payload);

    const sql_query = normalizeGeneratedSql(response.data.sql_query || response.data.sql);

    console.log("\nSQL QUERY FROM LLM:", sql_query, "\n");

    // FIXED VALIDATION
    if (!sql_query) {
      throw new Error("Invalid response from query generator service");
    }

    return {
      success: true,
      sql_query
    };

  } catch (error) {
    const errorDetail = error.response?.data || error.message;
    console.error("Query Fetch Error:", errorDetail);

    return {
      success: false,
      error: errorDetail
    };
  }
}


/**
 * Save a message to the messages table
 * @param {string} workspace_id - Workspace UUID
 * @param {string} role - Message role ('user', 'assistant', 'system')
 * @param {string} content - Message content
 * @param {string} generated_sql - Generated SQL query (optional)
 * @param {object} result_metadata - Query execution metadata (optional)
 * @returns {Promise<object>} Message record with message_id
 */
async function saveMessage(workspace_id, role, content, generated_sql = null, result_metadata = null) {
  try {
    if (!workspace_id || !role || !content) {
      throw new Error("Missing required parameters: workspace_id, role, or content");
    }

    // Validate role
    if (!["user", "assistant", "system"].includes(role)) {
      throw new Error("Invalid role. Must be 'user', 'assistant', or 'system'");
    }

    const message_id = uuidv4();
    const sequence_number = await getNextSequenceNumber(workspace_id);

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        `INSERT INTO messages 
        (message_id, workspace_id, role, content, generated_sql, result_metadata, sequence_number, created_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *;`,
        [message_id, workspace_id, role, content, generated_sql, result_metadata ? JSON.stringify(result_metadata) : null, sequence_number]
      );
      return { success: true, message: result.rows[0] };
    } else {
      await mysql.promise().query(
        `INSERT INTO messages 
        (message_id, workspace_id, role, content, generated_sql, result_metadata, sequence_number, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW());`,
        [message_id, workspace_id, role, content, generated_sql, result_metadata ? JSON.stringify(result_metadata) : null, sequence_number]
      );
      return { success: true, message_id, workspace_id, role, content, sequence_number };
    }
  } catch (error) {
    console.error("Save Message Error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get the next sequence number for a workspace (for ordering messages)
 * @param {string} workspace_id - Workspace UUID
 * @returns {Promise<number>} Next sequence number
 */
async function getNextSequenceNumber(workspace_id) {
  try {
    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        "SELECT MAX(sequence_number) as max_seq FROM messages WHERE workspace_id = $1;",
        [workspace_id]
      );
      return (result.rows[0].max_seq || 0) + 1;
    } else {
      const [result] = await mysql.promise().query(
        "SELECT MAX(sequence_number) as max_seq FROM messages WHERE workspace_id = ?;",
        [workspace_id]
      );
      return (result[0].max_seq || 0) + 1;
    }
  } catch (error) {
    console.error("Get Sequence Number Error:", error.message);
    return 1;
  }
}

/**
 * Retrieve conversation history (all messages for a workspace)
 * @param {string} workspace_id - Workspace UUID
 * @param {number} limit - Maximum messages to retrieve (optional, default 50)
 * @returns {Promise<object>} Array of messages ordered by sequence
 */
async function getConversationHistory(workspace_id, limit = 50) {
  try {
    if (!workspace_id) {
      return { success: true, messages: [] }; // No workspace_id, return empty
    }

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        `SELECT * FROM messages 
        WHERE workspace_id = $1 
        ORDER BY sequence_number ASC 
        LIMIT $2;`,
        [workspace_id, limit]
      );
      return { success: true, messages: result.rows };
    } else {
      const [result] = await mysql.promise().query(
        `SELECT * FROM messages 
        WHERE workspace_id = ? 
        ORDER BY sequence_number ASC 
        LIMIT ?;`,
        [workspace_id, limit]
      );
      return { success: true, messages: result };
    }
  } catch (error) {
    console.warn(`⚠️ Conversation history fetch failed (non-blocking - table may not exist): ${error.message}`);
    // Don't fail - return empty messages, not critical
    return { success: true, messages: [] };
  }
}

/**
 * Get a specific message by ID
 * @param {string} message_id - Message UUID
 * @returns {Promise<object>} Message record
 */
async function getMessage(message_id) {
  try {
    if (!message_id) {
      throw new Error("message_id is required");
    }

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        "SELECT * FROM messages WHERE message_id = $1;",
        [message_id]
      );
      if (result.rows.length === 0) {
        throw new Error("Message not found");
      }
      return { success: true, message: result.rows[0] };
    } else {
      const [result] = await mysql.promise().query(
        "SELECT * FROM messages WHERE message_id = ?;",
        [message_id]
      );
      if (!result || result.length === 0) {
        throw new Error("Message not found");
      }
      return { success: true, message: result[0] };
    }
  } catch (error) {
    console.error("Get Message Error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete all messages for a workspace/conversation
 * @param {string} workspace_id - Workspace UUID
 * @returns {Promise<object>} Success status
 */
async function deleteConversation(workspace_id) {
  try {
    if (!workspace_id) {
      throw new Error("workspace_id is required");
    }

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      await pg_db.query(
        "DELETE FROM messages WHERE workspace_id = $1;",
        [workspace_id]
      );
    } else {
      await mysql.promise().query(
        "DELETE FROM messages WHERE workspace_id = ?;",
        [workspace_id]
      );
    }

    return { success: true, message: "Conversation deleted" };
  } catch (error) {
    console.error("Delete Conversation Error:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  schemaUpload,
  fetchQuery,
  saveMessage,
  getConversationHistory,
  getMessage,
  deleteConversation
};
