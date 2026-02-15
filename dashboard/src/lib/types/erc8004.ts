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
