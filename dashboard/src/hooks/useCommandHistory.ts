"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentCommand } from "@/lib/types";

/**
 * Subscribe to recent command history with real-time updates.
 * Debounces rapid Realtime events to avoid re-fetching in a burst.
 */
export function useCommandHistory(limit = 15) {
  const [commands, setCommands] = useState<AgentCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCommands = useCallback(async () => {
    const { data } = await supabase
      .from("agent_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (data) setCommands(data);
    setLoading(false);
  }, [supabase, limit]);

  // Debounced refetch (coalesce rapid Realtime events)
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchCommands, 300);
  }, [fetchCommands]);

  useEffect(() => {
    fetchCommands();

    const channel = supabase
      .channel("command-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_commands" },
        debouncedFetch
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchCommands, debouncedFetch, supabase]);

  return { commands, loading };
}
