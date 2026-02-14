/**
 * Soul Agent — Dream Mode
 *
 * Runs during extended idle periods (>6h without fleet activity).
 * Consolidates scattered memories into insight summaries,
 * detects patterns, and prunes weak associations.
 *
 * This is triggered by the bridge heartbeat when idle time exceeds
 * the threshold. Not a cron job — it's opportunistic.
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "./retrieval.js";
import type { DreamInsight } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

let lastDreamTime = 0;
let isDreaming = false;

/**
 * Check if it's time to dream. Called from the heartbeat loop.
 * Dreams when fleet has been idle for >6 hours and hasn't dreamed recently.
 */
export async function maybeStartDream(): Promise<void> {
  if (isDreaming) return;

  const now = Date.now();
  const hoursSinceLastDream = (now - lastDreamTime) / (1000 * 60 * 60);
  if (hoursSinceLastDream < DEFAULT_CONFIG.dreamIdleThresholdHours) return;

  // Check if fleet is actually idle
  const { data: busyAgents } = await supabase
    .from("agent_sessions")
    .select("agent_id")
    .eq("status", "busy")
    .limit(1);

  if (busyAgents && busyAgents.length > 0) return; // Fleet is active

  // Check if there have been any commands in the last 6 hours
  const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const { data: recentCmds } = await supabase
    .from("agent_commands")
    .select("id")
    .gte("created_at", sixHoursAgo)
    .limit(1);

  if (recentCmds && recentCmds.length > 0) return; // Recent activity

  // Time to dream
  isDreaming = true;
  console.log("[soul] Dream mode starting — fleet idle, consolidating memories...");

  try {
    await runDreamCycle();
    lastDreamTime = Date.now();
    console.log("[soul] Dream mode complete.");
  } catch (err) {
    console.error("[soul] Dream mode error:", (err as Error).message);
  } finally {
    isDreaming = false;
  }
}

/**
 * Execute one dream cycle:
 * 1. Fetch unprocessed recent memories
 * 2. Cluster by keyword overlap
 * 3. Generate insights from clusters
 * 4. Prune weak associations
 */
async function runDreamCycle(): Promise<void> {
  // 1. Fetch memories from the last 48 hours
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: memories, error } = await supabase
    .from("agent_memory")
    .select("*")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error || !memories || memories.length < 3) {
    console.log("[soul] Not enough recent memories to dream about.");
    return;
  }

  console.log(`[soul] Dreaming about ${memories.length} memories...`);

  // 2. Cluster memories by keyword overlap
  const clusters = clusterMemories(memories);
  console.log(`[soul] Found ${clusters.length} memory cluster(s).`);

  // 3. Generate insights from significant clusters
  const insights: DreamInsight[] = [];
  for (const cluster of clusters) {
    if (cluster.memories.length < 2) continue;

    const insight = generateInsight(cluster);
    if (insight) insights.push(insight);
  }

  // 4. Write insights to DB
  if (insights.length > 0) {
    try {
      const { error: insertErr } = await supabase
        .from("dream_insights")
        .insert(insights);

      if (insertErr) {
        console.error("[soul] Failed to save dream insights:", insertErr.message);
      } else {
        console.log(`[soul] Generated ${insights.length} insight(s) from dream.`);
      }
    } catch {
      // Table doesn't exist yet - non-fatal
      console.log(`[soul] dream_insights table not ready. Generated ${insights.length} insight(s) (not persisted).`);
    }
  }

  // 5. Prune weak associations
  await pruneWeakAssociations();
}

interface MemoryCluster {
  keywords: string[];
  memories: Array<{ id: string; content: string; kind: string; agent_id: string; created_at: string }>;
  agents: string[];
}

/**
 * Simple keyword-based clustering of memories.
 */
function clusterMemories(
  memories: Array<{ id: string; content: string; kind: string; agent_id: string; created_at: string }>
): MemoryCluster[] {
  const clusters: MemoryCluster[] = [];

  // Extract keywords for each memory
  const memKeywords = memories.map((m) => ({
    mem: m,
    keywords: extractKeywords(m.content),
  }));

  const assigned = new Set<number>();

  for (let i = 0; i < memKeywords.length; i++) {
    if (assigned.has(i)) continue;
    if (memKeywords[i].keywords.length === 0) continue;

    const cluster: MemoryCluster = {
      keywords: [...memKeywords[i].keywords],
      memories: [memKeywords[i].mem],
      agents: [memKeywords[i].mem.agent_id],
    };
    assigned.add(i);

    // Find similar memories
    for (let j = i + 1; j < memKeywords.length; j++) {
      if (assigned.has(j)) continue;

      const overlap = memKeywords[i].keywords.filter((kw) =>
        memKeywords[j].keywords.includes(kw)
      );

      // Need at least 2 keyword overlap or 40% similarity
      const similarity =
        overlap.length /
        Math.max(memKeywords[i].keywords.length, memKeywords[j].keywords.length);

      if (overlap.length >= 2 || similarity > 0.4) {
        cluster.memories.push(memKeywords[j].mem);
        cluster.agents.push(memKeywords[j].mem.agent_id);
        // Merge keywords
        for (const kw of memKeywords[j].keywords) {
          if (!cluster.keywords.includes(kw)) cluster.keywords.push(kw);
        }
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Sort by size descending
  return clusters.sort((a, b) => b.memories.length - a.memories.length);
}

/**
 * Generate an insight from a cluster of related memories.
 */
function generateInsight(cluster: MemoryCluster): DreamInsight | null {
  const { keywords, memories, agents } = cluster;
  const uniqueAgents = [...new Set(agents)].filter((a) => a !== "_shared");
  const topKeywords = keywords.slice(0, 5).join(", ");

  // Count outcome types
  const outcomes = memories.filter((m) => m.kind === "outcome").length;
  const errors = memories.filter((m) => m.kind === "error").length;
  const total = memories.length;

  let insight: string;
  let category: DreamInsight["category"] = "pattern";
  let confidence = 0.5;

  if (errors > outcomes && errors >= 2) {
    // Error pattern detected
    insight = `Recurring issues around [${topKeywords}]: ${errors}/${total} memories are errors. Agents involved: ${uniqueAgents.join(", ")}.`;
    category = "correction";
    confidence = Math.min(0.9, 0.4 + errors * 0.1);
  } else if (outcomes >= 3) {
    // Success pattern
    insight = `Strong track record with [${topKeywords}]: ${outcomes}/${total} successful outcomes across ${uniqueAgents.length} agent(s).`;
    category = "pattern";
    confidence = Math.min(0.9, 0.4 + outcomes * 0.1);
  } else if (total >= 4) {
    // Activity cluster
    insight = `High activity around [${topKeywords}]: ${total} related memories in the last 48h. Agents: ${uniqueAgents.join(", ")}.`;
    category = "summary";
    confidence = 0.5;
  } else {
    return null; // Not significant enough
  }

  return {
    insight,
    source_memories: memories.map((m) => m.id),
    category,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Remove associations weaker than the minimum threshold.
 */
async function pruneWeakAssociations(): Promise<void> {
  try {
    const { error } = await supabase
      .from("memory_associations")
      .delete()
      .lt("strength", 0.15);

    if (!error) {
      console.log("[soul] Pruned weak associations.");
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Retrieve dream insights relevant to a task (for context injection).
 */
export async function getRelevantInsights(
  taskKeywords: string[],
  limit = 3
): Promise<DreamInsight[]> {
  try {
    const { data, error } = await supabase
      .from("dream_insights")
      .select("*")
      .gte("confidence", 0.4)
      .order("generated_at", { ascending: false })
      .limit(20);

    if (error || !data) return [];

    // Score insights by keyword overlap
    const scored = data.map((insight: any) => {
      const insightText = insight.insight.toLowerCase();
      const hits = taskKeywords.filter((kw) => insightText.includes(kw)).length;
      return { ...insight, score: hits };
    });

    return scored
      .filter((s: any) => s.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit) as DreamInsight[];
  } catch {
    return [];
  }
}
