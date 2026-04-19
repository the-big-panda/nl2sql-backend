const RemoteContainerClient = require("../util/remoteContainerClient");
const { getUserContainer } = require("../services/containerService");
const { saveMessage, getConversationHistory } = require("../controllers/llmControllers/llmConfig");
const { fetchQuery } = require("../controllers/llmControllers/llmConfig");

// Store active container connections per user
const activeContainers = new Map(); // user_id -> RemoteContainerClient

/**
 * Initialize WebSocket event handlers for workspace operations
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} user_id - User ID
 * @param {object} wss - WebSocket Server instance
 */
async function initializeWorkspaceHandlers(ws, user_id, wss) {
  try {
    // Get user's container
    const containerResult = await getUserContainer(user_id);
    if (!containerResult.success) {
      ws.send(
        JSON.stringify({
          type: "error",
          error: containerResult.error,
        })
      );
      ws.close();
      return;
    }

    const { container } = containerResult;

    // Connect to remote container
    const containerClient = new RemoteContainerClient(container.container_ws_url, user_id);
    try {
      await containerClient.connect();
      activeContainers.set(user_id, containerClient);

      ws.send(
        JSON.stringify({
          type: "connection_established",
          message: "Connected to container",
        })
      );
    } catch (error) {
      ws.send(
        JSON.stringify({
          type: "error",
          error: `Failed to connect to container: ${error.message}`,
        })
      );
      ws.close();
      return;
    }

    // Handle incoming messages from client
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data);
        await handleWorkspaceMessage(message, user_id, containerClient, ws);
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: error.message,
          })
        );
      }
    });

    // Handle client disconnect
    ws.on("close", () => {
      console.log(`User ${user_id} disconnected`);
      if (activeContainers.has(user_id)) {
        activeContainers.get(user_id).disconnect();
        activeContainers.delete(user_id);
      }
    });
  } catch (error) {
    console.error("Initialize Workspace Handlers Error:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        error: error.message,
      })
    );
    ws.close();
  }
}

/**
 * Handle workspace messages from client
 * @param {object} message - Message from client
 * @param {string} user_id - User ID
 * @param {RemoteContainerClient} containerClient - Container client
 * @param {WebSocket} ws - Client WebSocket
 */
async function handleWorkspaceMessage(message, user_id, containerClient, ws) {
  const { type, workspace_id, payload } = message;

  try {
    switch (type) {
      case "configure_workspace":
        // Configure database in container
        await configureWorkspace(workspace_id, payload, containerClient, ws);
        break;

      case "execute_query":
        // Execute query through container
        await executeWorkspaceQuery(workspace_id, user_id, payload, containerClient, ws);
        break;

      case "get_history":
        // Get conversation history
        await getWorkspaceHistory(workspace_id, ws);
        break;

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;

      default:
        ws.send(
          JSON.stringify({
            type: "error",
            error: `Unknown message type: ${type}`,
          })
        );
    }
  } catch (error) {
    console.error("Handle Workspace Message Error:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        error: error.message,
      })
    );
  }
}

/**
 * Configure workspace database in container
 * @param {string} workspace_id - Workspace ID
 * @param {object} dbConfig - Database config
 * @param {RemoteContainerClient} containerClient - Container client
 * @param {WebSocket} ws - Client WebSocket
 */
async function configureWorkspace(workspace_id, dbConfig, containerClient, ws) {
  try {
    const result = await containerClient.sendDatabaseConfig({
      workspace_id,
      ...dbConfig,
    });

    ws.send(
      JSON.stringify({
        type: "workspace_configured",
        payload: result,
      })
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Execute query through container
 * @param {string} workspace_id - Workspace ID
 * @param {string} user_id - User ID
 * @param {object} queryPayload - { nl_query or sql_query }
 * @param {RemoteContainerClient} containerClient - Container client
 * @param {WebSocket} ws - Client WebSocket
 */
async function executeWorkspaceQuery(workspace_id, user_id, queryPayload, containerClient, ws) {
  try {
    const { nl_query, sql_query } = queryPayload;

    let finalSQL = sql_query;

    // Convert natural language to SQL if needed
    if (nl_query && !sql_query) {
      const queryResult = await fetchQuery(workspace_id, nl_query);
      if (!queryResult.success) {
        throw new Error(`Failed to generate SQL: ${queryResult.error}`);
      }
      finalSQL = queryResult.sql_query;
    }

    // Save user message to database
    await saveMessage(workspace_id, "user", nl_query || sql_query);

    // Execute query in container
    const executionResult = await containerClient.executeQuery(finalSQL);

    // Save assistant message with SQL and results
    await saveMessage(
      workspace_id,
      "assistant",
      JSON.stringify(executionResult),
      finalSQL,
      executionResult
    );

    ws.send(
      JSON.stringify({
        type: "query_executed",
        payload: {
          sql_query: finalSQL,
          result: executionResult,
        },
      })
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get workspace conversation history
 * @param {string} workspace_id - Workspace ID
 * @param {WebSocket} ws - Client WebSocket
 */
async function getWorkspaceHistory(workspace_id, ws) {
  try {
    const result = await getConversationHistory(workspace_id);

    ws.send(
      JSON.stringify({
        type: "history",
        payload: result.messages || [],
      })
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get active container client for user
 * @param {string} user_id - User ID
 * @returns {RemoteContainerClient|null} Container client or null
 */
function getContainerClient(user_id) {
  return activeContainers.get(user_id) || null;
}

module.exports = {
  initializeWorkspaceHandlers,
  handleWorkspaceMessage,
  getContainerClient,
};
