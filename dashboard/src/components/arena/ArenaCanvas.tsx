"use client";

import { useRef, useEffect, useState } from "react";
import { ARENA_AGENTS } from "./agents";
import { useArenaEvents, type ArenaHandlers } from "./useArenaEvents";
import type { NodesApi } from "./renderer/nodes";
import type { EffectsApi } from "./renderer/effects";

interface HudStats {
  online: number;
  activeCommands: number;
  lastEvent: string;
}

export default function ArenaCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesApiRef = useRef<NodesApi | null>(null);
  const effectsApiRef = useRef<EffectsApi | null>(null);
  const activeCommandsRef = useRef(new Set<string>());
  const nodeStatesRef = useRef(new Map<string, string>());

  const [hudStats, setHudStats] = useState<HudStats>({
    online: 0,
    activeCommands: 0,
    lastEvent: "Initializing...",
  });

  const [labelPositions, setLabelPositions] = useState<
    { id: string; label: string; colorHex: string; x: number; y: number }[]
  >([]);

  // -- Arena event handlers (imperative, called by useArenaEvents) ----
  const handlersRef = useRef<ArenaHandlers>({
    onStatus(agentId, status) {
      nodesApiRef.current?.setState(agentId, status);
      nodeStatesRef.current.set(agentId, status);
      const online = Array.from(nodeStatesRef.current.values()).filter(
        (s) => s !== "offline",
      ).length;
      setHudStats((s) => ({
        ...s,
        online,
        lastEvent: `${agentId} ${status}`,
      }));
    },
    onCommand(commandId, agentId, message) {
      activeCommandsRef.current.add(commandId);
      nodesApiRef.current?.setState(agentId, "busy");
      effectsApiRef.current?.commandPulse(agentId);
      effectsApiRef.current?.streamStart(agentId);
      setHudStats((s) => ({
        ...s,
        activeCommands: activeCommandsRef.current.size,
        lastEvent: `CMD > ${agentId}: ${message.slice(0, 40)}`,
      }));
    },
    onChunk(_commandId, agentId) {
      effectsApiRef.current?.streamStart(agentId);
    },
    onComplete(commandId, agentId, status) {
      activeCommandsRef.current.delete(commandId);
      effectsApiRef.current?.streamStop(agentId);
      if (status === "completed") {
        effectsApiRef.current?.completionBurst(agentId);
        nodesApiRef.current?.setState(agentId, "idle");
      } else {
        effectsApiRef.current?.failureGlitch(agentId);
        nodesApiRef.current?.setState(agentId, "idle");
      }
      setHudStats((s) => ({
        ...s,
        activeCommands: activeCommandsRef.current.size,
        lastEvent: `${status === "completed" ? "OK" : "FAIL"} ${agentId}`,
      }));
    },
    onControl(agentId, enabled) {
      if (!enabled) {
        nodesApiRef.current?.setState(agentId, "offline");
      }
      setHudStats((s) => ({
        ...s,
        lastEvent: `${agentId} ${enabled ? "enabled" : "disabled"}`,
      }));
    },
  });

  // Connect to Supabase realtime
  useArenaEvents(handlersRef);

  // -- Initialize PixiJS ----------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    let cleanupBg: (() => void) | null = null;

    (async () => {
      const { Application } = await import("pixi.js");
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

      // Init renderers (dynamic import keeps pixi.js out of SSR bundle)
      const { initBackground } = await import("./renderer/background");
      const { initNodes } = await import("./renderer/nodes");
      const { initEffects } = await import("./renderer/effects");
      if (destroyed) {
        app.destroy();
        return;
      }

      cleanupBg = initBackground(app);
      const nodesApi = initNodes(app);
      const effectsApi = initEffects(app, nodesApi);

      nodesApiRef.current = nodesApi;
      effectsApiRef.current = effectsApi;

      // Compute initial label positions
      setLabelPositions(
        ARENA_AGENTS.map((cfg) => ({
          id: cfg.id,
          label: cfg.label,
          colorHex: cfg.colorHex,
          x: cfg.position.x * app.screen.width,
          y: cfg.position.y * app.screen.height,
        })),
      );

      // Resize handler
      const ro = new ResizeObserver(() => {
        if (destroyed) return;
        const w = app.screen.width;
        const h = app.screen.height;
        nodesApi.resize(w, h);
        setLabelPositions(
          ARENA_AGENTS.map((cfg) => ({
            id: cfg.id,
            label: cfg.label,
            colorHex: cfg.colorHex,
            x: cfg.position.x * w,
            y: cfg.position.y * h,
          })),
        );
      });
      ro.observe(el);

      // Store cleanup for resize observer
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
      nodesApiRef.current = null;
      effectsApiRef.current = null;
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

      {/* ── HUD: Title (top-left) ─────────────────────── */}
      <div className="absolute top-4 left-6 z-10 pointer-events-none select-none">
        <h1
          className="text-xl font-mono font-bold tracking-[0.25em]"
          style={{ color: "#00f0ff", textShadow: "0 0 20px #00f0ff44" }}
        >
          XMETAV ARENA
        </h1>
        <p
          className="text-[10px] font-mono mt-1 tracking-wider"
          style={{ color: "#00f0ff33" }}
        >
          REAL-TIME AGENT VISUALIZATION
        </p>
      </div>

      {/* ── HUD: Back button (top-right) ──────────────── */}
      <a
        href="/agent"
        className="absolute top-4 right-6 z-10 px-3 py-1.5 rounded text-xs font-mono transition-all hover:border-[#00f0ff55]"
        style={{
          color: "#00f0ff88",
          border: "1px solid #00f0ff22",
          background: "#05080fcc",
        }}
      >
        &larr; DASHBOARD
      </a>

      {/* ── HUD: Stats (bottom-left) ─────────────────── */}
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

      {/* ── HUD: Legend (bottom-right) ────────────────── */}
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

      {/* ── Floating agent labels ─────────────────────── */}
      {labelPositions.map((lbl) => (
        <div
          key={lbl.id}
          className="absolute z-10 pointer-events-none select-none text-center"
          style={{
            left: lbl.x,
            top: lbl.y + 55,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="text-[9px] font-mono tracking-wider"
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
