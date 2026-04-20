const pg_db = require("../database/postgresConfig");
const mysql = require("mysql2/promise");

/**
 * Fetch user's container information from database
 * @param {string} user_id - User ID
 * @returns {Promise<object>} Container info { container_id, container_host, container_port, container_ws_url }
 */
async function getUserContainer(user_id) {
  try {
    if (!user_id) {
      throw new Error("user_id is required");
    }

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        `SELECT container_id, container_host, container_port, container_ws_url, status 
         FROM containers WHERE user_id = $1;`,
        [user_id]
      );
      if (result.rows.length === 0) {
        throw new Error("No container found for this user");
      }
      return { success: true, container: result.rows[0] };
    } else {
      const [result] = await mysql.promise().query(
        `SELECT container_id, container_host, container_port, container_ws_url, status 
         FROM containers WHERE user_id = ?;`,
        [user_id]
      );
      if (!result || result.length === 0) {
        throw new Error("No container found for this user");
      }
      return { success: true, container: result[0] };
    }
  } catch (error) {
    console.error("Get User Container Error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create container record for user (called during user registration)
 * @param {string} user_id - User ID
 * @param {string} container_id - Container ID from remote server
 * @param {string} container_host - Container host/IP
 * @param {number} container_port - Container port
 * @param {string} container_ws_url - WebSocket URL for container
 * @returns {Promise<object>} Success status
 */
async function createUserContainer(user_id, container_id, container_host, container_port, container_ws_url) {
  try {
    if (!user_id || !container_id || !container_host || !container_port || !container_ws_url) {
      throw new Error("All container parameters are required");
    }

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      await pg_db.query(
        `INSERT INTO containers (user_id, container_id, container_host, container_port, container_ws_url, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW());`,
        [user_id, container_id, container_host, container_port, container_ws_url, "active"]
      );
    } else {
      await mysql.promise().query(
        `INSERT INTO containers (user_id, container_id, container_host, container_port, container_ws_url, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW());`,
        [user_id, container_id, container_host, container_port, container_ws_url, "active"]
      );
    }

    console.log(`✅ Container created for user: ${user_id}`);
    return { success: true, message: "Container created" };
  } catch (error) {
    console.error("Create User Container Error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update container status
 * @param {string} user_id - User ID
 * @param {string} status - Container status (active, inactive, error, etc.)
 * @returns {Promise<object>} Success status
 */
async function updateContainerStatus(user_id, status) {
  try {
    if (!user_id || !status) {
      throw new Error("user_id and status are required");
    }

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      await pg_db.query(
        `UPDATE containers SET status = $1, updated_at = NOW() WHERE user_id = $2;`,
        [status, user_id]
      );
    } else {
      await mysql.promise().query(
        `UPDATE containers SET status = ?, updated_at = NOW() WHERE user_id = ?;`,
        [status, user_id]
      );
    }

    return { success: true, message: `Container status updated to ${status}` };
  } catch (error) {
    console.error("Update Container Status Error:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getUserContainer,
  createUserContainer,
  updateContainerStatus,
};
