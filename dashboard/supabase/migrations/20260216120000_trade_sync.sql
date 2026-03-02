-- ============================================================
-- Trade Sync Migration
-- Fixes: x402_daily_spend view, adds missing indexes,
-- expands association_type, creates trade_executions table
-- ============================================================

-- 1. Fix x402_daily_spend view: include 'settled' status (x402-server writes "settled", not "completed")
CREATE OR REPLACE VIEW x402_daily_spend AS
SELECT
  agent_id,
  date_trunc('day', created_at) AS day,
  count(*) AS payment_count,
  sum(NULLIF(regexp_replace(amount, '[^0-9.]', '', 'g'), '')::numeric) AS total_amount,
  currency
FROM x402_payments
WHERE status IN ('completed', 'settled')
GROUP BY agent_id, date_trunc('day', created_at), currency
ORDER BY day DESC;

-- 2. Add missing indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_x402_payments_endpoint ON x402_payments(endpoint);
CREATE INDEX IF NOT EXISTS idx_x402_payments_payer ON x402_payments(payer_address);
CREATE INDEX IF NOT EXISTS idx_swarm_spawn_billing_status ON swarm_spawn_billing(status);

-- 3. Expand association_type to support fusion and dream catalyst types
ALTER TABLE memory_associations
  DROP CONSTRAINT IF EXISTS memory_associations_association_type_check;
ALTER TABLE memory_associations
  ADD CONSTRAINT memory_associations_association_type_check
  CHECK (association_type IN ('causal', 'similar', 'sequential', 'related', 'fusion', 'dream'));

-- 4. Trade executions table — structured logging for DeFi trade endpoints
CREATE TABLE IF NOT EXISTS trade_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Payment linkage
  payment_id UUID REFERENCES x402_payments(id) ON DELETE SET NULL,

  -- Trade details
  trade_type TEXT NOT NULL CHECK (trade_type IN ('swap', 'rebalance', 'arbitrage', 'yield-deposit', 'yield-withdraw')),
  token_in TEXT NOT NULL,
  token_out TEXT,
  amount_in TEXT NOT NULL,
  amount_out TEXT,
  trade_value_usd DECIMAL(18, 6),

  -- Fee details
  fee_usd DECIMAL(18, 6),
  fee_tier TEXT,                       -- "None", "Starter", "Bronze", etc.
  fee_percent DECIMAL(5, 4),           -- e.g. 0.005 = 0.5%

  -- Execution details
  chain TEXT NOT NULL DEFAULT 'base',
  protocol TEXT,                       -- "uniswap-v3", "aerodrome", "aave", "morpho", etc.
  pool_address TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'simulated')),

  -- Caller info
  caller_address TEXT,
  caller_agent_id TEXT,

  -- Extra data
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for trade_executions
CREATE INDEX IF NOT EXISTS idx_trade_exec_type ON trade_executions(trade_type);
CREATE INDEX IF NOT EXISTS idx_trade_exec_created ON trade_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_exec_caller ON trade_executions(caller_address);
CREATE INDEX IF NOT EXISTS idx_trade_exec_status ON trade_executions(status);
CREATE INDEX IF NOT EXISTS idx_trade_exec_protocol ON trade_executions(protocol);

-- RLS
ALTER TABLE trade_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view trade executions"
  ON trade_executions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages trade executions"
  ON trade_executions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon read access (for public dashboards)
CREATE POLICY "Anon can view trade executions"
  ON trade_executions FOR SELECT
  TO anon
  USING (true);

-- 5. Enable RLS on crystal tables that are missing it
ALTER TABLE memory_crystals ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_fusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summons ENABLE ROW LEVEL SECURITY;
ALTER TABLE limit_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quests ENABLE ROW LEVEL SECURITY;

-- Add service_role + anon policies for crystal tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['memory_crystals','memory_fusions','memory_summons','limit_breaks','memory_achievements','daily_quests'])
  LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Service role full access on %I" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Anon read on %I" ON %I FOR SELECT TO anon USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Authenticated read on %I" ON %I FOR SELECT TO authenticated USING (true)', tbl, tbl);
  END LOOP;
END $$;

-- 6. Trade volume summary view
CREATE OR REPLACE VIEW trade_volume_daily AS
SELECT
  trade_type,
  date_trunc('day', created_at) AS day,
  count(*) AS trade_count,
  sum(trade_value_usd) AS total_volume_usd,
  sum(fee_usd) AS total_fees_usd,
  avg(trade_value_usd) AS avg_trade_usd
FROM trade_executions
WHERE status IN ('executed', 'simulated')
GROUP BY trade_type, date_trunc('day', created_at)
ORDER BY day DESC;
