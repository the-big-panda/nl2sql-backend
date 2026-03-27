@echo off
echo Running migration to allow NULL workspace values...
psql -U postgres -d nl2sql -f database/migration_allow_null_workspace.sql
echo Migration completed!
pause
