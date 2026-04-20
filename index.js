const express = require('express')
const { getAvailableDB } = require("./util/check-db");
const { setupLocalDB } = require('./util/setup-localdb');
var cors = require('cors')
require('dotenv').config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// (optional but common) to handle URL-encoded forms
app.use(express.urlencoded({ extended: true }));

// CORS configuration from environment
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8000').split(',');
var corsOptions = {
  origin: corsOrigins,
}
 
app.use(cors(corsOptions));

(async () => {
  try {
    // Detect which database is available
    const dbType = await getAvailableDB();

    if (!dbType) {
      console.error("No supported database (MySQL or PostgreSQL) is running.");
      console.error("Please start MySQL or PostgreSQL and try again.");
      process.exit(1);
    }

    console.log(`✅ ${dbType.toUpperCase()} detected — setting up connection...`);
    
    // Setup and connect to the available database
    const db = await setupLocalDB(dbType);
    app.set("db", db); // Store in app context for routes to use

    // Health check endpoints (no auth required)
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'be-project', database: dbType });
    });

    app.get('/', (req, res) => {
      res.json({ 
        message: 'BE-Project Backend is running', 
        database: dbType,
        endpoints: {
          health: '/health',
          auth: '/user/register, /user/login',
          workspace: '/workspace/getWorkspaces, /workspace/addWorkspaces'
        }
      });
    });

    // Register routes AFTER database is ready
    const userRoutes = require('./route/userRoutes');
    const workspaceRoutes = require('./route/workspaceRoute');
    
    app.use('/user', userRoutes);
    app.use('/workspace', workspaceRoutes);

    // Start server AFTER everything is set up
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
      console.log(`🚀 Application running on port ${PORT}`);
      console.log(`📊 Database: ${dbType.toUpperCase()} connected`);
      console.log("✅ Routes registered and ready");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();