"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ARENA_AGENTS } from "./agents";
import { useArenaEvents, type ArenaHandlers } from "./useArenaEvents";
import type { NodesApi } from "./renderer/avatars";
import type { EffectsApi } from "./renderer/effects";
import type { OfficeApi } from "./renderer/office";

interface HudStats {
  online: number;
  activeCommands: number;
  lastEvent: string;
  meetingActive: boolean;
  meetingAgents: string[];
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

  const [hudStats, setHudStats] = useState<HudStats>({
    online: 0,
    activeCommands: 0,
    lastEvent: "Initializing...",
    meetingActive: false,
    meetingAgents: [],
  });

  const [labelPositions, setLabelPositions] = useState<
    { id: string; label: string; colorHex: string; x: number; y: number }[]
  >([]);

  // -- Meeting detection (stable callback via refs) ---------------------
  const checkMeetingRef = useRef<() => void>(() => {});
  const checkMeeting = useCallback(() => {
    const busyCount = busyAgentsRef.current.size;
    const busyIds = Array.from(busyAgentsRef.current);

    console.log("[arena] checkMeeting:", busyCount, "busy →", busyIds, "meetingActive:", meetingActiveRef.current);

    if (busyCount >= 2 && !meetingActiveRef.current) {
      console.log("[arena] >>> STARTING MEETING", busyIds);
      meetingActiveRef.current = true;
      nodesApiRef.current?.startMeeting(busyIds);
      effectsApiRef.current?.meetingStart(busyIds);
      officeApiRef.current?.setMeetingMode(true);
      setHudStats((s) => ({
        ...s,
        meetingActive: true,
        meetingAgents: busyIds,
        lastEvent: `MEETING: ${busyIds.length} agents at table`,
      }));
    } else if (busyCount >= 2 && meetingActiveRef.current) {
      // Update meeting agents (new agent joined)
      nodesApiRef.current?.startMeeting(busyIds);
      effectsApiRef.current?.meetingStart(busyIds);
      setHudStats((s) => ({
        ...s,
        meetingAgents: busyIds,
      }));
    } else if (busyCount < 2 && meetingActiveRef.current) {
      console.log("[arena] >>> ENDING MEETING");
      meetingActiveRef.current = false;
      nodesApiRef.current?.endMeeting();
      effectsApiRef.current?.meetingEnd();
      officeApiRef.current?.setMeetingMode(false);
      setHudStats((s) => ({
        ...s,
        meetingActive: false,
        meetingAgents: [],
        lastEvent: "Meeting ended",
      }));
    }
  }, []);

  // Keep checkMeeting ref current for use in the async PixiJS init
  checkMeetingRef.current = checkMeeting;

  // -- Arena event handlers (updated every render via ref assignment) --
  const handlersRef = useRef<ArenaHandlers | null>(null);

  // Assign fresh handlers on every render so closures stay current
  handlersRef.current = {
    onStatus(agentId, status) {
      nodesApiRef.current?.setState(agentId, status);
      const screenState =
        status === "busy" ? "busy" : status === "offline" ? "off" : "idle";
      officeApiRef.current?.setScreenState(agentId, screenState);

      nodeStatesRef.current.set(agentId, status);

      // Also track busy from status events
      if (status === "busy") {
        busyAgentsRef.current.add(agentId);
      } else {
        busyAgentsRef.current.delete(agentId);
      }

      const online = Array.from(nodeStatesRef.current.values()).filter(
        (s) => s !== "offline",
      ).length;
      setHudStats((s) => ({
        ...s,
        online,
        lastEvent: `${agentId} ${status}`,
      }));
      checkMeeting();
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
      checkMeeting();
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

      // Resize handler
      const ro = new ResizeObserver(() => {
        if (destroyed) return;
        const newOff = getSceneOffset(
          app.screen.width,
          app.screen.height,
        );
        scene.position.set(newOff.x, newOff.y);
        updateLabels();
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

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: "#05080f" }}
    >
      {/* PixiJS canvas mount point */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* -- HUD: Title (top-left) ----------------------------------- */}
      <div className="absolute top-4 left-6 z-10 pointer-events-none select-none">
        <h1
          className="text-xl font-mono font-bold tracking-[0.25em]"
          style={{ color: "#00f0ff", textShadow: "0 0 20px #00f0ff44" }}
        >
          XMETAV HQ
        </h1>
        <p
          className="text-[10px] font-mono mt-1 tracking-wider"
          style={{ color: "#00f0ff33" }}
        >
          COMMAND CENTER LIVE VIEW
        </p>
      </div>

      {/* -- HUD: Meeting indicator (top-center) ---------------------- */}
      {hudStats.meetingActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none">
          <div
            className="px-4 py-2 rounded font-mono text-xs tracking-widest text-center animate-pulse"
            style={{
              color: "#00f0ff",
              border: "1px solid #00f0ff33",
              background: "#05080fdd",
              backdropFilter: "blur(8px)",
              textShadow: "0 0 12px #00f0ffaa",
            }}
          >
            <div className="text-[10px] mb-0.5" style={{ color: "#00f0ff88" }}>
              MEETING IN SESSION
            </div>
            <div className="text-[8px]" style={{ color: "#00f0ff55" }}>
              {hudStats.meetingAgents.join(" / ")}
            </div>
          </div>
        </div>
      )}

      {/* -- HUD: Back button + Debug (top-right) -------------------- */}
      <div className="absolute top-4 right-6 z-10 flex gap-2">
        <button
          onClick={() => {
            // Force-trigger a meeting with all available agents for testing
            const testIds = ["main", "akua", "basedintern"];
            console.log("[arena] MANUAL MEETING TRIGGER:", testIds);
            for (const id of testIds) {
              busyAgentsRef.current.add(id);
              nodesApiRef.current?.setState(id, "busy");
              officeApiRef.current?.setScreenState(id, "busy");
            }
            checkMeeting();
          }}
          className="px-3 py-1.5 rounded text-xs font-mono transition-all hover:border-[#f59e0b55]"
          style={{
            color: "#f59e0b88",
            border: "1px solid #f59e0b22",
            background: "#05080fcc",
          }}
        >
          TEST MEETING
        </button>
        <a
          href="/agent"
          className="px-3 py-1.5 rounded text-xs font-mono transition-all hover:border-[#00f0ff55]"
          style={{
            color: "#00f0ff88",
            border: "1px solid #00f0ff22",
            background: "#05080fcc",
          }}
        >
          &larr; DASHBOARD
        </a>
      </div>

      {/* -- HUD: Stats (bottom-left) -------------------------------- */}
      <div
        className="absolute bottom-4 left-6 z-10 p-3 rounded pointer-events-none select-none"
        style={{
          background: "#05080fdd",
          border: "1px solid #00f0ff15",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          className="text-[9px] font-mono uppercase tracking-wider mb-2"
          style={{ color: "#00f0ff44" }}
        >
          SYSTEM STATUS
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <div>
            <span style={{ color: "#39ff14" }}>{hudStats.online}</span>
            <span style={{ color: "#4a6a8a" }}> online</span>
          </div>
          <div>
            <span style={{ color: "#f59e0b" }}>
              {hudStats.activeCommands}
            </span>
            <span style={{ color: "#4a6a8a" }}> active</span>
          </div>
        </div>
        <div
          className="text-[10px] font-mono mt-1.5 max-w-[200px] truncate"
          style={{ color: "#00f0ff55" }}
        >
          {hudStats.lastEvent}
        </div>
      </div>

      {/* -- HUD: Legend (bottom-right) ------------------------------ */}
      <div
        className="absolute bottom-4 right-6 z-10 p-3 rounded pointer-events-none select-none"
        style={{
          background: "#05080fdd",
          border: "1px solid #00f0ff15",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          className="text-[9px] font-mono uppercase tracking-wider mb-2"
          style={{ color: "#00f0ff44" }}
        >
          AGENTS
        </div>
        <div className="space-y-1">
          {ARENA_AGENTS.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 text-[10px] font-mono"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: a.colorHex,
                  boxShadow: `0 0 4px ${a.colorHex}`,
                }}
              />
              <span style={{ color: a.colorHex }}>{a.label}</span>
            </div>
          ))}
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
