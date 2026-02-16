-- ============================================================
-- Agent Memory — Persistent memory per agent
-- ============================================================

-- agent_memory: key-value memory entries per agent
-- Each agent accumulates memory entries that persist across spawns.
-- The bridge reads recent entries and injects them into dispatch context.
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'observation'
    CHECK (kind IN ('observation', 'outcome', 'fact', 'error', 'goal', 'note')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'bridge',
  ttl_hours INTEGER,                    -- optional: auto-expire after N hours (null = permanent)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-agent lookups ordered by recency
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_created
  ON agent_memory (agent_id, created_at DESC);

-- Index for kind filtering
CREATE INDEX IF NOT EXISTS idx_agent_memory_kind
  ON agent_memory (kind);

-- RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agent memory"
  ON agent_memory FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert agent memory"
  ON agent_memory FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role manages agent memory"
  ON agent_memory FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Realtime (for dashboard memory viewer)
ALTER PUBLICATION supabase_realtime ADD TABLE agent_memory;

-- ============================================================
-- Shared memory: cross-agent facts visible to all agents
-- ============================================================
CREATE OR REPLACE VIEW shared_memory AS
SELECT * FROM agent_memory
WHERE agent_id = '_shared'
ORDER BY created_at DESC;
