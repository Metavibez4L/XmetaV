-- =====================================================
-- Memory System Optimization Migration
-- Adds missing indexes and TTL cleanup function
-- =====================================================

-- 1. Index for dashboard polling of recent associations
CREATE INDEX IF NOT EXISTS idx_memory_associations_created_at
  ON memory_associations (created_at DESC);

-- 2. Index for memory crystal leaderboard sorting
CREATE INDEX IF NOT EXISTS idx_memory_crystals_sort
  ON memory_crystals (star_rating DESC, xp DESC);

-- 3. Index for insight_shards recent-24h filter
CREATE INDEX IF NOT EXISTS idx_insight_shards_created_at
  ON insight_shards (created_at DESC);

-- 4. Index for predictive_contexts usefulness filter
CREATE INDEX IF NOT EXISTS idx_predictive_contexts_created_at
  ON predictive_contexts (created_at DESC);

-- 5. Index for memory_decay archive scan
CREATE INDEX IF NOT EXISTS idx_memory_decay_archived
  ON memory_decay (is_archived, decay_score);

-- 6. Partial index for TTL-expirable memories (only rows with ttl_hours set)
CREATE INDEX IF NOT EXISTS idx_agent_memory_ttl_expiry
  ON agent_memory (created_at)
  WHERE ttl_hours IS NOT NULL;

-- 7. TTL cleanup function - deletes expired memories
CREATE OR REPLACE FUNCTION cleanup_expired_memories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete memories where TTL has expired
  WITH expired AS (
    DELETE FROM agent_memory
    WHERE ttl_hours IS NOT NULL
      AND created_at + (ttl_hours || ' hours')::interval < now()
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM expired;

  -- Also clean up associated decay records for deleted memories
  DELETE FROM memory_decay
  WHERE memory_id NOT IN (SELECT id FROM agent_memory);

  RETURN deleted_count;
END;
$$;

-- 8. Summons growth limiter - keeps only recent 500 summons per agent
CREATE OR REPLACE FUNCTION prune_old_summons(max_per_agent integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pruned integer := 0;
  agent_row RECORD;
BEGIN
  FOR agent_row IN
    SELECT agent_id, count(*) as cnt
    FROM memory_summons
    GROUP BY agent_id
    HAVING count(*) > max_per_agent
  LOOP
    WITH excess AS (
      DELETE FROM memory_summons
      WHERE id IN (
        SELECT id FROM memory_summons
        WHERE agent_id = agent_row.agent_id
        ORDER BY created_at DESC
        OFFSET max_per_agent
      )
      RETURNING id
    )
    SELECT pruned + count(*) INTO pruned FROM excess;
  END LOOP;

  RETURN pruned;
END;
$$;

-- 9. Schedule via pg_cron if available (Supabase has it)
DO $$
BEGIN
  -- Run TTL cleanup every hour
  PERFORM cron.schedule(
    'cleanup-expired-memories',
    '0 * * * *',
    'SELECT cleanup_expired_memories()'
  );

  -- Run summons pruning daily at 3 AM
  PERFORM cron.schedule(
    'prune-old-summons',
    '0 3 * * *',
    'SELECT prune_old_summons(500)'
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron not available - schedule cleanup manually';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule cron jobs: %', SQLERRM;
END;
$$;
