"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentResponse } from "@/lib/types";

/**
 * Subscribe to real-time agent_responses for a given command_id.
 * Returns accumulated response chunks as they stream in.
 */
export function useRealtimeMessages(commandId: string | null) {
  const [chunks, setChunks] = useState<AgentResponse[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const supabaseRef = useRef(createClient());

  const reset = useCallback(() => {
    setChunks([]);
    setIsComplete(false);
  }, []);

  useEffect(() => {
    if (!commandId) return;

    reset();
    const supabase = supabaseRef.current;

    // Fetch any existing responses first
    supabase
      .from("agent_responses")
      .select("*")
      .eq("command_id", commandId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setChunks(data);
          if (data.some((r) => r.is_final)) setIsComplete(true);
        }
      });

    // Subscribe to new responses
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
          const row = payload.new as AgentResponse;
          setChunks((prev) => [...prev, row]);
          if (row.is_final) setIsComplete(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [commandId, reset]);

  const fullText = chunks.map((c) => c.content).join("");

  return { chunks, fullText, isComplete, reset };
}
