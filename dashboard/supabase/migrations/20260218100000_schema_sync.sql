-- ============================================================
-- Migration: Dashboard ↔ Supabase Schema Sync
-- Fixes the only 2 tables with real column mismatches
-- ============================================================

-- ── x402_payments ──────────────────────────────────────────
-- Add metadata column for caller agent info (code had metadata fallback)
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS metadata jsonb;
-- Fix network default: was 'eip155:84532' (Base Sepolia testnet),
-- should be 'eip155:8453' (Base Mainnet)
ALTER TABLE x402_payments ALTER COLUMN network SET DEFAULT 'eip155:8453';

-- ── agent_responses ────────────────────────────────────────
-- LiveLogs.tsx reads agent, output, error, session_id
-- Bridge writes command_id, content, is_final
-- Add alias columns so both old and new code paths work
ALTER TABLE agent_responses ADD COLUMN IF NOT EXISTS agent text;
ALTER TABLE agent_responses ADD COLUMN IF NOT EXISTS output text;
ALTER TABLE agent_responses ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE agent_responses ADD COLUMN IF NOT EXISTS session_id uuid;
-- Backfill output from content for existing rows
UPDATE agent_responses SET output = content WHERE output IS NULL AND content IS NOT NULL;
