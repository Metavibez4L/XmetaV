"use client";

import React, { useRef, useEffect, useMemo, useCallback } from "react";
import { useSwarmRuns } from "@/hooks/useSwarmRuns";
import { ARENA_AGENTS } from "@/components/arena/agents";
import { Network, Zap, GitBranch } from "lucide-react";

/* ── Constants ─────────────────────────────────────────────── */

const AGENT_COLORS: Record<string, string> = {};
for (const a of ARENA_AGENTS) {
  AGENT_COLORS[a.id] = a.colorHex;
}

const MODE_COLORS: Record<string, string> = {
  parallel: "#39ff14",
  pipeline: "#f59e0b",
  collaborative: "#a855f7",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#4a6a8a",
  running: "#00f0ff",
  completed: "#39ff14",
  failed: "#ff2d5e",
  skipped: "#4a6a8a",
  cancelled: "#4a6a8a",
};

/* ── Helpers ───────────────────────────────────────────────── */

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NodePos {
  id: string;
  x: number;
  y: number;
  color: string;
}

/* ── Component ─────────────────────────────────────────────── */

export const SwarmNetwork = React.memo(function SwarmNetwork() {
  const { runs, taskMap, fetchTasks } = useSwarmRuns();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // Get the most recent active or completed runs (up to 3)
  const relevantRuns = useMemo(() => {
    const active = runs.filter((r) => r.status === "running");
    const recent = runs
      .filter((r) => r.status !== "running")
      .slice(0, 3 - active.length);
    return [...active, ...recent].slice(0, 3);
  }, [runs]);

  // Fetch tasks for relevant runs
  useEffect(() => {
    for (const run of relevantRuns) {
      fetchTasks(run.id);
    }
  }, [relevantRuns, fetchTasks]);

  // Build node positions for the network graph
  const networkData = useMemo(() => {
    const allAgentIds = new Set<string>();
    const allLinks: {
      from: string;
      to: string;
      runId: string;
      mode: string;
      status: string;
    }[] = [];

    for (const run of relevantRuns) {
      const tasks = taskMap[run.id] ?? [];
      const agentIds = tasks.map((t) => t.agent_id);
      for (const id of agentIds) allAgentIds.add(id);

      if (run.mode === "pipeline") {
        for (let i = 0; i < agentIds.length - 1; i++) {
          allLinks.push({
            from: agentIds[i],
            to: agentIds[i + 1],
            runId: run.id,
            mode: run.mode,
            status: tasks[i]?.status ?? "pending",
          });
        }
      } else {
        // Hub and spoke — all connect through "main" or first agent
        const hub = agentIds.includes("main") ? "main" : agentIds[0];
        if (hub) allAgentIds.add(hub);
        for (const id of agentIds) {
          if (id !== hub) {
            const task = tasks.find((t) => t.agent_id === id);
            allLinks.push({
              from: hub,
              to: id,
              runId: run.id,
              mode: run.mode,
              status: task?.status ?? "pending",
            });
          }
        }
      }
    }

    // Position nodes in a circle
    const CW = 760;
    const CH = 280;
    const cx = CW / 2;
    const cy = CH / 2;
    const agents = Array.from(allAgentIds);
    const nodes: NodePos[] = agents.map((id, i) => {
      const angle = (i / Math.max(agents.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const radius = Math.min(CW, CH) * 0.32;
      return {
        id,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.75,
        color: AGENT_COLORS[id] ?? "#00f0ff",
      };
    });

    return { nodes, links: allLinks, agents };
  }, [relevantRuns, taskMap]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );
  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
  }, []);

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    const animate = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;
      ctx.clearRect(0, 0, W, H);

      // Background
      const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.55);
      bg.addColorStop(0, "rgba(8,5,18,0.98)");
      bg.addColorStop(1, "rgba(3,4,10,1)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Faint grid
      ctx.strokeStyle = "rgba(0,240,255,0.015)";
      ctx.lineWidth = 0.5;
      for (let gy = 0; gy < H; gy += 20) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }
      for (let gx = 0; gx < W; gx += 20) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }

      const { nodes, links } = networkData;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Draw links
      for (const link of links) {
        const fromNode = nodeMap.get(link.from);
        const toNode = nodeMap.get(link.to);
        if (!fromNode || !toNode) continue;

        const modeColor = MODE_COLORS[link.mode] ?? "#00f0ff";
        const statusColor = STATUS_COLORS[link.status] ?? "#4a6a8a";
        const isActive = link.status === "running";
        const pulse = isActive
          ? 0.3 + Math.sin(t * 3 + fromNode.x * 0.05) * 0.15
          : link.status === "completed"
            ? 0.2
            : 0.08;

        // Main link
        ctx.beginPath();
        const cpx = (fromNode.x + toNode.x) / 2 + Math.sin(t * 0.5 + fromNode.y * 0.1) * 6;
        const cpy = (fromNode.y + toNode.y) / 2 - 10;
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.quadraticCurveTo(cpx, cpy, toNode.x, toNode.y);
        ctx.strokeStyle = hexToRgba(statusColor, pulse);
        ctx.lineWidth = isActive ? 1.8 : 1;
        ctx.stroke();

        // Chromatic ghost
        ctx.beginPath();
        ctx.moveTo(fromNode.x + 1.5, fromNode.y);
        ctx.quadraticCurveTo(cpx + 1.5, cpy, toNode.x + 1.5, toNode.y);
        ctx.strokeStyle = hexToRgba("#ff006e", pulse * 0.25);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Data flow particle
        if (isActive) {
          const pt = (t * 0.7 + fromNode.x * 0.01) % 1;
          const px =
            (1 - pt) * (1 - pt) * fromNode.x +
            2 * (1 - pt) * pt * cpx +
            pt * pt * toNode.x;
          const py =
            (1 - pt) * (1 - pt) * fromNode.y +
            2 * (1 - pt) * pt * cpy +
            pt * pt * toNode.y;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(modeColor, 0.7);
          ctx.fill();
          // Glow
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(modeColor, 0.15);
          ctx.fill();
        }

        // Arrow for pipeline
        if (link.mode === "pipeline") {
          const mid = 0.7;
          const ax =
            (1 - mid) * (1 - mid) * fromNode.x +
            2 * (1 - mid) * mid * cpx +
            mid * mid * toNode.x;
          const ay =
            (1 - mid) * (1 - mid) * fromNode.y +
            2 * (1 - mid) * mid * cpy +
            mid * mid * toNode.y;
          const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(4, 0);
          ctx.lineTo(-3, -3);
          ctx.lineTo(-3, 3);
          ctx.closePath();
          ctx.fillStyle = hexToRgba(statusColor, pulse * 1.5);
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw nodes
      const mouse = mouseRef.current;
      for (const node of nodes) {
        const pulseR = 8 + Math.sin(t * 2 + node.x * 0.1) * 1.5;

        // Outer glow
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, pulseR * 2.5);
        glow.addColorStop(0, hexToRgba(node.color, 0.2));
        glow.addColorStop(1, hexToRgba(node.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, pulseR * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(node.color, 0.6);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(node.color, 0.8);
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Inner highlight
        ctx.beginPath();
        ctx.arc(node.x, node.y, pulseR * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(node.color, 0.3);
        ctx.fill();

        // Label
        const isHover = mouse && Math.hypot(node.x - mouse.x, node.y - mouse.y) < 25;
        ctx.font = isHover ? "bold 9px monospace" : "8px monospace";
        ctx.fillStyle = hexToRgba(node.color, isHover ? 0.9 : 0.5);
        ctx.textAlign = "center";
        ctx.fillText(node.id.toUpperCase(), node.x, node.y + pulseR + 12);
      }

      // Scanline
      const scanY = ((t * 35) % (H + 20)) - 10;
      ctx.fillStyle = "rgba(0,240,255,0.012)";
      ctx.fillRect(0, scanY, W, 2);

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [networkData]);

  // Stats
  const activeCount = relevantRuns.filter((r) => r.status === "running").length;
  const totalTasks = relevantRuns.reduce(
    (sum, r) => sum + (taskMap[r.id]?.length ?? 0),
    0,
  );
  const completedTasks = relevantRuns.reduce(
    (sum, r) =>
      sum +
      (taskMap[r.id]?.filter((t) => t.status === "completed").length ?? 0),
    0,
  );

  return (
    <div className="cyber-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4" style={{ color: "#39ff14" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#39ff14" }}
          >
            NEURAL SWARM
          </h2>
          {activeCount > 0 && (
            <span
              className="text-[9px] font-mono px-2 py-0.5 rounded animate-pulse"
              style={{
                color: "#00f0ff",
                background: "#00f0ff15",
                border: "1px solid #00f0ff22",
              }}
            >
              {activeCount} ACTIVE
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-3 text-[9px] font-mono"
          style={{ color: "#4a6a8a" }}
        >
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" style={{ color: "#39ff14" }} />
            PARALLEL
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" style={{ color: "#f59e0b" }} />
            PIPELINE
          </span>
          <span className="flex items-center gap-1">
            <Network className="h-3 w-3" style={{ color: "#a855f7" }} />
            COLLAB
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative rounded overflow-hidden"
        style={{
          border: "1px solid #39ff1415",
          background: "#020408",
        }}
      >
        <canvas
          ref={canvasRef}
          width={760}
          height={280}
          className="w-full"
          style={{ imageRendering: "auto" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />

        {/* Overlay stats */}
        <div
          className="absolute top-2 left-3 text-[8px] font-mono flex flex-col gap-0.5"
          style={{ color: "#39ff1444" }}
        >
          <span>SWARMS: {relevantRuns.length}</span>
          <span>
            TASKS: {completedTasks}/{totalTasks}
          </span>
        </div>

        {/* Corner decorations */}
        <div
          className="absolute top-0 left-0 w-4 h-4"
          style={{
            borderTop: "1px solid #39ff1430",
            borderLeft: "1px solid #39ff1430",
          }}
        />
        <div
          className="absolute top-0 right-0 w-4 h-4"
          style={{
            borderTop: "1px solid #39ff1430",
            borderRight: "1px solid #39ff1430",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-4 h-4"
          style={{
            borderBottom: "1px solid #39ff1430",
            borderLeft: "1px solid #39ff1430",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-4 h-4"
          style={{
            borderBottom: "1px solid #39ff1430",
            borderRight: "1px solid #39ff1430",
          }}
        />

        {/* Empty state */}
        {relevantRuns.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Network
                className="h-6 w-6 mx-auto mb-2"
                style={{ color: "#39ff1422" }}
              />
              <p
                className="text-[10px] font-mono"
                style={{ color: "#4a6a8a" }}
              >
                No swarm activity detected
              </p>
              <p
                className="text-[8px] font-mono mt-1"
                style={{ color: "#4a6a8a66" }}
              >
                Neural links appear when swarm runs are active
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Run status ticker */}
      {relevantRuns.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {relevantRuns.map((run) => {
            const modeColor = MODE_COLORS[run.mode] ?? "#00f0ff";
            const statusColor = STATUS_COLORS[run.status] ?? "#4a6a8a";
            const tasks = taskMap[run.id] ?? [];
            const done = tasks.filter(
              (t) => t.status === "completed",
            ).length;
            return (
              <div
                key={run.id}
                className="flex-shrink-0 px-2.5 py-1.5 rounded text-[8px] font-mono"
                style={{
                  color: modeColor,
                  background: hexToRgba(modeColor, 0.06),
                  border: `1px solid ${hexToRgba(modeColor, 0.15)}`,
                  minWidth: 140,
                }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="truncate" style={{ maxWidth: 90 }}>
                    {run.name}
                  </span>
                  <span
                    className={
                      run.status === "running" ? "animate-pulse" : ""
                    }
                    style={{ color: statusColor }}
                  >
                    {run.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: "#4a6a8a" }}>
                    {run.mode.toUpperCase()}
                  </span>
                  <span style={{ color: "#4a6a8a" }}>
                    {done}/{tasks.length} tasks
                  </span>
                  <span style={{ color: "#4a6a8a66" }}>
                    {timeSince(run.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
