const express = require('express')
const { getAvailableDB } = require("./util/check-db");
const { setupLocalDB } = require('./util/setup-localdb');
var cors = require('cors')

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// (optional but common) to handle URL-encoded forms
app.use(express.urlencoded({ extended: true }));

var corsOptions = {
  origin: 'http://localhost:8000',
  //optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
 
app.use(cors(corsOptions));

(async () => {
  try {
    const dbType = await getAvailableDB();

    if (dbType) {
      console.log(`${dbType.toUpperCase()} detected — setting up local setup DB...`);
      await setupLocalDB(dbType);
    } else {
      console.log("No supported database (MySQL or PostgreSQL) is running.");
    }

    const db = await setupLocalDB("postgres"); // initialize db
    app.set("db", db); // store in app context

    // Register routes AFTER database is ready
    const userRoutes = require('./route/userRoutes');
    const workspaceRoutes = require('./route/workspaceRoute');
    
    app.use('/user', userRoutes);
    app.use('/workspace', workspaceRoutes);

    // Start server AFTER everything is set up
    app.listen(8080, () => {
      console.log("Application running on port 8080");
      console.log("Database connected and routes registered");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();