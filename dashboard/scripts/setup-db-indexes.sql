-- ============================================================
-- XmetaV Performance Indexes — Safe, Additive Optimization
-- Run in Supabase SQL Editor after all other setup-db scripts.
-- All indexes use CONCURRENTLY to avoid table locks in production.
-- ============================================================

-- ── Agent Memory: fast context loading ──────────────────────
-- Hot path: bridge loads recent memories by source + time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_memory_source_created
  ON agent_memory (source, created_at DESC);

-- Hot path: TTL-based cleanup queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_memory_ttl
  ON agent_memory (ttl_hours, created_at)
  WHERE ttl_hours IS NOT NULL;

-- ── Soul: dream insights by confidence ──────────────────────
-- Hot path: soul context builder fetches high-confidence insights
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dream_insights_cat_conf
  ON dream_insights (category, confidence DESC);

-- ── Soul: memory associations by strength ───────────────────
-- Hot path: association retrieval sorted by strength
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assoc_type_strength
  ON memory_associations (association_type, strength DESC);

-- ── Commands: pending command pickup ────────────────────────
-- Hot path: bridge polls for pending commands per agent
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commands_agent_status_created
  ON agent_commands (agent_id, status, created_at ASC)
  WHERE status = 'pending';

-- ── Responses: fast chunk retrieval per command ─────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_command_created
  ON agent_responses (command_id, created_at ASC);

-- ── x402 Payments: revenue aggregation ──────────────────────
-- Hot path: Midas revenue reports aggregate by date + endpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x402_payments_created_endpoint
  ON x402_payments (created_at DESC, endpoint);

-- Hot path: completed payment filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x402_payments_settled
  ON x402_payments (status, created_at DESC)
  WHERE status = 'completed';

-- ── Swarm: task status lookups ──────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_swarm_tasks_swarm_status
  ON swarm_tasks (swarm_id, status);

-- ── Agent Sessions: heartbeat freshness check ───────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_heartbeat
  ON agent_sessions (last_heartbeat DESC);

-- ============================================================
-- Verification: list all custom indexes
-- ============================================================
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
