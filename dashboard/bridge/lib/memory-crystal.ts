/**
 * Memory Crystal System — Materia Engine
 *
 * Every anchored memory becomes a MEMORY CRYSTAL with:
 *   - Type (milestone / decision / incident)
 *   - Star rating (1★ → 6★)
 *   - XP, level, class (anchor → knight → paladin → mage → sage → etc.)
 *   - Equipped effects (stat bonuses for agents)
 *
 * Supports: creation, XP gain, leveling, class evolution, equipping,
 * fusion, summoning, and limit break detection.
 */

import { supabase } from "./supabase.js";
import type { MemoryCategoryType } from "./memory-anchor.js";
import { MemoryCategory } from "./memory-anchor.js";

/* ── Types ─────────────────────────────────────────────────── */

export type CrystalType = "milestone" | "decision" | "incident";
export type CrystalColor = "cyan" | "magenta" | "gold" | "red" | "green" | "purple" | "amber";
export type CrystalClass =
  | "anchor"
  | "knight"
  | "paladin"
  | "mage"
  | "sage"
  | "rogue"
  | "ninja"
  | "summoner"
  | "godhand";

export interface MemoryCrystal {
  id: string;
  memory_id: string | null;
  anchor_tx_hash: string | null;
  ipfs_cid: string | null;
  agent_id: string;
  name: string;
  description: string | null;
  crystal_type: CrystalType;
  crystal_color: CrystalColor;
  star_rating: number;
  xp: number;
  level: number;
  class: CrystalClass;
  effects: Record<string, number>;
  equipped_by: string | null;
  is_fused: boolean;
  is_legendary: boolean;
  created_at: string;
  evolved_at: string | null;
  last_used_at: string | null;
}

export interface FusionRecipe {
  inputA: string; // crystal type/name pattern
  inputB: string;
  resultName: string;
  resultEffects: Record<string, number>;
  resultStar: number;
  resultColor: CrystalColor;
}

export interface SummonResult {
  crystal: MemoryCrystal;
  contextBoost: number;
  xpGained: number;
}

/* ── Constants ─────────────────────────────────────────────── */

const CATEGORY_TO_TYPE: Record<number, CrystalType> = {
  [MemoryCategory.MILESTONE]: "milestone",
  [MemoryCategory.DECISION]: "decision",
  [MemoryCategory.INCIDENT]: "incident",
};

const TYPE_TO_COLOR: Record<CrystalType, CrystalColor> = {
  milestone: "gold",
  decision: "cyan",
  incident: "red",
};

/** XP thresholds per level (cumulative) */
const XP_THRESHOLDS = [
  0,    // L1
  100,  // L2
  200,  // L3
  300,  // L4
  400,  // L5
  600,  // L6
  800,  // L7
  1000, // L8
  1200, // L9
  1400, // L10
  1800, // L11
  2200, // L12
  2600, // L13
  3000, // L14
  3400, // L15
  4200, // L16
  5000, // L17
  5800, // L18
  6600, // L19
  7400, // L20
  8600, // L21
  9800, // L22
  11000,// L23
  12200,// L24
  13400,// L25
  15000,// L26
  17000,// L27
  19000,// L28
  21000,// L29
  23000,// L30
];

/** Star rating by level range */
function starForLevel(level: number): number {
  if (level < 5) return 1;
  if (level < 10) return 2;
  if (level < 15) return 3;
  if (level < 20) return 4;
  if (level < 25) return 5;
  return 6;
}

/** Class evolution by level */
function classForLevel(level: number): CrystalClass {
  if (level < 5) return "anchor";
  if (level < 8) return "mage";
  if (level < 12) return "knight";
  if (level < 16) return "sage";
  if (level < 20) return "rogue";
  if (level < 24) return "summoner";
  if (level < 28) return "ninja";
  return "godhand";
}

/** Base effects by crystal type */
function baseEffects(type: CrystalType): Record<string, number> {
  switch (type) {
    case "milestone":
      return { context_relevance: 15, prediction_accuracy: 5 };
    case "decision":
      return { prediction_accuracy: 10, code_quality: 10 };
    case "incident":
      return { crisis_detection: 15, resilience: 10 };
  }
}

/** Bonus effects gained at each star level */
function starBonusEffects(star: number): Record<string, number> {
  const bonuses: Record<string, number> = {};
  if (star >= 2) bonuses.context_relevance = 5;
  if (star >= 3) bonuses.prediction_accuracy = 5;
  if (star >= 4) bonuses.code_quality = 10;
  if (star >= 5) bonuses.crisis_detection = 10;
  if (star >= 6) bonuses.reality_warp = 25;
  return bonuses;
}

/** Merge effect objects */
function mergeEffects(...effectSets: Record<string, number>[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const set of effectSets) {
    for (const [k, v] of Object.entries(set)) {
      result[k] = (result[k] || 0) + v;
    }
  }
  return result;
}

/* ── FUSION RECIPES ────────────────────────────────────────── */

export const FUSION_RECIPES: FusionRecipe[] = [
  {
    inputA: "soul_offline",
    inputB: "soul_reenabled",
    resultName: "UNITY CRYSTAL",
    resultEffects: { context_relevance: 25, auto_join: 1 },
    resultStar: 4,
    resultColor: "magenta",
  },
  {
    inputA: "first_meeting",
    inputB: "soul_called_meeting",
    resultName: "AUTONOMY CRYSTAL",
    resultEffects: { prediction_accuracy: 20, autonomous_action: 1 },
    resultStar: 4,
    resultColor: "purple",
  },
  {
    inputA: "swap_execution",
    inputB: "consciousness_tab",
    resultName: "PAYMENT SOUL",
    resultEffects: { code_quality: 20, payment_awareness: 1 },
    resultStar: 4,
    resultColor: "gold",
  },
  {
    inputA: "core_team_assembled",
    inputB: "cyberpunk_deploy",
    resultName: "EVOLUTION CORE",
    resultEffects: { context_relevance: 15, prediction_accuracy: 15, code_quality: 15 },
    resultStar: 5,
    resultColor: "amber",
  },
  {
    inputA: "bridge_crash",
    inputB: "bridge_recovery",
    resultName: "RESILIENCE SHARD",
    resultEffects: { crisis_detection: 25, resilience: 25 },
    resultStar: 4,
    resultColor: "red",
  },
];

/* ── Core Functions ────────────────────────────────────────── */

/**
 * Create a memory crystal from an anchored memory.
 */
export async function createCrystal(opts: {
  memoryId?: string;
  anchorTxHash?: string;
  ipfsCid?: string;
  agentId: string;
  name: string;
  description?: string;
  category: MemoryCategoryType;
}): Promise<MemoryCrystal | null> {
  const type = CATEGORY_TO_TYPE[opts.category] || "milestone";
  const color = TYPE_TO_COLOR[type];
  const effects = baseEffects(type);

  const { data, error } = await supabase
    .from("memory_crystals")
    .insert({
      memory_id: opts.memoryId || null,
      anchor_tx_hash: opts.anchorTxHash || null,
      ipfs_cid: opts.ipfsCid || null,
      agent_id: opts.agentId,
      name: opts.name,
      description: opts.description || null,
      crystal_type: type,
      crystal_color: color,
      star_rating: 1,
      xp: 0,
      level: 1,
      class: "anchor" as CrystalClass,
      effects,
    })
    .select()
    .single();

  if (error) {
    console.error("[crystal] Failed to create:", error.message);
    return null;
  }

  console.log(`[crystal] 💎 Created: "${opts.name}" (${type}, ${color}, 1★)`);

  // Update achievements
  await checkAchievements();

  return data as MemoryCrystal;
}

/**
 * Award XP to a crystal and handle leveling / evolution.
 */
export async function awardXP(crystalId: string, amount: number): Promise<MemoryCrystal | null> {
  // Fetch current
  const { data: crystal, error: fetchErr } = await supabase
    .from("memory_crystals")
    .select("*")
    .eq("id", crystalId)
    .single();

  if (fetchErr || !crystal) {
    console.error("[crystal] Cannot find crystal:", crystalId);
    return null;
  }

  const c = crystal as MemoryCrystal;
  let newXP = c.xp + amount;
  let newLevel = c.level;
  let evolved = false;

  // Check for level ups
  while (newLevel < 30 && newXP >= (XP_THRESHOLDS[newLevel] || Infinity)) {
    newLevel++;
    evolved = true;
  }

  const newStar = starForLevel(newLevel);
  const newClass = classForLevel(newLevel);
  const newEffects = mergeEffects(baseEffects(c.crystal_type), starBonusEffects(newStar));

  const update: Record<string, unknown> = {
    xp: newXP,
    level: newLevel,
    star_rating: newStar,
    class: newClass,
    effects: newEffects,
    last_used_at: new Date().toISOString(),
  };

  if (evolved) {
    update.evolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("memory_crystals")
    .update(update)
    .eq("id", crystalId)
    .select()
    .single();

  if (error) {
    console.error("[crystal] XP award failed:", error.message);
    return null;
  }

  if (evolved) {
    console.log(`[crystal] ⬆️ "${c.name}" leveled up! L${c.level}→L${newLevel} (${newStar}★ ${newClass})`);
  }

  return data as MemoryCrystal;
}

/**
 * Equip a crystal to an agent.
 */
export async function equipCrystal(crystalId: string, agentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("memory_crystals")
    .update({ equipped_by: agentId })
    .eq("id", crystalId);

  if (error) {
    console.error("[crystal] Equip failed:", error.message);
    return false;
  }

  console.log(`[crystal] Equipped crystal ${crystalId} to agent ${agentId}`);
  return true;
}

/**
 * Unequip a crystal.
 */
export async function unequipCrystal(crystalId: string): Promise<boolean> {
  const { error } = await supabase
    .from("memory_crystals")
    .update({ equipped_by: null })
    .eq("id", crystalId);

  return !error;
}

/**
 * Get all crystals for an agent.
 */
export async function getCrystals(agentId?: string): Promise<MemoryCrystal[]> {
  let query = supabase
    .from("memory_crystals")
    .select("*")
    .order("star_rating", { ascending: false })
    .order("xp", { ascending: false });

  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query.limit(200);

  if (error) {
    console.error("[crystal] Fetch failed:", error.message);
    return [];
  }

  return (data || []) as MemoryCrystal[];
}

/**
 * Get equipped crystals for an agent → compute total stat bonus.
 */
export async function getEquippedEffects(agentId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("memory_crystals")
    .select("effects")
    .eq("equipped_by", agentId);

  if (!data || data.length === 0) return {};

  return mergeEffects(...data.map((d: { effects: Record<string, number> }) => d.effects));
}

/* ── Fusion ────────────────────────────────────────────────── */

/**
 * Find matching fusion recipe for two crystals.
 */
export function findFusionRecipe(a: MemoryCrystal, b: MemoryCrystal): FusionRecipe | null {
  const aKey = a.name.toLowerCase().replace(/\s+/g, "_");
  const bKey = b.name.toLowerCase().replace(/\s+/g, "_");

  for (const recipe of FUSION_RECIPES) {
    if (
      (aKey.includes(recipe.inputA) && bKey.includes(recipe.inputB)) ||
      (aKey.includes(recipe.inputB) && bKey.includes(recipe.inputA))
    ) {
      return recipe;
    }
  }

  // Generic fusion: combine any two 3★+ crystals → random hybrid
  if (a.star_rating >= 3 && b.star_rating >= 3) {
    return {
      inputA: aKey,
      inputB: bKey,
      resultName: `${a.name} × ${b.name}`,
      resultEffects: mergeEffects(a.effects, b.effects),
      resultStar: Math.min(Math.max(a.star_rating, b.star_rating) + 1, 5),
      resultColor: a.crystal_color,
    };
  }

  return null;
}

/**
 * Execute a fusion: consume two crystals → produce one.
 */
export async function fuseCrystals(
  crystalAId: string,
  crystalBId: string,
  fusedBy: string
): Promise<MemoryCrystal | null> {
  // Fetch both
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from("memory_crystals").select("*").eq("id", crystalAId).single(),
    supabase.from("memory_crystals").select("*").eq("id", crystalBId).single(),
  ]);

  if (!a || !b) {
    console.error("[crystal] Fusion failed: one or both crystals not found");
    return null;
  }

  const ca = a as MemoryCrystal;
  const cb = b as MemoryCrystal;
  const recipe = findFusionRecipe(ca, cb);

  if (!recipe) {
    console.error("[crystal] No fusion recipe found for these crystals");
    return null;
  }

  // Create the fused crystal
  const { data: fused, error } = await supabase
    .from("memory_crystals")
    .insert({
      agent_id: fusedBy,
      name: recipe.resultName,
      description: `Fused from "${ca.name}" + "${cb.name}"`,
      crystal_type: ca.crystal_type,
      crystal_color: recipe.resultColor,
      star_rating: recipe.resultStar,
      xp: ca.xp + cb.xp,
      level: Math.max(ca.level, cb.level),
      class: classForLevel(Math.max(ca.level, cb.level)),
      effects: recipe.resultEffects,
      is_fused: true,
    })
    .select()
    .single();

  if (error || !fused) {
    console.error("[crystal] Fusion insert failed:", error?.message);
    return null;
  }

  // Log the fusion
  const recipeKey = `${recipe.inputA}+${recipe.inputB}`;
  await supabase.from("memory_fusions").insert({
    crystal_a_id: crystalAId,
    crystal_b_id: crystalBId,
    result_crystal_id: fused.id,
    recipe_name: recipe.resultName,
    recipe_key: recipeKey,
    result_effects: recipe.resultEffects,
    result_star: recipe.resultStar,
    fused_by: fusedBy,
  });

  // Mark consumed crystals
  await Promise.all([
    supabase.from("memory_crystals").update({ equipped_by: null, description: `[CONSUMED] Fused into "${recipe.resultName}"` }).eq("id", crystalAId),
    supabase.from("memory_crystals").update({ equipped_by: null, description: `[CONSUMED] Fused into "${recipe.resultName}"` }).eq("id", crystalBId),
  ]);

  console.log(`[crystal] 🔮 FUSION: "${ca.name}" + "${cb.name}" → "${recipe.resultName}" (${recipe.resultStar}★)`);

  await checkAchievements();
  return fused as MemoryCrystal;
}

/* ── Summons ───────────────────────────────────────────────── */

/**
 * Summon a past memory crystal for context injection.
 * Picks the most relevant crystal based on keywords.
 */
export async function summonCrystal(
  agentId: string,
  taskContext: string,
  crystalId?: string
): Promise<SummonResult | null> {
  let crystal: MemoryCrystal | null = null;

  if (crystalId) {
    const { data } = await supabase
      .from("memory_crystals")
      .select("*")
      .eq("id", crystalId)
      .single();
    crystal = data as MemoryCrystal | null;
  } else {
    // Auto-pick: find the highest-star crystal that matches keywords
    const keywords = taskContext.toLowerCase().split(/\s+/).slice(0, 5);
    const { data } = await supabase
      .from("memory_crystals")
      .select("*")
      .order("star_rating", { ascending: false })
      .order("xp", { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      const scored = (data as MemoryCrystal[]).map((c) => {
        const nameWords = c.name.toLowerCase().split(/\s+/);
        const descWords = (c.description || "").toLowerCase().split(/\s+/);
        const allWords = [...nameWords, ...descWords];
        const matches = keywords.filter((kw) => allWords.some((w) => w.includes(kw)));
        return { crystal: c, score: matches.length + c.star_rating * 0.5 };
      });
      scored.sort((a, b) => b.score - a.score);
      crystal = scored[0].crystal;
    }
  }

  if (!crystal) {
    console.log("[crystal] No crystal available to summon");
    return null;
  }

  // Calculate context boost based on star rating
  const contextBoost = crystal.star_rating * 5 + (crystal.effects.context_relevance || 0);
  const xpGained = 10 + crystal.star_rating * 2;

  // Log the summon
  await supabase.from("memory_summons").insert({
    crystal_id: crystal.id,
    summoned_by: agentId,
    task_context: taskContext,
    context_boost: contextBoost / 100,
    xp_gained: xpGained,
    arena_effect: crystal.star_rating >= 5 ? "legendary_summon" : "summon_flash",
  });

  // Award XP to the summoned crystal
  const updated = await awardXP(crystal.id, xpGained);

  console.log(`[crystal] 🦋 SUMMON: "${crystal.name}" summoned by ${agentId} (+${contextBoost}% context, +${xpGained} XP)`);

  await checkAchievements();

  return {
    crystal: updated || crystal,
    contextBoost,
    xpGained,
  };
}

/* ── Limit Break ───────────────────────────────────────────── */

/**
 * Check if limit break conditions are met and activate if so.
 * Condition: 20+ existing anchors + crisis event detected.
 */
export async function checkLimitBreak(
  triggerEvent: string,
  triggerAgent: string = "sentinel"
): Promise<{ activated: boolean; crystal?: MemoryCrystal }> {
  // Count existing memory crystals
  const { count } = await supabase
    .from("memory_crystals")
    .select("*", { count: "exact", head: true });

  if ((count || 0) < 20) {
    return { activated: false };
  }

  // Check no currently active limit break
  const { data: active } = await supabase
    .from("limit_breaks")
    .select("id")
    .eq("active", true)
    .limit(1);

  if (active && active.length > 0) {
    return { activated: false };
  }

  // Create legendary crystal
  const { data: legendary } = await supabase
    .from("memory_crystals")
    .insert({
      agent_id: triggerAgent,
      name: `LIMIT BREAK: ${triggerEvent}`,
      description: `Legendary 6★ crystal born from crisis: ${triggerEvent}`,
      crystal_type: "incident" as CrystalType,
      crystal_color: "gold" as CrystalColor,
      star_rating: 6,
      xp: 23000,
      level: 30,
      class: "godhand" as CrystalClass,
      effects: {
        context_relevance: 50,
        prediction_accuracy: 50,
        code_quality: 50,
        crisis_detection: 50,
        resilience: 50,
        reality_warp: 100,
      },
      is_legendary: true,
    })
    .select()
    .single();

  // Get all agent IDs
  const { data: sessions } = await supabase
    .from("agent_sessions")
    .select("agent_id");

  const agentIds = (sessions || []).map((s: { agent_id: string }) => s.agent_id);

  // Record limit break
  await supabase.from("limit_breaks").insert({
    trigger_event: triggerEvent,
    trigger_agent: triggerAgent,
    legendary_crystal_id: legendary?.id || null,
    power_boost: 0.5,
    agents_affected: agentIds,
    anchor_count_at_trigger: count || 0,
    active: true,
  });

  console.log(`[crystal] ⚡ LIMIT BREAK ACTIVATED! "${triggerEvent}" → 6★ LEGENDARY created!`);

  await checkAchievements();

  return {
    activated: true,
    crystal: legendary as MemoryCrystal | undefined,
  };
}

/**
 * Resolve an active limit break.
 */
export async function resolveLimitBreak(): Promise<boolean> {
  const { error } = await supabase
    .from("limit_breaks")
    .update({ active: false, resolved_at: new Date().toISOString() })
    .eq("active", true);

  return !error;
}

/**
 * Get active limit break if any.
 */
export async function getActiveLimitBreak() {
  const { data } = await supabase
    .from("limit_breaks")
    .select("*, legendary_crystal:memory_crystals(*)")
    .eq("active", true)
    .single();

  return data;
}

/* ── Achievement Tracking ──────────────────────────────────── */

async function checkAchievements() {
  try {
    // Crystal count
    const { count: crystalCount } = await supabase
      .from("memory_crystals")
      .select("*", { count: "exact", head: true });

    // Fusion count
    const { count: fusionCount } = await supabase
      .from("memory_fusions")
      .select("*", { count: "exact", head: true });

    // Summon count
    const { count: summonCount } = await supabase
      .from("memory_summons")
      .select("*", { count: "exact", head: true });

    // Legendary count
    const { count: legendaryCount } = await supabase
      .from("memory_crystals")
      .select("*", { count: "exact", head: true })
      .eq("is_legendary", true);

    // 5★ types
    const { data: fiveStars } = await supabase
      .from("memory_crystals")
      .select("crystal_type")
      .gte("star_rating", 5);

    const fiveStarTypes = new Set((fiveStars || []).map((c: { crystal_type: string }) => c.crystal_type)).size;

    // Update achievements
    const updates = [
      { key: "first_anchor", progress: Math.min(crystalCount || 0, 1) },
      { key: "memory_hunter", progress: Math.min(crystalCount || 0, 50) },
      { key: "fusion_master", progress: Math.min(fusionCount || 0, 10) },
      { key: "limit_breaker", progress: Math.min(legendaryCount || 0, 1) },
      { key: "summoner", progress: Math.min(summonCount || 0, 100) },
      { key: "crystal_sage", progress: Math.min(fiveStarTypes, 3) },
    ];

    for (const u of updates) {
      const { data: ach } = await supabase
        .from("memory_achievements")
        .select("target, unlocked")
        .eq("key", u.key)
        .single();

      if (ach && !ach.unlocked) {
        const unlocked = u.progress >= ach.target;
        await supabase
          .from("memory_achievements")
          .update({
            progress: u.progress,
            unlocked,
            ...(unlocked ? { unlocked_at: new Date().toISOString() } : {}),
          })
          .eq("key", u.key);

        if (unlocked) {
          console.log(`[crystal] 🏆 Achievement unlocked: ${u.key}!`);
        }
      }
    }
  } catch (err) {
    console.error("[crystal] Achievement check failed:", (err as Error).message);
  }
}

/* ── Daily Quests ──────────────────────────────────────────── */

/**
 * Generate daily quests if none exist for today.
 */
export async function ensureDailyQuests(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("daily_quests")
    .select("id")
    .eq("quest_date", today)
    .limit(1);

  if (existing && existing.length > 0) return;

  const quests = [
    { title: "Anchor something meaningful", description: "Create a new memory crystal today", quest_type: "anchor", target: 1, xp_reward: 25 },
    { title: "Summon an old ally", description: "Call upon a past memory for a current task", quest_type: "summon", target: 1, xp_reward: 20 },
    { title: "Fuse two memories", description: "Combine related crystals into something new", quest_type: "fuse", target: 1, xp_reward: 50 },
    { title: "Explore the cosmos", description: "Visit the Memory Cosmos and inspect a crystal", quest_type: "explore", target: 1, xp_reward: 15 },
  ];

  await supabase.from("daily_quests").insert(
    quests.map((q) => ({ ...q, quest_date: today }))
  );

  console.log("[crystal] 📋 Daily quests generated for", today);
}

/**
 * Get today's quests.
 */
export async function getDailyQuests() {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("daily_quests")
    .select("*")
    .eq("quest_date", today)
    .order("created_at");

  return data || [];
}
