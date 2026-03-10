"use client";

import { useState, useEffect, useCallback } from "react";

interface MemoryTimeline {
  date: string;
  daily: number;
  cumulative: number;
}

interface RecentAnchor {
  id: string;
  source: string;
  content: string;
  category: string | null;
  relevance_score: number | null;
  created_at: string;
}

export interface MemoryReport {
  total: number;
  byAgent: Record<string, number>;
  byCategory: Record<string, number>;
  timeline: MemoryTimeline[];
  recentAnchors: RecentAnchor[];
  flow: { source: string; target: string; value: number }[];
}

interface ScholarDomain {
  domain: string;
  findings: number;
  relevance: number;
  lastUpdate: string | null;
}

interface ScholarFinding {
  id: string;
  preview: string;
  category: string | null;
  relevance: number | null;
  timestamp: string;
}

export interface ScholarReport {
  totalFindings: number;
  domains: ScholarDomain[];
  recentFindings: ScholarFinding[];
  heatmap: Record<string, number>;
}

export interface AgentInfo {
  id: string;
  status: string;
  lastHeartbeat: string;
  memoryCount: number;
  commands: number;
  successRate: number;
  lastActivity: string;
}

interface RevenueDay {
  date: string;
  daily: number;
  cumulative: number;
}

export interface AgentReport {
  agents: AgentInfo[];
  revenue: RevenueDay[];
  totalRevenue: number;
}

export interface FullReport {
  memory: MemoryReport | null;
  scholar: ScholarReport | null;
  agents: AgentReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReport(): FullReport {
  const [memory, setMemory] = useState<MemoryReport | null>(null);
  const [scholar, setScholar] = useState<ScholarReport | null>(null);
  const [agents, setAgents] = useState<AgentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [memRes, schRes, agRes] = await Promise.all([
        fetch("/api/report/memories"),
        fetch("/api/report/scholar"),
        fetch("/api/report/agents"),
      ]);

      if (!memRes.ok || !schRes.ok || !agRes.ok) {
        throw new Error("Failed to fetch report data");
      }

      const [memData, schData, agData] = await Promise.all([
        memRes.json(),
        schRes.json(),
        agRes.json(),
      ]);

      setMemory(memData);
      setScholar(schData);
      setAgents(agData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { memory, scholar, agents, loading, error, refresh: fetchAll };
}
