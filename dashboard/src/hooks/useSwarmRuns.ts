"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { SwarmRun, SwarmTask } from "@/lib/types";

/**
 * Subscribe to swarm runs and their tasks with real-time updates.
 * Optimizations:
 * - Singleton supabase client
 * - Visibility-aware: pauses Realtime refetch when tab is hidden
 * - Debounced refetch to coalesce rapid Realtime events
 * - Inline task updates from Realtime (no full refetch)
 * - Auto-fetch tasks for active runs
 * - Stable callback refs to prevent effect re-runs
 */
export function useSwarmRuns() {
  const [runs, setRuns] = useState<SwarmRun[]>([]);
  const [taskMap, setTaskMap] = useState<Record<string, SwarmTask[]>>({});
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(true);
  const fetchedTasksRef = useRef<Set<string>>(new Set());

  // Fetch all runs
  const fetchRuns = useCallback(async () => {
    const { data } = await supabase
      .from("swarm_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setRuns(data as SwarmRun[]);
    setLoading(false);
  }, [supabase]);

  // Fetch tasks for a specific run (with dedup guard)
  const fetchTasks = useCallback(
    async (swarmId: string) => {
      const { data } = await supabase
        .from("swarm_tasks")
        .select("*")
        .eq("swarm_id", swarmId)
        .order("created_at", { ascending: true });

      if (data) {
        setTaskMap((prev) => ({ ...prev, [swarmId]: data as SwarmTask[] }));
        fetchedTasksRef.current.add(swarmId);
      }
    },
    [supabase]
  );

  // Debounced refetch -- only when visible
  const debouncedFetchRuns = useCallback(() => {
    if (!visibleRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchRuns, 300);
  }, [fetchRuns]);

  // Visibility listener: refetch when tab becomes visible again
  useEffect(() => {
    const handler = () => {
      visibleRef.current = document.visibilityState === "visible";
      if (visibleRef.current) {
        fetchRuns();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchRuns]);

  // Main subscriptions
  useEffect(() => {
    fetchRuns();

    // Subscribe to run changes -- inline update for status changes, full refetch for inserts/deletes
    const runsChannel = supabase
      .channel("swarm-runs-rt")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "swarm_runs" },
        (payload) => {
          const updated = payload.new as SwarmRun;
          setRuns((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "swarm_runs" },
        () => debouncedFetchRuns()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "swarm_runs" },
        () => debouncedFetchRuns()
      )
      .subscribe();

    // Subscribe to task changes -- inline merge, no full refetch
    const tasksChannel = supabase
      .channel("swarm-tasks-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_tasks" },
        (payload) => {
          const row = payload.new as SwarmTask;
          if (!row?.swarm_id) return;

          setTaskMap((prev) => {
            const existing = prev[row.swarm_id];
            if (!existing) {
              // Only add if we've been tracking this swarm
              if (!fetchedTasksRef.current.has(row.swarm_id)) return prev;
              return { ...prev, [row.swarm_id]: [row] };
            }
            const idx = existing.findIndex((t) => t.id === row.id);
            if (idx >= 0) {
              // Update in place (avoid full array copy if unchanged)
              if (existing[idx].status === row.status && existing[idx].output === row.output) {
                return prev;
              }
              const updated = [...existing];
              updated[idx] = row;
              return { ...prev, [row.swarm_id]: updated };
            }
            return { ...prev, [row.swarm_id]: [...existing, row] };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(runsChannel);
      supabase.removeChannel(tasksChannel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [supabase, fetchRuns, debouncedFetchRuns]);

  // Auto-fetch tasks for active runs
  useEffect(() => {
    for (const run of runs) {
      if (
        (run.status === "pending" || run.status === "running") &&
        !fetchedTasksRef.current.has(run.id)
      ) {
        fetchTasks(run.id);
      }
    }
  }, [runs, fetchTasks]);

  // Derived: active runs (pending or running)
  const activeRuns = useMemo(
    () => runs.filter((r) => r.status === "pending" || r.status === "running"),
    [runs]
  );

  // Derived: completed/failed/cancelled
  const historyRuns = useMemo(
    () => runs.filter((r) => r.status !== "pending" && r.status !== "running"),
    [runs]
  );

  return {
    runs,
    activeRuns,
    historyRuns,
    taskMap,
    loading,
    fetchTasks,
    refetch: fetchRuns,
  };
}
