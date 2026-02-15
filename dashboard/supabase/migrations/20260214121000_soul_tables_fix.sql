-- ============================================================
-- Soul Agent — Memory Orchestration Schema (fix)
-- ============================================================
-- Some environments may have the original migration marked as applied
-- without the tables actually existing. This migration is idempotent.
-- Created: 2026-02-14

-- Memory associations: links between related memories
CREATE TABLE IF NOT EXISTS memory_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES agent_memory(id) ON DELETE CASCADE,
  related_memory_id UUID NOT NULL REFERENCES agent_memory(id) ON DELETE CASCADE,
  association_type TEXT NOT NULL DEFAULT 'related'
    CHECK (association_type IN ('causal', 'similar', 'sequential', 'related')),
  strength FLOAT NOT NULL DEFAULT 0.5
    CHECK (strength >= 0.0 AND strength <= 1.0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (memory_id, related_memory_id)
);

CREATE INDEX IF NOT EXISTS idx_assoc_memory ON memory_associations(memory_id);
CREATE INDEX IF NOT EXISTS idx_assoc_related ON memory_associations(related_memory_id);
CREATE INDEX IF NOT EXISTS idx_assoc_strength ON memory_associations(strength DESC);

-- Memory queries: log of context retrievals for learning
CREATE TABLE IF NOT EXISTS memory_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  task_keywords TEXT[] NOT NULL DEFAULT '{}',
  retrieved_memory_ids UUID[] NOT NULL DEFAULT '{}',
  relevance_scores FLOAT[] NOT NULL DEFAULT '{}',
  query_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mq_agent ON memory_queries(agent_id);
CREATE INDEX IF NOT EXISTS idx_mq_time ON memory_queries(query_time DESC);

-- Dream insights: generated during idle consolidation
CREATE TABLE IF NOT EXISTS dream_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight TEXT NOT NULL,
  source_memories UUID[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'pattern'
    CHECK (category IN ('pattern', 'recommendation', 'summary', 'correction')),
  confidence FLOAT NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dream_category ON dream_insights(category);
CREATE INDEX IF NOT EXISTS idx_dream_confidence ON dream_insights(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_dream_time ON dream_insights(generated_at DESC);

-- Enable RLS
ALTER TABLE memory_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies (read for authenticated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'memory_associations' AND policyname = 'Authenticated can read associations'
  ) THEN
    CREATE POLICY "Authenticated can read associations"
      ON memory_associations FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'memory_queries' AND policyname = 'Authenticated can read memory_queries'
  ) THEN
    CREATE POLICY "Authenticated can read memory_queries"
      ON memory_queries FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dream_insights' AND policyname = 'Authenticated can read dream_insights'
  ) THEN
    CREATE POLICY "Authenticated can read dream_insights"
      ON dream_insights FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Privileges (policies require grants to be useful)
GRANT SELECT ON TABLE memory_associations, memory_queries, dream_insights TO authenticated;
GRANT ALL ON TABLE memory_associations, memory_queries, dream_insights TO service_role;

-- Ask PostgREST to reload schema cache (Supabase convention)
SELECT pg_notify('pgrst', 'reload schema');
