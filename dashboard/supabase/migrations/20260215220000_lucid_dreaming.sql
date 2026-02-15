-- Phase 5: Lucid Dreaming — Soul Dream Manifestations
-- Autonomous dream proposals, approvals, and executed actions.

-- ── Dream Manifestations ──
-- Each row is a proposal Soul generates during lucid dreaming.
-- Status flow: proposed → approved/rejected → executed/expired
CREATE TABLE IF NOT EXISTS soul_dream_manifestations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What Soul proposes
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN (
    'fusion',           -- Fuse specific crystals/memories
    'association',      -- Reinforce or create new association
    'pricing',          -- x402 pricing adjustment suggestion
    'skill',            -- Agent skill recommendation
    'meeting',          -- Trigger a meeting with specific agents
    'pattern',          -- Detected pattern worth highlighting
    'correction'        -- Error pattern requiring intervention
  )),
  -- Confidence & priority
  confidence  FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  priority    INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  -- Source data
  source_memories  UUID[]  DEFAULT '{}',
  source_insights  UUID[]  DEFAULT '{}',
  source_anchors   INTEGER[] DEFAULT '{}',
  -- Proposed action (machine-readable)
  proposed_action  JSONB NOT NULL DEFAULT '{}',
  -- Approval flow
  status      TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed',    -- Waiting for approval
    'approved',    -- Approved, pending execution
    'rejected',    -- User rejected
    'executed',    -- Successfully executed
    'auto_executed', -- High-confidence auto-execution
    'expired'      -- Expired without action (>72hr)
  )),
  approved_by TEXT,          -- 'user', 'main', or 'auto'
  approved_at TIMESTAMPTZ,
  -- Execution result
  execution_result JSONB,
  executed_at      TIMESTAMPTZ,
  -- Dream session tracking
  dream_session_id UUID,     -- Groups manifestations from same dream cycle
  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manifestations_status ON soul_dream_manifestations(status);
CREATE INDEX IF NOT EXISTS idx_manifestations_category ON soul_dream_manifestations(category);
CREATE INDEX IF NOT EXISTS idx_manifestations_priority ON soul_dream_manifestations(priority);
CREATE INDEX IF NOT EXISTS idx_manifestations_session ON soul_dream_manifestations(dream_session_id);
CREATE INDEX IF NOT EXISTS idx_manifestations_created ON soul_dream_manifestations(created_at DESC);

-- ── Dream Sessions ──
-- Tracks each lucid dream cycle.
CREATE TABLE IF NOT EXISTS soul_dream_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  -- Stats
  memories_scanned   INTEGER DEFAULT 0,
  clusters_found     INTEGER DEFAULT 0,
  insights_generated INTEGER DEFAULT 0,
  proposals_created  INTEGER DEFAULT 0,
  auto_executed      INTEGER DEFAULT 0,
  -- Context
  trigger_type   TEXT DEFAULT 'idle' CHECK (trigger_type IN ('idle', 'manual', 'scheduled')),
  fleet_idle_hours FLOAT,
  -- State
  status         TEXT DEFAULT 'dreaming' CHECK (status IN ('dreaming', 'completed', 'interrupted'))
);

CREATE INDEX IF NOT EXISTS idx_dream_sessions_status ON soul_dream_sessions(status);
CREATE INDEX IF NOT EXISTS idx_dream_sessions_started ON soul_dream_sessions(started_at DESC);

-- ── Association Modification Log ──
-- Tracks Soul's self-modifications to associations.
CREATE TABLE IF NOT EXISTS soul_association_modifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifestation_id  UUID REFERENCES soul_dream_manifestations(id),
  memory_id         UUID,
  related_memory_id UUID,
  modification_type TEXT NOT NULL CHECK (modification_type IN ('reinforce', 'weaken', 'create', 'retype')),
  old_strength      FLOAT,
  new_strength      FLOAT,
  old_type          TEXT,
  new_type          TEXT,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (service role bypasses)
ALTER TABLE soul_dream_manifestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE soul_dream_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE soul_association_modifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all_manifestations" ON soul_dream_manifestations
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sessions" ON soul_dream_sessions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_modifications" ON soul_association_modifications
  FOR ALL USING (true) WITH CHECK (true);
