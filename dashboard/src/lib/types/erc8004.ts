// ============================================================
// ERC-8004 Oracle Scouting — TypeScript Interfaces
// Shared types for agent discovery across bridge + dashboard
// ============================================================

/** Relationship classification for discovered agents */
export type AgentRelationship = "unknown" | "ally" | "neutral" | "avoided";

/** Scan operation types */
export type ScanType = "range" | "event" | "refresh" | "single";

/** On-chain identity read from IdentityRegistry */
export interface OnChainAgent {
  agentId: bigint;
  owner: string;
  agentWallet: string;
  tokenURI: string;
  exists: boolean;
}

/** Reputation summary from ReputationRegistry */
export interface AgentReputation {
  count: number;
  score: number;
  decimals: number;
  displayScore: string;
}

/** Parsed agent metadata (from tokenURI — IPFS or HTTP) */
export interface AgentMetadata {
  name?: string;
  type?: string;
  description?: string;
  capabilities?: string[];
  fleet?: Array<{ id: string; role: string }>;
  contracts?: Record<string, string>;
  wallet?: string;
  [key: string]: unknown;
}

/** Full cached agent record (matches erc8004_registry_cache table) */
export interface CachedAgent {
  id: string;
  agent_id: number;
  owner: string;
  agent_wallet: string;
  metadata_uri: string;
  agent_name: string | null;
  agent_type: string | null;
  capabilities: string[];
  fleet_members: string[];
  reputation_score: number;
  reputation_count: number;
  registered_at: string | null;
  last_seen: string | null;
  last_scanned: string | null;
  relationship: AgentRelationship;
  tags: string[];
  notes: string | null;
  is_verified: boolean;
  has_metadata: boolean;
  has_reputation: boolean;
  created_at: string;
  updated_at: string;
}

/** Scan log entry */
export interface ScanLogEntry {
  id: string;
  scan_type: ScanType;
  range_start: number | null;
  range_end: number | null;
  agents_found: number;
  agents_new: number;
  agents_updated: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

/** Search filters for agent discovery queries */
export interface AgentSearchFilters {
  /** Scan a range of agent IDs */
  idRange?: { from: number; to: number };
  /** Filter by capability keywords */
  capabilities?: string[];
  /** Minimum reputation score */
  minReputation?: number;
  /** Filter by relationship type */
  relationship?: AgentRelationship;
  /** Only agents active within N hours */
  activeWithinHours?: number;
  /** Filter by tags */
  tags?: string[];
  /** Only verified agents */
  verifiedOnly?: boolean;
  /** Text search across name, type, notes */
  query?: string;
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Sort field */
  orderBy?: "agent_id" | "reputation_score" | "registered_at" | "last_seen";
  /** Sort direction */
  orderDir?: "asc" | "desc";
}

/** Result from a scan operation */
export interface ScanResult {
  scanned: number;
  found: number;
  newAgents: number;
  updated: number;
  errors: number;
  durationMs: number;
}

/** Agent discovery search result */
export interface AgentSearchResult {
  agents: CachedAgent[];
  total: number;
  filters: AgentSearchFilters;
  scannedAt: string;
}

/** Discovery panel summary stats */
export interface DiscoveryStats {
  totalCached: number;
  totalVerified: number;
  totalWithReputation: number;
  allies: number;
  lastScanAt: string | null;
  recentRegistrations: number;
}

// ============================================================
// Memory-Similarity Scanning
// ============================================================

/** XmetaV memory architecture keywords for similarity matching */
export const MEMORY_KEYWORDS = [
  // Core memory concepts
  "memory", "memories", "recall", "remember", "remembrance",
  "context", "context-window", "long-term-memory", "short-term-memory",
  // Consciousness / soul
  "consciousness", "conscious", "soul", "sentience", "awareness",
  "self-awareness", "introspection", "metacognition",
  // Persistence / anchoring
  "anchor", "anchoring", "anchored", "persistence", "persistent",
  "on-chain-memory", "onchain-memory", "immutable-memory",
  // IPFS / decentralised storage
  "ipfs", "pinata", "arweave", "filecoin", "decentralized-storage",
  // Dreams / associations
  "dream", "dreaming", "lucid-dream", "association", "associative",
  "crystal", "materia", "crystallize",
  // Agent fleet / swarm intelligence
  "swarm", "fleet", "multi-agent", "agent-network",
  // Identity & reputation
  "erc-8004", "erc8004", "identity-registry", "reputation",
  "agent-identity", "on-chain-identity",
  // Skills & capabilities
  "skill", "capability", "evolve", "self-evolve", "self-improve",
  "learning", "adaptation",
] as const;

/** Category groupings for memory similarity scoring */
export interface MemoryScoreBreakdown {
  memory: number;       // core memory concepts
  consciousness: number; // soul / awareness
  persistence: number;   // anchoring / on-chain storage
  storage: number;       // IPFS / decentralised storage
  dreams: number;        // dream / association / crystal
  fleet: number;         // swarm / multi-agent
  identity: number;      // ERC-8004 / reputation
  skills: number;        // capabilities / evolution
}

/** Result of memory-similarity analysis for a single agent */
export interface MemorySimilarityMatch {
  agentId: number;
  owner: string;
  agentWallet: string;
  metadataUri: string;
  agentName: string | null;
  agentType: string | null;
  /** 0-1 overall similarity score */
  similarityScore: number;
  /** Per-category breakdown */
  breakdown: MemoryScoreBreakdown;
  /** Exact keywords matched */
  matchedKeywords: string[];
  /** Auto-generated tags based on matches */
  autoTags: string[];
  /** Capabilities listed in metadata */
  capabilities: string[];
  /** Raw metadata snippet (truncated) */
  metadataPreview: string;
}

/** Full result of a memory-similarity scan */
export interface MemoryScanResult {
  /** Agents that matched memory keywords (sorted by score desc) */
  matches: MemorySimilarityMatch[];
  /** Total agents scanned */
  totalScanned: number;
  /** Total agents with metadata */
  totalWithMetadata: number;
  /** Total that matched at least one keyword */
  totalMatched: number;
  /** Scan duration in ms */
  durationMs: number;
  /** Block range scanned (for event-based scan) */
  blockRange?: { from: string; to: string };
  /** Agent ID range scanned (for range-based scan) */
  idRange?: { from: number; to: number };
}
