"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";

/* ── Types ─────────────────────────────────────────────────── */

export interface MemoryNode {
  id: string;
  agent_id: string;
  kind: string;
  content: string;
  created_at: string;
  source?: string;
}

export interface MemoryEdge {
  id: string;
  memory_id: string;
  related_memory_id: string;
  association_type: string;
  strength: number;
}

export interface DreamInsight {
  id: string;
  insight: string;
  source_memories: string[];
  category: string;
  confidence: number;
  generated_at: string;
}

export interface MemoryQuery {
  id: string;
  agent_id: string;
  task_keywords: string[];
  retrieved_memory_ids: string[];
  relevance_scores: number[];
  query_time: string;
}

export interface AnchorEntry {
  id: string;
  content: string;
  created_at: string;
  /** The anchor TX hash – extracted from content like "tx: 0x..." */
  txHash?: string;
  /** IPFS CID – extracted from content like "ipfs://Qm..." */
  ipfsCid?: string;
}

export interface AgentSession {
  agent_id: string;
  status: string;
  last_heartbeat: string;
}

export interface ConsciousnessData {
  /* Agents */
  mainSession: AgentSession | null;
  soulSession: AgentSession | null;

  /* Memory graph */
  memories: MemoryNode[];
  associations: MemoryEdge[];

  /* Anchors (from agent_memory where source = "anchor") */
  anchors: AnchorEntry[];

  /* Context injection metrics */
  queries: MemoryQuery[];
  avgRelevance: number;
  avgQueryTime: number;
  totalInjections: number;

  /* Dream mode */
  dreamInsights: DreamInsight[];
  lastDreamAt: string | null;
  dreamReady: boolean;

  /* Meta */
  loading: boolean;
  error: string | null;
}

const REFRESH_INTERVAL = 30_000; // 30s auto-refresh

/* ── Hook ──────────────────────────────────────────────────── */

export function useConsciousness(): ConsciousnessData & { refresh: () => void } {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<ConsciousnessData>({
    mainSession: null,
    soulSession: null,
    memories: [],
    associations: [],
    anchors: [],
    queries: [],
    avgRelevance: 0,
    avgQueryTime: 0,
    totalInjections: 0,
    dreamInsights: [],
    lastDreamAt: null,
    dreamReady: false,
    loading: true,
    error: null,
  });

  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    try {
      const [
        sessionsRes,
        memoriesRes,
        assocRes,
        anchorsRes,
        queriesRes,
        dreamsRes,
      ] = await Promise.all([
        supabase
          .from("agent_sessions")
          .select("id, agent_id, status, started_at, last_active, last_heartbeat, tasks_completed, errors")
          .in("agent_id", ["main", "soul"]),
        supabase
          .from("agent_memory")
          .select("id, agent_id, kind, content, source, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("memory_associations")
          .select("id, memory_id, related_memory_id, association_type, strength, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("agent_memory")
          .select("id, agent_id, kind, content, source, created_at")
          .eq("source", "anchor")
          .order("created_at", { ascending: true })
          .limit(100),
        supabase
          .from("memory_queries")
          .select("id, agent_id, task_keywords, retrieved_memory_ids, relevance_scores, query_time")
          .order("query_time", { ascending: false })
          .limit(50),
        supabase
          .from("dream_insights")
          .select("id, insight, source_memories, category, confidence, generated_at")
          .order("generated_at", { ascending: false })
          .limit(30),
      ]);

      if (!mountedRef.current) return;

      const sessions = (sessionsRes.data ?? []) as AgentSession[];
      const mainSession = sessions.find((s) => s.agent_id === "main") ?? null;
      const soulSession = sessions.find((s) => s.agent_id === "soul") ?? null;

      const memories = (memoriesRes.data ?? []) as MemoryNode[];
      const associations = (assocRes.data ?? []) as MemoryEdge[];
      const rawAnchors = (anchorsRes.data ?? []) as MemoryNode[];
      const queries = (queriesRes.data ?? []) as MemoryQuery[];
      const dreamInsights = (dreamsRes.data ?? []) as DreamInsight[];

      // Extract TX hashes and IPFS CIDs from anchor memory content
      const anchors: AnchorEntry[] = rawAnchors.map((a) => {
        const txMatch = a.content.match(/tx:\s*(0x[a-fA-F0-9]+)/);
        const ipfsMatch = a.content.match(/ipfs:\/\/(\w+)/);
        return {
          id: a.id,
          content: a.content,
          created_at: a.created_at,
          txHash: txMatch?.[1],
          ipfsCid: ipfsMatch?.[1],
        };
      });

      // Context injection metrics
      const totalInjections = queries.length;
      const allScores = queries.flatMap((q) => q.relevance_scores);
      const avgRelevance =
        allScores.length > 0
          ? allScores.reduce((s, v) => s + v, 0) / allScores.length
          : 0;

      // Estimate query time from timestamps (sequential diff)
      const avgQueryTime = 0.3; // placeholder — real latency needs server-side timing

      // Dream readiness: check if soul has been idle > 6 hours
      const lastDreamAt = dreamInsights.length > 0 ? dreamInsights[0].generated_at : null;
      const soulLastActive = soulSession?.last_heartbeat
        ? new Date(soulSession.last_heartbeat).getTime()
        : 0;
      const sixHoursMs = 6 * 60 * 60 * 1000;
      const dreamReady = Date.now() - soulLastActive > sixHoursMs && memories.length > 5;

      setData({
        mainSession,
        soulSession,
        memories,
        associations,
        anchors,
        queries,
        avgRelevance,
        avgQueryTime,
        totalInjections,
        dreamInsights,
        lastDreamAt,
        dreamReady,
        loading: false,
        error: null,
      });
    } catch (err) {
      if (mountedRef.current) {
        setData((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    }
  }, [supabase]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const iv = setInterval(fetchAll, REFRESH_INTERVAL);

    // Realtime subscription — instantly picks up new anchors
    const channel = supabase
      .channel("anchor-sync")
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "agent_memory",
          filter: "source=eq.anchor",
        },
        () => {
          // New anchor landed — refresh immediately
          if (mountedRef.current) fetchAll();
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [fetchAll, supabase]);

  return { ...data, refresh: fetchAll };
}
