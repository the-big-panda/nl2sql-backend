const jwt = require("jsonwebtoken");
require('dotenv').config();

/**
 * Normalize user fields from token for compatibility
 */
const normalizeUserFields = (decoded) => {
  return {
    userId: decoded.user_id || decoded.userID || decoded.userId,
    user_id: decoded.user_id || decoded.userID || decoded.userId,
    userName: decoded.userName || decoded.username || decoded.user_name,
    email: decoded.email,
  };
};

/**
 * WebSocket authentication middleware
 * Verifies JWT token from WebSocket connection
 * @param {http.IncomingMessage} req - WebSocket upgrade request
 * @returns {object} { user_id, error } or null if invalid
 */
function authenticateWebSocket(req) {
  try {
    // Extract token from URL query params or headers
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return { error: "No token provided" };
    }

    const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN || "your_secret_key";
    const decoded = jwt.verify(token, jwtSecret);
    
    const normalized = normalizeUserFields(decoded);
    return { 
      user_id: normalized.user_id,
      userId: normalized.user_id,
      ...normalized 
    };
  } catch (error) {
    console.error("WebSocket Auth Error:", error.message);
    return { error: error.message };
  }
}

module.exports = {
  authenticateWebSocket,
  normalizeUserFields,
};
