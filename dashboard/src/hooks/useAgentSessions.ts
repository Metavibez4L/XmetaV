"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentSession, AgentStatus } from "@/lib/types";

const HEARTBEAT_TIMEOUT_MS = 60_000;

/**
 * Subscribe to all agent sessions with real-time updates.
 * Provides a getStatus() helper that factors in heartbeat staleness.
 */
export function useAgentSessions() {
  const [sessions, setSessions] = useState<Record<string, AgentSession>>({});
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase
      .from("agent_sessions")
      .select("*")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, AgentSession> = {};
          data.forEach((s) => (map[s.agent_id] = s));
          setSessions(map);
        }
      });

    const channel = supabase
      .channel("fleet-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_sessions" },
        (payload) => {
          const row = payload.new as AgentSession;
          setSessions((prev) => ({ ...prev, [row.agent_id]: row }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const getStatus = useCallback(
    (agentId: string): AgentStatus => {
      const session = sessions[agentId];
      if (!session) return "offline";
      const lastBeat = new Date(session.last_heartbeat).getTime();
      if (Date.now() - lastBeat > HEARTBEAT_TIMEOUT_MS) return "offline";
      return session.status as AgentStatus;
    },
    [sessions]
  );

  return { sessions, getStatus };
}
