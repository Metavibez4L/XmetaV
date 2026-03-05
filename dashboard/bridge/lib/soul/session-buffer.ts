/**
 * Soul Agent — Session Buffer
 *
 * In-memory caching layer that sits between the executor and
 * the database. Eliminates redundant queries on hot paths:
 *
 *   1. contextCache   — built context strings (30s TTL)
 *   2. retrievalCache  — scored memory results (15s TTL)
 *   3. recentWrites    — ring buffer of recent memory writes
 *                        merged into retrieval results before DB round-trip
 *
 * All caches auto-invalidate when a new memory is written for an agent.
 */

import { TTLCache } from "../ttl-cache.js";
import type { MemoryEntry } from "../agent-memory.js";

// ---- Types ----

export type ScoredMemory = MemoryEntry & { relevance: number };

// ---- Caches ----

/** Built soul context strings, keyed by agentId */
export const contextCache = new TTLCache<string>(30_000);

/** Scored retrieval results, keyed by "agentId:keywordsHash" */
export const retrievalCache = new TTLCache<ScoredMemory[]>(15_000);

// ---- Adaptive TTL ----

/** Payment-related keywords trigger shorter cache TTLs (fresher data needed) */
const VOLATILE_KEYWORDS = new Set([
  "payment", "revenue", "spend", "usdc", "trade", "swap",
  "balance", "price", "fee", "billing", "transaction",
]);

/**
 * Determine the retrieval cache TTL based on query keywords.
 *   - Payment / trade queries → 5s (high-volatility)
 *   - Default queries → 15s (normal)
 *   - Status / identity queries → 30s (low-volatility)
 */
export function adaptiveTTL(keywords: string[]): number {
  const hasVolatile = keywords.some((kw) => VOLATILE_KEYWORDS.has(kw));
  if (hasVolatile) return 5_000;   // 5s — financial data changes rapidly

  const statusKeywords = ["status", "identity", "config", "health", "version"];
  const isStable = keywords.some((kw) => statusKeywords.includes(kw));
  if (isStable) return 30_000;     // 30s — stable data

  return 15_000;                   // 15s default
}

// ---- Session Ring Buffer ----

const MAX_RECENT_PER_AGENT = 20;

/** In-memory ring buffer of the most recent memory writes per agent */
const recentWritesByAgent = new Map<string, MemoryEntry[]>();

/**
 * Record a memory write in the session buffer and invalidate caches.
 * Called from captureCommandOutcome / writeMemory.
 */
export function notifyMemoryWrite(agentId: string, entry: MemoryEntry): void {
  // Append to ring buffer
  let buf = recentWritesByAgent.get(agentId);
  if (!buf) {
    buf = [];
    recentWritesByAgent.set(agentId, buf);
  }
  buf.push(entry);
  if (buf.length > MAX_RECENT_PER_AGENT) {
    buf.shift(); // evict oldest
  }

  // Invalidate caches for this agent (new memory = stale results)
  invalidateAgent(agentId);
}

/**
 * Get the recent in-memory writes for an agent.
 * These haven't necessarily expired from the DB query window yet,
 * but they may be fresher than the cached retrieval results.
 */
export function getRecentWrites(agentId: string): MemoryEntry[] {
  return recentWritesByAgent.get(agentId) ?? [];
}

/**
 * Invalidate all caches for a specific agent.
 * Called on memory writes and when forced refresh is needed.
 */
export function invalidateAgent(agentId: string): void {
  contextCache.invalidate(agentId);
  // Retrieval cache keys start with "agentId:" — prune matching keys
  // TTLCache doesn't expose keys, so just clear the whole thing
  // (fine for 12 agents; retrieval cache is cheap to rebuild)
  retrievalCache.clear();

  // Also invalidate _shared since shared writes affect all agents
  if (agentId === "_shared") {
    contextCache.clear();
  }
}

/**
 * Invalidate caches on payment events.
 * Called from the payment pipeline so agents see fresh financial data.
 */
export function invalidateOnPayment(): void {
  // Clear all retrieval caches — payment events change revenue context
  retrievalCache.clear();
  // Clear context for midas + alchemist (revenue-sensitive agents)
  contextCache.invalidate("midas");
  contextCache.invalidate("alchemist");
}

/**
 * Hash keywords into a short cache key suffix.
 */
export function keywordsKey(agentId: string, keywords: string[]): string {
  // Simple deterministic key — sorted keywords joined
  return `${agentId}:${keywords.slice(0, 8).sort().join(",")}`;
}

/**
 * Merge recent writes into scored results, avoiding duplicates.
 * Recent writes get a freshness boost since they're from this session.
 */
export function mergeRecentWrites(
  scored: ScoredMemory[],
  recentWrites: MemoryEntry[],
  scoreFn: (entry: MemoryEntry) => number
): ScoredMemory[] {
  const existingIds = new Set(scored.map((s) => s.id).filter(Boolean));

  const newEntries: ScoredMemory[] = recentWrites
    .filter((w) => !existingIds.has(w.id))
    .map((w) => ({
      ...w,
      relevance: Math.min(1.0, scoreFn(w) + 0.1), // freshness boost
    }));

  return [...scored, ...newEntries];
}

/**
 * Get session buffer stats for diagnostics.
 */
export function getSessionBufferStats(): {
  contextCacheSize: number;
  retrievalCacheSize: number;
  agentsBuffered: number;
  totalBufferedWrites: number;
} {
  let totalWrites = 0;
  for (const buf of recentWritesByAgent.values()) {
    totalWrites += buf.length;
  }
  return {
    contextCacheSize: contextCache.size,
    retrievalCacheSize: retrievalCache.size,
    agentsBuffered: recentWritesByAgent.size,
    totalBufferedWrites: totalWrites,
  };
}
