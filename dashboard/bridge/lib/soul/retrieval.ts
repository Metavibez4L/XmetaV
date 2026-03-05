/**
 * Soul Agent — Memory Retrieval
 *
 * Retrieves the most relevant memories for a given task,
 * using keyword matching, recency weighting, and association
 * strength. This replaces the simple "last N entries" approach
 * in agent-memory.ts with intelligent context curation.
 */

import { supabase } from "../supabase.js";
import type { MemoryEntry } from "../agent-memory.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { SoulConfig } from "./types.js";
import {
  retrievalCache,
  keywordsKey,
  getRecentWrites,
  mergeRecentWrites,
  adaptiveTTL,
  type ScoredMemory,
} from "./session-buffer.js";

const config: SoulConfig = DEFAULT_CONFIG;

/** Stop words to exclude from keyword extraction */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "not", "no", "nor", "so", "yet", "both", "each", "few", "more",
  "most", "other", "some", "such", "than", "too", "very", "just",
  "about", "up", "out", "it", "its", "my", "your", "his", "her",
  "their", "our", "this", "that", "these", "those", "i", "me", "we",
  "you", "he", "she", "they", "what", "which", "who", "whom",
  "how", "when", "where", "why", "all", "any",
]);

/**
 * Extract meaningful keywords from a task description.
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i) // dedupe
    .slice(0, 20);
}

/**
 * Score a memory entry against a set of task keywords.
 * Returns 0.0–1.0 relevance score.
 *
 * Combines:
 *   - Keyword match ratio (0-1)
 *   - Exponential time-decay (half-life = 48h)
 *   - Kind importance weighting
 */
function scoreMemory(entry: MemoryEntry, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  const content = entry.content.toLowerCase();
  let hits = 0;

  for (const kw of keywords) {
    if (content.includes(kw)) hits++;
  }

  const keywordScore = hits / keywords.length;

  // Exponential time-decay: half-life of 48 hours
  // importance = e^(-λt) where λ = ln(2)/halfLife
  const ageMs = Date.now() - new Date(entry.created_at || 0).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const halfLifeHours = 48;
  const lambda = Math.LN2 / halfLifeHours;
  const timeFactor = Math.exp(-lambda * ageHours); // 1.0 at t=0, 0.5 at 48h, 0.25 at 96h

  // Kind weighting: outcomes and errors are most actionable
  const kindWeight: Record<string, number> = {
    outcome: 1.0,
    fact: 1.0,
    error: 0.95,
    goal: 0.85,
    observation: 0.6,
    note: 0.5,
  };
  const kw2 = kindWeight[entry.kind] ?? 0.5;

  // Combine: keyword relevance * kind weight + time decay bonus
  // Keywords drive primary score, time decay modulates it
  const score = keywordScore * kw2 * 0.7 + timeFactor * 0.3;

  return Math.min(1.0, score);
}

/**
 * Standalone scorer for use by session buffer merge.
 * Scores without keywords (recency + kind only).
 */
export function scoreMemoryRecency(entry: MemoryEntry): number {
  return scoreMemory(entry, []);
}

/**
 * Retrieve the most relevant memories for a task.
 *
 * 1. Check session buffer cache (fast path)
 * 2. Fetch recent memories for the agent (+ shared)
 * 3. Score each against extracted task keywords
 * 4. Merge in-memory session writes (fresher than DB)
 * 5. Boost by association strength (if soul tables exist)
 * 6. Cache result and return top N sorted by relevance
 */
export async function retrieveRelevantMemories(
  agentId: string,
  taskMessage: string,
  maxResults = config.maxRetrievalCount
): Promise<ScoredMemory[]> {
  const keywords = extractKeywords(taskMessage);
  const cacheKey = keywordsKey(agentId, keywords);

  // Fast path: return cached results if fresh
  const cached = retrievalCache.get(cacheKey);
  if (cached) return cached;

  // Fetch a wider window than the old RECENT_LIMIT to score from
  // Exclude TTL-expired memories: created_at + ttl_hours > now
  const { data, error } = await supabase
    .from("agent_memory")
    .select("id, agent_id, kind, content, source, ttl_hours, created_at")
    .in("agent_id", [agentId, "_shared"])
    .order("created_at", { ascending: false })
    .limit(config.associationScanWindow);

  if (error || !data) return [];

  const now = Date.now();
  const entries = (data as (MemoryEntry & { ttl_hours?: number | null })[]).filter((m) => {
    // Skip TTL-expired memories
    if (m.ttl_hours && m.created_at) {
      const expiresAt = new Date(m.created_at).getTime() + m.ttl_hours * 3600000;
      if (now > expiresAt) return false;
    }
    return true;
  });

  // Score each memory
  let scored: ScoredMemory[] = entries.map((entry) => ({
    ...entry,
    relevance: scoreMemory(entry, keywords),
  }));

  // Merge recent in-memory writes (may not be in DB query result yet)
  const recent = getRecentWrites(agentId);
  if (recent.length > 0) {
    scored = mergeRecentWrites(scored, recent, (e) => scoreMemory(e, keywords));
  }

  // Try to boost by associations (non-fatal if table doesn't exist)
  await boostByAssociations(scored);

  // Sort by relevance descending, take top N
  scored.sort((a, b) => b.relevance - a.relevance);

  // Filter out zero-relevance unless we'd return nothing
  const relevant = scored.filter((s) => s.relevance > 0);
  const result = relevant.length > 0
    ? relevant.slice(0, maxResults)
    : scored.slice(0, Math.min(5, maxResults)); // fallback: latest 5

  // Cache the result with adaptive TTL
  const ttl = adaptiveTTL(keywords);
  retrievalCache.set(cacheKey, result, ttl);

  return result;
}

/**
 * Boost memory scores based on association strength.
 * If two memories are associated, seeing one makes the other more relevant.
 */
async function boostByAssociations(
  scored: Array<MemoryEntry & { relevance: number }>
): Promise<void> {
  try {
    const topIds = scored
      .filter((s) => s.relevance > 0.3)
      .slice(0, 10)
      .map((s) => s.id)
      .filter(Boolean) as string[];

    if (topIds.length === 0) return;

    const { data, error } = await supabase
      .from("memory_associations")
      .select("memory_id, related_memory_id, strength")
      .or(
        topIds
          .map((id) => `memory_id.eq.${id},related_memory_id.eq.${id}`)
          .join(",")
      )
      .gte("strength", config.minAssociationStrength)
      .limit(100);

    if (error || !data) return;

    // Build a boost map: related_id → max boost
    const boosts = new Map<string, number>();
    for (const assoc of data) {
      for (const id of topIds) {
        const otherId =
          assoc.memory_id === id ? assoc.related_memory_id : assoc.memory_id;
        const current = boosts.get(otherId) || 0;
        boosts.set(otherId, Math.max(current, assoc.strength * 0.2));
      }
    }

    // Apply boosts
    for (const entry of scored) {
      if (entry.id && boosts.has(entry.id)) {
        entry.relevance = Math.min(1.0, entry.relevance + boosts.get(entry.id)!);
      }
    }
  } catch {
    // memory_associations table doesn't exist yet — that's fine
  }
}

/**
 * Log a context retrieval query for learning.
 */
export async function logQuery(
  agentId: string,
  keywords: string[],
  retrievedIds: string[],
  scores: number[]
): Promise<void> {
  try {
    await supabase.from("memory_queries").insert({
      agent_id: agentId,
      task_keywords: keywords,
      retrieved_memory_ids: retrievedIds,
      relevance_scores: scores,
    });
  } catch {
    // Non-fatal — table may not exist yet
  }
}
