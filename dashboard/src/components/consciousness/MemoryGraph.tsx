"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { MemoryNode, MemoryEdge } from "@/hooks/useConsciousness";
import { Maximize2, Minimize2 } from "lucide-react";

/* ── Force-directed layout ──────────────────────────────── */

interface GraphNode {
  id: string;
  label: string;
  kind: string;
  agentId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
  strength: number;
  type: string;
}

const KIND_COLORS: Record<string, string> = {
  observation: "#00f0ff",
  outcome: "#39ff14",
  fact: "#a855f7",
  error: "#ef4444",
  goal: "#f59e0b",
  note: "#38bdf8",
};

const AGENT_CLUSTER_OFFSET: Record<string, { x: number; y: number }> = {
  main: { x: -80, y: -60 },
  soul: { x: 80, y: -60 },
  _shared: { x: 0, y: 80 },
  oracle: { x: -120, y: 40 },
  briefing: { x: 120, y: 40 },
  alchemist: { x: -60, y: 100 },
  web3dev: { x: 60, y: 100 },
  akua: { x: -140, y: -20 },
  basedintern: { x: 140, y: -20 },
};

function truncate(s: string, maxLen = 40): string {
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

interface Props {
  memories: MemoryNode[];
  associations: MemoryEdge[];
}

export const MemoryGraph = React.memo(function MemoryGraph({
  memories,
  associations,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const frameRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({
    nodeId: null, offsetX: 0, offsetY: 0,
  });
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Build graph data from memories and associations
  useEffect(() => {
    const nodeMap = new Map<string, GraphNode>();
    const cw = containerRef.current?.clientWidth ?? 600;
    const ch = containerRef.current?.clientHeight ?? 400;
    const cx = cw / 2;
    const cy = ch / 2;

    // Use the most recent 80 memories for performance
    const recent = memories.slice(0, 80);

    recent.forEach((m, i) => {
      const offset = AGENT_CLUSTER_OFFSET[m.agent_id] ?? { x: 0, y: 0 };
      nodeMap.set(m.id, {
        id: m.id,
        label: truncate(m.content),
        kind: m.kind,
        agentId: m.agent_id,
        x: cx + offset.x + (Math.random() - 0.5) * 100,
        y: cy + offset.y + (Math.random() - 0.5) * 100,
        vx: 0,
        vy: 0,
        radius: 5 + Math.min(m.content.length / 50, 8),
      });
    });

    const nodeIds = new Set(nodeMap.keys());
    const edges: GraphEdge[] = associations
      .filter((a) => nodeIds.has(a.memory_id) && nodeIds.has(a.related_memory_id))
      .map((a) => ({
        source: a.memory_id,
        target: a.related_memory_id,
        strength: a.strength,
        type: a.association_type,
      }));

    nodesRef.current = Array.from(nodeMap.values());
    edgesRef.current = edges;
  }, [memories, associations]);

  // Force simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let iteration = 0;

    function resize() {
      if (!canvas || !containerRef.current) return;
      canvas.width = containerRef.current.clientWidth * devicePixelRatio;
      canvas.height = containerRef.current.clientHeight * devicePixelRatio;
      canvas.style.width = containerRef.current.clientWidth + "px";
      canvas.style.height = containerRef.current.clientHeight + "px";
      ctx?.scale(devicePixelRatio, devicePixelRatio);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current!);

    function tick() {
      if (!running || !ctx || !canvas) return;

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const w = canvas.width / devicePixelRatio;
      const h = canvas.height / devicePixelRatio;

      // Cool down simulation over time
      const alpha = Math.max(0.001, 0.3 * Math.pow(0.99, iteration));
      iteration++;

      // Apply forces
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (800 / (dist * dist)) * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Spring for edges
      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 60 + (1 - edge.strength) * 40;
        const force = ((dist - target) * 0.03 * edge.strength) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      // Center gravity
      const cx = w / 2;
      const cy = h / 2;
      for (const node of nodes) {
        if (dragRef.current.nodeId === node.id) continue;
        node.vx += (cx - node.x) * 0.001 * alpha;
        node.vy += (cy - node.y) * 0.001 * alpha;
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;
        // Clamp
        node.x = Math.max(20, Math.min(w - 20, node.x));
        node.y = Math.max(20, Math.min(h - 20, node.y));
      }

      // Render
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(scaleRef.current, scaleRef.current);

      // Edges
      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) continue;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.08 + edge.strength * 0.12})`;
        ctx.lineWidth = 0.5 + edge.strength * 1.5;
        ctx.stroke();
      }

      // Nodes
      for (const node of nodes) {
        const color = KIND_COLORS[node.kind] ?? "#4a6a8a";
        // Glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 3, 0, Math.PI * 2);
        ctx.fillStyle = color + "15";
        ctx.fill();
        // Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = color + "cc";
        ctx.fill();
        ctx.strokeStyle = color + "44";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, []);

  // Mouse interaction
  const getNodeAtPos = useCallback(
    (mx: number, my: number): GraphNode | null => {
      const px = (mx - panRef.current.x) / scaleRef.current;
      const py = (my - panRef.current.y) / scaleRef.current;
      for (const node of nodesRef.current) {
        const dx = px - node.x;
        const dy = py - node.y;
        if (dx * dx + dy * dy < (node.radius + 4) ** 2) return node;
      }
      return null;
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAtPos(x, y);
      if (node) {
        dragRef.current = {
          nodeId: node.id,
          offsetX: node.x - (x - panRef.current.x) / scaleRef.current,
          offsetY: node.y - (y - panRef.current.y) / scaleRef.current,
        };
      }
    },
    [getNodeAtPos],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragRef.current.nodeId) {
        const node = nodesRef.current.find(
          (n) => n.id === dragRef.current.nodeId,
        );
        if (node) {
          node.x =
            (x - panRef.current.x) / scaleRef.current +
            dragRef.current.offsetX;
          node.y =
            (y - panRef.current.y) / scaleRef.current +
            dragRef.current.offsetY;
          node.vx = 0;
          node.vy = 0;
        }
      } else {
        const node = getNodeAtPos(x, y);
        setHoveredNode(node);
      }
    },
    [getNodeAtPos],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current.nodeId = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scaleRef.current = Math.max(0.3, Math.min(3, scaleRef.current * delta));
  }, []);

  // Count clusters by agent
  const clusters = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memories.slice(0, 80)) {
      map.set(m.agent_id, (map.get(m.agent_id) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [memories]);

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-sm font-mono font-bold tracking-wider"
          style={{ color: "#a855f7" }}
        >
          MEMORY GRAPH
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {clusters.map(([agent, count]) => (
              <span
                key={agent}
                className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  color: "#4a6a8a",
                  border: "1px solid #4a6a8a33",
                }}
              >
                {agent}: {count}
              </span>
            ))}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded transition-colors hover:bg-white/5"
            style={{ color: "#4a6a8a" }}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {Object.entries(KIND_COLORS).map(([kind, color]) => (
          <div key={kind} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: color, boxShadow: `0 0 4px ${color}44` }}
            />
            <span className="text-[8px] font-mono uppercase" style={{ color: "#4a6a8a" }}>
              {kind}
            </span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative rounded overflow-hidden"
        style={{
          height: expanded ? 500 : 300,
          background: "#05080f",
          border: "1px solid #00f0ff10",
          transition: "height 0.3s ease",
        }}
      >
        <canvas
          ref={canvasRef}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />

        {/* Tooltip */}
        {hoveredNode && (
          <div
            className="absolute pointer-events-none px-3 py-2 rounded text-[10px] font-mono max-w-[250px]"
            style={{
              left: hoveredNode.x * scaleRef.current + panRef.current.x + 15,
              top: hoveredNode.y * scaleRef.current + panRef.current.y - 10,
              background: "#0a0f1af0",
              border: `1px solid ${KIND_COLORS[hoveredNode.kind] ?? "#4a6a8a"}33`,
              backdropFilter: "blur(8px)",
              color: "#c8d6e5",
              zIndex: 50,
            }}
          >
            <div
              className="text-[9px] uppercase tracking-wider mb-1"
              style={{ color: KIND_COLORS[hoveredNode.kind] ?? "#4a6a8a" }}
            >
              {hoveredNode.kind} · {hoveredNode.agentId}
            </div>
            <div style={{ color: "#c8d6e5cc" }}>{hoveredNode.label}</div>
          </div>
        )}

        {/* Stats overlay */}
        <div
          className="absolute bottom-2 left-2 text-[9px] font-mono px-2 py-1 rounded"
          style={{
            color: "#4a6a8a",
            background: "#05080fcc",
            border: "1px solid #00f0ff10",
          }}
        >
          {nodesRef.current.length} nodes · {edgesRef.current.length} edges
        </div>
      </div>
    </div>
  );
});
