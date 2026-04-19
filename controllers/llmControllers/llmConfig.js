const axios = require("axios");
require("dotenv").config();
const pg_db = require("../../database/postgresConfig");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

async function schemaUpload(db_name, db_service, schema) {
  try {
    if (!db_name || !db_service || !schema) {
      throw new Error("Missing required parameters: db_name, db_service or schema.");
    }

    // DO NOT FLATTEN SCHEMA. FastAPI expects nested object.
    const payload = {
      database: db_name,
      service: "postgres",
      schema: schema     // <-- keep ORIGINAL nested objecrt
    };

    console.log("Payload sent to API:", JSON.stringify(payload, null, 2));

    const ENDPOINT_URL =
      process.env.ENDPOINT_URL ||
      "http://localhost:8001/generate-sql";

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


async function fetchQuery(db_name, nl_query) {
  try {
    if (!db_name || !nl_query) {
      throw new Error("Database name and NL query required");
    }

    const ENDPOINT_URL =
      process.env.QUERY_GENERATOR_URL ||
      "http://127.0.0.1:8000/api/query";

    const payload = {
      database: String(db_name).trim(),
      query: String(nl_query).trim()
    };

    console.log("QUERY PAYLOAD:", JSON.stringify(payload, null, 2));

    const response = await axios.post(ENDPOINT_URL, payload);

    console.log("\nSQL QUERY FROM LLM:", response.data.sql_query, "\n");

    // FIXED VALIDATION
    if (!response.data.success || !response.data.sql_query) {
      throw new Error("Invalid response from query generator service");
    }

    return {
      success: true,
      sql_query: response.data.sql_query
    };

  } catch (error) {
    console.error("Query Fetch Error:", error.message);

    return {
      success: false,
      error: error.message
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
      throw new Error("workspace_id is required");
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
    console.error("Get Conversation History Error:", error.message);
    return { success: false, error: error.message };
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
