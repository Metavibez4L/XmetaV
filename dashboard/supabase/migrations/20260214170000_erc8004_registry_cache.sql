-- ============================================================
-- ORACLE IDENTITY SCOUTING — ERC-8004 Registry Cache
-- Local cache of discovered agents from the Base IdentityRegistry
-- ============================================================

-- ─── RELATIONSHIP ENUM ─────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE agent_relationship AS ENUM (
    'unknown', 'ally', 'neutral', 'avoided'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── REGISTRY CACHE TABLE ──────────────────────────────────

CREATE TABLE IF NOT EXISTS erc8004_registry_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        BIGINT NOT NULL UNIQUE,
  owner           TEXT NOT NULL DEFAULT '',
  agent_wallet    TEXT NOT NULL DEFAULT '',
  metadata_uri    TEXT NOT NULL DEFAULT '',

  -- Parsed from metadata (populated when URI is fetched)
  agent_name      TEXT,
  agent_type      TEXT,
  capabilities    TEXT[] NOT NULL DEFAULT '{}',
  fleet_members   TEXT[] NOT NULL DEFAULT '{}',

  -- Reputation from ReputationRegistry
  reputation_score   NUMERIC(10,4) NOT NULL DEFAULT 0,
  reputation_count   INTEGER NOT NULL DEFAULT 0,

  -- Activity tracking
  registered_at   TIMESTAMPTZ,                   -- from on-chain block timestamp
  last_seen       TIMESTAMPTZ DEFAULT now(),      -- last activity detected
  last_scanned    TIMESTAMPTZ DEFAULT now(),      -- last time we fetched data

  -- Classification
  relationship    agent_relationship NOT NULL DEFAULT 'unknown',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  notes           TEXT,

  -- Verification
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  has_metadata    BOOLEAN NOT NULL DEFAULT FALSE,
  has_reputation  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Internal
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── INDEXES ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_erc8004_cache_agent_id
  ON erc8004_registry_cache (agent_id);

CREATE INDEX IF NOT EXISTS idx_erc8004_cache_capabilities
  ON erc8004_registry_cache USING GIN (capabilities);

CREATE INDEX IF NOT EXISTS idx_erc8004_cache_tags
  ON erc8004_registry_cache USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_erc8004_cache_reputation
  ON erc8004_registry_cache (reputation_score DESC);

CREATE INDEX IF NOT EXISTS idx_erc8004_cache_relationship
  ON erc8004_registry_cache (relationship);

CREATE INDEX IF NOT EXISTS idx_erc8004_cache_last_seen
  ON erc8004_registry_cache (last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_erc8004_cache_registered
  ON erc8004_registry_cache (registered_at DESC);

-- ─── SCAN LOG TABLE ─────────────────────────────────────────
-- Tracks Oracle scan operations for audit/scheduling

CREATE TABLE IF NOT EXISTS erc8004_scan_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type     TEXT NOT NULL CHECK (scan_type IN ('range', 'event', 'refresh', 'single')),
  range_start   BIGINT,
  range_end     BIGINT,
  agents_found  INTEGER NOT NULL DEFAULT 0,
  agents_new    INTEGER NOT NULL DEFAULT 0,
  agents_updated INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_log_type
  ON erc8004_scan_log (scan_type, created_at DESC);

-- ─── AUTO-UPDATE TRIGGER ────────────────────────────────────

CREATE OR REPLACE FUNCTION update_erc8004_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erc8004_cache_updated ON erc8004_registry_cache;
CREATE TRIGGER trg_erc8004_cache_updated
  BEFORE UPDATE ON erc8004_registry_cache
  FOR EACH ROW EXECUTE FUNCTION update_erc8004_cache_updated_at();

-- ─── ROW LEVEL SECURITY ────────────────────────────────────

ALTER TABLE erc8004_registry_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE erc8004_scan_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
DO $$ BEGIN
  CREATE POLICY erc8004_cache_service_all
    ON erc8004_registry_cache FOR ALL
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY scan_log_service_all
    ON erc8004_scan_log FOR ALL
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Anon users can read the cache (public agent directory)
DO $$ BEGIN
  CREATE POLICY erc8004_cache_anon_select
    ON erc8004_registry_cache FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── REALTIME ───────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE erc8004_registry_cache;
