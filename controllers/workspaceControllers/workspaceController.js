const pg_db = require("../../database/postgresConfig");
const { Client: PGClient } = require("pg");
const mysql = require("mysql2/promise");
const extractSchema = require("../dbControllers/schemaExtractor");
const { fetchQuery, schemaUpload, getConversationHistory } = require("../llmControllers/llmConfig");
const  handleQueryExecution  = require("../llmControllers/queryController");

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
    let existingWorkspace = null;

    // 🔍 Check if workspace already exists
    if (db_service === "postgres") {
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

    // Insert new workspace into dbinfos table
    if (db_service === "postgres") {
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
    return res.status(200).send("Workspace added successfully.");
  } catch (error) {
    console.error(" Add Workspace Error:", error);
    return res.status(500).send("Internal server error");
  }
}

async function handleGetWorkspaces(req, res) {
  try {
    const user_id = req.user.userID;

    let workspaces = [];

    // Fetch all workspaces for this user
    if (process.env.LOCAL_DB_TYPE === "postgres") {
      const result = await pg_db.query(
        "SELECT * FROM workspace WHERE user_id = $1;",
        [user_id]
      );
      workspaces = result.rows;
    } else {
      const [result] = await mysql_db
        .promise()
        .query("SELECT * FROM workspace WHERE user_id = ?;", [user_id]);
      workspaces = result;
    }

    //  If no workspaces exist, return empty array
    if (!workspaces || workspaces.length === 0) {
      return res.status(200).json({ messages: "No workspaces found. Please add a workspace." });
    }

    // Return all workspaces
    return res.status(200).json(workspaces);
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
        "SELECT * FROM dbinfos WHERE db_workspace = $1;",
        [workspace.workspace_id]
      );
      dbInfo = result.rows[0] || null;
    } else {
      const [result] = await mysql_db
        .promise()
        .query("SELECT * FROM dbinfos WHERE db_workspace = ?;", [
          workspace.workspace_id,
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

    let connection;
    let connectStatus = false;

    //Autoconnect db
    if (db_service === "postgres") {
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
    const schema = await extractSchema(db_service, config);
    await schemaUpload(db_service, config, schema);

    // Fetch conversation history (all messages for this workspace)
    const conversationResult = await getConversationHistory(workspace.workspace_id);
    const messages = conversationResult.success ? conversationResult.messages : [];

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
  const { db_name, nl_query } = req.body;
  try {
    const response = await fetchQuery(db_name, nl_query);
    if (!response.success) {
      console.error("SQL Query Fetch Error:", response.error);

      return res.status(400).json({
        message: "Failed to fetch sql query",
        error: response.error,
      });
    }

    const user_id = req.user.userID;

    const results = await handleQueryExecution(
      db_name,
      user_id,
      response.sql_query
    );

    if (!results.success) {
      console.error("SQL Query Execution Error:", results.error);
      return res.status(400).json({
        message: "Failed to execute sql query",
        error: results.error,
      });
    }

    return res.status(200).json({
      result: results,
      sql_query: response.sql_query,
    });
  } catch (error) {
    console.error("Connect Workspace Error:", error);
    return res.status(500).json({
      message: "Failed to connect to workspace",
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
