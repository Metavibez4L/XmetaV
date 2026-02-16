"use client";

import React, { useRef, useEffect, useMemo, useCallback } from "react";
import type { DreamInsight, MemoryEdge, MemoryNode } from "@/hooks/useConsciousness";
import { Sparkles, Zap, Globe } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

interface Props {
  dreamInsights: DreamInsight[];
  memories: MemoryNode[];
  associations: MemoryEdge[];
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  rotation: number;
  rotSpeed: number;
  label: string;
  kind: "memory" | "insight" | "association";
  pulse: number;
}

interface Bridge {
  from: Shard;
  to: Shard;
  strength: number;
  color: string;
}

/* ── Helpers ───────────────────────────────────────────────── */

const SHARD_COLORS: Record<string, string> = {
  memory: "#00f0ff",
  insight: "#ff006e",
  association: "#a855f7",
};

const CATEGORY_COLORS: Record<string, string> = {
  pattern: "#a855f7",
  recommendation: "#39ff14",
  summary: "#00f0ff",
  correction: "#ef4444",
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "…" : s;
}

/* ── Component ─────────────────────────────────────────────── */

export const DreamscapeView = React.memo(function DreamscapeView({
  dreamInsights,
  memories,
  associations,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const shardsRef = useRef<Shard[]>([]);
  const bridgesRef = useRef<Bridge[]>([]);
  const timeRef = useRef(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // Build shards from data
  const shardData = useMemo(() => {
    const shards: Shard[] = [];
    const CW = 760;
    const CH = 340;
    const centerX = CW / 2;
    const centerY = CH / 2;

    // Memory shards (sample up to 30)
    const memSample = memories.slice(0, 30);
    for (let i = 0; i < memSample.length; i++) {
      const m = memSample[i];
      const angle = (i / memSample.length) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 60 + Math.random() * 100;
      shards.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.6,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1,
        size: 3 + (m.content?.length ?? 0) * 0.02,
        color: SHARD_COLORS.memory,
        alpha: 0.5 + Math.random() * 0.3,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.008,
        label: truncate(m.kind || "memory", 12),
        kind: "memory",
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // Insight crystals
    for (let i = 0; i < dreamInsights.length; i++) {
      const d = dreamInsights[i];
      const angle =
        (i / Math.max(dreamInsights.length, 1)) * Math.PI * 2 +
        Math.PI / 4;
      const radius = 30 + Math.random() * 50;
      const catColor = CATEGORY_COLORS[d.category] ?? "#ff006e";
      shards.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.6,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.06,
        size: 5 + d.confidence * 4,
        color: catColor,
        alpha: 0.6 + d.confidence * 0.3,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.015,
        label: truncate(d.insight, 18),
        kind: "insight",
        pulse: Math.random() * Math.PI * 2,
      });
    }

    return shards;
  }, [memories, dreamInsights]);

  // Build bridges from associations
  const bridgeData = useMemo(() => {
    if (shardData.length < 2) return [];
    const bridges: Bridge[] = [];
    const memoryShards = shardData.filter((s) => s.kind === "memory");

    for (const assoc of associations.slice(0, 40)) {
      // Map to shards by index (rough mapping)
      const fromIdx = Math.abs(assoc.memory_id.charCodeAt(0)) % memoryShards.length;
      const toIdx = Math.abs(assoc.related_memory_id.charCodeAt(0)) % memoryShards.length;
      if (fromIdx !== toIdx && memoryShards[fromIdx] && memoryShards[toIdx]) {
        bridges.push({
          from: memoryShards[fromIdx],
          to: memoryShards[toIdx],
          strength: assoc.strength,
          color: "#a855f7",
        });
      }
    }

    // Connect insights to nearby memory shards
    const insightShards = shardData.filter((s) => s.kind === "insight");
    for (const ins of insightShards) {
      if (memoryShards.length === 0) break;
      const nearest = memoryShards.reduce((best, m) => {
        const d = Math.hypot(m.x - ins.x, m.y - ins.y);
        const bd = Math.hypot(best.x - ins.x, best.y - ins.y);
        return d < bd ? m : best;
      }, memoryShards[0]);
      bridges.push({
        from: ins,
        to: nearest,
        strength: 0.6,
        color: "#ff006e",
      });
    }

    return bridges;
  }, [shardData, associations]);

  // Initialize shards
  useEffect(() => {
    shardsRef.current = shardData.map((s) => ({ ...s }));
    bridgesRef.current = bridgeData;
  }, [shardData, bridgeData]);

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
  }, []);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const animate = () => {
      // Skip rendering when tab is hidden to save CPU/GPU
      if (document.hidden) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }
      timeRef.current += 0.016;
      const t = timeRef.current;

      ctx.clearRect(0, 0, W, H);

      // ── Background: dark void with subtle radial gradient ──
      const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.6);
      bg.addColorStop(0, "rgba(10,5,20,0.98)");
      bg.addColorStop(0.5, "rgba(5,8,18,0.99)");
      bg.addColorStop(1, "rgba(2,4,8,1)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ── Background grid (faint perspective lines) ──
      ctx.strokeStyle = "rgba(0,240,255,0.02)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 20; i++) {
        const gy = H * 0.3 + i * i * 1.2;
        if (gy > H) break;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }
      for (let i = -10; i <= 10; i++) {
        const topX = W / 2 + i * 6;
        const botX = W / 2 + i * 45;
        ctx.beginPath();
        ctx.moveTo(topX, H * 0.3);
        ctx.lineTo(botX, H);
        ctx.stroke();
      }

      // ── Draw synaptic bridges ──
      for (const bridge of bridgesRef.current) {
        const pulseAlpha =
          bridge.strength * 0.15 * (0.6 + Math.sin(t * 2 + bridge.from.x) * 0.4);
        ctx.beginPath();
        ctx.moveTo(bridge.from.x, bridge.from.y);
        // Curved bridge with control point
        const cpx = (bridge.from.x + bridge.to.x) / 2 + Math.sin(t + bridge.from.y) * 8;
        const cpy = (bridge.from.y + bridge.to.y) / 2 - 15;
        ctx.quadraticCurveTo(cpx, cpy, bridge.to.x, bridge.to.y);
        ctx.strokeStyle = hexToRgba(bridge.color, pulseAlpha);
        ctx.lineWidth = 0.5 + bridge.strength * 0.8;
        ctx.stroke();

        // Data flow particles along bridge
        if (Math.random() < 0.03 * bridge.strength) {
          const pt = 0.3 + Math.random() * 0.4;
          const px =
            (1 - pt) * (1 - pt) * bridge.from.x +
            2 * (1 - pt) * pt * cpx +
            pt * pt * bridge.to.x;
          const py =
            (1 - pt) * (1 - pt) * bridge.from.y +
            2 * (1 - pt) * pt * cpy +
            pt * pt * bridge.to.y;
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(bridge.color, 0.6);
          ctx.fill();
        }
      }

      // ── Draw shards ──
      const shards = shardsRef.current;
      const mouse = mouseRef.current;

      for (const shard of shards) {
        // Movement
        shard.x += shard.vx;
        shard.y += shard.vy;
        shard.rotation += shard.rotSpeed;
        shard.pulse += 0.03;

        // Mouse repulsion
        if (mouse) {
          const dx = shard.x - mouse.x;
          const dy = shard.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 80 && dist > 0) {
            const force = (80 - dist) * 0.003;
            shard.vx += (dx / dist) * force;
            shard.vy += (dy / dist) * force;
          }
        }

        // Boundary wrap
        if (shard.x < -20) shard.x = W + 20;
        if (shard.x > W + 20) shard.x = -20;
        if (shard.y < -20) shard.y = H + 20;
        if (shard.y > H + 20) shard.y = -20;

        // Damping
        shard.vx *= 0.998;
        shard.vy *= 0.998;

        const pulseScale = 1 + Math.sin(shard.pulse) * 0.15;
        const r = shard.size * pulseScale;

        ctx.save();
        ctx.translate(shard.x, shard.y);
        ctx.rotate(shard.rotation);

        if (shard.kind === "insight") {
          // Diamond crystal shape
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.3);
          ctx.lineTo(r, 0);
          ctx.lineTo(0, r * 1.3);
          ctx.lineTo(-r, 0);
          ctx.closePath();

          // Glow
          const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
          glow.addColorStop(0, hexToRgba(shard.color, 0.3));
          glow.addColorStop(1, hexToRgba(shard.color, 0));
          ctx.fillStyle = glow;
          ctx.fill();

          // Core
          ctx.fillStyle = hexToRgba(shard.color, shard.alpha * 0.8);
          ctx.fill();
          ctx.strokeStyle = hexToRgba(shard.color, shard.alpha);
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // Hexagonal shard
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          // Glow
          const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
          glow.addColorStop(0, hexToRgba(shard.color, 0.15));
          glow.addColorStop(1, hexToRgba(shard.color, 0));
          ctx.fillStyle = glow;
          ctx.fill();

          // Core
          ctx.fillStyle = hexToRgba(shard.color, shard.alpha * 0.5);
          ctx.fill();
          ctx.strokeStyle = hexToRgba(shard.color, shard.alpha * 0.7);
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }

        ctx.restore();

        // Label (on hover proximity)
        if (mouse) {
          const dist = Math.hypot(shard.x - mouse.x, shard.y - mouse.y);
          if (dist < 30) {
            ctx.font = "9px monospace";
            ctx.fillStyle = hexToRgba(shard.color, 0.8);
            ctx.textAlign = "center";
            ctx.fillText(shard.label, shard.x, shard.y - r - 6);
          }
        }
      }

      // ── Ambient particles (floating data motes) ──
      const particleCount = 40;
      for (let i = 0; i < particleCount; i++) {
        const px =
          W / 2 +
          Math.sin(t * 0.2 + i * 1.7) * (W * 0.4) +
          Math.cos(t * 0.1 + i * 2.3) * 30;
        const py =
          H / 2 +
          Math.cos(t * 0.15 + i * 1.3) * (H * 0.35) +
          Math.sin(t * 0.08 + i * 3.1) * 20;
        const pa = 0.08 + Math.sin(t * 1.5 + i * 0.7) * 0.06;
        ctx.beginPath();
        ctx.arc(px, py, 0.8 + Math.sin(t + i) * 0.3, 0, Math.PI * 2);
        ctx.fillStyle =
          i % 3 === 0
            ? `rgba(255,0,110,${pa})`
            : i % 3 === 1
              ? `rgba(168,85,247,${pa})`
              : `rgba(0,240,255,${pa})`;
        ctx.fill();
      }

      // ── Scanline overlay ──
      const scanY = ((t * 40) % (H + 20)) - 10;
      ctx.fillStyle = "rgba(0,240,255,0.015)";
      ctx.fillRect(0, scanY, W, 2);
      ctx.fillStyle = "rgba(0,240,255,0.006)";
      ctx.fillRect(0, scanY - 4, W, 10);

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Stats
  const insightCount = dreamInsights.length;
  const avgConfidence =
    insightCount > 0
      ? (dreamInsights.reduce((s, d) => s + d.confidence, 0) / insightCount).toFixed(2)
      : "—";
  const memoryCount = memories.length;
  const bridgeCount = associations.length;

  return (
    <div className="cyber-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4" style={{ color: "#a855f7" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#a855f7" }}
          >
            DREAMSCAPE
          </h2>
          <span
            className="text-[9px] font-mono px-2 py-0.5 rounded"
            style={{
              color: "#ff006e",
              background: "#ff006e15",
              border: "1px solid #ff006e22",
            }}
          >
            VISUALIZATION
          </span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "#00f0ff" }}
            />
            MEMORY ({memoryCount})
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{
                background: "#ff006e",
                transform: "rotate(45deg)",
              }}
            />
            INSIGHT ({insightCount})
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-[1px]"
              style={{ background: "#a855f7" }}
            />
            BRIDGE ({bridgeCount})
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative rounded overflow-hidden"
        style={{
          border: "1px solid #00f0ff15",
          background: "#020408",
        }}
      >
        <canvas
          ref={canvasRef}
          width={760}
          height={340}
          className="w-full"
          style={{ imageRendering: "auto" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />

        {/* Overlay stats */}
        <div
          className="absolute top-2 left-3 text-[8px] font-mono flex flex-col gap-0.5"
          style={{ color: "#00f0ff44" }}
        >
          <span>SHARDS: {memoryCount + insightCount}</span>
          <span>BRIDGES: {bridgeCount}</span>
          <span>CONFIDENCE: {avgConfidence}</span>
        </div>

        {/* Corner decorations */}
        <div
          className="absolute top-0 left-0 w-4 h-4"
          style={{
            borderTop: "1px solid #a855f730",
            borderLeft: "1px solid #a855f730",
          }}
        />
        <div
          className="absolute top-0 right-0 w-4 h-4"
          style={{
            borderTop: "1px solid #a855f730",
            borderRight: "1px solid #a855f730",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-4 h-4"
          style={{
            borderBottom: "1px solid #a855f730",
            borderLeft: "1px solid #a855f730",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-4 h-4"
          style={{
            borderBottom: "1px solid #a855f730",
            borderRight: "1px solid #a855f730",
          }}
        />

        {/* Empty state */}
        {memoryCount === 0 && insightCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Sparkles
                className="h-6 w-6 mx-auto mb-2"
                style={{ color: "#a855f722" }}
              />
              <p
                className="text-[10px] font-mono"
                style={{ color: "#4a6a8a" }}
              >
                Awaiting dream cycle data…
              </p>
              <p
                className="text-[8px] font-mono mt-1"
                style={{ color: "#4a6a8a66" }}
              >
                Memory shards will materialize after Soul processes memories
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recent insights ticker */}
      {dreamInsights.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {dreamInsights.slice(0, 6).map((insight) => {
            const catColor = CATEGORY_COLORS[insight.category] ?? "#ff006e";
            return (
              <div
                key={insight.id}
                className="flex-shrink-0 px-2.5 py-1.5 rounded text-[8px] font-mono"
                style={{
                  color: catColor,
                  background: hexToRgba(catColor, 0.06),
                  border: `1px solid ${hexToRgba(catColor, 0.15)}`,
                  maxWidth: 160,
                }}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <Zap className="h-2 w-2" />
                  <span style={{ color: hexToRgba(catColor, 0.6) }}>
                    {insight.category.toUpperCase()}
                  </span>
                  <span style={{ color: "#4a6a8a" }}>
                    {(insight.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  className="truncate"
                  style={{ color: hexToRgba(catColor, 0.8) }}
                >
                  {insight.insight}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
