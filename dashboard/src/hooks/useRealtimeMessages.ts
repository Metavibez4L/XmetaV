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
const THROTTLE_MS = 50; // batch rapid chunks — update UI at ~20fps (was 80/12fps)

export function useRealtimeMessages(commandId: string | null) {
  const [fullText, setFullText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  const seenIds = useRef(new Set<string>());
  const textRef = useRef(""); // running text accumulator
  const rafRef = useRef<number | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCommandIdRef = useRef<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // ── Synchronous reset when commandId changes ──
  // This runs during render (before paint) so the StreamingBubble
  // never sees stale fullText from a previous command.
  if (commandId !== prevCommandIdRef.current) {
    prevCommandIdRef.current = commandId;
    textRef.current = "";
    seenIds.current.clear();
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // These setState calls during render trigger a synchronous re-render
    // before the browser paints — React supports this pattern.
    if (fullText !== "") setFullText("");
    if (isComplete) setIsComplete(false);
  }

  /** Push accumulated text to React state (throttled + RAF aligned) */
  const scheduleUpdate = useCallback(() => {
    if (throttleRef.current) return; // already scheduled
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      // Align state update with next animation frame for smoother rendering
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setFullText(textRef.current);
      });
    }, THROTTLE_MS);
  }, []);

  /** Flush immediately (for final chunk or catch-up) */
  const flushNow = useCallback(() => {
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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

    // Safety poll: if realtime misses is_final, catch it via DB query
    const POLL_INTERVAL = 15_000; // 15s
    const MAX_POLL_TIME = 210_000; // 3.5min — stop polling after this
    const pollStart = Date.now();
    const pollTimer = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - pollStart > MAX_POLL_TIME) {
        // Hard timeout — force-complete as failed
        if (!cancelled) {
          flushNow();
          setIsComplete(true);
        }
        return;
      }
      try {
        const { data: cmd } = await supabase
          .from("agent_commands")
          .select("status")
          .eq("id", commandId)
          .single();
        if (cancelled) return;
        if (cmd?.status === "completed" || cmd?.status === "failed") {
          // Command is done — fetch any missed response chunks
          const { data: rows } = await supabase
            .from("agent_responses")
            .select("*")
            .eq("command_id", commandId)
            .order("created_at", { ascending: true });
          if (cancelled) return;
          if (rows && rows.length > 0) {
            let text = "";
            rows.forEach((r) => {
              seenIds.current.add(r.id);
              text += r.content;
            });
            textRef.current = text;
          }
          flushNow();
          setIsComplete(true);
        }
      } catch {
        // Ignore poll errors — will retry next interval
      }
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      if (throttleRef.current) clearTimeout(throttleRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      supabase.removeChannel(channel);
    };
  }, [commandId, reset, supabase, scheduleUpdate, flushNow]);

  return { fullText, isComplete, reset };
}
