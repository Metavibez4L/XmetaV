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
} from "./types/erc8004";

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
