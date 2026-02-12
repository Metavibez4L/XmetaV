"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentResponse } from "@/lib/types";

/**
 * Subscribe to real-time agent_responses for a given command_id.
 * Returns accumulated response text as it streams in.
 *
 * Optimizations:
 *  - Ref-based text accumulator (avoids rebuilding full string on each chunk)
 *  - Deduplication guard on chunk IDs
 *  - Throttled state updates (batches rapid chunks into single render)
 *  - Stable callback refs to avoid re-subscriptions
 *  - Proper cleanup on unmount and commandId change
 */
const THROTTLE_MS = 80; // batch rapid chunks — update UI at ~12fps

export function useRealtimeMessages(commandId: string | null) {
  const [fullText, setFullText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  const seenIds = useRef(new Set<string>());
  const textRef = useRef(""); // running text accumulator
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useMemo(() => createClient(), []);

  /** Push accumulated text to React state (throttled) */
  const scheduleUpdate = useCallback(() => {
    if (throttleRef.current) return; // already scheduled
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      setFullText(textRef.current);
    }, THROTTLE_MS);
  }, []);

  /** Flush immediately (for final chunk or catch-up) */
  const flushNow = useCallback(() => {
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    setFullText(textRef.current);
  }, []);

  const reset = useCallback(() => {
    setFullText("");
    setIsComplete(false);
    textRef.current = "";
    seenIds.current.clear();
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
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
        let text = "";
        data.forEach((r) => {
          ids.add(r.id);
          text += r.content;
        });
        seenIds.current = ids;
        textRef.current = text;
        flushNow();
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

          // Append to accumulator (no array copy)
          textRef.current += row.content;

          if (row.is_final) {
            flushNow();
            setIsComplete(true);
          } else {
            scheduleUpdate();
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (throttleRef.current) clearTimeout(throttleRef.current);
      supabase.removeChannel(channel);
    };
  }, [commandId, reset, supabase, scheduleUpdate, flushNow]);

  return { fullText, isComplete, reset };
}
