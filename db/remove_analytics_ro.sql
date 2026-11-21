-- UNDO for db/analytics_ro.sql. Run in the Supabase SQL editor if you ever want the dashboard's access gone.
-- It removes only what analytics_ro.sql created. Portal tables and data are not touched.
DROP POLICY IF EXISTS analytics_ro_own ON accounts;
DROP POLICY IF EXISTS analytics_ro_own ON categories;
DROP POLICY IF EXISTS analytics_ro_own ON transactions;
DROP POLICY IF EXISTS analytics_ro_own ON recurring_transactions;
DROP POLICY IF EXISTS analytics_ro_own ON savings;
DROP POLICY IF EXISTS analytics_ro_own ON saving_transactions;
DROP POLICY IF EXISTS analytics_ro_own ON audit_logs;
DROP OWNED BY analytics_ro;            -- removes the SELECT grants
DROP FUNCTION IF EXISTS app_user_id();
DROP ROLE IF EXISTS analytics_ro;
