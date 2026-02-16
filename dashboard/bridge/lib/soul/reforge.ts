/**
 * Soul Agent — Memory Reforging System
 *
 * Not all memories deserve immortality.
 *
 * 1. Decay Scoring — tracks access patterns, ages memories
 * 2. Auto-Archive — cold-stores low-value dailies (still anchored, not loaded)
 * 3. Reforging — compresses 10+ related memories into 1 legendary crystal
 *
 * Prevents context bloat as you scale past 100 anchors.
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "./retrieval.js";

// ── Types ────────────────────────────────────────────────────

export interface DecayEntry {
  id?: string;
  memory_id: string;
  decay_score: number;    // 1.0 = fresh, 0.0 = forgotten
  access_count: number;
  last_accessed: string;
  is_archived: boolean;
  archive_reason?: string;
}

export interface ReforgedCrystal {
  id?: string;
  source_memory_ids: string[];
  result_crystal_id?: string;
  compression_ratio: number;
  source_count: number;
  reforged_by: string;
  legendary_name: string;
  summary: string;
  keywords: string[];
  created_at?: string;
}

// ── Legendary Names ──────────────────────────────────────────

const LEGENDARY_PREFIXES = [
  "The", "Ancient", "Eternal", "Lost", "Forgotten", "Sacred",
  "Shattered", "Luminous", "Shadow", "Crystal", "Void", "Genesis",
];

const LEGENDARY_SUFFIXES = [
  "Archive", "Chronicle", "Codex", "Fragment", "Remnant", "Tome",
  "Memory", "Echo", "Sigil", "Prism", "Core", "Nexus",
];

function generateLegendaryName(keywords: string[]): string {
  const prefix = LEGENDARY_PREFIXES[Math.floor(Math.random() * LEGENDARY_PREFIXES.length)];
  const suffix = LEGENDARY_SUFFIXES[Math.floor(Math.random() * LEGENDARY_SUFFIXES.length)];
  const keyword = keywords.length > 0
    ? keywords[0].charAt(0).toUpperCase() + keywords[0].slice(1)
    : "Unknown";
  return `${prefix} ${keyword} ${suffix}`;
}

// ── Decay Scoring ────────────────────────────────────────────

/**
 * Calculate decay score for a memory based on:
 * - Age (older = lower score)
 * - Access count (more accessed = higher score)
 * - Kind (errors decay faster, goals decay slower)
 * - Has anchor (anchored memories resist decay)
 */
function calculateDecay(
  ageHours: number,
  accessCount: number,
  kind: string,
  isAnchored: boolean
): number {
  // Base decay: halves every 72 hours
  let score = Math.pow(0.5, ageHours / 72);

  // Access boost: each access adds 0.1 (capped)
  score += Math.min(0.3, accessCount * 0.1);

  // Kind modifier
  const kindMultiplier: Record<string, number> = {
    goal: 1.3,       // Goals persist
    fact: 1.2,       // Facts are durable
    outcome: 1.0,    // Outcomes are normal
    observation: 0.9, // Observations fade faster
    note: 0.8,       // Notes are ephemeral
    error: 0.7,      // Errors fade (but can be important)
  };
  score *= kindMultiplier[kind] || 1.0;

  // Anchor resistance: anchored memories never go below 0.3
  if (isAnchored) {
    score = Math.max(0.3, score);
  }

  return Math.max(0, Math.min(1.0, score));
}

/**
 * Run the decay scoring pass across all memories.
 * Updates or creates decay entries for every memory.
 */
export async function runDecayPass(): Promise<{
  scored: number;
  archived: number;
  archiveCandidates: DecayEntry[];
}> {
  console.log("[soul:reforge] Running memory decay pass...");

  // Fetch all memories with their existing decay info
  const { data: memories, error: memErr } = await supabase
    .from("agent_memory")
    .select("id, kind, source, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (memErr || !memories) {
    console.log("[soul:reforge] No memories to score.");
    return { scored: 0, archived: 0, archiveCandidates: [] };
  }

  // Fetch existing decay entries
  const { data: existingDecay } = await supabase
    .from("memory_decay")
    .select("memory_id, access_count, is_archived");

  const decayMap = new Map<string, { access_count: number; is_archived: boolean }>();
  if (existingDecay) {
    for (const d of existingDecay) {
      decayMap.set(d.memory_id, { access_count: d.access_count, is_archived: d.is_archived });
    }
  }

  const now = Date.now();
  const upserts: Array<{
    memory_id: string;
    decay_score: number;
    access_count: number;
    is_archived: boolean;
    archive_reason?: string;
    updated_at: string;
  }> = [];

  const archiveCandidates: DecayEntry[] = [];
  let archivedCount = 0;

  for (const mem of memories) {
    const ageHours = (now - new Date(mem.created_at).getTime()) / (1000 * 60 * 60);
    const existing = decayMap.get(mem.id);
    const accessCount = existing?.access_count ?? 0;
    const isAnchored = mem.source === "anchor";
    const wasArchived = existing?.is_archived ?? false;

    const decayScore = calculateDecay(ageHours, accessCount, mem.kind, isAnchored);

    // Archive threshold: score < 0.15 and not already anchored
    const shouldArchive = decayScore < 0.15 && !isAnchored && !wasArchived;

    upserts.push({
      memory_id: mem.id,
      decay_score: Math.round(decayScore * 1000) / 1000,
      access_count: accessCount,
      is_archived: wasArchived || shouldArchive,
      archive_reason: shouldArchive ? `Auto-archived: decay score ${decayScore.toFixed(3)} below 0.15` : undefined,
      updated_at: new Date().toISOString(),
    });

    if (shouldArchive) {
      archivedCount++;
    }

    // Candidates for reforging: 0.15 ≤ score < 0.4
    if (decayScore >= 0.15 && decayScore < 0.4 && !isAnchored) {
      archiveCandidates.push({
        memory_id: mem.id,
        decay_score: decayScore,
        access_count: accessCount,
        last_accessed: mem.created_at,
        is_archived: false,
      });
    }
  }

  // Batch upsert in chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < upserts.length; i += CHUNK_SIZE) {
    const chunk = upserts.slice(i, i + CHUNK_SIZE);
    try {
      const { error } = await supabase
        .from("memory_decay")
        .upsert(chunk, { onConflict: "memory_id" });

      if (error) console.error("[soul:reforge] Decay upsert error:", error.message);
    } catch {
      console.log("[soul:reforge] memory_decay table not ready.");
      break;
    }
  }

  console.log(`[soul:reforge] Scored ${memories.length} memories. Archived ${archivedCount}. ${archiveCandidates.length} reforge candidates.`);

  return {
    scored: memories.length,
    archived: archivedCount,
    archiveCandidates,
  };
}

// ── Memory Reforging ─────────────────────────────────────────

/**
 * Find groups of related low-decay memories suitable for reforging.
 * Groups ≥5 memories by keyword overlap → compresses into legendary crystal.
 */
export async function findReforgeTargets(): Promise<Array<{
  memoryIds: string[];
  keywords: string[];
  count: number;
  avgDecay: number;
}>> {
  // Get reforge candidates (low decay, not anchored, not archived)
  const { data: candidates } = await supabase
    .from("memory_decay")
    .select("memory_id, decay_score")
    .eq("is_archived", false)
    .lt("decay_score", 0.4)
    .gte("decay_score", 0.05)
    .order("decay_score", { ascending: true })
    .limit(200);

  if (!candidates || candidates.length < 5) return [];

  // Fetch the actual memory content
  const memIds = candidates.map((c) => c.memory_id);
  const { data: memories } = await supabase
    .from("agent_memory")
    .select("id, content, kind")
    .in("id", memIds);

  if (!memories || memories.length < 5) return [];

  // Create decay score lookup
  const decayLookup = new Map<string, number>();
  for (const c of candidates) decayLookup.set(c.memory_id, c.decay_score);

  // Cluster by keyword overlap
  const memKeywords = memories.map((m) => ({
    id: m.id,
    keywords: extractKeywords(m.content),
    decay: decayLookup.get(m.id) || 0.2,
  }));

  const groups: Array<{ memoryIds: string[]; keywords: string[]; decays: number[] }> = [];
  const assigned = new Set<number>();

  for (let i = 0; i < memKeywords.length; i++) {
    if (assigned.has(i) || memKeywords[i].keywords.length < 2) continue;

    const group = {
      memoryIds: [memKeywords[i].id],
      keywords: [...memKeywords[i].keywords],
      decays: [memKeywords[i].decay],
    };
    assigned.add(i);

    for (let j = i + 1; j < memKeywords.length; j++) {
      if (assigned.has(j)) continue;

      const overlap = memKeywords[i].keywords.filter((kw) =>
        memKeywords[j].keywords.includes(kw)
      );

      if (overlap.length >= 2) {
        group.memoryIds.push(memKeywords[j].id);
        group.decays.push(memKeywords[j].decay);
        assigned.add(j);
      }
    }

    if (group.memoryIds.length >= 5) {
      groups.push(group);
    }
  }

  return groups.map((g) => ({
    memoryIds: g.memoryIds,
    keywords: g.keywords.slice(0, 8),
    count: g.memoryIds.length,
    avgDecay: g.decays.reduce((a, b) => a + b, 0) / g.decays.length,
  })).sort((a, b) => a.avgDecay - b.avgDecay);
}

/**
 * Reforge a group of memories into a single legendary crystal.
 *
 * 1. Summarize the memories into a compressed narrative
 * 2. Create a legendary memory crystal
 * 3. Archive the source memories
 * 4. Log the reforge event
 */
export async function reforgeMemories(
  memoryIds: string[],
  reforgedBy = "soul"
): Promise<ReforgedCrystal | null> {
  if (memoryIds.length < 5) {
    console.log("[soul:reforge] Need at least 5 memories to reforge.");
    return null;
  }

  console.log(`[soul:reforge] Reforging ${memoryIds.length} memories into legendary crystal...`);

  // 1. Fetch the memory contents
  const { data: memories } = await supabase
    .from("agent_memory")
    .select("id, content, kind, agent_id, created_at")
    .in("id", memoryIds)
    .order("created_at", { ascending: true });

  if (!memories || memories.length < 5) return null;

  // 2. Build compressed narrative
  const keywords = new Set<string>();
  const agents = new Set<string>();
  const kinds = new Map<string, number>();
  const contentSnippets: string[] = [];

  for (const m of memories) {
    for (const kw of extractKeywords(m.content)) keywords.add(kw);
    agents.add(m.agent_id);
    kinds.set(m.kind, (kinds.get(m.kind) || 0) + 1);
    // Take first 100 chars of each memory
    contentSnippets.push(m.content.substring(0, 100));
  }

  const topKeywords = [...keywords].slice(0, 10);
  const agentList = [...agents].filter((a) => a !== "_shared");
  const kindsSummary = [...kinds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `${c} ${k}s`)
    .join(", ");

  const timeRange = `${new Date(memories[0].created_at).toLocaleDateString()} — ${new Date(memories[memories.length - 1].created_at).toLocaleDateString()}`;

  const summary = [
    `REFORGED CRYSTAL — ${timeRange}`,
    `Compressed ${memories.length} memories (${kindsSummary}) into a single legendary crystal.`,
    `Agents involved: ${agentList.join(", ")}.`,
    `Core themes: ${topKeywords.join(", ")}.`,
    "",
    "Key moments:",
    ...contentSnippets.slice(0, 5).map((s, i) => `  ${i + 1}. ${s}...`),
    memories.length > 5 ? `  ... and ${memories.length - 5} more.` : "",
  ].join("\n");

  const legendaryName = generateLegendaryName(topKeywords);

  // 3. Create the legendary crystal
  let resultCrystalId: string | undefined;
  try {
    // Determine crystal type from dominant kind
    const dominantKind = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const crystalType = dominantKind === "error" ? "incident" :
      dominantKind === "goal" ? "decision" : "milestone";

    const { data: crystal, error: crystErr } = await supabase
      .from("memory_crystals")
      .insert({
        agent_id: reforgedBy,
        name: legendaryName,
        description: summary,
        crystal_type: crystalType,
        crystal_color: "amber",
        star_rating: 5,
        xp: memories.length * 100,
        level: 20,
        class: "godhand",
        effects: {
          context_relevance: 20,
          prediction_accuracy: 15,
          resilience: 10,
          reality_warp: 5,
        },
        is_fused: false,
        is_legendary: true,
      })
      .select("id")
      .single();

    if (crystal && !crystErr) {
      resultCrystalId = crystal.id;
      console.log(`[soul:reforge] Created legendary crystal: ${legendaryName} (${resultCrystalId})`);
    }
  } catch {
    console.log("[soul:reforge] Could not create crystal (table may not exist).");
  }

  // 4. Archive the source memories
  try {
    const { error: archiveErr } = await supabase
      .from("memory_decay")
      .upsert(
        memoryIds.map((mid) => ({
          memory_id: mid,
          decay_score: 0,
          is_archived: true,
          archive_reason: `Reforged into "${legendaryName}"`,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "memory_id" }
      );

    if (archiveErr) console.error("[soul:reforge] Archive error:", archiveErr.message);
  } catch {
    // Non-fatal
  }

  // 5. Log the reforge event
  const reforged: ReforgedCrystal = {
    source_memory_ids: memoryIds,
    result_crystal_id: resultCrystalId,
    compression_ratio: 1 / memories.length,
    source_count: memories.length,
    reforged_by: reforgedBy,
    legendary_name: legendaryName,
    summary,
    keywords: topKeywords,
  };

  try {
    const { error } = await supabase.from("reforged_crystals").insert(reforged);
    if (error) console.error("[soul:reforge] Reforge log error:", error.message);
  } catch {
    console.log("[soul:reforge] reforged_crystals table not ready.");
  }

  console.log(`[soul:reforge] ✦ Reforged ${memories.length} memories → "${legendaryName}" (5★ legendary)`);

  return reforged;
}

/**
 * Auto-reforge: find eligible groups and reforge them automatically.
 * Called during dream cycles.
 */
export async function autoReforge(): Promise<{
  reforgedCount: number;
  crystals: ReforgedCrystal[];
}> {
  console.log("[soul:reforge] Checking for auto-reforge opportunities...");

  const targets = await findReforgeTargets();
  const crystals: ReforgedCrystal[] = [];

  // Only reforge groups ≥ 8 memories automatically
  for (const target of targets) {
    if (target.count < 8) continue;

    const crystal = await reforgeMemories(target.memoryIds);
    if (crystal) crystals.push(crystal);

    // Limit to 2 auto-reforges per cycle
    if (crystals.length >= 2) break;
  }

  if (crystals.length > 0) {
    console.log(`[soul:reforge] Auto-reforged ${crystals.length} group(s) into legendary crystals.`);
  }

  return { reforgedCount: crystals.length, crystals };
}

// ── Query Helpers ────────────────────────────────────────────

/**
 * Record a memory access (for decay tracking).
 */
export async function recordMemoryAccess(memoryId: string): Promise<void> {
  try {
    // Upsert — increment access count
    const { data: existing } = await supabase
      .from("memory_decay")
      .select("access_count")
      .eq("memory_id", memoryId)
      .single();

    if (existing) {
      await supabase
        .from("memory_decay")
        .update({
          access_count: existing.access_count + 1,
          last_accessed: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("memory_id", memoryId);
    } else {
      await supabase.from("memory_decay").insert({
        memory_id: memoryId,
        decay_score: 1.0,
        access_count: 1,
        last_accessed: new Date().toISOString(),
      });
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Check if a memory is archived (should be excluded from context loading).
 */
export async function isMemoryArchived(memoryId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("memory_decay")
      .select("is_archived")
      .eq("memory_id", memoryId)
      .single();

    return data?.is_archived ?? false;
  } catch {
    return false;
  }
}

/**
 * Get reforging stats for dashboard.
 */
export async function getReforgeStats(): Promise<{
  totalMemories: number;
  archived: number;
  decaying: number;
  healthy: number;
  reforgedCrystals: number;
  totalCompressed: number;
  avgDecay: number;
}> {
  try {
    const { data: decayData } = await supabase
      .from("memory_decay")
      .select("decay_score, is_archived");

    const { data: reforged } = await supabase
      .from("reforged_crystals")
      .select("source_count");

    const entries = decayData || [];
    const archived = entries.filter((d) => d.is_archived).length;
    const decaying = entries.filter((d) => !d.is_archived && d.decay_score < 0.4).length;
    const healthy = entries.filter((d) => !d.is_archived && d.decay_score >= 0.4).length;
    const avgDecay = entries.length > 0
      ? entries.reduce((sum, d) => sum + d.decay_score, 0) / entries.length
      : 1.0;

    const reforgedEntries = reforged || [];
    const totalCompressed = reforgedEntries.reduce((sum, r) => sum + r.source_count, 0);

    return {
      totalMemories: entries.length,
      archived,
      decaying,
      healthy,
      reforgedCrystals: reforgedEntries.length,
      totalCompressed,
      avgDecay: Math.round(avgDecay * 100) / 100,
    };
  } catch {
    return {
      totalMemories: 0, archived: 0, decaying: 0, healthy: 0,
      reforgedCrystals: 0, totalCompressed: 0, avgDecay: 1.0,
    };
  }
}

/**
 * Get recent reforge events for the UI.
 */
export async function getRecentReforges(limit = 10): Promise<ReforgedCrystal[]> {
  try {
    const { data, error } = await supabase
      .from("reforged_crystals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as ReforgedCrystal[];
  } catch {
    return [];
  }
}
