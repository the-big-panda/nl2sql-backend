const jwt = require("jsonwebtoken");
const { model } = require("mongoose");
require('dotenv').config();

// Normalize field names for compatibility
const normalizeUserFields = (decoded) => {
  return {
    userId: decoded.user_id || decoded.userID || decoded.userId,
    userName: decoded.userName || decoded.username || decoded.user_name,
    email: decoded.email,
    // Keep original fields for backward compatibility
    userID: decoded.user_id || decoded.userID || decoded.userId,
    user_id: decoded.user_id || decoded.userID || decoded.userId,
  };
};

const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  
  try {
    const decodedBody = jwt.verify(token, process.env.JWT_SECRET || process.env.ACCESS_TOKEN);
    const normalizedUser = normalizeUserFields(decodedBody);
    req.user = { ...decodedBody, ...normalizedUser };
    next();
  } catch (error) {
    console.log('Authentication Error', error.message);
    res.status(401).send("Invalid or expired token");
  }
};

const generateToken = (userData) => {
  const { userID, userName, userId, username, email } = userData;
  
  // Normalize input
  const normalizedUserId = userId || userID;
  const normalizedUserName = username || userName;
  
  const payload = {
    user_id: normalizedUserId,
    userId: normalizedUserId,
    userID: normalizedUserId,
    username: normalizedUserName,
    userName: normalizedUserName,
    email: email,
  };
  
  const token = jwt.sign(payload, process.env.JWT_SECRET || process.env.ACCESS_TOKEN, {
    expiresIn: process.env.JWT_EXPIRY || '24h',
  });
  return token;
};

module.exports = { authenticateToken, generateToken, normalizeUserFields };