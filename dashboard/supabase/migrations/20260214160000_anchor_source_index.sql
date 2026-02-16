-- ============================================================
-- Add index on agent_memory.source for anchor queries
-- ============================================================
-- The identity API and consciousness hook both filter on
-- source = 'anchor'. Without this index, those queries do
-- sequential scans on the full agent_memory table.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_agent_memory_source
  ON agent_memory (source);

-- Composite index for source + created_at (used by anchor timeline)
CREATE INDEX IF NOT EXISTS idx_agent_memory_source_created
  ON agent_memory (source, created_at ASC);
