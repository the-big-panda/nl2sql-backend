const WebSocket = require("ws");

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 * @returns {WebSocket.Server} WebSocket server instance
 */
function initializeWebSocket(server) {
  const wss = new WebSocket.Server({ 
    server,
    path: "/ws"
  });

  // Track connected clients
  wss.clients = new Map(); // Map of user_id -> WebSocket

  wss.on("connection", (ws, req) => {
    console.log("New WebSocket connection");

    // Store connection for later use
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
  });

  // Heartbeat to detect dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  return wss;
}

/**
 * Broadcast message to specific user
 * @param {WebSocket.Server} wss - WebSocket server
 * @param {string} user_id - User ID
 * @param {object} message - Message to send
 */
function broadcastToUser(wss, user_id, message) {
  const ws = wss.clients.get(user_id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Broadcast to all connected clients
 * @param {WebSocket.Server} wss - WebSocket server
 * @param {object} message - Message to send
 */
function broadcastToAll(wss, message) {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

module.exports = {
  initializeWebSocket,
  broadcastToUser,
  broadcastToAll,
};
