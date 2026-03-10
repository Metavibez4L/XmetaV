-- ============================================================
-- Cross-Chain Jobs Table
-- Tracks multi-chain swap operations:
--   Base x402 → Solana bridge → Jupiter swap → Kamino vault → return
-- ============================================================

CREATE TABLE IF NOT EXISTS cross_chain_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_address   TEXT NOT NULL,
  payment_amount  NUMERIC(20,6) NOT NULL,
  target_chain    TEXT NOT NULL DEFAULT 'solana',
  output_token    TEXT NOT NULL DEFAULT 'USDC',
  vault_strategy  TEXT NOT NULL DEFAULT 'none',
  return_to_base  BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'pending',
  batch_id        UUID,

  -- Transaction hashes
  base_bridge_tx    TEXT,
  solana_bridge_tx  TEXT,
  jupiter_swap_tx   TEXT,
  kamino_deposit_tx TEXT,
  kamino_withdraw_tx TEXT,
  return_bridge_tx  TEXT,
  anchor_tx         TEXT,

  -- Amounts
  bridged_amount     NUMERIC(20,6),
  swap_output_amount NUMERIC(20,6),
  vault_shares       NUMERIC(20,6),
  return_amount      NUMERIC(20,6),
  yield_earned       NUMERIC(20,6),

  -- Fees (JSONB for flexibility)
  fees JSONB,

  -- Error tracking
  error TEXT,

  -- Timestamps
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ccj_status ON cross_chain_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ccj_payer ON cross_chain_jobs(payer_address);
CREATE INDEX IF NOT EXISTS idx_ccj_batch ON cross_chain_jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ccj_created ON cross_chain_jobs(created_at DESC);

-- Batch groups table
CREATE TABLE IF NOT EXISTS cross_chain_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_amount NUMERIC(20,6) NOT NULL,
  job_count    INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'collecting',
  bridge_tx    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_ccj_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ccj_updated_at ON cross_chain_jobs;
CREATE TRIGGER trg_ccj_updated_at
  BEFORE UPDATE ON cross_chain_jobs
  FOR EACH ROW EXECUTE FUNCTION update_ccj_updated_at();

-- RLS policies (service role bypasses, but good practice)
ALTER TABLE cross_chain_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_chain_batches ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_ccj" ON cross_chain_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_ccb" ON cross_chain_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their own jobs
CREATE POLICY "read_own_ccj" ON cross_chain_jobs
  FOR SELECT TO authenticated
  USING (payer_address = current_setting('request.jwt.claims', true)::json->>'sub');
