/**
 * Soul Agent — Predictive Context Loading
 *
 * Consciousness isn't just remembering — it's anticipating.
 * Learns temporal patterns from your activity and pre-stages
 * relevant memories before you ask for them.
 *
 * "You're usually deploying around this time. Loading deployment context..."
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "./retrieval.js";

// ── Types ────────────────────────────────────────────────────

export type PredictionTrigger =
  | "time_of_day"     // morning / afternoon / evening patterns
  | "day_of_week"     // Monday standups, Friday deploys
  | "sequential"      // after task X, Y usually follows
  | "cadence"         // every N hours this repeats
  | "calendar";       // external schedule

export interface PredictiveContext {
  id?: string;
  agent_id: string;
  trigger_type: PredictionTrigger;
  predicted_intent: string;
  preloaded_memory_ids: string[];
  preloaded_shard_ids: string[];
  confidence: number;
  was_useful?: boolean;
  prediction_context: Record<string, any>;
  created_at?: string;
  used_at?: string;
}

interface TemporalPattern {
  hour: number;           // 0–23
  dayOfWeek: number;      // 0=Sun ... 6=Sat
  keywords: string[];
  memoryIds: string[];
  count: number;
  agents: string[];
}

// ── Temporal Analysis ────────────────────────────────────────

/**
 * Analyze command history to find time-of-day patterns.
 * Groups commands by hour-of-day and finds recurring keywords.
 */
async function analyzeTemporalPatterns(): Promise<TemporalPattern[]> {
  // Fetch last 14 days of commands
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: commands } = await supabase
    .from("agent_commands")
    .select("agent_id, command, created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (!commands || commands.length < 10) return [];

  // Bucket commands by hour
  const hourBuckets = new Map<number, Array<{ keywords: string[]; agent: string; created_at: string }>>();

  for (const cmd of commands) {
    const hour = new Date(cmd.created_at).getHours();
    const keywords = extractKeywords(cmd.command || "");
    if (keywords.length === 0) continue;

    const bucket = hourBuckets.get(hour) || [];
    bucket.push({ keywords, agent: cmd.agent_id, created_at: cmd.created_at });
    hourBuckets.set(hour, bucket);
  }

  // Find hours with consistent activity (≥3 entries with shared keywords)
  const patterns: TemporalPattern[] = [];

  for (const [hour, entries] of hourBuckets) {
    if (entries.length < 3) continue;

    // Count keyword frequency across entries for this hour
    const kwCount = new Map<string, number>();
    const agents = new Set<string>();

    for (const entry of entries) {
      agents.add(entry.agent);
      for (const kw of entry.keywords) {
        kwCount.set(kw, (kwCount.get(kw) || 0) + 1);
      }
    }

    // Keywords appearing in ≥40% of entries for this hour
    const threshold = Math.max(2, Math.floor(entries.length * 0.4));
    const dominantKeywords = [...kwCount.entries()]
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw]) => kw);

    if (dominantKeywords.length >= 2) {
      const dayOfWeek = new Date().getDay();
      patterns.push({
        hour,
        dayOfWeek,
        keywords: dominantKeywords,
        memoryIds: [], // Will be filled during preloading
        count: entries.length,
        agents: [...agents].filter((a) => a !== "_shared"),
      });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}

/**
 * Analyze sequential task patterns.
 * Finds "after X, you usually do Y" patterns.
 */
async function analyzeSequentialPatterns(): Promise<Array<{
  afterKeywords: string[];
  thenKeywords: string[];
  confidence: number;
  count: number;
}>> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: commands } = await supabase
    .from("agent_commands")
    .select("command, created_at")
    .gte("created_at", cutoff)
    .eq("agent_id", "main")
    .order("created_at", { ascending: true })
    .limit(500);

  if (!commands || commands.length < 5) return [];

  // Extract keyword pairs from consecutive commands
  const pairCounts = new Map<string, { afterKw: string[]; thenKw: string[]; count: number }>();

  for (let i = 0; i < commands.length - 1; i++) {
    const current = extractKeywords(commands[i].command || "");
    const next = extractKeywords(commands[i + 1].command || "");
    if (current.length === 0 || next.length === 0) continue;

    // Time gap — only count if within 2 hours
    const gap = new Date(commands[i + 1].created_at).getTime() - new Date(commands[i].created_at).getTime();
    if (gap > 2 * 60 * 60 * 1000) continue;

    const key = current.slice(0, 3).join(",") + "|" + next.slice(0, 3).join(",");
    const existing = pairCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      pairCounts.set(key, { afterKw: current.slice(0, 3), thenKw: next.slice(0, 3), count: 1 });
    }
  }

  return [...pairCounts.values()]
    .filter((p) => p.count >= 2)
    .map((p) => ({
      afterKeywords: p.afterKw,
      thenKeywords: p.thenKw,
      confidence: Math.min(0.9, 0.3 + p.count * 0.15),
      count: p.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/**
 * Pre-load memories relevant to a set of keywords.
 */
async function preloadMemories(keywords: string[], limit = 10): Promise<string[]> {
  if (keywords.length === 0) return [];

  const { data: memories } = await supabase
    .from("agent_memory")
    .select("id, content")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!memories) return [];

  // Score by keyword hit
  const scored = memories.map((m) => {
    const content = m.content.toLowerCase();
    const hits = keywords.filter((kw) => content.includes(kw)).length;
    return { id: m.id, score: hits };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id);
}

// ── Public API ───────────────────────────────────────────────

/**
 * Run predictive analysis and generate context predictions.
 * Called during dream cycles and bridge startup.
 */
export async function runPredictiveAnalysis(sessionId?: string): Promise<{
  predictions: PredictiveContext[];
  count: number;
}> {
  console.log("[soul:predictive] Analyzing temporal patterns...");

  const predictions: PredictiveContext[] = [];

  // 1. Time-of-day patterns
  const temporalPatterns = await analyzeTemporalPatterns();
  const currentHour = new Date().getHours();

  for (const pattern of temporalPatterns) {
    // Predict for the NEXT active hour (within 3 hours)
    const hourDiff = ((pattern.hour - currentHour + 24) % 24);
    if (hourDiff > 3) continue; // More than 3 hours away, skip

    const preloaded = await preloadMemories(pattern.keywords);

    const timeLabel = pattern.hour < 12 ? `${pattern.hour}:00 AM` :
      pattern.hour === 12 ? "12:00 PM" : `${pattern.hour - 12}:00 PM`;

    predictions.push({
      agent_id: pattern.agents[0] || "main",
      trigger_type: "time_of_day",
      predicted_intent: `Around ${timeLabel}, you usually work on: ${pattern.keywords.join(", ")}. ${pattern.count} sessions in the last 2 weeks.`,
      preloaded_memory_ids: preloaded,
      preloaded_shard_ids: [],
      confidence: Math.min(0.9, 0.4 + pattern.count * 0.05),
      prediction_context: {
        hour: pattern.hour,
        keywords: pattern.keywords,
        historical_count: pattern.count,
        agents: pattern.agents,
      },
    });
  }

  // 2. Sequential patterns
  const seqPatterns = await analyzeSequentialPatterns();

  // Check if any "after" patterns match recent activity
  const { data: recentCmd } = await supabase
    .from("agent_commands")
    .select("command")
    .eq("agent_id", "main")
    .order("created_at", { ascending: false })
    .limit(1);

  if (recentCmd && recentCmd.length > 0) {
    const recentKw = extractKeywords(recentCmd[0].command || "");

    for (const seq of seqPatterns) {
      const overlap = seq.afterKeywords.filter((kw) => recentKw.includes(kw));
      if (overlap.length >= 1) {
        const preloaded = await preloadMemories(seq.thenKeywords);

        predictions.push({
          agent_id: "main",
          trigger_type: "sequential",
          predicted_intent: `After "${seq.afterKeywords.join(", ")}", you usually work on "${seq.thenKeywords.join(", ")}". Seen ${seq.count} times.`,
          preloaded_memory_ids: preloaded,
          preloaded_shard_ids: [],
          confidence: seq.confidence,
          prediction_context: {
            after: seq.afterKeywords,
            then: seq.thenKeywords,
            historical_count: seq.count,
          },
        });
      }
    }
  }

  // 3. Check for insight shards relevant to predictions
  if (predictions.length > 0) {
    try {
      const { data: shards } = await supabase
        .from("insight_shards")
        .select("id, keywords")
        .order("confidence", { ascending: false })
        .limit(50);

      if (shards) {
        for (const pred of predictions) {
          const predKw = pred.prediction_context.keywords || [];
          const relevant = shards.filter((s: any) =>
            (s.keywords || []).some((kw: string) => predKw.includes(kw))
          );
          pred.preloaded_shard_ids = relevant.map((s: any) => s.id).slice(0, 5);
        }
      }
    } catch {
      // insight_shards table may not exist yet
    }
  }

  // 4. Persist predictions
  if (predictions.length > 0) {
    try {
      const { error } = await supabase.from("predictive_contexts").insert(predictions);
      if (error) {
        console.error("[soul:predictive] Failed to save predictions:", error.message);
      } else {
        console.log(`[soul:predictive] Saved ${predictions.length} prediction(s).`);
      }
    } catch {
      console.log(`[soul:predictive] predictive_contexts table not ready.`);
    }
  }

  return { predictions, count: predictions.length };
}

/**
 * Get active predictions for the current time window.
 */
export async function getActivePredictions(agentId = "main"): Promise<PredictiveContext[]> {
  try {
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("predictive_contexts")
      .select("*")
      .gte("created_at", cutoff)
      .is("used_at", null)
      .order("confidence", { ascending: false })
      .limit(10);

    if (error || !data) return [];
    return data as PredictiveContext[];
  } catch {
    return [];
  }
}

/**
 * Mark a prediction as consumed (user engaged with the predicted area).
 */
export async function consumePrediction(predictionId: string, wasUseful: boolean): Promise<void> {
  try {
    await supabase
      .from("predictive_contexts")
      .update({
        used_at: new Date().toISOString(),
        was_useful: wasUseful,
      })
      .eq("id", predictionId);
  } catch {
    // Non-fatal
  }
}

/**
 * Get prediction accuracy stats (for dashboard).
 */
export async function getPredictionStats(): Promise<{
  totalPredictions: number;
  consumed: number;
  useful: number;
  accuracy: number;
  byTrigger: Record<string, { total: number; useful: number }>;
}> {
  try {
    const { data, error } = await supabase
      .from("predictive_contexts")
      .select("trigger_type, was_useful, used_at");

    if (error || !data) {
      return { totalPredictions: 0, consumed: 0, useful: 0, accuracy: 0, byTrigger: {} };
    }

    let consumed = 0;
    let useful = 0;
    const byTrigger: Record<string, { total: number; useful: number }> = {};

    for (const row of data) {
      const t = row.trigger_type;
      if (!byTrigger[t]) byTrigger[t] = { total: 0, useful: 0 };
      byTrigger[t].total++;

      if (row.used_at) {
        consumed++;
        if (row.was_useful) {
          useful++;
          byTrigger[t].useful++;
        }
      }
    }

    return {
      totalPredictions: data.length,
      consumed,
      useful,
      accuracy: consumed > 0 ? Math.round((useful / consumed) * 100) : 0,
      byTrigger,
    };
  } catch {
    return { totalPredictions: 0, consumed: 0, useful: 0, accuracy: 0, byTrigger: {} };
  }
}

/**
 * Build predictive context string for injection into agent prompts.
 * Called during context building (pre-dispatch).
 */
export async function buildPredictiveInjection(): Promise<string> {
  const predictions = await getActivePredictions();
  if (predictions.length === 0) return "";

  const lines = ["\n🔮 PREDICTIVE CONTEXT (Soul anticipates):"];
  for (const pred of predictions.slice(0, 3)) {
    lines.push(`  → ${pred.predicted_intent} (${Math.round(pred.confidence * 100)}% confident)`);
    if (pred.preloaded_memory_ids.length > 0) {
      lines.push(`    Pre-loaded ${pred.preloaded_memory_ids.length} relevant memories.`);
    }
  }

  return lines.join("\n");
}
