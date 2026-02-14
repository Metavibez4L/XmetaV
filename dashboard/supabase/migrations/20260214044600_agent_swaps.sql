-- Agent Swaps Log Table
-- Tracks all on-chain swaps executed by agents via the bridge
-- Created: 2026-02-14

CREATE TABLE IF NOT EXISTS agent_swaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'main',
  command_id UUID REFERENCES agent_commands(id),
  tx_hash TEXT,
  approve_tx_hash TEXT,
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  amount_in TEXT NOT NULL,
  amount_out TEXT,
  explorer_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by agent
CREATE INDEX IF NOT EXISTS idx_agent_swaps_agent ON agent_swaps(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_swaps_status ON agent_swaps(status);

-- RLS
ALTER TABLE agent_swaps ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all swaps
CREATE POLICY "Authenticated users can view swaps"
  ON agent_swaps FOR SELECT
  TO authenticated
  USING (true);

-- Service role (bridge) can insert/update
CREATE POLICY "Service role can manage swaps"
  ON agent_swaps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
