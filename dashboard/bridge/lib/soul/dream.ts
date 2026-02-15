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
import {
  startDreamSession,
  endDreamSession,
  generateProposals,
  expireOldProposals,
} from "./dream-proposals.js";

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

  // Time to dream (lucid mode)
  await triggerDream("idle", hoursSinceLastDream);
}

/**
 * Manually trigger a dream cycle (bypasses idle checks).
 */
export async function triggerManualDream(): Promise<{
  sessionId: string;
  proposals: number;
  insights: number;
}> {
  if (isDreaming) {
    return { sessionId: "busy", proposals: 0, insights: 0 };
  }
  return triggerDream("manual");
}

/**
 * Run a lucid dream cycle with session tracking.
 */
async function triggerDream(
  triggerType: "idle" | "manual" | "scheduled" = "idle",
  idleHours?: number
): Promise<{ sessionId: string; proposals: number; insights: number }> {
  isDreaming = true;
  console.log(`[soul] Lucid dream starting (${triggerType}) — consolidating + proposing...`);

  const sessionId = await startDreamSession(triggerType, idleHours);
  let proposalCount = 0;
  let insightCount = 0;

  try {
    const result = await runDreamCycle(sessionId);
    proposalCount = result.proposals;
    insightCount = result.insights;
    lastDreamTime = Date.now();

    // Expire old proposals
    const expired = await expireOldProposals();
    if (expired > 0) console.log(`[soul] Expired ${expired} old proposals.`);

    await endDreamSession(sessionId, {
      proposals_created: proposalCount,
      insights_generated: insightCount,
    });

    console.log(
      `[soul] Lucid dream complete — ${insightCount} insights, ${proposalCount} proposals.`
    );
  } catch (err) {
    console.error("[soul] Lucid dream error:", (err as Error).message);
    await endDreamSession(sessionId, { status: "interrupted" });
  } finally {
    isDreaming = false;
  }

  return { sessionId, proposals: proposalCount, insights: insightCount };
}

/**
 * Execute one dream cycle:
 * 1. Fetch unprocessed recent memories
 * 2. Cluster by keyword overlap
 * 3. Generate insights from clusters
 * 4. Generate lucid dream proposals
 * 5. Prune weak associations
 */
async function runDreamCycle(sessionId: string): Promise<{
  insights: number;
  proposals: number;
}> {
  // 1. Fetch memories from the last 48 hours
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: memories, error } = await supabase
    .from("agent_memory")
    .select("*")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error || !memories || memories.length < 3) {
    console.log("[soul] Not enough recent memories to dream about.");
    return { insights: 0, proposals: 0 };
  }

  console.log(`[soul] Dreaming about ${memories.length} memories...`);

  // Update session stats
  await supabase
    .from("soul_dream_sessions")
    .update({ memories_scanned: memories.length })
    .eq("id", sessionId)
    .then(() => {});

  // 2. Cluster memories by keyword overlap
  const clusters = clusterMemories(memories);
  console.log(`[soul] Found ${clusters.length} memory cluster(s).`);

  await supabase
    .from("soul_dream_sessions")
    .update({ clusters_found: clusters.length })
    .eq("id", sessionId)
    .then(() => {});

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

  // 5. Generate lucid dream proposals (Phase 5)
  let proposalCount = 0;
  try {
    const proposals = await generateProposals(clusters, insights, sessionId);
    proposalCount = proposals.length;
  } catch (err) {
    console.error("[soul:lucid] Proposal generation failed:", (err as Error).message);
  }

  // 6. Prune weak associations
  await pruneWeakAssociations();

  return { insights: insights.length, proposals: proposalCount };
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
