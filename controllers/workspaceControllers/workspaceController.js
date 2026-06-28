const pg_db = require("../../database/postgresConfig");
const { Client: PGClient } = require("pg");
const mysql = require("mysql2/promise");
const mysql_db = require("../../database/mysqlConfig");
const extractSchema = require("../dbControllers/schemaExtractor");
const { fetchQuery, schemaUpload, getConversationHistory, saveMessage } = require("../llmControllers/llmConfig");
const  handleQueryExecution  = require("../llmControllers/queryController");
const { createContainerOnCloudBackend } = require("../../util/cloudBackendClient");
const { createUserContainer } = require("../../services/containerService");

async function handleAddWorkSpaces(req, res) {
  const { workspaceName, db_host, db_user, db_password, db_service, db_name } =
    req.body;

  try {
    // Check required fields
    if (
      !db_host ||
      !db_user ||
      !db_password ||
      !db_service ||
      !db_name ||
      !workspaceName
    ) {
      return res.status(400).send("Please enter all fields correctly.");
    }

    const user_id = req.user.userID;
    console.log(`\n\n ${req.user} \n\n`);
    
    // Normalize db_service: accept both "postgres" and "postgresql"
    const isPostgres = db_service === "postgres" || db_service === "postgresql";
    
    let existingWorkspace = null;

    // 🔍 Check if workspace already exists
    if (isPostgres) {
      const result = await pg_db.query(
        "SELECT * FROM dbinfos WHERE user_id = $1 AND db_name = $2;",
        [user_id, db_name]
      );
      existingWorkspace = result.rows.length > 0;
    } else {
      const [result] = await mysql_db
        .promise()
        .query("SELECT * FROM dbinfos WHERE user_id = ? AND db_name = ?;", [
          user_id,
          db_name,
        ]);
      existingWorkspace = result.length > 0;
    }

    if (existingWorkspace) {
      return res.status(409).send("Workspace already exists.");
    }

    // Generate UUID for workspace_id
    const { v4: uuidv4 } = require('uuid');
    const workspace_id = uuidv4();

    // Insert into workspace table (using existing schema with uuid)
    if (isPostgres) {
      await pg_db.query(
        `INSERT INTO workspace (workspace_id, user_id, db_id, title, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW());`,
        [workspace_id, user_id, db_name, workspaceName, "connected"]
      );
    } else {
      await mysql_db
        .promise()
        .query(
          "INSERT INTO workspace (workspace_id, user_id, db_id, title, status) VALUES (?, ?, ?, ?, ?);",
          [workspace_id, user_id, db_name, workspaceName, "connected"]
        );
    }

    // Insert into dbinfos table (database configuration)
    if (isPostgres) {
      await pg_db.query(
        `INSERT INTO dbinfos 
   (user_id, db_workspace, db_host, db_service, db_user, db_password, db_name, "createdAt", "updatedAt") 
   VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW());`,
        [
          user_id,
          workspaceName,
          db_host,
          db_service,
          db_user,
          db_password,
          db_name,
        ]
      );
    } else {
      await mysql_db
        .promise()
        .query(
          "INSERT INTO dbinfos (user_id, db_workspace, db_host, db_service, db_user, db_password, db_name) VALUES (?, ?, ?, ?, ?, ?, ?);",
          [
            user_id,
            workspaceName,
            db_host,
            db_service,
            db_user,
            db_password,
            db_name,
          ]
        );
    }

    console.log(`Workspace '${workspaceName}' added successfully.`);
    
    // Request container creation from cloud-backend
    console.log(`[Container] Requesting container for user ${user_id}...`);
    let containerInfo = null;
    const containerResult = await createContainerOnCloudBackend(user_id);
    
    if (containerResult.success) {
      if (containerResult.container_id && containerResult.container_id !== "unknown" && containerResult.container_id !== null) {
        // Container was successfully created on cloud-backend
        console.log(`✅ Container created on cloud-backend for user: ${user_id}`);
        console.log(`   Container ID: ${containerResult.container_id}`);
        console.log(`   Container URL: ${containerResult.container_url}`);
        
        // Try to store container info in local database
        if (containerResult.container_url) {
          const storeResult = await createUserContainer(
            user_id,
            containerResult.container_id,
            containerResult.container_url,
            containerResult.container_port || 9001,
            containerResult.container_ws_url || containerResult.container_url
          );
          
          if (storeResult.success) {
            containerInfo = {
              container_id: containerResult.container_id,
              container_name: containerResult.container_name,
              container_url: containerResult.container_url,
              container_port: containerResult.container_port,
              is_new: containerResult.is_new,
              token: containerResult.token,
            };
            console.log(`✅ Container info stored locally for user: ${user_id}`);
          } else {
            console.warn(`⚠️ Container created but not stored locally: ${storeResult.error}`);
          }
        }
      } else {
        // Token generated but container not created (Kubernetes unavailable)
        console.log(`✅ Authentication token generated for user: ${user_id}`);
        console.log(`⚠️ Container service unavailable on cloud-backend`);
        if (containerResult.warning) {
          console.log(`   Reason: ${containerResult.warning}`);
        }
        console.log(`   Workspace will still function without containerized LLM access`);
        
        // Store token for future use even without container
        containerInfo = {
          auth_token: containerResult.token,
          container_available: false,
          message: containerResult.warning || "Container service unavailable",
        };
      }
    } else {
      console.warn(`⚠️ Container request failed: ${containerResult.error}`);
      // Continue without container - workspace still functions
    }
    
    // Return the created workspace
    return res.status(201).json({
      id: workspace_id,
      name: workspaceName,
      workspace_id: workspace_id,
      user_id: user_id,
      db_id: db_name,
      status: "connected",
      container_info: containerInfo,
      dbConfig: {
        host: db_host,
        user: db_user,
        password: db_password,
        service: db_service,
        database: db_name,
      }
    });
  } catch (error) {
    console.error(" Add Workspace Error:", error);
    return res.status(500).send("Internal server error");
  }
}

async function handleGetWorkspaces(req, res) {
  try {
    const user_id = req.user.userID;

    let workspaces = [];

    // Fetch all workspaces for this user with their database config
    if (process.env.LOCAL_DB_TYPE === "postgres") {
      // Join workspace with dbinfos to get complete info
      const result = await pg_db.query(
        `SELECT 
          w.workspace_id, 
          w.user_id,
          w.db_id,
          w.title AS name,
          w.status,
          w.created_at,
          d.db_host,
          d.db_user,
          d.db_password,
          d.db_service,
          d.db_name
        FROM workspace w
        LEFT JOIN dbinfos d ON w.db_id = d.db_name AND w.user_id = d.user_id
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC;`,
        [user_id]
      );
      workspaces = result.rows;
    } else {
      const [result] = await mysql_db
        .promise()
        .query(
          `SELECT 
            w.workspace_id, 
            w.user_id,
            w.db_id,
            w.title AS name,
            w.status,
            w.created_at,
            d.db_host,
            d.db_user,
            d.db_password,
            d.db_service,
            d.db_name
          FROM workspace w
          LEFT JOIN dbinfos d ON w.db_id = d.db_name AND w.user_id = d.user_id
          WHERE w.user_id = ?
          ORDER BY w.created_at DESC;`,
          [user_id]
        );
      workspaces = result;
    }

    //  If no workspaces exist, return empty array
    if (!workspaces || workspaces.length === 0) {
      return res.status(200).json([]);
    }

    // Format workspace response with database config
    const formattedWorkspaces = workspaces.map(ws => ({
      id: ws.workspace_id,
      name: ws.name || "Unnamed Workspace",
      workspace_id: ws.workspace_id,
      user_id: ws.user_id,
      db_id: ws.db_id,
      status: ws.status,
      dbConfig: ws.db_host ? {
        host: ws.db_host,
        user: ws.db_user,
        password: ws.db_password,
        service: ws.db_service,
        database: ws.db_name,
      } : null
    }));

    // Return all workspaces
    return res.status(200).json(formattedWorkspaces);
  } catch (error) {
    console.error("Get Workspace Error:", error);
    return res.status(500).send("Internal server error");
  }
}

async function handleConnectWorkspaces(req, res) {
  const { db_name } = req.body;

  try {
    if (!db_name) {
      return res.status(404).send("DB Name is required.");
    }
    const user_id = req.user.userID;

    // Fetch workspace details from workspace table
    let workspace = null;

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        "SELECT * FROM workspace WHERE user_id = $1 AND db_id = $2;",
        [user_id, db_name]
      );
      workspace = result.rows[0] || null;
    } else {
      const [result] = await mysql_db
        .promise()
        .query("SELECT * FROM workspace WHERE user_id = ? AND db_id = ?;", [
          user_id,
          db_name,
        ]);
      workspace = result && result[0] ? result[0] : null;
    }

    if (!workspace) {
      return res.status(404).json({
        message: "Workspace not found for this user. Please add a workspace first.",
      });
    }

    // Fetch database connection details from dbinfos table
    let dbInfo = null;

    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        "SELECT * FROM dbinfos WHERE db_name = $1 AND user_id = $2;",
        [db_name, user_id]
      );
      dbInfo = result.rows[0] || null;
    } else {
      const [result] = await mysql_db
        .promise()
        .query("SELECT * FROM dbinfos WHERE db_name = ? AND user_id = ?;", [
          db_name,
          user_id,
        ]);
      dbInfo = result && result[0] ? result[0] : null;
    }

    if (!dbInfo) {
      return res.status(404).json({
        message: "Database connection details not found.",
      });
    }

    // Extract database connection details
    const {
      db_service,
      db_host,
      db_user,
      db_password,
      db_name: workspaceDBName,
    } = dbInfo;

    // Normalize db_service: accept both "postgres" and "postgresql"
    const isPostgres = db_service === "postgres" || db_service === "postgresql";

    let connection;
    let connectStatus = false;

    //Autoconnect db
    if (isPostgres) {
      connection = new PGClient({
        host: db_host,
        user: db_user,
        password: db_password,
        database: workspaceDBName,
        port: 5432,
      });

      await connection.connect();
      connectStatus = true;
    } else if (db_service === "mysql") {
      connection = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: workspaceDBName,
        port: 3306,
      });

      connectStatus = true;
    } else {
      return res.status(400).json({
        message: `Unsupported DB service: ${db_service}`,
      });
    }

    config = {
      host: db_host,
      user: db_user,
      database: workspaceDBName,
      password: db_password,
    };
    
    console.log(`\n📊 Extracting Schema from database:`);
    console.log(`   Host: ${db_host}`);
    console.log(`   Database: ${workspaceDBName}`);
    console.log(`   User: ${db_user}`);
    console.log(`   Service: ${db_service}\n`);
    
    // Extract schema from the database (non-blocking if fails)
    try {
      const schema = await extractSchema(db_service, config);
      if (schema && Object.keys(schema).length > 0) {
        console.log(`✅ Found ${Object.keys(schema).length} tables in database:`);
        Object.keys(schema).forEach(table => {
          console.log(`   - ${table}`);
        });
        await schemaUpload(workspace.workspace_id, db_service, schema, user_id);
        console.log(`✅ Schema extracted and uploaded`);
      } else {
        console.log(`⚠️ No tables found in database "${workspaceDBName}"`);
        console.log(`   If this is unexpected, check that:`);
        console.log(`   1. You're connecting to the correct database`);
        console.log(`   2. The database has tables created`);
        console.log(`   3. The tables are in the 'public' schema`);
      }
    } catch (schemaErr) {
      console.warn(`⚠️ Schema extraction failed (non-blocking):`, schemaErr.message);
      // Continue without schema - not critical
    }

    // Fetch conversation history (non-blocking if fails)
    let messages = [];
    try {
      const conversationResult = await getConversationHistory(workspace.workspace_id);
      messages = conversationResult.success ? conversationResult.messages : [];
    } catch (historyErr) {
      console.warn(`⚠️ Failed to fetch conversation history (non-blocking):`, historyErr.message);
      // Continue without history
    }

    // Request container creation from cloud-backend
    console.log(`[Container] Requesting container for user ${user_id}...`);
    let containerInfo = null;
    const containerResult = await createContainerOnCloudBackend(user_id);
    
    if (containerResult.success) {
      if (containerResult.container_id && containerResult.container_id !== "unknown" && containerResult.container_id !== null) {
        // Container was successfully created on cloud-backend
        console.log(`✅ Container created on cloud-backend for user: ${user_id}`);
        console.log(`   Container ID: ${containerResult.container_id}`);
        console.log(`   Container URL: ${containerResult.container_url}`);
        
        // Try to store container info in local database
        if (containerResult.container_url) {
          const storeResult = await createUserContainer(
            user_id,
            containerResult.container_id,
            containerResult.container_url,
            containerResult.container_port || 9001,
            containerResult.container_ws_url || containerResult.container_url
          );
          
          if (storeResult.success) {
            containerInfo = {
              container_id: containerResult.container_id,
              container_name: containerResult.container_name,
              container_url: containerResult.container_url,
              container_port: containerResult.container_port,
              is_new: containerResult.is_new,
              token: containerResult.token,
            };
            console.log(`✅ Container info stored locally for user: ${user_id}`);
          } else {
            console.warn(`⚠️ Container created but not stored locally: ${storeResult.error}`);
          }
        }
      } else {
        // Token generated but container not created (Kubernetes unavailable)
        console.log(`✅ Authentication token generated for user: ${user_id}`);
        console.log(`⚠️ Container service unavailable on cloud-backend`);
        if (containerResult.warning) {
          console.log(`   Reason: ${containerResult.warning}`);
        }
        console.log(`   Workspace will still function without containerized LLM access`);
        
        // Store token for future use even without container
        containerInfo = {
          auth_token: containerResult.token,
          container_available: false,
          message: containerResult.warning || "Container service unavailable",
        };
      }
    } else {
      console.warn(`⚠️ Container request failed: ${containerResult.error}`);
      // Continue without container - workspace still functions
    }

    return res.status(200).json({
      message: "Connection successful",
      connection_status: connectStatus,
      workspace_id: workspace.workspace_id,
      db_service,
      connection_info: {
        host: db_host,
        user: db_user,
        db_name: workspaceDBName,
      },
      container_info: containerInfo,
      conversation_history: messages,
      message_count: messages.length,
    });
  } catch (error) {
    console.error("Connect Workspace Error:", error);
    return res.status(500).json({
      message: "Failed to connect to workspace",
      error: error.message,
    });
  }
}

async function handleWorkspaceQuery(req, res) {
  // Backend expects: db_name, nl_query
  // Frontend sends: workspaceId, query, dbConfig
  // This function needs to handle the frontend format
  let { db_name, nl_query, workspaceId, query, dbConfig } = req.body;

  // If frontend format is used, map it to backend format
  if (!db_name && query) {
    nl_query = query;
  }
  if (!db_name && dbConfig?.database) {
    db_name = dbConfig.database;
  }

  try {
    if (!db_name || !nl_query) {
      return res.status(400).json({
        message: "Missing required parameters",
        error: "Database name (db_name) and natural language query (nl_query) are required",
        received: { db_name, nl_query, workspaceId, query }
      });
    }

    const user_id = req.user.userID;

    let dbInfo = null;
    let workspace = null;
    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        "SELECT * FROM dbinfos WHERE db_name = $1 AND user_id = $2;",
        [db_name, user_id]
      );
      dbInfo = result.rows[0] || null;

      const workspaceResult = await pg_db.query(
        "SELECT * FROM workspace WHERE user_id = $1 AND db_id = $2;",
        [user_id, db_name]
      );
      workspace = workspaceResult.rows[0] || null;
    } else {
      const [result] = await mysql_db
        .promise()
        .query("SELECT * FROM dbinfos WHERE db_name = ? AND user_id = ?;", [
          db_name,
          user_id,
        ]);
      dbInfo = result && result[0] ? result[0] : null;

      const [workspaceResult] = await mysql_db
        .promise()
        .query("SELECT * FROM workspace WHERE user_id = ? AND db_id = ?;", [
          user_id,
          db_name,
        ]);
      workspace = workspaceResult && workspaceResult[0] ? workspaceResult[0] : null;
    }

    if (!dbInfo) {
      return res.status(404).json({
        message: "Database connection details not found for this workspace.",
      });
    }

    const schemaConfig = {
      host: dbInfo.db_host,
      user: dbInfo.db_user,
      database: dbInfo.db_name,
      password: dbInfo.db_password,
    };

    let schema = null;
    try {
      schema = await extractSchema(dbInfo.db_service, schemaConfig);
    } catch (schemaError) {
      console.error("Schema extraction failed:", schemaError.message);
      return res.status(400).json({
        message: "Failed to connect to the workspace database",
        error: schemaError.message,
        hint: `Check the saved ${dbInfo.db_service} credentials for "${dbInfo.db_name}".`,
        connection_info: {
          service: dbInfo.db_service,
          host: dbInfo.db_host,
          user: dbInfo.db_user,
          database: dbInfo.db_name,
        },
      });
    }

    const resolvedWorkspaceId = workspaceId || workspace?.workspace_id || db_name;

    const response = await fetchQuery(db_name, nl_query, user_id, {
      db_service: dbInfo.db_service,
      schema,
      workspace_id: resolvedWorkspaceId,
    });
    if (!response.success) {
      console.error("SQL Query Fetch Error:", response.error);

      return res.status(400).json({
        message: "Failed to fetch sql query",
        error: response.error,
      });
    }

    let sqlQuery = response.sql_query;
    let execution = await handleQueryExecution(
      db_name,
      user_id,
      sqlQuery
    );

    if (!execution.success) {
      console.warn("SQL Query Execution Error, requesting one correction:", execution.error);

      const retryResponse = await fetchQuery(db_name, nl_query, user_id, {
        db_service: dbInfo.db_service,
        schema,
        workspace_id: resolvedWorkspaceId,
        previous_sql: sqlQuery,
        query_error: execution.error,
      });

      if (retryResponse.success && retryResponse.sql_query && retryResponse.sql_query !== sqlQuery) {
        sqlQuery = retryResponse.sql_query;
        execution = await handleQueryExecution(db_name, user_id, sqlQuery);
      }
    }

    if (!execution.success) {
      console.error("SQL Query Execution Error:", execution.error);
      return res.status(400).json({
        message: "Failed to execute sql query",
        error: execution.error,
        sql_query: sqlQuery,
      });
    }

    if (workspace?.workspace_id) {
      try {
        await saveMessage(workspace.workspace_id, "user", nl_query);
        await saveMessage(
          workspace.workspace_id,
          "assistant",
          sqlQuery,
          sqlQuery,
          {
            db_service: execution.db_service,
            db_name: execution.db_name,
            row_count: execution.rows?.length || 0,
            fields: execution.fields || [],
          }
        );
      } catch (messageError) {
        console.warn("Message save failed (non-blocking):", messageError.message);
      }
    }

    return res.status(200).json({
      success: true,
      sql_query: sqlQuery,
      result: execution,
      results: execution.rows || [],
      rows: execution.rows || [],
      fields: execution.fields || [],
      row_count: execution.rows?.length || 0,
    });
  } catch (error) {
    console.error("Workspace Query Error:", error);
    return res.status(500).json({
      message: "Failed to process workspace query",
      error: error.message,
    });
  }
}


module.exports = {
  handleAddWorkSpaces,
  handleGetWorkspaces,
  handleConnectWorkspaces,
  handleWorkspaceQuery,
};
