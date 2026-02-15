// ============================================================
// Agent Discovery — Oracle Analysis & Cache Logic
// Bridges on-chain reads (erc8004-scout) with Supabase cache
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAgentIdentity,
  getAgentReputation,
  fetchAgentMetadata,
  scanAgentRange,
  scanRegisteredEvents,
  getLatestBlock,
} from "./erc8004-scout";
import type {
  CachedAgent,
  AgentSearchFilters,
  AgentSearchResult,
  ScanResult,
  DiscoveryStats,
  ScanLogEntry,
  MemorySimilarityMatch,
  MemoryScoreBreakdown,
  MemoryScanResult,
} from "./types/erc8004";
import { MEMORY_KEYWORDS } from "./types/erc8004";

/** Safely extract fleet member IDs from parsed metadata */
function extractFleetIds(fleet: unknown): string[] {
  if (!Array.isArray(fleet)) return [];
  return fleet
    .map((f: unknown) => {
      if (typeof f === "string") return f;
      if (f && typeof f === "object" && "id" in f) return String((f as { id: unknown }).id);
      return String(f);
    })
    .filter(Boolean);
}

// ============================================================
// SCAN OPERATIONS — Populate the cache from on-chain data
// ============================================================

/**
 * Scan a range of agent IDs and upsert results into the cache.
 * This is the core operation: reads on-chain → enriches → stores.
 */
export async function scanAndCacheRange(
  supabase: SupabaseClient,
  from: number,
  to: number,
  options: { fetchMetadata?: boolean; fetchReputation?: boolean } = {}
): Promise<ScanResult> {
  const start = Date.now();
  const { fetchMetadata = true, fetchReputation = true } = options;

  let found = 0;
  let newAgents = 0;
  let updated = 0;
  let errors = 0;

  const agents = await scanAgentRange(from, to, 5);

  for (const agent of agents) {
    if (!agent.exists) continue;
    found++;

    try {
      // Check if already cached
      const { data: existing } = await supabase
        .from("erc8004_registry_cache")
        .select("id, agent_id")
        .eq("agent_id", Number(agent.agentId))
        .single();

      // Build the upsert record
      const record: Record<string, unknown> = {
        agent_id: Number(agent.agentId),
        owner: agent.owner,
        agent_wallet: agent.agentWallet,
        metadata_uri: agent.tokenURI,
        last_scanned: new Date().toISOString(),
      };

      // Fetch & parse metadata if URI exists
      if (fetchMetadata && agent.tokenURI) {
        const meta = await fetchAgentMetadata(agent.tokenURI);
        if (meta) {
          record.agent_name = meta.name || null;
          record.agent_type = meta.type || null;
          record.capabilities = meta.capabilities || [];
          record.fleet_members = extractFleetIds(meta.fleet);
          record.has_metadata = true;
        }
      }

      // Fetch reputation
      if (fetchReputation) {
        const rep = await getAgentReputation(agent.agentId);
        if (rep.count > 0) {
          record.reputation_score = rep.score;
          record.reputation_count = rep.count;
          record.has_reputation = true;
        }
      }

      // Upsert
      const { error } = await supabase
        .from("erc8004_registry_cache")
        .upsert(record, { onConflict: "agent_id" });

      if (error) {
        errors++;
      } else if (existing) {
        updated++;
      } else {
        newAgents++;
      }
    } catch {
      errors++;
    }
  }

  const durationMs = Date.now() - start;

  // Log the scan
  await supabase.from("erc8004_scan_log").insert({
    scan_type: "range",
    range_start: from,
    range_end: to,
    agents_found: found,
    agents_new: newAgents,
    agents_updated: updated,
    duration_ms: durationMs,
  });

  return { scanned: to - from + 1, found, newAgents, updated, errors, durationMs };
}

/**
 * Scan for new registrations via events since a given block.
 * More efficient than range-scanning — only finds new agents.
 */
export async function scanNewRegistrations(
  supabase: SupabaseClient,
  fromBlock?: bigint
): Promise<ScanResult> {
  const start = Date.now();

  // Default: look back ~24 hours (~43200 blocks at 2s Base block time)
  const latestBlock = await getLatestBlock();
  const startBlock = fromBlock || latestBlock - BigInt(43200);

  let found = 0;
  let newAgents = 0;
  let updated = 0;
  let errors = 0;

  try {
    const events = await scanRegisteredEvents(startBlock, latestBlock);
    found = events.length;

    for (const event of events) {
      try {
        // Full identity read for each discovered agent
        const identity = await getAgentIdentity(event.agentId);
        if (!identity.exists) continue;

        const record: Record<string, unknown> = {
          agent_id: Number(event.agentId),
          owner: event.owner,
          agent_wallet: identity.agentWallet,
          metadata_uri: event.agentURI || identity.tokenURI,
          last_scanned: new Date().toISOString(),
        };

        // Try to fetch metadata
        const uri = event.agentURI || identity.tokenURI;
        if (uri) {
          const meta = await fetchAgentMetadata(uri);
          if (meta) {
            record.agent_name = meta.name || null;
            record.agent_type = meta.type || null;
            record.capabilities = meta.capabilities || [];
            record.fleet_members = extractFleetIds(meta.fleet);
            record.has_metadata = true;
          }
        }

        // Reputation
        const rep = await getAgentReputation(event.agentId);
        if (rep.count > 0) {
          record.reputation_score = rep.score;
          record.reputation_count = rep.count;
          record.has_reputation = true;
        }

        const { data: existing } = await supabase
          .from("erc8004_registry_cache")
          .select("id")
          .eq("agent_id", Number(event.agentId))
          .single();

        const { error } = await supabase
          .from("erc8004_registry_cache")
          .upsert(record, { onConflict: "agent_id" });

        if (error) errors++;
        else if (existing) updated++;
        else newAgents++;
      } catch {
        errors++;
      }
    }
  } catch {
    errors++;
  }

  const durationMs = Date.now() - start;

  await supabase.from("erc8004_scan_log").insert({
    scan_type: "event",
    range_start: Number(startBlock),
    range_end: Number(latestBlock),
    agents_found: found,
    agents_new: newAgents,
    agents_updated: updated,
    duration_ms: durationMs,
  });

  return { scanned: found, found, newAgents, updated, errors, durationMs };
}

/**
 * Refresh a single agent's cached data.
 */
export async function refreshAgent(
  supabase: SupabaseClient,
  agentId: number
): Promise<CachedAgent | null> {
  const identity = await getAgentIdentity(BigInt(agentId));
  if (!identity.exists) return null;

  const record: Record<string, unknown> = {
    agent_id: agentId,
    owner: identity.owner,
    agent_wallet: identity.agentWallet,
    metadata_uri: identity.tokenURI,
    last_scanned: new Date().toISOString(),
  };

  if (identity.tokenURI) {
    const meta = await fetchAgentMetadata(identity.tokenURI);
    if (meta) {
      record.agent_name = meta.name || null;
      record.agent_type = meta.type || null;
      record.capabilities = meta.capabilities || [];
      record.fleet_members = extractFleetIds(meta.fleet);
      record.has_metadata = true;
    }
  }

  const rep = await getAgentReputation(BigInt(agentId));
  if (rep.count > 0) {
    record.reputation_score = rep.score;
    record.reputation_count = rep.count;
    record.has_reputation = true;
  }

  await supabase
    .from("erc8004_registry_cache")
    .upsert(record, { onConflict: "agent_id" });

  // Log it
  await supabase.from("erc8004_scan_log").insert({
    scan_type: "single",
    range_start: agentId,
    range_end: agentId,
    agents_found: 1,
    agents_new: 0,
    agents_updated: 1,
    duration_ms: 0,
  });

  const { data } = await supabase
    .from("erc8004_registry_cache")
    .select("*")
    .eq("agent_id", agentId)
    .single();

  return data as CachedAgent | null;
}

// ============================================================
// SEARCH OPERATIONS — Query the cache
// ============================================================

/**
 * Search the cached agent registry with filters.
 */
export async function searchAgents(
  supabase: SupabaseClient,
  filters: AgentSearchFilters = {}
): Promise<AgentSearchResult> {
  const {
    idRange,
    capabilities,
    minReputation,
    relationship,
    activeWithinHours,
    tags,
    verifiedOnly,
    query,
    limit = 50,
    offset = 0,
    orderBy = "agent_id",
    orderDir = "desc",
  } = filters;

  let q = supabase
    .from("erc8004_registry_cache")
    .select("*", { count: "exact" });

  // Agent ID range
  if (idRange) {
    q = q.gte("agent_id", idRange.from).lte("agent_id", idRange.to);
  }

  // Capability filter (array overlap)
  if (capabilities && capabilities.length > 0) {
    q = q.overlaps("capabilities", capabilities);
  }

  // Minimum reputation
  if (minReputation !== undefined) {
    q = q.gte("reputation_score", minReputation);
  }

  // Relationship filter
  if (relationship) {
    q = q.eq("relationship", relationship);
  }

  // Activity window
  if (activeWithinHours) {
    const since = new Date(
      Date.now() - activeWithinHours * 60 * 60 * 1000
    ).toISOString();
    q = q.gte("last_seen", since);
  }

  // Tag filter (array overlap)
  if (tags && tags.length > 0) {
    q = q.overlaps("tags", tags);
  }

  // Verified only
  if (verifiedOnly) {
    q = q.eq("is_verified", true);
  }

  // Text search across name and type
  if (query) {
    q = q.or(
      `agent_name.ilike.%${query}%,agent_type.ilike.%${query}%,notes.ilike.%${query}%`
    );
  }

  // Sorting
  q = q.order(orderBy, { ascending: orderDir === "asc" });

  // Pagination
  q = q.range(offset, offset + limit - 1);

  const { data, count, error } = await q;

  if (error) throw new Error(`Agent search failed: ${error.message}`);

  return {
    agents: (data || []) as CachedAgent[],
    total: count || 0,
    filters,
    scannedAt: new Date().toISOString(),
  };
}

// ============================================================
// STATS & UTILITIES
// ============================================================

/**
 * Get summary statistics for the discovery dashboard.
 */
export async function getDiscoveryStats(
  supabase: SupabaseClient
): Promise<DiscoveryStats> {
  const [totalRes, verifiedRes, repRes, allyRes, scanRes, recentRes] =
    await Promise.all([
      supabase
        .from("erc8004_registry_cache")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("erc8004_registry_cache")
        .select("id", { count: "exact", head: true })
        .eq("is_verified", true),
      supabase
        .from("erc8004_registry_cache")
        .select("id", { count: "exact", head: true })
        .gt("reputation_count", 0),
      supabase
        .from("erc8004_registry_cache")
        .select("id", { count: "exact", head: true })
        .eq("relationship", "ally"),
      supabase
        .from("erc8004_scan_log")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("erc8004_registry_cache")
        .select("id", { count: "exact", head: true })
        .gte(
          "registered_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ),
    ]);

  return {
    totalCached: totalRes.count || 0,
    totalVerified: verifiedRes.count || 0,
    totalWithReputation: repRes.count || 0,
    allies: allyRes.count || 0,
    lastScanAt: scanRes.data?.[0]?.created_at || null,
    recentRegistrations: recentRes.count || 0,
  };
}

/**
 * Update the relationship classification for a cached agent.
 */
export async function setRelationship(
  supabase: SupabaseClient,
  agentId: number,
  relationship: "unknown" | "ally" | "neutral" | "avoided",
  notes?: string
): Promise<void> {
  const update: Record<string, unknown> = { relationship };
  if (notes !== undefined) update.notes = notes;

  await supabase
    .from("erc8004_registry_cache")
    .update(update)
    .eq("agent_id", agentId);
}

/**
 * Add tags to a cached agent.
 */
export async function addTags(
  supabase: SupabaseClient,
  agentId: number,
  newTags: string[]
): Promise<void> {
  const { data } = await supabase
    .from("erc8004_registry_cache")
    .select("tags")
    .eq("agent_id", agentId)
    .single();

  const existing = (data?.tags || []) as string[];
  const merged = [...new Set([...existing, ...newTags])];

  await supabase
    .from("erc8004_registry_cache")
    .update({ tags: merged })
    .eq("agent_id", agentId);
}

/**
 * Get recent scan log entries.
 */
export async function getScanHistory(
  supabase: SupabaseClient,
  limit = 20
): Promise<ScanLogEntry[]> {
  const { data } = await supabase
    .from("erc8004_scan_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []) as ScanLogEntry[];
}

// ============================================================
// Memory-Similarity Scanning Engine
// Scans ERC-8004 agents for memory/consciousness capabilities
// similar to XmetaV's architecture (anchors + IPFS + dreams)
// ============================================================

/** Keyword → category mapping for scoring */
const CATEGORY_MAP: Record<string, keyof MemoryScoreBreakdown> = {};
const CAT_KEYWORDS: Record<keyof MemoryScoreBreakdown, string[]> = {
  memory: [
    "memory", "memories", "recall", "remember", "remembrance",
    "context", "context-window", "long-term-memory", "short-term-memory",
  ],
  consciousness: [
    "consciousness", "conscious", "soul", "sentience", "awareness",
    "self-awareness", "introspection", "metacognition",
  ],
  persistence: [
    "anchor", "anchoring", "anchored", "persistence", "persistent",
    "on-chain-memory", "onchain-memory", "immutable-memory",
  ],
  storage: [
    "ipfs", "pinata", "arweave", "filecoin", "decentralized-storage",
  ],
  dreams: [
    "dream", "dreaming", "lucid-dream", "association", "associative",
    "crystal", "materia", "crystallize",
  ],
  fleet: [
    "swarm", "fleet", "multi-agent", "agent-network",
  ],
  identity: [
    "erc-8004", "erc8004", "identity-registry", "reputation",
    "agent-identity", "on-chain-identity",
  ],
  skills: [
    "skill", "capability", "evolve", "self-evolve", "self-improve",
    "learning", "adaptation",
  ],
};

// Build reverse lookup
for (const [cat, words] of Object.entries(CAT_KEYWORDS)) {
  for (const w of words) {
    CATEGORY_MAP[w] = cat as keyof MemoryScoreBreakdown;
  }
}

/** Category weights — memory/consciousness/persistence matter most */
const CATEGORY_WEIGHTS: Record<keyof MemoryScoreBreakdown, number> = {
  memory: 0.25,
  consciousness: 0.20,
  persistence: 0.20,
  storage: 0.10,
  dreams: 0.08,
  fleet: 0.05,
  identity: 0.07,
  skills: 0.05,
};

/**
 * Flatten all text from agent metadata into a single searchable blob.
 * Handles nested objects, arrays, and arbitrary keys.
 */
function flattenMetadataText(meta: Record<string, unknown>): string {
  const parts: string[] = [];

  function walk(obj: unknown) {
    if (typeof obj === "string") {
      parts.push(obj.toLowerCase());
    } else if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    } else if (obj && typeof obj === "object") {
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        parts.push(key.toLowerCase());
        walk(val);
      }
    }
  }

  walk(meta);
  return parts.join(" ");
}

/**
 * Analyse a single agent's metadata for memory-system similarity.
 * Returns per-category scores and an overall weighted score 0-1.
 */
export function analyzeMemorySimilarity(
  metadata: Record<string, unknown>
): {
  score: number;
  breakdown: MemoryScoreBreakdown;
  matchedKeywords: string[];
  autoTags: string[];
} {
  const text = flattenMetadataText(metadata);
  const matchedKeywords: string[] = [];

  // Track per-category hit counts
  const catHits: Record<keyof MemoryScoreBreakdown, number> = {
    memory: 0,
    consciousness: 0,
    persistence: 0,
    storage: 0,
    dreams: 0,
    fleet: 0,
    identity: 0,
    skills: 0,
  };

  for (const kw of MEMORY_KEYWORDS) {
    // Word boundary match — handles hyphenated keywords too
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(text)) {
      matchedKeywords.push(kw);
      const cat = CATEGORY_MAP[kw];
      if (cat) catHits[cat]++;
    }
  }

  // Compute per-category scores (capped at 1.0 per category)
  const breakdown: MemoryScoreBreakdown = {} as MemoryScoreBreakdown;
  let score = 0;

  for (const cat of Object.keys(CAT_KEYWORDS) as (keyof MemoryScoreBreakdown)[]) {
    const maxForCat = CAT_KEYWORDS[cat].length;
    const catScore = Math.min(catHits[cat] / Math.max(maxForCat * 0.4, 1), 1);
    breakdown[cat] = Math.round(catScore * 100) / 100;
    score += catScore * CATEGORY_WEIGHTS[cat];
  }

  // Normalise final score to 0-1
  score = Math.round(Math.min(score, 1) * 1000) / 1000;

  // Auto-generate tags based on categories that scored > 0
  const autoTags: string[] = [];
  if (breakdown.memory > 0) autoTags.push("memory-system");
  if (breakdown.consciousness > 0) autoTags.push("consciousness");
  if (breakdown.persistence > 0) autoTags.push("on-chain-persistence");
  if (breakdown.storage > 0) autoTags.push("decentralized-storage");
  if (breakdown.dreams > 0) autoTags.push("dream-engine");
  if (breakdown.fleet > 0) autoTags.push("fleet-capable");
  if (breakdown.identity > 0) autoTags.push("erc8004-identity");
  if (breakdown.skills > 0) autoTags.push("self-evolving");

  return { score, breakdown, matchedKeywords, autoTags };
}

/**
 * Scan a range of agent IDs for memory-similar agents.
 * Fetches on-chain identity + metadata, runs similarity analysis,
 * caches results, and auto-tags matches.
 */
export async function scanForMemoryAgents(
  supabase: SupabaseClient,
  options: {
    /** Scan by agent ID range */
    fromId?: number;
    toId?: number;
    /** OR scan by block range (event-based) */
    fromBlock?: bigint;
    toBlock?: bigint;
    /** Minimum similarity score to include (default 0.05) */
    minScore?: number;
    /** Auto-tag matching agents in cache */
    autoTag?: boolean;
    /** Max agents to scan in a single call */
    maxAgents?: number;
  } = {}
): Promise<MemoryScanResult> {
  const start = Date.now();
  const minScore = options.minScore ?? 0.05;
  const autoTag = options.autoTag ?? true;
  const maxAgents = Math.min(options.maxAgents ?? 500, 1000);

  const matches: MemorySimilarityMatch[] = [];
  let totalScanned = 0;
  let totalWithMetadata = 0;
  let blockRange: { from: string; to: string } | undefined;
  let idRange: { from: number; to: number } | undefined;

  // ----- Determine agent list to scan -----
  interface AgentStub {
    agentId: number;
    owner: string;
    agentWallet: string;
    tokenURI: string;
  }

  const stubs: AgentStub[] = [];

  if (options.fromBlock !== undefined) {
    // Event-based: scan Registered events in block range
    const events = await scanRegisteredEvents(
      options.fromBlock,
      options.toBlock
    );
    blockRange = {
      from: (options.fromBlock ?? BigInt(0)).toString(),
      to: (options.toBlock ?? "latest").toString(),
    };

    for (const ev of events.slice(0, maxAgents)) {
      stubs.push({
        agentId: Number(ev.agentId),
        owner: ev.owner,
        agentWallet: "",  // filled on metadata fetch
        tokenURI: ev.agentURI,
      });
    }
  } else {
    // Range-based: scan sequential agent IDs
    const from = options.fromId ?? 1;
    const to = Math.min(options.toId ?? from + 99, from + maxAgents - 1);
    idRange = { from, to };

    const agents = await scanAgentRange(from, to, 10);
    for (const a of agents) {
      if (a.exists) {
        stubs.push({
          agentId: Number(a.agentId),
          owner: a.owner,
          agentWallet: a.agentWallet,
          tokenURI: a.tokenURI,
        });
      }
    }
  }

  totalScanned = stubs.length;

  // ----- Fetch metadata & analyse each agent -----
  // Process in batches of 10 to avoid overwhelming IPFS gateway
  const BATCH = 10;
  for (let i = 0; i < stubs.length; i += BATCH) {
    const batch = stubs.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      batch.map(async (stub) => {
        if (!stub.tokenURI) return null;

        const metadata = await fetchAgentMetadata(stub.tokenURI);
        if (!metadata) return null;

        totalWithMetadata++;

        const analysis = analyzeMemorySimilarity(
          metadata as Record<string, unknown>
        );

        if (analysis.score < minScore) return null;

        // Truncate metadata preview to 500 chars
        const preview = JSON.stringify(metadata).slice(0, 500);

        const match: MemorySimilarityMatch = {
          agentId: stub.agentId,
          owner: stub.owner,
          agentWallet: stub.agentWallet || (metadata.wallet as string) || "",
          metadataUri: stub.tokenURI,
          agentName: (metadata.name as string) || null,
          agentType: (metadata.type as string) || null,
          similarityScore: analysis.score,
          breakdown: analysis.breakdown,
          matchedKeywords: analysis.matchedKeywords,
          autoTags: analysis.autoTags,
          capabilities: Array.isArray(metadata.capabilities)
            ? (metadata.capabilities as string[])
            : [],
          metadataPreview: preview,
        };

        return match;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        matches.push(r.value);
      }
    }
  }

  // Sort by similarity score descending
  matches.sort((a, b) => b.similarityScore - a.similarityScore);

  // ----- Auto-tag + cache matching agents -----
  if (autoTag && matches.length > 0) {
    for (const m of matches) {
      try {
        // Upsert into cache if not present
        await supabase
          .from("erc8004_registry_cache")
          .upsert(
            {
              agent_id: m.agentId,
              owner: m.owner,
              agent_wallet: m.agentWallet,
              metadata_uri: m.metadataUri,
              agent_name: m.agentName,
              agent_type: m.agentType,
              capabilities: m.capabilities,
              has_metadata: true,
              last_scanned: new Date().toISOString(),
              tags: m.autoTags,
            },
            { onConflict: "agent_id" }
          );

        // Merge auto-tags with existing tags
        await addTags(supabase, m.agentId, m.autoTags);
      } catch {
        // Non-fatal — continue with other agents
      }
    }
  }

  // ----- Log the scan -----
  const durationMs = Date.now() - start;
  try {
    await supabase.from("erc8004_scan_log").insert({
      scan_type: "event",
      range_start: idRange?.from ?? null,
      range_end: idRange?.to ?? null,
      agents_found: totalScanned,
      agents_new: matches.length,
      agents_updated: autoTag ? matches.length : 0,
      duration_ms: durationMs,
    });
  } catch {
    // Non-fatal
  }

  return {
    matches,
    totalScanned,
    totalWithMetadata,
    totalMatched: matches.length,
    durationMs,
    blockRange,
    idRange,
  };
}
