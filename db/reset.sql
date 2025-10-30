-- MUTESOL Database Reset Script
-- WARNING: This will delete ALL data from the database!
-- Use this to clean up and start fresh

-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS user_stats_view CASCADE;
DROP VIEW IF EXISTS active_goals_view CASCADE;

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS faucet_claims CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS daily_analytics CASCADE;
DROP TABLE IF EXISTS allocation_history CASCADE;
DROP TABLE IF EXISTS pool_allocations CASCADE;
DROP TABLE IF EXISTS currency_configs CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Note: We don't drop the uuid-ossp extension as it might be used by other databases

\echo 'Database reset complete. You can now run schema.sql to recreate tables.'
