"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type {
  AgentSession,
  AgentCommand,
  AgentResponse,
  AgentControl,
  SwarmRun,
  SwarmTask,
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
  onSwarmStart?: (runId: string, agentIds: string[], mode: string) => void;
  onSwarmTaskUpdate?: (runId: string, agentId: string, status: string) => void;
  onSwarmEnd?: (runId: string) => void;
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
  /** Cache last-known status per agent to skip no-op updates */
  const lastKnownStatus = useRef(new Map<string, string>());

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
      console.log("[arena-events] Initial fetch done. Sessions:", sessions?.length ?? 0, "Controls:", controls?.length ?? 0);

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
          if (!row?.agent_id) return;
          const status = (row.status as "idle" | "busy" | "offline") ?? "idle";
          // Skip if status hasn't changed (prevents unnecessary React re-renders)
          if (lastKnownStatus.current.get(row.agent_id) === status) return;
          lastKnownStatus.current.set(row.agent_id, status);
          console.log("[arena-events] session realtime:", row.agent_id, status);
          handlersRef.current?.onStatus(row.agent_id, status);
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
          console.log("[arena-events] command INSERT:", row.agent_id, row.id?.slice(0, 8));
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

    // -- Swarm realtime subscriptions ---------------------------------
    const swarmRunsChannel = supabase
      .channel("arena-swarm-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_runs" },
        (payload) => {
          const row = payload.new as SwarmRun;
          if (!row?.id) return;
          if (row.status === "running") {
            // Extract agent IDs from manifest tasks
            const manifest = row.manifest as { tasks?: { agent?: string }[] };
            const agentIds = (manifest?.tasks ?? [])
              .map((t) => t.agent)
              .filter((a): a is string => !!a);
            if (agentIds.length > 0) {
              handlersRef.current?.onSwarmStart?.(row.id, agentIds, row.mode);
            }
          } else if (
            row.status === "completed" ||
            row.status === "failed" ||
            row.status === "cancelled"
          ) {
            handlersRef.current?.onSwarmEnd?.(row.id);
          }
        },
      )
      .subscribe();

    const swarmTasksChannel = supabase
      .channel("arena-swarm-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_tasks" },
        (payload) => {
          const row = payload.new as SwarmTask;
          if (!row?.swarm_id || !row?.agent_id) return;
          handlersRef.current?.onSwarmTaskUpdate?.(
            row.swarm_id,
            row.agent_id,
            row.status,
          );
        },
      )
      .subscribe();

    // Fetch currently running swarms on init
    (async () => {
      const { data: runningSwarms } = await supabase
        .from("swarm_runs")
        .select("*")
        .eq("status", "running")
        .limit(10);
      if (runningSwarms) {
        for (const run of runningSwarms as SwarmRun[]) {
          const manifest = run.manifest as { tasks?: { agent?: string }[] };
          const agentIds = (manifest?.tasks ?? [])
            .map((t) => t.agent)
            .filter((a): a is string => !!a);
          if (agentIds.length > 0) {
            handlersRef.current?.onSwarmStart?.(run.id, agentIds, run.mode);
          }
          // Also fetch task statuses
          const { data: tasks } = await supabase
            .from("swarm_tasks")
            .select("*")
            .eq("swarm_id", run.id);
          if (tasks) {
            for (const t of tasks as SwarmTask[]) {
              handlersRef.current?.onSwarmTaskUpdate?.(
                t.swarm_id,
                t.agent_id,
                t.status,
              );
            }
          }
        }
      }
    })();

    // -- Periodic sync (safety net for dropped realtime events) ----------
    // Only fires onStatus for agents whose status actually changed since
    // last sync — prevents unnecessary React re-renders.
    const syncInterval = setInterval(async () => {
      if (!initialFetchDone.current) return;
      const { data: sessions } = await supabase
        .from("agent_sessions")
        .select("*");
      if (!sessions) return;
      for (const s of sessions as AgentSession[]) {
        const HEARTBEAT_TIMEOUT = 60_000;
        const stale =
          Date.now() - new Date(s.last_heartbeat).getTime() >
          HEARTBEAT_TIMEOUT;
        const status = stale
          ? "idle"
          : ((s.status as "idle" | "busy" | "offline") ?? "idle");
        // Skip unchanged — this is the key optimization; without it
        // every 10s tick fires N onStatus → N setHudStats → N renders
        if (lastKnownStatus.current.get(s.agent_id) === status) continue;
        lastKnownStatus.current.set(s.agent_id, status);
        handlersRef.current?.onStatus(s.agent_id, status);
      }
    }, 10_000);

    return () => {
      clearInterval(syncInterval);
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(commandsChannel);
      supabase.removeChannel(responsesChannel);
      supabase.removeChannel(controlsChannel);
      supabase.removeChannel(swarmRunsChannel);
      supabase.removeChannel(swarmTasksChannel);
    };
  }, [supabase, handlersRef]);
}
