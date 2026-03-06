"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ARENA_AGENTS } from "./agents";
import { useArenaEvents, type ArenaHandlers } from "./useArenaEvents";
import type { NodesApi } from "./renderer/avatars";
import type { EffectsApi } from "./renderer/effects";
import type { OfficeApi } from "./renderer/office";
import "./arena.css";

interface HudStats {
  online: number;
  activeCommands: number;
  lastEvent: string;
  meetingActive: boolean;
  meetingAgents: string[];
  meetingType: "auto" | "manual" | null;
}

interface EventLogEntry {
  id: number;
  text: string;
  time: string;
  type: "info" | "command" | "success" | "fail" | "meeting" | "swarm";
}

export default function ArenaCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesApiRef = useRef<NodesApi | null>(null);
  const effectsApiRef = useRef<EffectsApi | null>(null);
  const officeApiRef = useRef<OfficeApi | null>(null);
  const activeCommandsRef = useRef(new Set<string>());
  const nodeStatesRef = useRef(new Map<string, string>());
  const busyAgentsRef = useRef(new Set<string>());
  const meetingActiveRef = useRef(false);
  const meetingAgentsRef = useRef(new Set<string>());

  const [hudStats, setHudStats] = useState<HudStats>({
    online: 0,
    activeCommands: 0,
    lastEvent: "Initializing...",
    meetingActive: false,
    meetingAgents: [],
    meetingType: null,
  });
  const [meetingPanelOpen, setMeetingPanelOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set(["main"]));
  const manualMeetingRef = useRef(false);

  // Event log (rolling 8 entries)
  const eventIdRef = useRef(0);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);

  const pushEvent = useCallback((text: string, type: EventLogEntry["type"] = "info") => {
    const id = ++eventIdRef.current;
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setEventLog((prev) => [{ id, text, time, type }, ...prev].slice(0, 8));
  }, []);

  // Live clock
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const [labelPositions, setLabelPositions] = useState<
    { id: string; label: string; colorHex: string; x: number; y: number }[]
  >([]);

  // -- Meeting detection (stable callback via refs) ---------------------
  const checkMeetingRef = useRef<() => void>(() => {});
  const meetingEndCooldownRef = useRef(0);

  // Soul always joins meetings as the observer/memory orchestrator
  const withSoul = (ids: string[]) => {
    if (!ids.includes("soul")) return [...ids, "soul"];
    return ids;
  };

  const checkMeeting = useCallback(() => {
    // Don't auto-manage meetings while a manual meeting is active
    if (manualMeetingRef.current) return;

    const busyCount = busyAgentsRef.current.size;
    const busyIds = Array.from(busyAgentsRef.current);

    console.log("[arena] checkMeeting:", busyCount, "busy →", busyIds, "meetingActive:", meetingActiveRef.current);

    if (busyCount >= 2 && !meetingActiveRef.current) {
      const meetingIds = withSoul(busyIds);
      console.log("[arena] >>> STARTING AUTO MEETING", meetingIds);
      meetingActiveRef.current = true;
      meetingAgentsRef.current = new Set(meetingIds);
      meetingEndCooldownRef.current = Date.now();
      nodesApiRef.current?.startMeeting(meetingIds);
      effectsApiRef.current?.meetingStart(meetingIds);
      officeApiRef.current?.setMeetingMode(true);
      setHudStats((s) => ({
        ...s,
        meetingActive: true,
        meetingAgents: meetingIds,
        meetingType: "auto",
        lastEvent: `MEETING: ${meetingIds.length} agents at table`,
      }));
      pushEvent(`MEETING: ${meetingIds.length} agents at table`, "meeting");
    } else if (busyCount >= 2 && meetingActiveRef.current) {
      const meetingIds = withSoul(busyIds);
      meetingAgentsRef.current = new Set(meetingIds);
      nodesApiRef.current?.startMeeting(meetingIds);
      effectsApiRef.current?.meetingStart(meetingIds);
      setHudStats((s) => ({
        ...s,
        meetingAgents: meetingIds,
      }));
    } else if (busyCount < 2 && meetingActiveRef.current) {
      // Prevent the periodic sync from ending a meeting too quickly
      // — agents need at least 5s to animate to seats and be visible
      if (Date.now() - meetingEndCooldownRef.current < 5000) {
        console.log("[arena] checkMeeting: skipping end (cooldown)");
        return;
      }
      console.log("[arena] >>> ENDING AUTO MEETING");
      meetingActiveRef.current = false;
      meetingAgentsRef.current.clear();
      nodesApiRef.current?.endMeeting();
      effectsApiRef.current?.meetingEnd();
      officeApiRef.current?.setMeetingMode(false);
      setHudStats((s) => ({
        ...s,
        meetingActive: false,
        meetingAgents: [],
        meetingType: null,
        lastEvent: "Meeting ended",
      }));
      pushEvent("Meeting ended", "meeting");
    }
  }, [pushEvent]);

  // -- Call a specific meeting with chosen agents ----------------------
  const callMeeting = useCallback((agentIds: string[]) => {
    if (agentIds.length < 2) return;
    const meetingIds = withSoul(agentIds);
    console.log("[arena] >>> CALLING MANUAL MEETING:", meetingIds, "nodesApi:", !!nodesApiRef.current);
    manualMeetingRef.current = true;
    meetingActiveRef.current = true;
    meetingAgentsRef.current = new Set(meetingIds);

    // Visually set called agents to "busy" for the meeting
    for (const id of meetingIds) {
      nodesApiRef.current?.setState(id, "busy");
      officeApiRef.current?.setScreenState(id, "busy");
    }

    nodesApiRef.current?.startMeeting(meetingIds);
    effectsApiRef.current?.meetingStart(meetingIds);
    officeApiRef.current?.setMeetingMode(true);
    setHudStats((s) => ({
      ...s,
      meetingActive: true,
      meetingAgents: meetingIds,
      meetingType: "manual",
      lastEvent: `MEETING CALLED: ${meetingIds.join(", ")}`,
    }));
    pushEvent(`MEETING CALLED: ${meetingIds.join(", ")}`, "meeting");
    setMeetingPanelOpen(false);
  }, [pushEvent]);

  // -- Dismiss current meeting -----------------------------------------
  const dismissMeeting = useCallback(() => {
    console.log("[arena] >>> DISMISSING MEETING");
    manualMeetingRef.current = false;
    meetingActiveRef.current = false;
    meetingAgentsRef.current.clear();
    nodesApiRef.current?.endMeeting();
    effectsApiRef.current?.meetingEnd();
    officeApiRef.current?.setMeetingMode(false);
    setHudStats((s) => ({
      ...s,
      meetingActive: false,
      meetingAgents: [],
      meetingType: null,
      lastEvent: "Meeting dismissed",
    }));
    pushEvent("Meeting dismissed", "meeting");
  }, [pushEvent]);

  // Keep refs current for use in async callbacks & cross-tab listeners
  checkMeetingRef.current = checkMeeting;
  const callMeetingRef = useRef(callMeeting);
  callMeetingRef.current = callMeeting;

  // -- Cross-tab meeting listener (localStorage "storage" event) ------
  // When AgentChat (on /agent tab) detects a meeting command, it writes
  // to localStorage. The "storage" event fires only in OTHER tabs.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== "xmetav-arena-meeting" || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue);
        if (data?.type === "call-meeting" && Array.isArray(data.agentIds)) {
          console.log("[arena] Cross-tab meeting received:", data.agentIds);
          if (!meetingActiveRef.current) {
            callMeetingRef.current(data.agentIds);
          }
        }
      } catch { /* ignore parse errors */ }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // -- Arena event handlers (updated every render via ref assignment) --
  const handlersRef = useRef<ArenaHandlers | null>(null);
  /** Tracks the last hudStats.online count to skip identical setHudStats calls */
  const lastOnlineRef = useRef(-1);

  // Assign fresh handlers on every render so closures stay current
  handlersRef.current = {
    onStatus(agentId, status) {
      // Quick bail: if the state hasn’t changed, skip all downstream work.
      // This eliminates the bulk of unnecessary React re-renders from the
      // 10s periodic sync and duplicate realtime events.
      if (nodeStatesRef.current.get(agentId) === status) return;

      // If this agent has an active command, don't let session sync
      // override its busy state — the command is the source of truth
      const hasActiveCommand = Array.from(activeCommandsRef.current).length > 0 &&
        busyAgentsRef.current.has(agentId);
      if (hasActiveCommand && status !== "busy") {
        nodeStatesRef.current.set(agentId, "busy");
        return;
      }

      // During an active meeting, don't let periodic sync disrupt
      // meeting participants — they must stay "busy" at the table
      if (meetingActiveRef.current && meetingAgentsRef.current.has(agentId) && status !== "busy") {
        // Keep meeting participant at the table; only update online count
        const online = Array.from(nodeStatesRef.current.values()).filter(
          (s) => s !== "offline",
        ).length;
        setHudStats((s) => ({ ...s, online }));
        return;
      }

      nodesApiRef.current?.setState(agentId, status);
      const screenState =
        status === "busy" ? "busy" : status === "offline" ? "off" : "idle";
      officeApiRef.current?.setScreenState(agentId, screenState);

      nodeStatesRef.current.set(agentId, status);

      // Track busy from status events
      if (status === "busy") {
        busyAgentsRef.current.add(agentId);
      } else {
        busyAgentsRef.current.delete(agentId);
      }

      const online = Array.from(nodeStatesRef.current.values()).filter(
        (s) => s !== "offline",
      ).length;

      // Only update React state if online count or event text changed
      if (online !== lastOnlineRef.current) {
        lastOnlineRef.current = online;
        setHudStats((s) => ({
          ...s,
          online,
          lastEvent: `${agentId} ${status}`,
        }));
        pushEvent(`${agentId} → ${status}`, status === "busy" ? "command" : "info");
      }

      // Don't let session sync noise end meetings prematurely
      if (!meetingActiveRef.current || status === "busy") {
        checkMeeting();
      }
    },
    onCommand(commandId, agentId, message) {
      console.log("[arena] onCommand:", agentId, commandId);
      activeCommandsRef.current.add(commandId);
      busyAgentsRef.current.add(agentId);
      nodesApiRef.current?.setState(agentId, "busy");
      officeApiRef.current?.setScreenState(agentId, "busy");
      effectsApiRef.current?.commandPulse(agentId);
      effectsApiRef.current?.streamStart(agentId);
      setHudStats((s) => ({
        ...s,
        activeCommands: activeCommandsRef.current.size,
        lastEvent: `CMD > ${agentId}: ${message.slice(0, 40)}`,
      }));
      pushEvent(`CMD > ${agentId}: ${message.slice(0, 40)}`, "command");

      // Detect meeting commands from voice/chat and trigger arena meeting
      const lower = message.toLowerCase();
      const isMeetingCmd = /\b(call|start|begin|schedule|hold|run)\b.*\bmeeting\b|\bmeeting\b.*\b(call|start|begin|with)\b/i.test(lower);
      if (isMeetingCmd && !meetingActiveRef.current) {
        // Extract mentioned agent names from the message
        const allIds = ARENA_AGENTS.map((a) => a.id);
        const mentioned = allIds.filter((id) => lower.includes(id.replace(/_/g, " ")) || lower.includes(id));
        // Always include the agent receiving the command + main
        const meetingSet = new Set([agentId, "main", ...mentioned]);
        // If no specific agents mentioned, add default intel squad
        if (mentioned.length === 0) {
          meetingSet.add("briefing");
          meetingSet.add("oracle");
        }
        const meetingIds = Array.from(meetingSet);
        console.log("[arena] Voice/chat meeting command detected:", message.slice(0, 60), "→", meetingIds);
        // Small delay to let the command visuals settle first
        setTimeout(() => callMeeting(meetingIds), 300);
      } else {
        checkMeeting();
      }
    },
    onChunk(_commandId, agentId) {
      effectsApiRef.current?.streamStart(agentId);
    },
    onComplete(commandId, agentId, status) {
      console.log("[arena] onComplete:", agentId, status);
      activeCommandsRef.current.delete(commandId);
      busyAgentsRef.current.delete(agentId);
      effectsApiRef.current?.streamStop(agentId);
      if (status === "completed") {
        effectsApiRef.current?.completionBurst(agentId);
        nodesApiRef.current?.setState(agentId, "idle");
        officeApiRef.current?.setScreenState(agentId, "idle");
      } else {
        effectsApiRef.current?.failureGlitch(agentId);
        officeApiRef.current?.setScreenState(agentId, "fail");
        nodesApiRef.current?.setState(agentId, "idle");
        setTimeout(() => {
          officeApiRef.current?.setScreenState(agentId, "idle");
        }, 2000);
      }
      setHudStats((s) => ({
        ...s,
        activeCommands: activeCommandsRef.current.size,
        lastEvent: `${status === "completed" ? "OK" : "FAIL"} ${agentId}`,
      }));
      pushEvent(
        `${status === "completed" ? "✓" : "✗"} ${agentId} ${status}`,
        status === "completed" ? "success" : "fail",
      );
      checkMeeting();
    },
    onControl(agentId, enabled) {
      if (!enabled) {
        nodesApiRef.current?.setState(agentId, "offline");
        officeApiRef.current?.setScreenState(agentId, "off");
      }
      setHudStats((s) => ({
        ...s,
        lastEvent: `${agentId} ${enabled ? "enabled" : "disabled"}`,
      }));
      pushEvent(`${agentId} ${enabled ? "enabled" : "disabled"}`, "info");
    },
    onSwarmStart(runId, agentIds, mode) {
      console.log("[arena] swarmStart:", runId.slice(0, 8), agentIds, mode);
      effectsApiRef.current?.swarmStart(runId, agentIds, mode);
      setHudStats((s) => ({
        ...s,
        lastEvent: `SWARM ${mode.toUpperCase()}: ${agentIds.length} agents`,
      }));
      pushEvent(`SWARM ${mode.toUpperCase()}: ${agentIds.length} agents`, "swarm");
    },
    onSwarmTaskUpdate(runId, agentId, status) {
      effectsApiRef.current?.swarmTaskUpdate(runId, agentId, status);
    },
    onSwarmEnd(runId) {
      console.log("[arena] swarmEnd:", runId.slice(0, 8));
      effectsApiRef.current?.swarmEnd(runId);
      setHudStats((s) => ({
        ...s,
        lastEvent: "Swarm completed",
      }));
      pushEvent("Swarm completed", "success");
    },
  };

  // Connect to Supabase realtime
  useArenaEvents(handlersRef);

  // -- Initialize PixiJS ----------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    let cleanupBg: (() => void) | null = null;

    (async () => {
      const { Application, Container } = await import("pixi.js");
      if (destroyed) return;

      const app = new Application();
      const el = containerRef.current!;

      await app.init({
        resizeTo: el,
        backgroundColor: 0x05080f,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (destroyed) {
        app.destroy();
        return;
      }

      el.appendChild(app.canvas as HTMLCanvasElement);

      // Import iso utilities and renderers
      const { getSceneOffset, toScreen } = await import("./renderer/iso");
      const { initBackground } = await import("./renderer/background");
      const { initOffice } = await import("./renderer/office");
      const { initAvatars } = await import("./renderer/avatars");
      const { initEffects } = await import("./renderer/effects");
      if (destroyed) {
        app.destroy();
        return;
      }

      // Create scene container centered on viewport
      const scene = new Container();
      const offset = getSceneOffset(
        app.screen.width,
        app.screen.height,
      );
      scene.position.set(offset.x, offset.y);
      app.stage.addChild(scene);

      // Init renderers (order = z-order)
      cleanupBg = initBackground(app, scene);
      const officeApi = initOffice(app, scene);
      const nodesApi = initAvatars(app, scene);
      const effectsApi = initEffects(app, scene, nodesApi, officeApi);

      nodesApiRef.current = nodesApi;
      effectsApiRef.current = effectsApi;
      officeApiRef.current = officeApi;

      console.log("[arena] PixiJS initialized, all APIs ready");

      // -- Replay buffered state that arrived before PixiJS was ready --
      // Sync individual agent states (busy/idle/offline)
      for (const [agentId, status] of nodeStatesRef.current.entries()) {
        nodesApi.setState(agentId, status as "idle" | "busy" | "offline");
        const screenState = status === "busy" ? "busy" : status === "offline" ? "off" : "idle";
        officeApi.setScreenState(agentId, screenState as "idle" | "busy" | "off" | "fail");
      }
      // Trigger meeting check now that PixiJS can actually render it
      console.log("[arena] Replaying state: busyAgents =", Array.from(busyAgentsRef.current));
      checkMeetingRef.current();

      // Compute label positions (iso coords + scene offset = screen coords)
      function updateLabels() {
        const off = scene.position;
        setLabelPositions(
          ARENA_AGENTS.map((cfg) => {
            const iso = toScreen(cfg.tile.col, cfg.tile.row);
            return {
              id: cfg.id,
              label: cfg.label,
              colorHex: cfg.colorHex,
              x: iso.x + off.x,
              y: iso.y + off.y,
            };
          }),
        );
      }
      updateLabels();

      // Resize handler (throttled to avoid excessive re-renders)
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const ro = new ResizeObserver(() => {
        if (destroyed) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const newOff = getSceneOffset(
            app.screen.width,
            app.screen.height,
          );
          scene.position.set(newOff.x, newOff.y);
          updateLabels();
        }, 100);
      });
      ro.observe(el);

      const origCleanup = cleanupBg;
      cleanupBg = () => {
        ro.disconnect();
        origCleanup?.();
      };
    })();

    return () => {
      destroyed = true;
      cleanupBg?.();
      nodesApiRef.current?.destroy();
      effectsApiRef.current?.destroy();
      officeApiRef.current?.destroy();
      nodesApiRef.current = null;
      effectsApiRef.current = null;
      officeApiRef.current = null;
      if (containerRef.current) {
        const canvas = containerRef.current.querySelector("canvas");
        canvas?.remove();
      }
    };
  }, []);

  /* Event log color map */
  const eventColor: Record<EventLogEntry["type"], string> = {
    info: "#00f0ff",
    command: "#f59e0b",
    success: "#39ff14",
    fail: "#ff2d5e",
    meeting: "#a855f7",
    swarm: "#ff006e",
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: "#05080f" }}
    >
      {/* PixiJS canvas mount point */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* -- Atmospheric overlays ------------------------------------ */}
      <div className="arena-scanline-overlay" />
      <div className="arena-vignette" />
      <div className="arena-corner arena-corner--tl" />
      <div className="arena-corner arena-corner--tr" />
      <div className="arena-corner arena-corner--bl" />
      <div className="arena-corner arena-corner--br" />

      {/* -- HUD: Title (top-left) ----------------------------------- */}
      <div className="absolute top-4 left-6 z-10 pointer-events-none select-none">
        <div className="flex items-end gap-3">
          <h1
            className="arena-title-glitch text-xl font-mono font-bold tracking-[0.25em]"
            data-text="XMETAV HQ"
            style={{ color: "#00f0ff" }}
          >
            XMETAV HQ
          </h1>
          <span
            className="text-[10px] font-mono mb-[3px] tracking-widest"
            style={{ color: "#39ff14", textShadow: "0 0 8px #39ff1466" }}
          >
            {clock}
          </span>
        </div>
        <div className="arena-title-line mt-1" />
        <p
          className="text-[9px] font-mono mt-1.5 tracking-[0.3em] uppercase"
          style={{ color: "#00f0ff44" }}
        >
          COMMAND CENTER &middot; LIVE
        </p>
      </div>

      {/* -- HUD: Meeting indicator (top-center) ---------------------- */}
      {hudStats.meetingActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 select-none">
          <div className="arena-meeting-glow px-5 py-2.5 rounded font-mono text-xs tracking-widest text-center">
            <div className="text-[10px] mb-0.5" style={{ color: "#a855f7" }}>
              &#9670; MEETING IN SESSION &#9670;
              {hudStats.meetingType === "manual" && (
                <span style={{ color: "#f59e0b" }}> [CALLED]</span>
              )}
            </div>
            <div className="text-[8px] mt-1" style={{ color: "#a855f788" }}>
              {hudStats.meetingAgents.join(" / ")}
            </div>
            <button
              onClick={dismissMeeting}
              className="mt-2 px-3 py-0.5 rounded text-[9px] font-mono transition-all hover:border-[#ff2d5e88] hover:text-[#ff2d5e]"
              style={{
                color: "#ff2d5e88",
                border: "1px solid #ff2d5e33",
                background: "#05080fcc",
              }}
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* -- HUD: Meeting controls + back button (top-right) --------- */}
      <div className="absolute top-4 right-6 z-10 flex gap-2">
        <button
          onClick={() => setMeetingPanelOpen(!meetingPanelOpen)}
          className="arena-hud-panel px-3 py-1.5 rounded text-xs font-mono transition-all hover:border-[#f59e0b55]"
          style={{
            color: meetingPanelOpen ? "#f59e0b" : "#f59e0b88",
            borderColor: meetingPanelOpen ? "#f59e0b55" : "#f59e0b22",
          }}
        >
          &#9670; CALL MEETING
        </button>
        <a
          href="/agent"
          className="arena-hud-panel px-3 py-1.5 rounded text-xs font-mono transition-all hover:border-[#00f0ff55]"
          style={{ color: "#00f0ff88", borderColor: "#00f0ff22" }}
        >
          &larr; DASHBOARD
        </a>
      </div>

      {/* -- Meeting panel (agent picker) ----------------------------- */}
      {meetingPanelOpen && (
        <div
          className="absolute top-14 right-6 z-20 p-4 rounded font-mono"
          style={{
            background: "#0a0e1af0",
            border: "1px solid #f59e0b33",
            backdropFilter: "blur(12px)",
            minWidth: "220px",
          }}
        >
          <div
            className="text-[9px] uppercase tracking-wider mb-3"
            style={{ color: "#f59e0b88" }}
          >
            SELECT AGENTS FOR MEETING
          </div>

          {/* Agent checkboxes */}
          <div className="space-y-1.5 mb-3">
            {ARENA_AGENTS.map((a) => {
              const checked = selectedAgents.has(a.id);
              return (
                <label
                  key={a.id}
                  className="flex items-center gap-2 cursor-pointer text-[11px]"
                  style={{ color: checked ? a.colorHex : "#4a6a8a" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedAgents((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.id)) {
                          if (a.id === "main") return next;
                          next.delete(a.id);
                        } else {
                          next.add(a.id);
                        }
                        return next;
                      });
                    }}
                    className="accent-[#f59e0b]"
                    style={{ width: 12, height: 12 }}
                  />
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: a.colorHex,
                      boxShadow: checked ? `0 0 6px ${a.colorHex}` : "none",
                      opacity: checked ? 1 : 0.3,
                    }}
                  />
                  {a.label}
                </label>
              );
            })}
          </div>

          {/* Quick presets */}
          <div
            className="text-[9px] uppercase tracking-wider mb-2"
            style={{ color: "#4a6a8a" }}
          >
            QUICK PRESETS
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              { label: "Intel", ids: ["main", "briefing", "oracle", "alchemist"] },
              { label: "Dev", ids: ["main", "web3dev", "akua", "basedintern"] },
              { label: "Token", ids: ["main", "alchemist", "oracle", "web3dev"] },
              { label: "All", ids: ARENA_AGENTS.map((a) => a.id) },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => setSelectedAgents(new Set(preset.ids))}
                className="px-2 py-0.5 rounded text-[9px] transition-all hover:border-[#f59e0b55]"
                style={{
                  color: "#f59e0b88",
                  border: "1px solid #f59e0b22",
                  background: "#05080fcc",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Call / Cancel buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => callMeeting(Array.from(selectedAgents))}
              disabled={selectedAgents.size < 2}
              className="flex-1 px-3 py-1.5 rounded text-xs font-bold transition-all"
              style={{
                color: selectedAgents.size < 2 ? "#4a6a8a" : "#05080f",
                background: selectedAgents.size < 2 ? "#1a2538" : "#f59e0b",
                border: "1px solid #f59e0b44",
                cursor: selectedAgents.size < 2 ? "not-allowed" : "pointer",
              }}
            >
              CALL ({selectedAgents.size})
            </button>
            <button
              onClick={() => setMeetingPanelOpen(false)}
              className="px-3 py-1.5 rounded text-xs transition-all hover:border-[#ff444444]"
              style={{
                color: "#ff444488",
                border: "1px solid #ff444422",
                background: "#05080fcc",
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* -- HUD: Stats + Event Log (bottom-left) -------------------- */}
      <div className="absolute bottom-4 left-6 z-10 pointer-events-none select-none" style={{ maxWidth: 320 }}>
        {/* System Status */}
        <div className="arena-hud-panel p-3 rounded mb-2 relative overflow-hidden">
          <div className="arena-radar" />
          <div
            className="text-[9px] font-mono uppercase tracking-[0.3em] mb-2 flex items-center gap-2"
            style={{ color: "#00f0ff66" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
              <rect x="1" y="1" width="3" height="3" fill="#00f0ff" opacity="0.6" />
              <rect x="6" y="1" width="3" height="3" fill="#00f0ff" opacity="0.3" />
              <rect x="1" y="6" width="3" height="3" fill="#00f0ff" opacity="0.3" />
              <rect x="6" y="6" width="3" height="3" fill="#00f0ff" opacity="0.6" />
            </svg>
            SYSTEM STATUS
          </div>
          <div className="flex gap-5 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="arena-pulse-dot" style={{ background: "#39ff14", boxShadow: "0 0 6px #39ff14" }} />
              <span style={{ color: "#39ff14", fontSize: 16, fontWeight: 700 }}>{hudStats.online}</span>
              <span style={{ color: "#4a6a8a", fontSize: 10 }}>ONLINE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="arena-pulse-dot" style={{ background: "#f59e0b", boxShadow: "0 0 6px #f59e0b", animationDelay: "0.5s" }} />
              <span style={{ color: "#f59e0b", fontSize: 16, fontWeight: 700 }}>{hudStats.activeCommands}</span>
              <span style={{ color: "#4a6a8a", fontSize: 10 }}>ACTIVE</span>
            </div>
            {hudStats.meetingActive && (
              <div className="flex items-center gap-1.5">
                <span className="arena-pulse-dot" style={{ background: "#a855f7", boxShadow: "0 0 6px #a855f7", animationDelay: "1s" }} />
                <span style={{ color: "#a855f7", fontSize: 16, fontWeight: 700 }}>{hudStats.meetingAgents.length}</span>
                <span style={{ color: "#4a6a8a", fontSize: 10 }}>MTG</span>
              </div>
            )}
          </div>
        </div>

        {/* Event Log */}
        {eventLog.length > 0 && (
          <div className="arena-hud-panel p-3 rounded">
            <div
              className="text-[9px] font-mono uppercase tracking-[0.3em] mb-2"
              style={{ color: "#00f0ff44" }}
            >
              &#9656; EVENT LOG
            </div>
            <div className="space-y-[3px]">
              {eventLog.map((e) => (
                <div
                  key={e.id}
                  className="arena-event-entry flex items-start gap-2 text-[10px] font-mono"
                >
                  <span style={{ color: "#4a6a8a", flexShrink: 0, fontSize: 9 }}>{e.time}</span>
                  <span style={{ color: eventColor[e.type], opacity: 0.9 }}>{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* -- HUD: Legend (bottom-right) ------------------------------ */}
      <div className="absolute bottom-4 right-6 z-10 pointer-events-none select-none">
        <div className="arena-hud-panel p-3 rounded">
          <div
            className="text-[9px] font-mono uppercase tracking-[0.3em] mb-2 flex items-center gap-2"
            style={{ color: "#00f0ff44" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
              <circle cx="5" cy="5" r="3" fill="none" stroke="#00f0ff" strokeWidth="0.8" opacity="0.5" />
              <circle cx="5" cy="5" r="1.2" fill="#00f0ff" opacity="0.6" />
            </svg>
            AGENTS ({hudStats.online}/{ARENA_AGENTS.length})
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-[3px]">
            {ARENA_AGENTS.map((a) => {
              const isOnline = nodeStatesRef.current.get(a.id) !== "offline";
              const isBusy = busyAgentsRef.current.has(a.id);
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 text-[10px] font-mono"
                >
                  <span
                    className={isOnline ? "arena-pulse-dot" : ""}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: isOnline ? a.colorHex : "#1a2538",
                      boxShadow: isOnline ? `0 0 5px ${a.colorHex}` : "none",
                    }}
                  />
                  <span
                    style={{
                      color: isOnline ? a.colorHex : "#2a3a4a",
                      fontWeight: isBusy ? 700 : 400,
                    }}
                  >
                    {a.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* -- Floating agent labels ----------------------------------- */}
      {labelPositions.map((lbl) => (
        <div
          key={lbl.id}
          className="absolute z-10 pointer-events-none select-none text-center"
          style={{
            left: lbl.x,
            top: lbl.y + 30,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="text-[8px] font-mono tracking-wider"
            style={{
              color: lbl.colorHex,
              textShadow: `0 0 6px ${lbl.colorHex}44`,
            }}
          >
            {lbl.label}
          </div>
        </div>
      ))}
    </div>
  );
}
