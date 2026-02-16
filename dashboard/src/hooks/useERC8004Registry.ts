"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type {
  CachedAgent,
  DiscoveryStats,
  AgentSearchFilters,
  ScanResult,
  ScanLogEntry,
} from "@/lib/types/erc8004";

// ============================================================
// useERC8004Registry — React hook for Oracle agent discovery
// ============================================================

interface RegistryState {
  agents: CachedAgent[];
  total: number;
  stats: DiscoveryStats | null;
  scanHistory: ScanLogEntry[];
  loading: boolean;
  scanning: boolean;
  error: string | null;
}

const INITIAL_STATE: RegistryState = {
  agents: [],
  total: 0,
  stats: null,
  scanHistory: [],
  loading: true,
  scanning: false,
  error: null,
};

export function useERC8004Registry(autoRefreshMs = 30_000) {
  const [state, setState] = useState<RegistryState>(INITIAL_STATE);
  const [filters, setFilters] = useState<AgentSearchFilters>({
    limit: 50,
    offset: 0,
    orderBy: "agent_id",
    orderDir: "desc",
  });

  const mountedRef = useRef(true);
  const supabase = useMemo(() => createClient(), []);

  // ---- Fetch stats ----
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/oracle/discovery?action=stats");
      if (!res.ok) return;
      const stats = await res.json();
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, stats }));
      }
    } catch {
      // Non-critical
    }
  }, []);

  // ---- Search agents ----
  const searchAgents = useCallback(
    async (searchFilters?: AgentSearchFilters) => {
      const f = searchFilters || filters;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const params = new URLSearchParams({ action: "search" });
        if (f.idRange) {
          params.set("from", String(f.idRange.from));
          params.set("to", String(f.idRange.to));
        }
        if (f.capabilities?.length)
          params.set("capability", f.capabilities.join(","));
        if (f.minReputation !== undefined)
          params.set("minReputation", String(f.minReputation));
        if (f.relationship) params.set("relationship", f.relationship);
        if (f.activeWithinHours)
          params.set("activeHours", String(f.activeWithinHours));
        if (f.tags?.length) params.set("tag", f.tags.join(","));
        if (f.verifiedOnly) params.set("verified", "true");
        if (f.query) params.set("q", f.query);
        if (f.limit) params.set("limit", String(f.limit));
        if (f.offset) params.set("offset", String(f.offset));
        if (f.orderBy) params.set("orderBy", f.orderBy);
        if (f.orderDir) params.set("orderDir", f.orderDir);

        const res = await fetch(`/api/oracle/discovery?${params}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);

        const data = await res.json();
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            agents: data.agents || [],
            total: data.total || 0,
            loading: false,
          }));
        }
      } catch (err) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Search failed",
          }));
        }
      }
    },
    [filters]
  );

  // ---- Scan range ----
  const scanRange = useCallback(
    async (
      from: number,
      to: number,
      options?: { fetchMetadata?: boolean; fetchReputation?: boolean }
    ): Promise<ScanResult | null> => {
      setState((prev) => ({ ...prev, scanning: true, error: null }));
      try {
        const res = await fetch("/api/oracle/discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "scan_range",
            from,
            to,
            ...options,
          }),
        });
        if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
        const result = await res.json();

        // Refresh the search results + stats
        await Promise.all([searchAgents(), fetchStats()]);

        if (mountedRef.current) {
          setState((prev) => ({ ...prev, scanning: false }));
        }
        return result as ScanResult;
      } catch (err) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            scanning: false,
            error: err instanceof Error ? err.message : "Scan failed",
          }));
        }
        return null;
      }
    },
    [searchAgents, fetchStats]
  );

  // ---- Scan events (new registrations) ----
  const scanEvents = useCallback(
    async (fromBlock?: number): Promise<ScanResult | null> => {
      setState((prev) => ({ ...prev, scanning: true, error: null }));
      try {
        const res = await fetch("/api/oracle/discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "scan_events",
            fromBlock,
          }),
        });
        if (!res.ok) throw new Error(`Event scan failed: ${res.status}`);
        const result = await res.json();

        await Promise.all([searchAgents(), fetchStats()]);

        if (mountedRef.current) {
          setState((prev) => ({ ...prev, scanning: false }));
        }
        return result as ScanResult;
      } catch (err) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            scanning: false,
            error: err instanceof Error ? err.message : "Event scan failed",
          }));
        }
        return null;
      }
    },
    [searchAgents, fetchStats]
  );

  // ---- Refresh single agent ----
  const refreshAgent = useCallback(
    async (agentId: number): Promise<CachedAgent | null> => {
      try {
        const res = await fetch("/api/oracle/discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh", agentId }),
        });
        if (!res.ok) return null;
        const { agent } = await res.json();

        // Update in local state if present
        if (mountedRef.current && agent) {
          setState((prev) => ({
            ...prev,
            agents: prev.agents.map((a) =>
              a.agent_id === agentId ? agent : a
            ),
          }));
        }
        return agent;
      } catch {
        return null;
      }
    },
    []
  );

  // ---- Set relationship ----
  const classifyAgent = useCallback(
    async (
      agentId: number,
      relationship: "unknown" | "ally" | "neutral" | "avoided",
      notes?: string
    ) => {
      try {
        await fetch("/api/oracle/discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_relationship",
            agentId,
            relationship,
            notes,
          }),
        });

        // Optimistic update
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            agents: prev.agents.map((a) =>
              a.agent_id === agentId ? { ...a, relationship, notes: notes ?? a.notes } : a
            ),
          }));
        }
      } catch {
        // Silently fail
      }
    },
    []
  );

  // ---- Fetch scan history ----
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/oracle/discovery?action=history");
      if (!res.ok) return;
      const { history } = await res.json();
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, scanHistory: history || [] }));
      }
    } catch {
      // Non-critical
    }
  }, []);

  // ---- Realtime subscription (new cache entries) ----
  useEffect(() => {
    const channel = supabase
      .channel("erc8004-registry-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "erc8004_registry_cache" },
        () => {
          // New agent discovered — refresh stats
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchStats]);

  // ---- Initial load + interval ----
  useEffect(() => {
    Promise.all([searchAgents(), fetchStats(), fetchHistory()]);

    const interval = setInterval(() => {
      if (mountedRef.current) {
        fetchStats();
      }
    }, autoRefreshMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // State
    ...state,
    filters,

    // Actions
    setFilters: (f: AgentSearchFilters) => {
      setFilters(f);
      searchAgents(f);
    },
    searchAgents,
    scanRange,
    scanEvents,
    refreshAgent,
    classifyAgent,
    fetchStats,
    fetchHistory,

    // Convenience
    refresh: () => Promise.all([searchAgents(), fetchStats(), fetchHistory()]),
  };
}
