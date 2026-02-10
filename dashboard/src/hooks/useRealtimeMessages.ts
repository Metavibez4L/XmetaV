"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentResponse } from "@/lib/types";

/**
 * Subscribe to real-time agent_responses for a given command_id.
 * Returns accumulated response text as it streams in.
 *
 * Optimizations:
 * - Memoized fullText (only recomputes when chunks change)
 * - Deduplication guard on chunk IDs
 * - Stable callback refs to avoid re-subscriptions
 * - Proper cleanup on unmount and commandId change
 */
export function useRealtimeMessages(commandId: string | null) {
  const [chunks, setChunks] = useState<AgentResponse[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const seenIds = useRef(new Set<string>());
  const supabase = useMemo(() => createClient(), []);

  const reset = useCallback(() => {
    setChunks([]);
    setIsComplete(false);
    seenIds.current.clear();
  }, []);

  useEffect(() => {
    if (!commandId) return;

    reset();
    let cancelled = false;

    // Fetch any existing responses first (catch-up)
    supabase
      .from("agent_responses")
      .select("*")
      .eq("command_id", commandId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return;
        const ids = new Set<string>();
        data.forEach((r) => ids.add(r.id));
        seenIds.current = ids;
        setChunks(data);
        if (data.some((r) => r.is_final)) setIsComplete(true);
      });

    // Subscribe to new responses with dedup
    const channel = supabase
      .channel(`responses:${commandId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_responses",
          filter: `command_id=eq.${commandId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as AgentResponse;
          // Deduplicate (Realtime can fire for rows already fetched)
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setChunks((prev) => [...prev, row]);
          if (row.is_final) setIsComplete(true);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [commandId, reset, supabase]);

  // Only recompute when chunks array reference changes
  const fullText = useMemo(() => chunks.map((c) => c.content).join(""), [chunks]);

  return { chunks, fullText, isComplete, reset };
}
