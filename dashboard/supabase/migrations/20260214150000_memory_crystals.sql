-- ============================================================
-- CYBER-NEURAL MEMORY EVOLUTION — Memory Crystal System
-- Memory Crystals, Fusions, Summons, Quests, Job Classes
-- ============================================================

-- ─── ENUMS ──────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE crystal_type AS ENUM ('milestone', 'decision', 'incident');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crystal_color AS ENUM ('cyan', 'magenta', 'gold', 'red', 'green', 'purple', 'amber');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crystal_class AS ENUM (
    'anchor', 'knight', 'paladin', 'mage', 'sage',
    'rogue', 'ninja', 'summoner', 'godhand'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── MEMORY CRYSTALS ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_crystals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Link to the anchored memory
  memory_id UUID REFERENCES agent_memory(id) ON DELETE SET NULL,
  anchor_tx_hash TEXT,         -- on-chain TX hash
  ipfs_cid TEXT,               -- IPFS content hash
  agent_id TEXT NOT NULL,      -- which agent spawned this crystal
  
  -- Crystal identity
  name TEXT NOT NULL,          -- e.g. "First Meeting", "Soul Offline"
  description TEXT,
  crystal_type crystal_type NOT NULL DEFAULT 'milestone',
  crystal_color crystal_color NOT NULL DEFAULT 'cyan',

  -- Materia system
  star_rating SMALLINT NOT NULL DEFAULT 1 CHECK (star_rating BETWEEN 1 AND 6),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  class crystal_class NOT NULL DEFAULT 'anchor',

  -- Equipped effects (JSONB for flexible stat bonuses)
  -- e.g. {"context_relevance": 15, "prediction_accuracy": 10, "code_quality": 20}
  effects JSONB NOT NULL DEFAULT '{}',
  
  -- Status
  equipped_by TEXT,            -- agent_id of who has it equipped (null = unequipped)
  is_fused BOOLEAN NOT NULL DEFAULT FALSE,   -- true if created from fusion
  is_legendary BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evolved_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crystals_agent ON memory_crystals(agent_id);
CREATE INDEX IF NOT EXISTS idx_crystals_star ON memory_crystals(star_rating DESC);
CREATE INDEX IF NOT EXISTS idx_crystals_equipped ON memory_crystals(equipped_by) WHERE equipped_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crystals_class ON memory_crystals(class);
CREATE INDEX IF NOT EXISTS idx_crystals_type ON memory_crystals(crystal_type);

-- ─── MEMORY FUSIONS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_fusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Input crystals (consumed)
  crystal_a_id UUID NOT NULL REFERENCES memory_crystals(id) ON DELETE CASCADE,
  crystal_b_id UUID NOT NULL REFERENCES memory_crystals(id) ON DELETE CASCADE,
  -- Output crystal (created)
  result_crystal_id UUID REFERENCES memory_crystals(id) ON DELETE SET NULL,
  
  -- Recipe metadata
  recipe_name TEXT NOT NULL,   -- e.g. "UNITY CRYSTAL", "RESILIENCE SHARD"
  recipe_key TEXT NOT NULL,    -- normalized key for matching, e.g. "soul_offline+soul_reenabled"
  
  -- Bonus effects from fusion
  result_effects JSONB NOT NULL DEFAULT '{}',
  result_star SMALLINT NOT NULL DEFAULT 4,
  
  -- Status
  fused_by TEXT NOT NULL,      -- who initiated the fusion
  fused_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fusions_recipe ON memory_fusions(recipe_key);

-- ─── MEMORY SUMMONS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_summons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which crystal was summoned
  crystal_id UUID NOT NULL REFERENCES memory_crystals(id) ON DELETE CASCADE,
  -- Context
  summoned_by TEXT NOT NULL,   -- agent_id
  task_context TEXT,           -- what task triggered the summon
  
  -- Effect
  context_boost REAL NOT NULL DEFAULT 0.0,  -- % boost to relevance
  xp_gained INTEGER NOT NULL DEFAULT 10,    -- XP awarded to crystal
  
  -- Visual state (for arena rendering)
  arena_effect TEXT DEFAULT 'summon_flash',
  
  summoned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_summons_crystal ON memory_summons(crystal_id);
CREATE INDEX IF NOT EXISTS idx_summons_agent ON memory_summons(summoned_by);

-- ─── LIMIT BREAKS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS limit_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The crisis that triggered it
  trigger_event TEXT NOT NULL,
  trigger_agent TEXT NOT NULL DEFAULT 'sentinel',
  
  -- Resulting legendary crystal
  legendary_crystal_id UUID REFERENCES memory_crystals(id) ON DELETE SET NULL,
  
  -- Effect
  power_boost REAL NOT NULL DEFAULT 0.50,  -- 50% boost
  agents_affected TEXT[] NOT NULL DEFAULT '{}',
  
  -- Condition check
  anchor_count_at_trigger INTEGER NOT NULL DEFAULT 0,
  
  -- Lifecycle
  active BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_limit_breaks_active ON limit_breaks(active) WHERE active = TRUE;

-- ─── MEMORY QUESTS & ACHIEVEMENTS ──────────────────────────

CREATE TABLE IF NOT EXISTS memory_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,     -- "first_anchor", "memory_hunter", etc.
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,                    -- emoji or icon key
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'legendary')),
  requirement JSONB NOT NULL DEFAULT '{}', -- e.g. {"anchor_count": 50}
  
  -- Progress
  unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  progress INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL DEFAULT 1,
  
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  description TEXT,
  quest_type TEXT NOT NULL DEFAULT 'anchor', -- 'anchor', 'summon', 'fuse', 'explore'
  target INTEGER NOT NULL DEFAULT 1,
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  xp_reward INTEGER NOT NULL DEFAULT 25,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_quests_date ON daily_quests(quest_date);

-- ─── SEED ACHIEVEMENTS ─────────────────────────────────────

INSERT INTO memory_achievements (key, name, description, icon, tier, requirement, target)
VALUES
  ('first_anchor', 'First Anchor', 'Bind your first memory', '⚓', 'bronze', '{"anchor_count": 1}', 1),
  ('memory_hunter', 'Memory Hunter', 'Anchor 50 memories', '🏹', 'silver', '{"anchor_count": 50}', 50),
  ('fusion_master', 'Fusion Master', 'Create 10 hybrid crystals', '🔮', 'gold', '{"fusion_count": 10}', 10),
  ('limit_breaker', 'Limit Breaker', 'Survive a crisis with a 6★ memory', '⚡', 'legendary', '{"legendary_count": 1}', 1),
  ('summoner', 'Summoner', 'Call 100 past memories', '🦋', 'gold', '{"summon_count": 100}', 100),
  ('crystal_sage', 'Crystal Sage', 'One 5★ crystal of each type', '🧠', 'legendary', '{"five_star_types": 3}', 3),
  ('one_winged_angel', 'One Winged Angel', '6★ Legendary + all classes maxed', '👼', 'legendary', '{"godhand_count": 1, "legendary_count": 1}', 1)
ON CONFLICT (key) DO NOTHING;

-- ─── XP LEVEL THRESHOLDS (reference view) ──────────────────

CREATE OR REPLACE VIEW crystal_level_thresholds AS
SELECT
  level,
  CASE
    WHEN level <= 5  THEN level * 100
    WHEN level <= 10 THEN 500 + (level - 5) * 200
    WHEN level <= 20 THEN 1500 + (level - 10) * 400
    ELSE 5500 + (level - 20) * 800
  END AS xp_required,
  CASE
    WHEN level < 5  THEN 1
    WHEN level < 10 THEN 2
    WHEN level < 15 THEN 3
    WHEN level < 20 THEN 4
    WHEN level < 25 THEN 5
    ELSE 6
  END AS star_rating,
  CASE
    WHEN level < 5 THEN 'anchor'
    WHEN level < 10 THEN 'mage'
    WHEN level < 15 THEN 'knight'
    WHEN level < 20 THEN 'sage'
    WHEN level < 25 THEN 'summoner'
    ELSE 'godhand'
  END AS class_name
FROM generate_series(1, 30) AS level;

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE memory_crystals ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_fusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summons ENABLE ROW LEVEL SECURITY;
ALTER TABLE limit_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quests ENABLE ROW LEVEL SECURITY;

-- Read for authenticated
CREATE POLICY "auth_read_crystals" ON memory_crystals FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_fusions" ON memory_fusions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_summons" ON memory_summons FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_breaks" ON limit_breaks FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_achievements" ON memory_achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_quests" ON daily_quests FOR SELECT TO authenticated USING (true);

-- Insert/update for authenticated
CREATE POLICY "auth_write_crystals" ON memory_crystals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_crystals" ON memory_crystals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_write_fusions" ON memory_fusions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_write_summons" ON memory_summons FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_write_breaks" ON limit_breaks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_breaks" ON limit_breaks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update_achievements" ON memory_achievements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_write_quests" ON daily_quests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_quests" ON daily_quests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Service role full access
CREATE POLICY "service_crystals" ON memory_crystals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_fusions" ON memory_fusions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_summons" ON memory_summons FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_breaks" ON limit_breaks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_achievements" ON memory_achievements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_quests" ON daily_quests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── REALTIME ───────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE memory_crystals;
ALTER PUBLICATION supabase_realtime ADD TABLE memory_fusions;
ALTER PUBLICATION supabase_realtime ADD TABLE memory_summons;
ALTER PUBLICATION supabase_realtime ADD TABLE limit_breaks;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_quests;
