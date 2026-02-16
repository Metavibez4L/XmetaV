-- ============================================================
-- Migration: Consolidate setup-only tables into migration chain
-- ============================================================
-- These 5 tables + 1 view were previously created via manual
-- setup scripts (scripts/setup-db-*.sql) but had no formal
-- migration. This migration formalizes them so that
-- `supabase db reset` and fresh environments work without
-- manually running setup scripts.
--
-- Tables: agent_controls, intent_sessions, x402_payments,
--         swarm_runs, swarm_tasks
-- Views:  x402_daily_spend
--
-- All use CREATE TABLE IF NOT EXISTS so this is safe to run
-- on databases that already have these tables.
-- ============================================================

-- ============================================================
-- 1. agent_controls — Agent enable/disable toggles
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_controls (
  agent_id   text        PRIMARY KEY,
  enabled    boolean     NOT NULL DEFAULT true,
  updated_by uuid        REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger (uses update_updated_at() from control_plane migration)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agent_controls_updated_at'
  ) THEN
    CREATE TRIGGER trg_agent_controls_updated_at
      BEFORE UPDATE ON agent_controls
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

ALTER TABLE agent_controls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_controls' AND policyname = 'Authenticated users can read agent controls'
  ) THEN
    CREATE POLICY "Authenticated users can read agent controls"
      ON agent_controls FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_controls' AND policyname = 'Authenticated users can upsert agent controls'
  ) THEN
    CREATE POLICY "Authenticated users can upsert agent controls"
      ON agent_controls FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_controls' AND policyname = 'Authenticated users can update agent controls'
  ) THEN
    CREATE POLICY "Authenticated users can update agent controls"
      ON agent_controls FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_controls;

-- ============================================================
-- 2. intent_sessions — Cursor intent resolution sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS intent_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cursor_agent_id     text        NOT NULL DEFAULT '',
  goal                text        NOT NULL,
  repository          text        NOT NULL DEFAULT 'https://github.com/Metavibez4L/XmetaV',
  model               text,
  status              text        NOT NULL DEFAULT 'THINKING'
    CHECK (status IN ('THINKING', 'READY', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  commands            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  executed_command_ids jsonb,
  conversation        jsonb,
  retry_count         integer     NOT NULL DEFAULT 0,
  max_retries         integer     NOT NULL DEFAULT 2,
  timeout_seconds     integer     NOT NULL DEFAULT 120,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_sessions_created
  ON intent_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intent_sessions_status
  ON intent_sessions (status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_intent_sessions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_intent_sessions_updated_at ON intent_sessions;
CREATE TRIGGER trg_intent_sessions_updated_at
  BEFORE UPDATE ON intent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_intent_sessions_updated_at();

ALTER TABLE intent_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'intent_sessions' AND policyname = 'Authenticated users can read intent sessions'
  ) THEN
    CREATE POLICY "Authenticated users can read intent sessions"
      ON intent_sessions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'intent_sessions' AND policyname = 'Authenticated users can create intent sessions'
  ) THEN
    CREATE POLICY "Authenticated users can create intent sessions"
      ON intent_sessions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'intent_sessions' AND policyname = 'Authenticated users can update intent sessions'
  ) THEN
    CREATE POLICY "Authenticated users can update intent sessions"
      ON intent_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE intent_sessions;

-- ============================================================
-- 3. x402_payments — x402 payment transaction log
-- ============================================================
-- NOTE: This must come after intent_sessions (FK reference)
-- and after agent_commands (FK reference, from control_plane migration).

CREATE TABLE IF NOT EXISTS x402_payments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id      uuid        REFERENCES agent_commands(id) ON DELETE SET NULL,
  session_id      uuid        REFERENCES intent_sessions(id) ON DELETE SET NULL,
  agent_id        text        NOT NULL DEFAULT 'main',
  endpoint        text        NOT NULL,
  amount          text        NOT NULL,
  currency        text        NOT NULL DEFAULT 'USDC',
  network         text        NOT NULL DEFAULT 'eip155:8453',
  tx_hash         text,
  payer_address   text,
  payee_address   text,
  status          text        NOT NULL DEFAULT 'pending',
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_x402_payments_status
  ON x402_payments(status);

CREATE INDEX IF NOT EXISTS idx_x402_payments_agent
  ON x402_payments(agent_id);

CREATE INDEX IF NOT EXISTS idx_x402_payments_created
  ON x402_payments(created_at DESC);

ALTER TABLE x402_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'x402_payments' AND policyname = 'Users can view payments'
  ) THEN
    CREATE POLICY "Users can view payments"
      ON x402_payments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'x402_payments' AND policyname = 'Service role can manage payments'
  ) THEN
    CREATE POLICY "Service role can manage payments"
      ON x402_payments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Daily spend aggregation view
CREATE OR REPLACE VIEW x402_daily_spend AS
SELECT
  agent_id,
  date_trunc('day', created_at) AS day,
  count(*)                      AS payment_count,
  sum(amount::numeric)          AS total_amount,
  currency
FROM x402_payments
WHERE status = 'completed'
GROUP BY agent_id, date_trunc('day', created_at), currency
ORDER BY day DESC;

-- ============================================================
-- 4. swarm_runs — Top-level swarm execution records
-- ============================================================

CREATE TABLE IF NOT EXISTS swarm_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL DEFAULT 'Untitled Swarm',
  mode        text        NOT NULL DEFAULT 'parallel'
    CHECK (mode IN ('parallel', 'pipeline', 'collaborative')),
  status      text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  manifest    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  synthesis   text,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swarm_runs_status
  ON swarm_runs(status);

CREATE INDEX IF NOT EXISTS idx_swarm_runs_created
  ON swarm_runs(created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_swarm_runs_updated_at'
  ) THEN
    CREATE TRIGGER trg_swarm_runs_updated_at
      BEFORE UPDATE ON swarm_runs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ============================================================
-- 5. swarm_tasks — Individual tasks within a swarm run
-- ============================================================

CREATE TABLE IF NOT EXISTS swarm_tasks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id      uuid        NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
  task_id       text        NOT NULL DEFAULT 'task',
  agent_id      text        NOT NULL,
  message       text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  output        text        NOT NULL DEFAULT '',
  exit_code     integer,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swarm_tasks_swarm
  ON swarm_tasks(swarm_id);

CREATE INDEX IF NOT EXISTS idx_swarm_tasks_status
  ON swarm_tasks(status);

-- RLS for swarm tables
ALTER TABLE swarm_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- swarm_runs policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'swarm_runs' AND policyname = 'Authenticated users can read swarm runs'
  ) THEN
    CREATE POLICY "Authenticated users can read swarm runs"
      ON swarm_runs FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'swarm_runs' AND policyname = 'Authenticated users can insert swarm runs'
  ) THEN
    CREATE POLICY "Authenticated users can insert swarm runs"
      ON swarm_runs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'swarm_runs' AND policyname = 'Authenticated users can update swarm runs'
  ) THEN
    CREATE POLICY "Authenticated users can update swarm runs"
      ON swarm_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- swarm_tasks policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'swarm_tasks' AND policyname = 'Authenticated users can read swarm tasks'
  ) THEN
    CREATE POLICY "Authenticated users can read swarm tasks"
      ON swarm_tasks FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'swarm_tasks' AND policyname = 'Authenticated users can insert swarm tasks'
  ) THEN
    CREATE POLICY "Authenticated users can insert swarm tasks"
      ON swarm_tasks FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'swarm_tasks' AND policyname = 'Authenticated users can update swarm tasks'
  ) THEN
    CREATE POLICY "Authenticated users can update swarm tasks"
      ON swarm_tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime for swarm tables
ALTER PUBLICATION supabase_realtime ADD TABLE swarm_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE swarm_tasks;
