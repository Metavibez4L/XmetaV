/**
 * Scholar Research Engine — Relevance Scorer
 *
 * Scores research findings on four dimensions:
 *   1. Novelty — How different is this from existing memories?
 *   2. Impact — Does this affect fleet operations, revenue, or strategy?
 *   3. Actionability — Can another agent act on this immediately?
 *   4. Recency — How fresh is the information?
 *
 * Formula:
 *   score = (novelty × 0.35) + (impact × 0.30) + (actionability × 0.20) + (recency × 0.15)
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "../soul/retrieval.js";
import type { ResearchDomain, DomainConfig, RESEARCH_DOMAINS } from "./types.js";

// ---- Impact Keywords ----

/** Keywords that indicate high-impact findings */
const HIGH_IMPACT_KEYWORDS = [
  "launched", "deployed", "mainnet", "production", "live", "partnership",
  "standard", "eip", "erc", "proposal", "adopted", "regulation",
  "exploit", "vulnerability", "hack", "bridge", "migration", "upgrade",
  "billion", "million", "record", "all-time", "breakthrough",
];

/** Keywords that indicate actionable findings */
const ACTIONABLE_KEYWORDS = [
  "integrate", "implement", "deploy", "migrate", "upgrade", "switch",
  "opportunity", "discount", "grant", "incentive", "airdrop",
  "api", "sdk", "library", "framework", "tool", "endpoint",
  "tutorial", "guide", "example", "template", "starter",
];

/**
 * Score a research finding for relevance.
 *
 * @param content - The finding text
 * @param domain - Which research domain this belongs to
 * @param domainConfig - Domain configuration with keywords and weight
 * @returns Composite score 0.0–1.0 and sub-scores
 */
export async function scoreRelevance(
  content: string,
  domain: ResearchDomain,
  domainConfig: DomainConfig
): Promise<{
  score: number;
  novelty: number;
  impact: number;
  actionability: number;
  recency: number;
  matchedKeywords: string[];
}> {
  const lower = content.toLowerCase();
  const keywords = extractKeywords(content);

  // ---- 1. Novelty (0–1) ----
  // Check how many existing memories share keywords with this finding
  const novelty = await computeNovelty(keywords, domain);

  // ---- 2. Impact (0–1) ----
  const impactHits = HIGH_IMPACT_KEYWORDS.filter((kw) => lower.includes(kw));
  const domainHits = domainConfig.keywords.filter((kw) => lower.includes(kw));
  const rawImpact = Math.min(1.0, (impactHits.length * 0.15) + (domainHits.length * 0.08));
  const impact = Math.min(1.0, rawImpact * domainConfig.weight);

  // ---- 3. Actionability (0–1) ----
  const actionHits = ACTIONABLE_KEYWORDS.filter((kw) => lower.includes(kw));
  const actionability = Math.min(1.0, actionHits.length * 0.12);

  // ---- 4. Recency (0–1) ----
  // Current findings are always fresh; penalize if content references old dates
  const recency = computeRecencyScore(content);

  // ---- Composite Score ----
  const matchedKeywords = [...new Set([...domainHits, ...impactHits, ...actionHits])];
  const rawScore = (novelty * 0.35) + (impact * 0.30) + (actionability * 0.20) + (recency * 0.15);
  const score = Math.round(Math.min(1.0, rawScore) * 100) / 100;

  return { score, novelty, impact, actionability, recency, matchedKeywords };
}

/**
 * Compute novelty by checking how many recent memories overlap with this finding.
 * High overlap = low novelty (we already know this).
 */
async function computeNovelty(
  keywords: string[],
  domain: ResearchDomain
): Promise<number> {
  if (keywords.length === 0) return 0.5;

  try {
    const { data: recentMemories } = await supabase
      .from("agent_memory")
      .select("content")
      .in("agent_id", ["scholar", "_shared"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (!recentMemories || recentMemories.length === 0) return 1.0; // Nothing stored yet = max novelty

    // Count how many existing memories share 50%+ keywords
    let duplicateCount = 0;
    for (const mem of recentMemories) {
      const memKw = extractKeywords(mem.content);
      const overlap = keywords.filter((kw) => memKw.includes(kw));
      if (overlap.length >= keywords.length * 0.5) {
        duplicateCount++;
      }
    }

    // More duplicates = lower novelty
    // 0 duplicates = 1.0 novelty, 3+ duplicates = 0.1 novelty
    return Math.max(0.1, 1.0 - (duplicateCount * 0.3));
  } catch {
    return 0.5; // Default on error
  }
}

/**
 * Compute a recency score based on the content itself.
 * Findings that reference "2026" or recent terms get higher scores.
 */
function computeRecencyScore(content: string): number {
  const lower = content.toLowerCase();
  const currentYear = new Date().getFullYear().toString();
  const lastYear = (new Date().getFullYear() - 1).toString();

  if (lower.includes(currentYear) || lower.includes("today") || lower.includes("just")) {
    return 1.0;
  }
  if (lower.includes(lastYear) || lower.includes("recent") || lower.includes("latest")) {
    return 0.7;
  }
  if (lower.includes("new") || lower.includes("update") || lower.includes("announce")) {
    return 0.6;
  }
  // Default: assume it's reasonably current since scholar just found it
  return 0.5;
}

/**
 * Check if a finding is a near-duplicate of something already in memory.
 * Returns true if we should skip this finding.
 */
export async function isDuplicate(
  content: string,
  deduplicationWindowHours: number
): Promise<boolean> {
  const keywords = extractKeywords(content);
  if (keywords.length < 3) return false;

  const windowStart = new Date(
    Date.now() - deduplicationWindowHours * 60 * 60 * 1000
  ).toISOString();

  try {
    const { data: recentMemories } = await supabase
      .from("agent_memory")
      .select("content")
      .eq("agent_id", "scholar")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!recentMemories) return false;

    for (const mem of recentMemories) {
      const memKw = extractKeywords(mem.content);
      const overlap = keywords.filter((kw) => memKw.includes(kw));
      // 70%+ keyword overlap = duplicate
      if (overlap.length >= keywords.length * 0.7) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
