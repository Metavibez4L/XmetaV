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
 *
 * Dedup:
 *   - Keyword overlap ≥ 85% = duplicate (was 70%)
 *   - Entity-based semantic check for named entities
 *   - Recurring topic detection for consolidation
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "../soul/retrieval.js";
import type { ResearchDomain, DomainConfig, RESEARCH_DOMAINS } from "./types.js";

/** Duplicate threshold — 85% keyword overlap */
const DUPLICATE_THRESHOLD = 0.85;

/** Entity-based overlap threshold (lower because entities are more specific) */
const ENTITY_DUPLICATE_THRESHOLD = 0.6;

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
 * Uses both keyword overlap and entity-based semantic matching.
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

    // Count how many existing memories share keywords at threshold
    let duplicateCount = 0;
    const contentEntities = extractEntities(keywords.join(" "));

    for (const mem of recentMemories) {
      const memKw = extractKeywords(mem.content);
      const overlap = keywords.filter((kw) => memKw.includes(kw));

      // Keyword overlap check (raised to 50% from having been 50%)
      if (overlap.length >= keywords.length * 0.5) {
        duplicateCount++;
        continue;
      }

      // Entity-based semantic check — even if keywords diverge,
      // if the same named entities appear the topic is the same
      if (contentEntities.length >= 2) {
        const memEntities = extractEntities(mem.content);
        const entityOverlap = contentEntities.filter((e) =>
          memEntities.some((me) => me.toLowerCase() === e.toLowerCase())
        );
        if (entityOverlap.length >= contentEntities.length * ENTITY_DUPLICATE_THRESHOLD) {
          duplicateCount += 0.5; // Partial match — contributes less
        }
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
      // 85%+ keyword overlap = duplicate (raised from 70%)
      if (overlap.length >= keywords.length * DUPLICATE_THRESHOLD) {
        return true;
      }

      // Entity-based semantic dedup
      const contentEntities = extractEntities(content);
      if (contentEntities.length >= 2) {
        const memEntities = extractEntities(mem.content);
        const entityOverlap = contentEntities.filter((e) =>
          memEntities.some((me) => me.toLowerCase() === e.toLowerCase())
        );
        if (entityOverlap.length >= contentEntities.length * ENTITY_DUPLICATE_THRESHOLD) {
          // Same entities + some keyword overlap = likely duplicate
          if (overlap.length >= keywords.length * 0.4) {
            return true;
          }
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ---- Entity Extraction ----

/** Known project/protocol names for entity matching */
const KNOWN_ENTITIES = [
  "ethereum", "base", "optimism", "arbitrum", "polygon", "solana",
  "coinbase", "circle", "tether", "uniswap", "aave", "compound",
  "opensea", "metamask", "alchemy", "infura", "chainlink",
  "erc-8004", "erc8004", "x402", "usdc", "usdt", "dai",
  "eip-4844", "op-stack", "superchain", "blob",
];

/**
 * Extract named entities from text.
 * Combines known-entity lookup with capitalized-word heuristic
 * to catch project names, protocols, and organizations.
 */
function extractEntities(text: string): string[] {
  const lower = text.toLowerCase();
  const entities: string[] = [];

  // Match known entities
  for (const entity of KNOWN_ENTITIES) {
    if (lower.includes(entity)) {
      entities.push(entity);
    }
  }

  // Heuristic: capitalized multi-word names (e.g., "Agent Registry", "Base Mainnet")
  const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;
  while ((match = capitalizedPattern.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (!entities.includes(name) && name.length > 4) {
      entities.push(name);
    }
  }

  return [...new Set(entities)];
}
