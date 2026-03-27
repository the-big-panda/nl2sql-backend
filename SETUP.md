# Backend Setup & Run Guide

This service runs on Node.js using Express, connecting the React Frontend to both internal Postgres datastores and the Python AI Inference Engine.

## 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- Wait for the local PostgreSQL server to be running (for the `nl2sql_workspace` application database).

## 2. Installation
Open a terminal in the `nl2sql-backend` directory and run:
```bash
npm install
```

## 3. Environment Configuration
Create a `.env` file in the root of `nl2sql-backend` with the following variables:
```env
PORT=8000
AI_SERVICE_URL=http://localhost:9001

# Application Database Connection (Your actual Postgres user credentials)
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nl2sql_workspace

# Security Passkeys (Keep these secret in production!)
JWT_SECRET=super_secret_jwt_token_123
ENCRYPTION_KEY=super_secret_encryption_key_123
```

## 4. Database Migrations
If this is your first time setting up the project, run the internal migrations to structure your Postgres database correctly:
```bash
# On Windows:
run_migration.bat
```
*(Alternatively, you can manually execute the `database/schema.sql` and `database/migration_allow_null_workspace.sql` scripts inside pgAdmin).*

## 5. Start the Server
Start the backend using Nodemon (auto-reloads on file changes):
```bash
npm run dev
```
The server will boot up and should say `🚀 NL2SQL Backend Server running on port 8000`.
