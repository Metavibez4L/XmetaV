"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type {
  AgentSession,
  AgentCommand,
  AgentResponse,
  AgentControl,
} from "@/lib/types";

export interface ArenaHandlers {
  onStatus: (agentId: string, status: "idle" | "busy" | "offline") => void;
  onCommand: (commandId: string, agentId: string, message: string) => void;
  onChunk: (commandId: string, agentId: string) => void;
  onComplete: (
    commandId: string,
    agentId: string,
    status: "completed" | "failed",
  ) => void;
  onControl: (agentId: string, enabled: boolean) => void;
}

/**
 * Subscribe to all Supabase realtime channels needed for the Arena.
 * Calls handlers imperatively (via ref) so the PixiJS layer can react
 * without triggering React re-renders.
 */
export function useArenaEvents(
  handlersRef: React.RefObject<ArenaHandlers | null>,
) {
  const supabase = useMemo(() => createClient(), []);
  const cmdAgentMap = useRef(new Map<string, string>());
  const initialFetchDone = useRef(false);

  useEffect(() => {
    // -- Initial fetch ------------------------------------------------
    (async () => {
      // Fetch all configured agents from agent_controls (source of truth)
      const { data: controls } = await supabase
        .from("agent_controls")
        .select("*");
      
      // Get session data for online/busy status
      const { data: sessions } = await supabase
        .from("agent_sessions")
        .select("*");
      
      // Build a map of agent_id -> session status
      const sessionMap = new Map<string, AgentSession>();
      if (sessions) {
        for (const s of sessions as AgentSession[]) {
          sessionMap.set(s.agent_id, s);
        }
      }

      // Process each configured agent
      if (controls) {
        for (const c of controls as AgentControl[]) {
          const agentId = c.agent_id;
          const enabled = !!c.enabled;
          
          // Check if agent has a recent session
          const session = sessionMap.get(agentId);
          let status: "idle" | "busy" | "offline" = "idle";
          
          if (!enabled) {
            status = "offline";
          } else if (session) {
            const HEARTBEAT_TIMEOUT = 60_000;
            const stale =
              Date.now() - new Date(session.last_heartbeat).getTime() >
              HEARTBEAT_TIMEOUT;
            
            if (!stale) {
              status = (session.status as "idle" | "busy" | "offline") ?? "idle";
            } else {
              // Stale but enabled - show as idle (agent might be reconnecting)
              status = "idle";
            }
          }
          
          // Always set initial status so agents appear
          handlersRef.current?.onStatus(agentId, status);
          handlersRef.current?.onControl(agentId, enabled);
        }
      }

      // Also process any sessions for agents not in controls
      if (sessions) {
        for (const s of sessions as AgentSession[]) {
          const agentId = s.agent_id;
          const HEARTBEAT_TIMEOUT = 60_000;
          const stale =
            Date.now() - new Date(s.last_heartbeat).getTime() >
            HEARTBEAT_TIMEOUT;
          
          // If we haven't already set status via controls
          const status = stale ? "idle" : ((s.status as "idle" | "busy" | "offline") ?? "idle");
          handlersRef.current?.onStatus(agentId, status);
        }
      }

      initialFetchDone.current = true;

      // Pre-populate command-agent mapping for active commands
      const { data: commands } = await supabase
        .from("agent_commands")
        .select("id, agent_id")
        .in("status", ["pending", "running"])
        .limit(50);
      if (commands) {
        for (const c of commands as { id: string; agent_id: string }[]) {
          cmdAgentMap.current.set(c.id, c.agent_id);
        }
      }
    })();

    // -- Realtime subscriptions ---------------------------------------

    const sessionsChannel = supabase
      .channel("arena-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_sessions" },
        (payload) => {
          const row = payload.new as AgentSession;
          if (row?.agent_id) {
            handlersRef.current?.onStatus(
              row.agent_id,
              (row.status as "idle" | "busy" | "offline") ?? "idle",
            );
          }
        },
      )
      .subscribe();

    const commandsChannel = supabase
      .channel("arena-commands")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_commands" },
        (payload) => {
          const row = payload.new as AgentCommand;
          cmdAgentMap.current.set(row.id, row.agent_id);
          handlersRef.current?.onCommand(row.id, row.agent_id, row.message);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_commands" },
        (payload) => {
          const row = payload.new as AgentCommand;
          cmdAgentMap.current.set(row.id, row.agent_id);
          if (row.status === "completed" || row.status === "failed") {
            handlersRef.current?.onComplete(
              row.id,
              row.agent_id,
              row.status,
            );
          }
        },
      )
      .subscribe();

    const responsesChannel = supabase
      .channel("arena-responses")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_responses" },
        (payload) => {
          const row = payload.new as AgentResponse;
          const agentId =
            cmdAgentMap.current.get(row.command_id) ?? "main";
          handlersRef.current?.onChunk(row.command_id, agentId);
        },
      )
      .subscribe();

    const controlsChannel = supabase
      .channel("arena-controls")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_controls" },
        (payload) => {
          const row = payload.new as AgentControl;
          if (row?.agent_id != null) {
            handlersRef.current?.onControl(row.agent_id, !!row.enabled);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(commandsChannel);
      supabase.removeChannel(responsesChannel);
      supabase.removeChannel(controlsChannel);
    };
  }, [supabase, handlersRef]);
}
