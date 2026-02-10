"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentSession } from "@/lib/types";

const HEARTBEAT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 15_000;

/**
 * Monitor the bridge daemon's heartbeat. Returns the latest session
 * and whether the bridge is considered "online" (heartbeat within 60s).
 *
 * Optimizations:
 * - Singleton supabase client
 * - Stable fetchLatest callback
 * - Visibility-aware polling (pauses when tab is hidden)
 * - Proper cleanup
 */
export function useBridgeStatus() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const processSession = useCallback((data: AgentSession | null) => {
    if (data) {
      setSession(data);
      const lastBeat = new Date(data.last_heartbeat).getTime();
      setIsOnline(Date.now() - lastBeat < HEARTBEAT_TIMEOUT_MS);
    } else {
      setSession(null);
      setIsOnline(false);
    }
  }, []);

  const fetchLatest = useCallback(async () => {
    const { data } = await supabase
      .from("agent_sessions")
      .select("*")
      .eq("agent_id", "bridge")
      .order("last_heartbeat", { ascending: false })
      .limit(1)
      .single();

    processSession(data);
  }, [supabase, processSession]);

  useEffect(() => {
    fetchLatest();

    // Visibility-aware polling: stop when tab is hidden
    const startPolling = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(fetchLatest, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchLatest(); // immediate refresh on tab focus
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    // Realtime subscription
    const channel = supabase
      .channel("bridge-heartbeat")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_sessions",
          filter: "agent_id=eq.bridge",
        },
        (payload) => {
          processSession(payload.new as AgentSession);
        }
      )
      .subscribe();

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [fetchLatest, supabase, processSession]);

  return { session, isOnline };
}
