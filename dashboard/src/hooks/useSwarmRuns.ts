"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { SwarmRun, SwarmTask } from "@/lib/types";

/**
 * Subscribe to swarm runs and their tasks with real-time updates.
 * Returns all runs, active runs, and task map keyed by swarm_id.
 */
export function useSwarmRuns() {
  const [runs, setRuns] = useState<SwarmRun[]>([]);
  const [taskMap, setTaskMap] = useState<Record<string, SwarmTask[]>>({});
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Fetch tasks for a specific run
  const fetchTasks = useCallback(
    async (swarmId: string) => {
      const { data } = await supabase
        .from("swarm_tasks")
        .select("*")
        .eq("swarm_id", swarmId)
        .order("created_at", { ascending: true });

      if (data) {
        setTaskMap((prev) => ({ ...prev, [swarmId]: data as SwarmTask[] }));
      }
    },
    [supabase]
  );

  // Debounced refetch
  const debouncedFetchRuns = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchRuns, 300);
  }, [fetchRuns]);

  useEffect(() => {
    fetchRuns();

    // Subscribe to run changes
    const runsChannel = supabase
      .channel("swarm-runs-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_runs" },
        () => debouncedFetchRuns()
      )
      .subscribe();

    // Subscribe to task changes
    const tasksChannel = supabase
      .channel("swarm-tasks-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_tasks" },
        (payload) => {
          const row = payload.new as SwarmTask;
          if (row?.swarm_id) {
            setTaskMap((prev) => {
              const existing = prev[row.swarm_id] ?? [];
              const idx = existing.findIndex((t) => t.id === row.id);
              if (idx >= 0) {
                const updated = [...existing];
                updated[idx] = row;
                return { ...prev, [row.swarm_id]: updated };
              }
              return { ...prev, [row.swarm_id]: [...existing, row] };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(runsChannel);
      supabase.removeChannel(tasksChannel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [supabase, fetchRuns, debouncedFetchRuns]);

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
