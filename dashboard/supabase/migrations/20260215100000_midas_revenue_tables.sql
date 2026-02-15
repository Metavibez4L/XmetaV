-- ============================================================
-- Migration: Midas Revenue & Growth Agent tables
-- ============================================================
-- Supports the Midas agent's revenue tracking, endpoint
-- analytics, and growth opportunity pipeline.
-- ============================================================

-- Revenue metrics (daily snapshots)
CREATE TABLE IF NOT EXISTS revenue_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_revenue_usd decimal(18,6) DEFAULT 0,
  x402_payments_count int DEFAULT 0,
  token_velocity decimal(18,6) DEFAULT 0,
  top_endpoint text,
  top_agent text,
  growth_rate_week decimal(5,2) DEFAULT 0,
  growth_rate_month decimal(5,2) DEFAULT 0,
  forecast_7d decimal(18,6) DEFAULT 0,
  forecast_30d decimal(18,6) DEFAULT 0,
  forecast_90d decimal(18,6) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Endpoint analytics (one row per endpoint path)
CREATE TABLE IF NOT EXISTS endpoint_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_path text NOT NULL UNIQUE,
  total_calls int DEFAULT 0,
  paid_calls int DEFAULT 0,
  free_calls int DEFAULT 0,
  conversion_rate decimal(5,2) DEFAULT 0,
  avg_payment_usd decimal(18,6) DEFAULT 0,
  revenue_7d decimal(18,6) DEFAULT 0,
  revenue_30d decimal(18,6) DEFAULT 0,
  growth_trend text DEFAULT 'stable' CHECK (growth_trend IN ('up', 'stable', 'down')),
  last_called_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Growth opportunities pipeline
CREATE TABLE IF NOT EXISTS growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'general' CHECK (category IN ('endpoint', 'token', 'partnership', 'vertical', 'optimization')),
  expected_revenue_30d decimal(18,6) DEFAULT 0,
  investment_required_usd decimal(18,6) DEFAULT 0,
  roi_score decimal(5,2) DEFAULT 0,
  priority int DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status text DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'in_progress', 'completed', 'rejected')),
  proposed_by text DEFAULT 'midas',
  approved_by text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Pricing recommendations
CREATE TABLE IF NOT EXISTS pricing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_path text NOT NULL,
  current_price_usd decimal(18,6),
  recommended_price_usd decimal(18,6),
  reasoning text,
  confidence decimal(3,2) DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  applied_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_revenue_metrics_date ON revenue_metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_endpoint_analytics_revenue ON endpoint_analytics(revenue_30d DESC);
CREATE INDEX IF NOT EXISTS idx_growth_opportunities_priority ON growth_opportunities(priority ASC, roi_score DESC);
CREATE INDEX IF NOT EXISTS idx_growth_opportunities_status ON growth_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_status ON pricing_recommendations(status);

-- RLS
ALTER TABLE revenue_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_recommendations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'revenue_metrics_select') THEN
    CREATE POLICY revenue_metrics_select ON revenue_metrics FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'revenue_metrics_all') THEN
    CREATE POLICY revenue_metrics_all ON revenue_metrics FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'endpoint_analytics_select') THEN
    CREATE POLICY endpoint_analytics_select ON endpoint_analytics FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'endpoint_analytics_all') THEN
    CREATE POLICY endpoint_analytics_all ON endpoint_analytics FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'growth_opportunities_select') THEN
    CREATE POLICY growth_opportunities_select ON growth_opportunities FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'growth_opportunities_all') THEN
    CREATE POLICY growth_opportunities_all ON growth_opportunities FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pricing_recommendations_select') THEN
    CREATE POLICY pricing_recommendations_select ON pricing_recommendations FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pricing_recommendations_all') THEN
    CREATE POLICY pricing_recommendations_all ON pricing_recommendations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Triggers for updated_at
CREATE OR REPLACE TRIGGER set_endpoint_analytics_updated_at
  BEFORE UPDATE ON endpoint_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_growth_opportunities_updated_at
  BEFORE UPDATE ON growth_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE revenue_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE endpoint_analytics;
ALTER PUBLICATION supabase_realtime ADD TABLE growth_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE pricing_recommendations;
