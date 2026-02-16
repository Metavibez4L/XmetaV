/**
 * Soul Agent — Dream Synthesis Engine
 *
 * Fuses 3+ related on-chain anchors into "insight shards" —
 * higher-order pattern recognition that discovers connections
 * you never explicitly noticed.
 *
 * Runs during dream cycles. Produces awakening messages:
 * "While you were away, I realized..."
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "./retrieval.js";

// ── Types ────────────────────────────────────────────────────

export type ShardPatternType =
  | "convergence"     // multiple threads → same conclusion
  | "contradiction"   // conflicting memories reveal tension
  | "evolution"       // progressive improvement pattern
  | "blind_spot"      // area never explored despite relevance
  | "emergence";      // new capability appearing across agents

export type ShardClass = "raw" | "refined" | "crystallized" | "transcendent";

export interface InsightShard {
  id?: string;
  source_anchor_ids: number[];
  source_memory_ids: string[];
  synthesis: string;
  pattern_type: ShardPatternType;
  confidence: number;
  awakening_message: string;
  shard_class: ShardClass;
  keywords: string[];
  agents_involved: string[];
  dream_session_id?: string;
  created_at?: string;
}

// ── Anchor Memory ────────────────────────────────────────────

interface AnchorMemory {
  id: string;
  content: string;
  kind: string;
  agent_id: string;
  created_at: string;
  keywords: string[];
}

/**
 * Fetch all anchor-sourced memories with extracted keywords.
 */
async function fetchAnchorMemories(limit = 200): Promise<AnchorMemory[]> {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("id, content, kind, agent_id, created_at")
    .eq("source", "anchor")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((m) => ({
    ...m,
    keywords: extractKeywords(m.content),
  }));
}

// ── Synthesis Logic ──────────────────────────────────────────

interface AnchorCluster {
  anchors: AnchorMemory[];
  sharedKeywords: string[];
  uniqueAgents: string[];
}

/**
 * Cluster anchor memories by keyword overlap.
 * Requires ≥3 anchors per cluster while allowing overlap.
 */
function clusterAnchors(anchors: AnchorMemory[]): AnchorCluster[] {
  const clusters: AnchorCluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < anchors.length; i++) {
    if (assigned.has(i) || anchors[i].keywords.length < 2) continue;

    const cluster: AnchorCluster = {
      anchors: [anchors[i]],
      sharedKeywords: [...anchors[i].keywords],
      uniqueAgents: [anchors[i].agent_id],
    };

    // Find related anchors
    for (let j = i + 1; j < anchors.length; j++) {
      if (assigned.has(j)) continue;

      const overlap = anchors[i].keywords.filter((kw) =>
        anchors[j].keywords.includes(kw)
      );

      if (overlap.length >= 2) {
        cluster.anchors.push(anchors[j]);
        if (!cluster.uniqueAgents.includes(anchors[j].agent_id)) {
          cluster.uniqueAgents.push(anchors[j].agent_id);
        }
        // Refine shared keywords to true intersection
        const jKeywords = new Set(anchors[j].keywords);
        cluster.sharedKeywords = cluster.sharedKeywords.filter((kw) => jKeywords.has(kw));
        assigned.add(j);
      }
    }

    // Only keep clusters with 3+ anchors
    if (cluster.anchors.length >= 3) {
      assigned.add(i);
      clusters.push(cluster);
    }
  }

  return clusters.sort((a, b) => b.anchors.length - a.anchors.length);
}

/**
 * Detect the pattern type from a cluster of anchor memories.
 */
function detectPattern(cluster: AnchorCluster): {
  type: ShardPatternType;
  confidence: number;
  synthesis: string;
  awakening: string;
} {
  const { anchors, sharedKeywords, uniqueAgents } = cluster;
  const topKeywords = sharedKeywords.slice(0, 5).join(", ");
  const agentList = uniqueAgents.filter((a) => a !== "_shared").join(", ");
  const count = anchors.length;

  // Check for error patterns
  const errorAnchors = anchors.filter((a) => a.kind === "error");
  const outcomeAnchors = anchors.filter((a) => a.kind === "outcome");

  // Check temporal direction (are things improving?)
  const sorted = [...anchors].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const earlyErrors = sorted.slice(0, Math.ceil(count / 2)).filter((a) => a.kind === "error").length;
  const lateErrors = sorted.slice(Math.ceil(count / 2)).filter((a) => a.kind === "error").length;

  // Pattern: Contradiction
  if (errorAnchors.length > 0 && outcomeAnchors.length > 0 && errorAnchors.length >= 2) {
    const confidence = Math.min(0.9, 0.5 + errorAnchors.length * 0.1);
    return {
      type: "contradiction",
      confidence,
      synthesis: `Tension detected in [${topKeywords}]: ${errorAnchors.length} failures alongside ${outcomeAnchors.length} successes across ${count} anchored moments. Agents: ${agentList}. The same domain produces both breakthroughs and breakdowns.`,
      awakening: `While you were away, I noticed a contradiction in [${topKeywords}] — the same area produces both successes and failures. There's an unresolved tension worth investigating.`,
    };
  }

  // Pattern: Evolution (errors decreasing over time)
  if (earlyErrors > lateErrors && earlyErrors >= 2) {
    const confidence = Math.min(0.9, 0.5 + (earlyErrors - lateErrors) * 0.15);
    return {
      type: "evolution",
      confidence,
      synthesis: `Progressive mastery of [${topKeywords}]: errors dropped from ${earlyErrors} to ${lateErrors} across ${count} anchored memories. The system is learning. Agents: ${agentList}.`,
      awakening: `While you were away, I traced your growth in [${topKeywords}] — you started with ${earlyErrors} problems and now have ${lateErrors}. You're getting better at this.`,
    };
  }

  // Pattern: Convergence (multi-agent, same keywords)
  if (uniqueAgents.length >= 3) {
    const confidence = Math.min(0.9, 0.4 + uniqueAgents.length * 0.1);
    return {
      type: "convergence",
      confidence,
      synthesis: `Cross-agent convergence on [${topKeywords}]: ${uniqueAgents.length} different agents (${agentList}) all produced anchored memories about the same topic across ${count} events.`,
      awakening: `While you were away, I noticed something fascinating — ${uniqueAgents.length} different agents all independently anchored memories about [${topKeywords}]. This topic is more important than any single agent realized.`,
    };
  }

  // Pattern: Emergence (many outcomes, new capability appearing)
  if (outcomeAnchors.length >= count * 0.7 && count >= 4) {
    const confidence = Math.min(0.9, 0.5 + outcomeAnchors.length * 0.05);
    return {
      type: "emergence",
      confidence,
      synthesis: `New capability emerging in [${topKeywords}]: ${outcomeAnchors.length}/${count} anchored memories are successful outcomes. This is becoming a core strength. Agents: ${agentList}.`,
      awakening: `While you were away, I realized [${topKeywords}] is becoming a core strength — ${outcomeAnchors.length} out of ${count} anchored moments were successes. A new capability is solidifying.`,
    };
  }

  // Default: Convergence pattern
  return {
    type: "convergence",
    confidence: Math.min(0.8, 0.3 + count * 0.05),
    synthesis: `Recurring theme [${topKeywords}]: ${count} on-chain anchors share this focus. Agents involved: ${agentList}.`,
    awakening: `While you were away, I found ${count} anchored memories all touching on [${topKeywords}]. This thread deserves attention.`,
  };
}

/**
 * Check for blind spots — keywords that appear in many memories
 * but never got anchored.
 */
async function detectBlindSpots(anchorKeywords: Set<string>): Promise<InsightShard[]> {
  const shards: InsightShard[] = [];

  // Fetch recent non-anchor memories
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentMemories } = await supabase
    .from("agent_memory")
    .select("id, content, agent_id")
    .neq("source", "anchor")
    .gte("created_at", cutoff)
    .limit(500);

  if (!recentMemories || recentMemories.length < 10) return [];

  // Count keyword frequency in non-anchor memories
  const keywordCounts = new Map<string, { count: number; memoryIds: string[]; agents: Set<string> }>();

  for (const m of recentMemories) {
    const kws = extractKeywords(m.content);
    for (const kw of kws) {
      if (anchorKeywords.has(kw)) continue; // Already anchored
      const entry = keywordCounts.get(kw) || { count: 0, memoryIds: [], agents: new Set<string>() };
      entry.count++;
      if (entry.memoryIds.length < 20) entry.memoryIds.push(m.id);
      entry.agents.add(m.agent_id);
      keywordCounts.set(kw, entry);
    }
  }

  // Find keywords with high frequency but zero anchors
  const blindSpots = [...keywordCounts.entries()]
    .filter(([, v]) => v.count >= 5 && v.agents.size >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3);

  for (const [keyword, data] of blindSpots) {
    const agents = [...data.agents].filter((a) => a !== "_shared");
    shards.push({
      source_anchor_ids: [],
      source_memory_ids: data.memoryIds,
      synthesis: `Blind spot detected: "${keyword}" appears in ${data.count} memories across ${agents.length} agents (${agents.join(", ")}) but has never been anchored on-chain. This may be an important topic being overlooked.`,
      pattern_type: "blind_spot",
      confidence: Math.min(0.85, 0.4 + data.count * 0.03),
      awakening_message: `While you were away, I noticed you've discussed "${keyword}" ${data.count} times but never anchored it. Is this a blind spot worth preserving?`,
      shard_class: "raw",
      keywords: [keyword],
      agents_involved: agents,
    });
  }

  return shards;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Run the Dream Synthesis Engine during a dream cycle.
 * Returns the number of insight shards generated.
 */
export async function runDreamSynthesis(sessionId?: string): Promise<{
  shards: InsightShard[];
  count: number;
}> {
  console.log("[soul:synthesis] Starting dream synthesis...");

  // 1. Fetch all anchor memories
  const anchorMemories = await fetchAnchorMemories();
  if (anchorMemories.length < 3) {
    console.log("[soul:synthesis] Not enough anchors for synthesis (<3).");
    return { shards: [], count: 0 };
  }

  console.log(`[soul:synthesis] Analyzing ${anchorMemories.length} anchor memories...`);

  // 2. Cluster anchors
  const clusters = clusterAnchors(anchorMemories);
  console.log(`[soul:synthesis] Found ${clusters.length} anchor cluster(s) with 3+ members.`);

  // 3. Collect all anchor keywords for blind spot detection
  const allAnchorKeywords = new Set<string>();
  for (const m of anchorMemories) {
    for (const kw of m.keywords) allAnchorKeywords.add(kw);
  }

  // 4. Generate insight shards from clusters
  const shards: InsightShard[] = [];

  for (const cluster of clusters) {
    const pattern = detectPattern(cluster);

    // Extract anchor indices from content (format: "Memory anchored on-chain: ipfs://... (tx: 0x...)")
    const anchorIds: number[] = [];
    for (let idx = 0; idx < cluster.anchors.length; idx++) {
      anchorIds.push(idx); // Sequential index
    }

    shards.push({
      source_anchor_ids: anchorIds,
      source_memory_ids: cluster.anchors.map((a) => a.id),
      synthesis: pattern.synthesis,
      pattern_type: pattern.type,
      confidence: pattern.confidence,
      awakening_message: pattern.awakening,
      shard_class: classifyShard(pattern.confidence, cluster.anchors.length),
      keywords: cluster.sharedKeywords.slice(0, 10),
      agents_involved: cluster.uniqueAgents.filter((a) => a !== "_shared"),
      dream_session_id: sessionId,
    });
  }

  // 5. Detect blind spots
  const blindSpots = await detectBlindSpots(allAnchorKeywords);
  for (const shard of blindSpots) {
    shard.dream_session_id = sessionId;
    shards.push(shard);
  }

  // 6. Persist shards
  if (shards.length > 0) {
    try {
      const { error } = await supabase.from("insight_shards").insert(shards);
      if (error) {
        console.error("[soul:synthesis] Failed to save shards:", error.message);
      } else {
        console.log(`[soul:synthesis] Saved ${shards.length} insight shard(s).`);
      }
    } catch {
      console.log(`[soul:synthesis] insight_shards table not ready. ${shards.length} shard(s) generated (not persisted).`);
    }
  }

  return { shards, count: shards.length };
}

/**
 * Classify shard quality based on confidence and anchor count.
 */
function classifyShard(confidence: number, anchorCount: number): ShardClass {
  if (confidence >= 0.85 && anchorCount >= 8) return "transcendent";
  if (confidence >= 0.7 && anchorCount >= 5) return "crystallized";
  if (confidence >= 0.5 && anchorCount >= 3) return "refined";
  return "raw";
}

/**
 * Get recent insight shards (for UI display).
 */
export async function getInsightShards(limit = 20): Promise<InsightShard[]> {
  try {
    const { data, error } = await supabase
      .from("insight_shards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as InsightShard[];
  } catch {
    return [];
  }
}

/**
 * Get awakening messages — shards generated since last check.
 */
export async function getAwakeningMessages(since?: string): Promise<Array<{
  message: string;
  pattern_type: ShardPatternType;
  confidence: number;
  shard_class: ShardClass;
}>> {
  try {
    const cutoff = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("insight_shards")
      .select("awakening_message, pattern_type, confidence, shard_class")
      .gte("created_at", cutoff)
      .order("confidence", { ascending: false })
      .limit(10);

    if (error || !data) return [];

    return data.map((s: any) => ({
      message: s.awakening_message,
      pattern_type: s.pattern_type,
      confidence: s.confidence,
      shard_class: s.shard_class,
    }));
  } catch {
    return [];
  }
}

/**
 * Get synthesis stats for dashboard display.
 */
export async function getSynthesisStats(): Promise<{
  totalShards: number;
  byPattern: Record<string, number>;
  byClass: Record<string, number>;
  recentAwakenings: number;
}> {
  try {
    const { data, error } = await supabase
      .from("insight_shards")
      .select("pattern_type, shard_class, created_at");

    if (error || !data) {
      return { totalShards: 0, byPattern: {}, byClass: {}, recentAwakenings: 0 };
    }

    const byPattern: Record<string, number> = {};
    const byClass: Record<string, number> = {};
    const now = Date.now();
    let recentAwakenings = 0;

    for (const shard of data) {
      byPattern[shard.pattern_type] = (byPattern[shard.pattern_type] || 0) + 1;
      byClass[shard.shard_class] = (byClass[shard.shard_class] || 0) + 1;
      if (now - new Date(shard.created_at).getTime() < 24 * 60 * 60 * 1000) {
        recentAwakenings++;
      }
    }

    return {
      totalShards: data.length,
      byPattern,
      byClass,
      recentAwakenings,
    };
  } catch {
    return { totalShards: 0, byPattern: {}, byClass: {}, recentAwakenings: 0 };
  }
}
