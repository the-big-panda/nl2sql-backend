const pg_db = require("../../database/postgresConfig");

async function handleAddWorkSpaces(req, res) {
  const { workspaceName, db_host, db_user, db_password, db_service, db_name } = req.body;

  try {
    // Check required fields
    if (!db_host || !db_user || !db_password || !db_service || !db_name || !workspaceName) {
      return res.status(400).send("Please enter all fields correctly.");
    }

    const user_id = req.user.userID;
    console.log(`\n\n ${req.user} \n\n`)
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
        .query(
          "SELECT * FROM dbinfos WHERE user_id = ? AND db_name = ?;",
          [user_id, db_name]
        );
      existingWorkspace = result.length > 0;
    }

    if (existingWorkspace) {
      return res.status(409).send("Workspace already exists.");
    }

    // 🧩 Insert new workspace into dbinfos table
    if (db_service === "postgres") {
      await pg_db.query(
        "INSERT INTO dbinfos (user_id, db_workspace, db_host, db_service, db_user, db_password, db_name) VALUES ($1, $2, $3, $4, $5, $6, $7);",
        [user_id, workspaceName, db_host, db_service, db_user, db_password, db_name]
      );
    } else {
      await mysql_db
        .promise()
        .query(
          "INSERT INTO dbinfos (user_id, db_workspace, db_host, db_service, db_user, db_password, db_name) VALUES (?, ?, ?, ?, ?, ?, ?);",
          [user_id, workspaceName, db_host, db_service, db_user, db_password, db_name]
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
        "SELECT * FROM dbinfos WHERE user_id = $1;",
        [user_id]
      );
      workspaces = result.rows;
    } else {
      const [result] = await mysql_db
        .promise()
        .query("SELECT * FROM dbinfos WHERE user_id = ?;", [user_id]);
      workspaces = result;
    }

    //  If no workspaces exist, return empty array
    if (!workspaces || workspaces.length === 0) {
      return res.status(200).json([]);
    }

    // Return all workspaces
    return res.status(200).json(workspaces);

  } catch (error) {
    console.error("Get Workspace Error:", error);
    return res.status(500).send("Internal server error");
  }
}

module.exports = {
  handleAddWorkSpaces,handleGetWorkspaces
}
