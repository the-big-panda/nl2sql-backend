-- PostgreSQL Schema for NL2SQL Workspace
-- Run this script after creating the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces table
CREATE TABLE workspaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    db_type VARCHAR(50) NOT NULL,
    connection_config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Connections table (with hashed passwords)
CREATE TABLE connections (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    host VARCHAR(255),
    port INTEGER,
    database VARCHAR(255),
    username VARCHAR(255),
    password_hash VARCHAR(255), -- hashed password for external DB
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Query history table
CREATE TABLE query_history (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    generated_sql TEXT,
    executed_sql TEXT,
    results_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schema cache table
CREATE TABLE schema_cache (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    table_name VARCHAR(255) NOT NULL,
    schema_json JSONB NOT NULL,
    chroma_collection_id VARCHAR(255),
    chroma_document_id VARCHAR(255),
    last_refreshed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, table_name)
);

-- Create indexes for better performance
CREATE INDEX idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX idx_connections_workspace_id ON connections(workspace_id);
CREATE INDEX idx_query_history_workspace_id ON query_history(workspace_id);
CREATE INDEX idx_query_history_created_at ON query_history(created_at);
CREATE INDEX idx_schema_cache_workspace_id ON schema_cache(workspace_id);
CREATE INDEX idx_schema_cache_table_name ON schema_cache(table_name);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
