-- ============================================================
-- Migration 005: Add metadata column to x402_payments
-- Fix network default from Sepolia to Base Mainnet
-- ============================================================
-- Run in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/ptlneqcjsnrxxruutsxm/sql/new
-- ============================================================

-- Add optional metadata column for caller agent info
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Fix network default: was Base Sepolia, should be Base Mainnet
ALTER TABLE x402_payments ALTER COLUMN network SET DEFAULT 'eip155:8453';
