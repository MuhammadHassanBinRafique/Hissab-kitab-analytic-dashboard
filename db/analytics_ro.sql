-- Run ONCE in the Supabase SQL editor (as postgres). Safe to re-run.
-- Gives the dashboard a role that can only READ, and only the signed-in user's own rows.
-- Nothing here touches the portal's tables, data or users.
--
-- Afterwards set the password yourself (never commit it):
--   ALTER ROLE analytics_ro PASSWORD '<long random password>';
-- Then use this role in ANALYTICS_DATABASE_URL (with Supabase's pooler the user is analytics_ro.<project-ref>).

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'analytics_ro') THEN
    CREATE ROLE analytics_ro LOGIN NOINHERIT;
  END IF;
END $$;

-- Hard limits: read-only by default, short queries, few connections.
ALTER ROLE analytics_ro SET default_transaction_read_only = on;
ALTER ROLE analytics_ro SET statement_timeout = '5s';
ALTER ROLE analytics_ro SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE analytics_ro CONNECTION LIMIT 10;

-- Who is asking is set per transaction by the API: SELECT set_config('app.user_id', '<id>', true).
-- If it is not set, the policies below match nothing (fails closed).
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

GRANT USAGE ON SCHEMA public TO analytics_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM analytics_ro;
-- Only what the dashboard shows. NOT granted: users (emails), quotes, _prisma_migrations.
GRANT SELECT ON accounts, categories, transactions, recurring_transactions,
                savings, saving_transactions, audit_logs TO analytics_ro;

DROP POLICY IF EXISTS analytics_ro_own ON accounts;
DROP POLICY IF EXISTS analytics_ro_own ON categories;
DROP POLICY IF EXISTS analytics_ro_own ON transactions;
DROP POLICY IF EXISTS analytics_ro_own ON recurring_transactions;
DROP POLICY IF EXISTS analytics_ro_own ON savings;
DROP POLICY IF EXISTS analytics_ro_own ON saving_transactions;
DROP POLICY IF EXISTS analytics_ro_own ON audit_logs;

CREATE POLICY analytics_ro_own ON accounts FOR SELECT TO analytics_ro USING ("userId" = app_user_id());
CREATE POLICY analytics_ro_own ON categories FOR SELECT TO analytics_ro USING ("userId" = app_user_id());
CREATE POLICY analytics_ro_own ON transactions FOR SELECT TO analytics_ro USING ("userId" = app_user_id());
CREATE POLICY analytics_ro_own ON recurring_transactions FOR SELECT TO analytics_ro USING ("userId" = app_user_id());
CREATE POLICY analytics_ro_own ON savings FOR SELECT TO analytics_ro USING ("userId" = app_user_id());
CREATE POLICY analytics_ro_own ON audit_logs FOR SELECT TO analytics_ro USING ("userId" = app_user_id());
CREATE POLICY analytics_ro_own ON saving_transactions FOR SELECT TO analytics_ro
  USING (EXISTS (SELECT 1 FROM savings s WHERE s.id = saving_transactions."savingId" AND s."userId" = app_user_id()));
