-- Migration to allow NULL db_type and connection_config for empty workspaces
-- Run this script to update the existing schema

-- Alter workspaces table to allow NULL values for db_type and connection_config
ALTER TABLE workspaces ALTER COLUMN db_type DROP NOT NULL;
ALTER TABLE workspaces ALTER COLUMN connection_config DROP NOT NULL;

-- Add status column to track workspace connection status
ALTER TABLE workspaces ADD COLUMN status VARCHAR(50) DEFAULT 'not_connected';

-- Update existing workspaces to have appropriate status
UPDATE workspaces SET status = 'connected' WHERE db_type IS NOT NULL;
UPDATE workspaces SET status = 'not_connected' WHERE db_type IS NULL;

-- Create index for status column
CREATE INDEX idx_workspaces_status ON workspaces(status);
