const WebSocket = require("ws");

/**
 * WebSocket client for communicating with remote container
 * Manages connection lifecycle and message handling
 */
class RemoteContainerClient {
  constructor(container_ws_url, user_id) {
    this.container_ws_url = container_ws_url;
    this.user_id = user_id;
    this.ws = null;
    this.isConnected = false;
    this.messageCallbacks = new Map(); // For request/response pattern
    this.eventCallbacks = new Map(); // For event subscriptions
  }

  /**
   * Connect to remote container via WebSocket
   * @returns {Promise<boolean>} Connection status
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.container_ws_url);

        this.ws.on("open", () => {
          this.isConnected = true;
          console.log(`✅ Connected to container for user: ${this.user_id}`);
          resolve(true);
        });

        this.ws.on("message", (data) => {
          this._handleMessage(data);
        });

        this.ws.on("error", (error) => {
          console.error("Container WebSocket Error:", error.message);
          reject(error);
        });

        this.ws.on("close", () => {
          this.isConnected = false;
          console.log(`❌ Disconnected from container for user: ${this.user_id}`);
          this._handleDisconnect();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send database connection details to container
   * @param {object} dbConfig - Database configuration { db_service, db_host, db_user, db_password, db_name }
   * @returns {Promise<object>} Response from container
   */
  sendDatabaseConfig(dbConfig) {
    return this._sendMessage({
      type: "configure_database",
      payload: dbConfig,
    });
  }

  /**
   * Send SQL query to container for execution
   * @param {string} sql_query - SQL query to execute
   * @returns {Promise<object>} Query execution result
   */
  executeQuery(sql_query) {
    return this._sendMessage({
      type: "execute_query",
      payload: { sql_query },
    });
  }

  /**
   * Send a message and wait for response
   * @param {object} message - Message object
   * @returns {Promise<object>} Response from container
   */
  _sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error("Not connected to container"));
        return;
      }

      const message_id = `${Date.now()}_${Math.random()}`;
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(message_id);
        reject(new Error("Container response timeout"));
      }, 30000); // 30 second timeout

      this.messageCallbacks.set(message_id, { resolve, reject, timeout });

      try {
        this.ws.send(
          JSON.stringify({
            ...message,
            message_id,
            user_id: this.user_id,
          })
        );
      } catch (error) {
        this.messageCallbacks.delete(message_id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages from container
   * @param {string} data - Raw message data
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);

      // Handle response to a sent message
      if (message.message_id && this.messageCallbacks.has(message.message_id)) {
        const { resolve, reject, timeout } = this.messageCallbacks.get(message.message_id);
        clearTimeout(timeout);
        this.messageCallbacks.delete(message.message_id);

        if (message.success) {
          resolve(message.payload || message);
        } else {
          reject(new Error(message.error || "Container error"));
        }
      }

      // Handle events from container
      if (message.type && this.eventCallbacks.has(message.type)) {
        const callbacks = this.eventCallbacks.get(message.type);
        callbacks.forEach((callback) => callback(message.payload));
      }
    } catch (error) {
      console.error("Error handling container message:", error);
    }
  }

  /**
   * Subscribe to events from container
   * @param {string} eventType - Event type to listen for
   * @param {function} callback - Callback function
   */
  on(eventType, callback) {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType).push(callback);
  }

  /**
   * Unsubscribe from events
   * @param {string} eventType - Event type
   * @param {function} callback - Callback to remove
   */
  off(eventType, callback) {
    if (this.eventCallbacks.has(eventType)) {
      const callbacks = this.eventCallbacks.get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Handle disconnection from container
   */
  _handleDisconnect() {
    // Reject all pending requests
    this.messageCallbacks.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("Container disconnected"));
    });
    this.messageCallbacks.clear();
  }

  /**
   * Disconnect from container
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.isConnected = false;
    }
  }
}

module.exports = RemoteContainerClient;
