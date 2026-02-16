-- Optimization Pass: RLS + Indexes
-- Applied to live Supabase on 2026-02-15

-- ── Authenticated READ policies for dream tables ──
-- LucidDreaming.tsx uses user-scoped client (createClient), not admin.
-- Without these policies, authenticated users see empty results.
CREATE POLICY "authenticated_read_manifestations" ON soul_dream_manifestations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_sessions" ON soul_dream_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_modifications" ON soul_association_modifications
  FOR SELECT TO authenticated USING (true);

-- ── Missing index on agent_memory.source ──
-- useConsciousness queries .eq("source", "anchor") every 30s.
CREATE INDEX IF NOT EXISTS idx_agent_memory_source ON agent_memory(source);

-- ── Composite index for association lookups ──
-- retrieval.ts boostByAssociations queries both memory_id and related_memory_id.
CREATE INDEX IF NOT EXISTS idx_memory_associations_both ON memory_associations(memory_id, related_memory_id);
