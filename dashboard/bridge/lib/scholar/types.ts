/**
 * Scholar Research Engine — Types & Configuration
 *
 * The Scholar agent runs a continuous research loop, scoring discoveries
 * for relevance and anchoring significant findings on-chain.
 */

// ---- Research Domains ----

export type ResearchDomain =
  | "erc8004"
  | "x402"
  | "layer2"
  | "stablecoins"
  | "smb-adoption";

export interface DomainConfig {
  id: ResearchDomain;
  label: string;
  keywords: string[];
  /** Weight multiplier for this domain's relevance scoring */
  weight: number;
  /** Minutes between research cycles for this domain */
  intervalMinutes: number;
}

export const RESEARCH_DOMAINS: DomainConfig[] = [
  {
    id: "erc8004",
    label: "ERC-8004 Identity",
    keywords: [
      "erc8004", "erc-8004", "agent-identity", "registry", "metadata",
      "tokenuri", "on-chain identity", "agent registration", "identity protocol",
      "agent wallet", "reputation", "agent nft",
    ],
    weight: 1.2,
    intervalMinutes: 30,
  },
  {
    id: "x402",
    label: "x402 Payments",
    keywords: [
      "x402", "http-402", "payment-required", "micropayment", "pay-per-call",
      "usdc payment", "agent payment", "api monetization", "paywall",
      "machine-to-machine payment", "autonomous payment",
    ],
    weight: 1.2,
    intervalMinutes: 40,
  },
  {
    id: "layer2",
    label: "Layer 2 Solutions",
    keywords: [
      "base", "optimism", "arbitrum", "layer2", "l2", "rollup", "sequencer",
      "blob", "eip-4844", "op-stack", "superchain", "zk-rollup",
      "base mainnet", "l2 fees", "throughput",
    ],
    weight: 1.0,
    intervalMinutes: 60,
  },
  {
    id: "stablecoins",
    label: "Stablecoin Intelligence",
    keywords: [
      "usdc", "usdt", "dai", "stablecoin", "peg", "reserve", "circle",
      "tether", "cbdc", "regulated stablecoin", "stablecoin flow",
      "stablecoin adoption", "pyusd",
    ],
    weight: 0.9,
    intervalMinutes: 90,
  },
  {
    id: "smb-adoption",
    label: "Small Business Adoption",
    keywords: [
      "small-business", "merchant", "adoption", "integration", "point-of-sale",
      "crypto payment", "business adoption", "merchant onboarding",
      "payment gateway", "smb crypto", "retail crypto",
    ],
    weight: 1.1,
    intervalMinutes: 120,
  },
];

// ---- Research Finding ----

export interface ResearchFinding {
  domain: ResearchDomain;
  title: string;
  content: string;
  /** Composite relevance score 0.0–1.0 */
  relevanceScore: number;
  /** Sub-scores for transparency */
  scoring: {
    novelty: number;
    impact: number;
    actionability: number;
    recency: number;
  };
  /** Keywords matched */
  matchedKeywords: string[];
  /** Source of the finding */
  source: string;
  /** Whether this was anchored on-chain */
  anchored: boolean;
  /** Timestamp */
  discoveredAt: string;
}

// ---- Scholar Config ----

export interface ScholarConfig {
  /** Minimum relevance score to store in memory */
  minMemoryScore: number;
  /** Minimum relevance score to share with all agents */
  minShareScore: number;
  /** Minimum relevance score to anchor on-chain */
  minAnchorScore: number;
  /** Max concurrent research tasks */
  maxConcurrent: number;
  /** Hours before a topic can be re-researched */
  deduplicationWindowHours: number;
  /** Max findings to store per cycle */
  maxFindingsPerCycle: number;
}

export const DEFAULT_SCHOLAR_CONFIG: ScholarConfig = {
  minMemoryScore: 0.3,
  minShareScore: 0.6,
  minAnchorScore: 0.75,
  maxConcurrent: 2,
  deduplicationWindowHours: 12,
  maxFindingsPerCycle: 5,
};

// ---- Adaptive Interval Logic ----

/**
 * Compute the effective interval for a domain based on its last avg score.
 * High-scoring domains get checked sooner; low-scoring domains back off.
 *
 *   avgScore ≥ 0.7  → 0.6× base  (more frequent — domain is hot)
 *   avgScore ≥ 0.5  → 1.0× base  (normal cadence)
 *   avgScore ≥ 0.3  → 1.5× base  (slow down — low signal)
 *   avgScore < 0.3   → 2.0× base  (back off — mostly noise)
 */
export function adaptiveInterval(
  baseMinutes: number,
  lastAvgScore: number | null
): number {
  if (lastAvgScore === null) return baseMinutes; // first run — use base

  if (lastAvgScore >= 0.7) return Math.round(baseMinutes * 0.6);
  if (lastAvgScore >= 0.5) return baseMinutes;
  if (lastAvgScore >= 0.3) return Math.round(baseMinutes * 1.5);
  return Math.round(baseMinutes * 2.0);
}
