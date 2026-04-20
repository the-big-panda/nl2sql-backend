/**
 * Cloud Backend Client
 * Handles communication with the cloud-backend service for container management
 * 
 * ENDPOINTS AVAILABLE ON CLOUD-BACKEND:
 * - POST /api/auth/token { userId, email } -> { token, container: {...} }
 * - GET /api/auth/container (requires auth header) -> { container: {...} }
 */

const CLOUD_BACKEND_URL = process.env.CLOUD_BACKEND_URL || "http://localhost:3000";

/**
 * Request container creation from cloud-backend by generating a token
 * The /api/auth/token endpoint automatically creates a container for the user
 * @param {string} user_id - User ID
 * @param {string} email - User email (optional)
 * @returns {Promise<object>} Container details { success, container_id, container_host, container_port, container_ws_url }
 */
async function createContainerOnCloudBackend(user_id, email = null) {
  try {
    if (!user_id) {
      throw new Error("user_id is required");
    }

    console.log(`[CloudBackend] Requesting container for user: ${user_id}`);

    // Call /api/auth/token endpoint which automatically creates/ensures container
    const response = await fetch(`${CLOUD_BACKEND_URL}/api/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        userId: user_id,
        ...(email && { email }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud backend error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    console.log(`[CloudBackend] Response:`, JSON.stringify(data, null, 2));
    
    // Response format from /api/auth/token:
    // { token, expiresIn, container?: { id, name, url, isNew }, warning?: string }
    if (!data.token) {
      throw new Error(data.error || "Failed to generate token and create container");
    }

    // Container creation is optional - Kubernetes may not be available
    if (data.container && data.container.id) {
      console.log(`[CloudBackend] ✅ Container created:`, {
        container_id: data.container.id,
        container_name: data.container.name,
        container_url: data.container.url,
        is_new: data.container.isNew,
      });
      
      return {
        success: true,
        token: data.token,
        expiresIn: data.expiresIn,
        container_id: data.container.id,
        container_name: data.container.name,
        container_url: data.container.url,
        is_new: data.container.isNew,
        warning: data.warning || null,
      };
    } else {
      // Container not created but token successful
      console.warn(`[CloudBackend] ⚠️ Token generated but container not available`);
      if (data.warning) {
        console.warn(`   Reason: ${data.warning}`);
      }
      console.log(`   💡 This is non-critical. Kubernetes orchestration may not be configured on cloud-backend.`);
      console.log(`   💡 Workspace will still function - container features will be unavailable.`);
      
      return {
        success: true,
        token: data.token,
        expiresIn: data.expiresIn,
        container_id: null,
        container_name: null,
        container_url: null,
        is_new: false,
        warning: data.warning || "Container service unavailable",
      };
    }

    return {
      success: true,
      token: data.token,
      expiresIn: data.expiresIn,
      container_id: data.container?.id || "unknown",
      container_name: data.container?.name || null,
      container_url: data.container?.url || null,
      is_new: data.container?.isNew || false,
      warning: data.warning || null,
    };
  } catch (error) {
    console.error("[CloudBackend] Container creation error:", error.message);
    // Don't throw - return error object so workspace doesn't fail
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get container status from cloud-backend
 * @param {string} user_id - User ID
 * @param {string} token - JWT token from cloud-backend (obtained from /api/auth/token)
 * @returns {Promise<object>} Container status
 */
async function getContainerStatus(user_id, token) {
  try {
    if (!user_id || !token) {
      throw new Error("user_id and token are required");
    }

    const response = await fetch(`${CLOUD_BACKEND_URL}/api/auth/container`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get container status: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      ...data,
    };
  } catch (error) {
    console.error("[CloudBackend] Get container status error:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createContainerOnCloudBackend,
  getContainerStatus,
};
