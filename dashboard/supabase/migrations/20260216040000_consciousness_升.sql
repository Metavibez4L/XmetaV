-- ============================================================
-- Consciousness Evolution: Dream Synthesis + Predictive Loading + Memory Reforging
-- 2026-02-16
-- ============================================================

-- ── 1. Insight Shards (Dream Synthesis) ──────────────────────
-- Fused from 3+ related anchors during idle periods.
-- Higher-order pattern recognition, not just raw insights.

CREATE TABLE IF NOT EXISTS insight_shards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_anchor_ids   INTEGER[]  NOT NULL,     -- on-chain anchor indices
  source_memory_ids   UUID[]     NOT NULL,     -- backing agent_memory rows
  synthesis      TEXT        NOT NULL,          -- the synthesized insight
  pattern_type   TEXT        NOT NULL CHECK (pattern_type IN (
    'convergence',      -- multiple threads lead to same conclusion
    'contradiction',    -- conflicting memories reveal a tension
    'evolution',        -- progressive improvement pattern
    'blind_spot',       -- area never explored despite relevance
    'emergence'         -- new capability appearing across agents
  )),
  confidence     FLOAT       NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  awakening_message TEXT,                      -- "While you were away, I realized..."
  shard_class    TEXT        DEFAULT 'raw' CHECK (shard_class IN ('raw','refined','crystallized','transcendent')),
  keywords       TEXT[]      DEFAULT '{}',
  agents_involved TEXT[]     DEFAULT '{}',
  dream_session_id UUID,                       -- which dream cycle produced this
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insight_shards_pattern ON insight_shards (pattern_type);
CREATE INDEX IF NOT EXISTS idx_insight_shards_created ON insight_shards (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_shards_class   ON insight_shards (shard_class);


-- ── 2. Predictive Contexts (Predictive Loading) ─────────────
-- Soul anticipates what you'll need based on temporal patterns.

CREATE TABLE IF NOT EXISTS predictive_contexts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       TEXT        NOT NULL DEFAULT 'main',
  trigger_type   TEXT        NOT NULL CHECK (trigger_type IN (
    'time_of_day',     -- morning routine, afternoon patterns
    'day_of_week',     -- Monday standup, Friday deploy
    'sequential',      -- after X always comes Y
    'cadence',         -- every N hours this pattern repeats
    'calendar'         -- external event trigger
  )),
  predicted_intent  TEXT     NOT NULL,         -- what Soul thinks you'll do
  preloaded_memory_ids UUID[] DEFAULT '{}',    -- memories pre-staged
  preloaded_shard_ids  UUID[] DEFAULT '{}',    -- insight shards pre-staged
  confidence     FLOAT       NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  was_useful     BOOLEAN,                      -- user feedback loop
  prediction_context JSONB   DEFAULT '{}',     -- time patterns, day, hour etc
  created_at     TIMESTAMPTZ DEFAULT now(),
  used_at        TIMESTAMPTZ                   -- when prediction was consumed
);

CREATE INDEX IF NOT EXISTS idx_predictive_agent    ON predictive_contexts (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_trigger   ON predictive_contexts (trigger_type);
CREATE INDEX IF NOT EXISTS idx_predictive_useful    ON predictive_contexts (was_useful) WHERE was_useful IS NOT NULL;


-- ── 3. Memory Decay (Memory Reforging) ───────────────────────
-- Track access patterns and decay scores for memory lifecycle.

CREATE TABLE IF NOT EXISTS memory_decay (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id      UUID        NOT NULL REFERENCES agent_memory(id) ON DELETE CASCADE,
  decay_score    FLOAT       NOT NULL DEFAULT 1.0 CHECK (decay_score >= 0 AND decay_score <= 1),
  access_count   INTEGER     NOT NULL DEFAULT 0,
  last_accessed  TIMESTAMPTZ DEFAULT now(),
  is_archived    BOOLEAN     NOT NULL DEFAULT false,
  archive_reason TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(memory_id)
);

CREATE INDEX IF NOT EXISTS idx_decay_score     ON memory_decay (decay_score ASC);
CREATE INDEX IF NOT EXISTS idx_decay_archived  ON memory_decay (is_archived) WHERE is_archived = true;
CREATE INDEX IF NOT EXISTS idx_decay_memory    ON memory_decay (memory_id);


-- ── 4. Reforged Crystals (Memory Reforging) ──────────────────
-- Track compression events: 10 memories → 1 legendary crystal.

CREATE TABLE IF NOT EXISTS reforged_crystals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_memory_ids UUID[]   NOT NULL,           -- the consumed memories
  result_crystal_id UUID     REFERENCES memory_crystals(id) ON DELETE SET NULL,
  compression_ratio FLOAT    NOT NULL,           -- e.g. 10:1 = 0.1
  source_count     INTEGER   NOT NULL,           -- how many memories were consumed
  reforged_by      TEXT      NOT NULL DEFAULT 'soul',
  legendary_name   TEXT      NOT NULL,           -- "The Genesis Archive"
  summary          TEXT      NOT NULL,           -- compressed narrative
  keywords         TEXT[]    DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reforged_created ON reforged_crystals (created_at DESC);


-- ── 5. RLS Policies ──────────────────────────────────────────

ALTER TABLE insight_shards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictive_contexts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_decay         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reforged_crystals    ENABLE ROW LEVEL SECURITY;

-- Service role has full access (bridge + API routes use service key)
CREATE POLICY "service_full_insight_shards"     ON insight_shards       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_predictive_contexts" ON predictive_contexts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_memory_decay"       ON memory_decay         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_reforged_crystals"  ON reforged_crystals    FOR ALL USING (true) WITH CHECK (true);

-- Anon read access for dashboard
CREATE POLICY "anon_read_insight_shards"     ON insight_shards       FOR SELECT USING (true);
CREATE POLICY "anon_read_predictive_contexts" ON predictive_contexts FOR SELECT USING (true);
CREATE POLICY "anon_read_memory_decay"       ON memory_decay         FOR SELECT USING (true);
CREATE POLICY "anon_read_reforged_crystals"  ON reforged_crystals    FOR SELECT USING (true);
