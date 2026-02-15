-- ============================================================
-- Migration: Phase 2 — A/B Pricing + Swarm Spawn Billing
-- ============================================================

-- A/B pricing experiments
CREATE TABLE IF NOT EXISTS pricing_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_path text NOT NULL,
  variant_name text NOT NULL DEFAULT 'control',
  price_usd decimal(18,6) NOT NULL,
  impressions int DEFAULT 0,
  conversions int DEFAULT 0,
  revenue_usd decimal(18,6) DEFAULT 0,
  conversion_rate decimal(5,2) DEFAULT 0,
  avg_revenue_per_impression decimal(18,6) DEFAULT 0,
  is_active boolean DEFAULT true,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(endpoint_path, variant_name)
);

-- Swarm spawn billing (per sub-agent invocation)
CREATE TABLE IF NOT EXISTS swarm_spawn_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  spawn_price_usd decimal(18,6) NOT NULL DEFAULT 0.02,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'billed', 'waived')),
  payer_address text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pricing_experiments_endpoint ON pricing_experiments(endpoint_path);
CREATE INDEX IF NOT EXISTS idx_pricing_experiments_active ON pricing_experiments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_swarm_spawn_billing_swarm ON swarm_spawn_billing(swarm_id);
CREATE INDEX IF NOT EXISTS idx_swarm_spawn_billing_agent ON swarm_spawn_billing(agent_id);

-- RLS
ALTER TABLE pricing_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_spawn_billing ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pricing_experiments_select') THEN
    CREATE POLICY pricing_experiments_select ON pricing_experiments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pricing_experiments_all') THEN
    CREATE POLICY pricing_experiments_all ON pricing_experiments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'swarm_spawn_billing_select') THEN
    CREATE POLICY swarm_spawn_billing_select ON swarm_spawn_billing FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'swarm_spawn_billing_all') THEN
    CREATE POLICY swarm_spawn_billing_all ON swarm_spawn_billing FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE pricing_experiments;
ALTER PUBLICATION supabase_realtime ADD TABLE swarm_spawn_billing;

-- Seed A/B experiments: test two price points per premium endpoint
INSERT INTO pricing_experiments (endpoint_path, variant_name, price_usd) VALUES
  -- Memory Crystal
  ('/memory-crystal', 'control', 0.05),
  ('/memory-crystal', 'premium', 0.08),
  -- Neural Swarm
  ('/neural-swarm', 'control', 0.10),
  ('/neural-swarm', 'premium', 0.15),
  -- Fusion Chamber
  ('/fusion-chamber', 'control', 0.15),
  ('/fusion-chamber', 'premium', 0.25),
  -- Cosmos Explore
  ('/cosmos-explore', 'control', 0.20),
  ('/cosmos-explore', 'premium', 0.30),
  -- Agent Task
  ('/agent-task', 'control', 0.10),
  ('/agent-task', 'premium', 0.15)
ON CONFLICT (endpoint_path, variant_name) DO NOTHING;
