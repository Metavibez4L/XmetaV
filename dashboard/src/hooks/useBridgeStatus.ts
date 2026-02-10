"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentSession } from "@/lib/types";

/**
 * Monitor the bridge daemon's heartbeat. Returns the latest session
 * and whether the bridge is considered "online" (heartbeat within 60s).
 */
export function useBridgeStatus() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;

    const fetchLatest = async () => {
      const { data } = await supabase
        .from("agent_sessions")
        .select("*")
        .eq("agent_id", "bridge")
        .order("last_heartbeat", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setSession(data);
        const lastBeat = new Date(data.last_heartbeat).getTime();
        setIsOnline(Date.now() - lastBeat < 60_000);
      } else {
        setSession(null);
        setIsOnline(false);
      }
    };

    fetchLatest();

    // Poll every 15s
    const interval = setInterval(fetchLatest, 15_000);

    // Also subscribe to realtime changes
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
          const row = payload.new as AgentSession;
          setSession(row);
          const lastBeat = new Date(row.last_heartbeat).getTime();
          setIsOnline(Date.now() - lastBeat < 60_000);
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return { session, isOnline };
}
