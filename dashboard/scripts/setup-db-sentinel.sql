-- Sentinel Agent Monitoring Tables
-- Tracks incidents, healing actions, and distributed traces.

-- ── Incidents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service     text NOT NULL,
  type        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message     text NOT NULL,
  count       integer DEFAULT 1,
  metadata    jsonb DEFAULT '{}',
  resolved    boolean DEFAULT false,
  resolved_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_service   ON sentinel_incidents (service);
CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_severity  ON sentinel_incidents (severity);
CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_resolved  ON sentinel_incidents (resolved);
CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_created   ON sentinel_incidents (created_at DESC);

-- ── Healing Log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_healing_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service     text NOT NULL,
  action      text NOT NULL,
  success     boolean NOT NULL,
  message     text,
  duration_ms integer,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_healing_created ON sentinel_healing_log (created_at DESC);

-- ── Distributed Traces ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_traces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id        text UNIQUE NOT NULL,
  root_service    text NOT NULL,
  root_operation  text NOT NULL,
  spans           jsonb NOT NULL DEFAULT '[]',
  duration_ms     integer,
  has_errors      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_traces_service ON sentinel_traces (root_service);
CREATE INDEX IF NOT EXISTS idx_sentinel_traces_created ON sentinel_traces (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sentinel_traces_errors  ON sentinel_traces (has_errors) WHERE has_errors = true;

-- ── Resource Snapshots (hourly rollups) ──────────────────────
CREATE TABLE IF NOT EXISTS sentinel_resource_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpu_percent     real,
  memory_percent  real,
  disk_percent    real,
  load_avg_1m     real,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_resources_created ON sentinel_resource_snapshots (created_at DESC);

-- ── RLS (allow bridge service role full access, anon read for dashboard) ─
ALTER TABLE sentinel_incidents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_healing_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_traces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_resource_snapshots  ENABLE ROW LEVEL SECURITY;

-- Anon read for dashboard health display
CREATE POLICY "anon_read_incidents"  ON sentinel_incidents  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_healing"    ON sentinel_healing_log FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_traces"     ON sentinel_traces      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_resources"  ON sentinel_resource_snapshots FOR SELECT TO anon USING (true);

-- Service role full access
CREATE POLICY "service_all_incidents" ON sentinel_incidents  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_healing"   ON sentinel_healing_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_traces"    ON sentinel_traces      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_resources" ON sentinel_resource_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Enable realtime on incidents for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE sentinel_incidents;
