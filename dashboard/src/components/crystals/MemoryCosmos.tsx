"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { MemoryCrystal } from "@/lib/types";
import { CRYSTAL_COLORS } from "@/hooks/useMemoryCrystals";
import { Globe, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

interface MemoryCosmosProps {
  crystals: MemoryCrystal[];
  onSelect?: (crystal: MemoryCrystal) => void;
}

interface Island {
  crystal: MemoryCrystal;
  x: number;
  y: number;
  radius: number;
  color: string;
  angle: number;       // orbit angle for movement
  orbitRadius: number;  // how far from center
  terrain: "city" | "wasteland" | "forest";
  particles: IslandParticle[];
}

interface IslandParticle {
  ox: number; // offset from island center
  oy: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Bridge {
  from: Island;
  to: Island;
  strength: number;
  color: string;
}

/* ── Helpers ───────────────────────────────────────────────── */

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const TERRAIN_MAP: Record<string, "city" | "wasteland" | "forest"> = {
  milestone: "city",
  incident: "wasteland",
  decision: "forest",
};

/* ── Component ─────────────────────────────────────────────── */

export const MemoryCosmos = React.memo(function MemoryCosmos({
  crystals,
  onSelect,
}: MemoryCosmosProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; camX: number; camY: number }>({
    active: false, startX: 0, startY: 0, camX: 0, camY: 0,
  });
  const islandsRef = useRef<Island[]>([]);
  const hoveredRef = useRef<string | null>(null);

  // Build islands from crystals
  const islands = useMemo(() => {
    const result: Island[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5)); // golden angle

    crystals.forEach((c, i) => {
      const color = CRYSTAL_COLORS[c.crystal_color] || "#00f0ff";
      const orbitRadius = 80 + i * 35 + c.star_rating * 15;
      const angle = i * golden;
      const terrain = TERRAIN_MAP[c.crystal_type] || "city";
      const radius = 20 + c.star_rating * 8 + (c.is_legendary ? 15 : 0);

      result.push({
        crystal: c,
        x: Math.cos(angle) * orbitRadius,
        y: Math.sin(angle) * orbitRadius,
        radius,
        color,
        angle,
        orbitRadius,
        terrain,
        particles: [],
      });
    });

    return result;
  }, [crystals]);

  islandsRef.current = islands;

  // Build bridges (connect crystals of same type or fused pairs)
  const bridges = useMemo(() => {
    const result: Bridge[] = [];
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const a = islands[i];
        const b = islands[j];
        // Connect same type
        if (a.crystal.crystal_type === b.crystal.crystal_type) {
          const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          if (dist < 400) {
            result.push({
              from: a,
              to: b,
              strength: 1 - dist / 400,
              color: a.color,
            });
          }
        }
        // Connect fused pairs
        if (a.crystal.is_fused && b.crystal.is_fused) {
          result.push({
            from: a,
            to: b,
            strength: 0.6,
            color: "#a855f7",
          });
        }
      }
    }
    return result;
  }, [islands]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      camX: cameraRef.current.x,
      camY: cameraRef.current.y,
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setCamera((prev) => ({
        ...prev,
        x: dragRef.current.camX + dx / prev.zoom,
        y: dragRef.current.camY + dy / prev.zoom,
      }));
      return;
    }

    // Hit test for hover
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - rect.width / 2) / cameraRef.current.zoom - cameraRef.current.x;
    const my = (e.clientY - rect.top - rect.height / 2) / cameraRef.current.zoom - cameraRef.current.y;

    let found: string | null = null;
    for (const island of islandsRef.current) {
      const dx = mx - island.x;
      const dy = my - island.y;
      if (dx * dx + dy * dy < island.radius * island.radius) {
        found = island.crystal.id;
        break;
      }
    }
    hoveredRef.current = found;
    setHoveredId(found);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current.active && hoveredRef.current) {
      const island = islandsRef.current.find((i) => i.crystal.id === hoveredRef.current);
      if (island) onSelect?.(island.crystal);
    }
    dragRef.current.active = false;
  }, [onSelect]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setCamera((prev) => ({
      ...prev,
      zoom: Math.max(0.3, Math.min(3, prev.zoom - e.deltaY * 0.001)),
    }));
  }, []);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize to container
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let raf: number;

    function draw() {
      frame++;
      const W = canvas!.width;
      const H = canvas!.height;
      const cam = cameraRef.current;
      const t = frame * 0.015;

      ctx!.clearRect(0, 0, W, H);

      // Deep space background
      const bgGrd = ctx!.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      bgGrd.addColorStop(0, "#060a14");
      bgGrd.addColorStop(1, "#020408");
      ctx!.fillStyle = bgGrd;
      ctx!.fillRect(0, 0, W, H);

      // Stars (static, parallax based on camera)
      ctx!.save();
      for (let i = 0; i < 80; i++) {
        const sx = ((i * 137.5 + cam.x * 0.1) % W + W) % W;
        const sy = ((i * 199.3 + cam.y * 0.1) % H + H) % H;
        const brightness = 0.2 + Math.sin(t + i * 0.7) * 0.1;
        ctx!.fillStyle = hexToRgba("#ffffff", brightness);
        ctx!.fillRect(sx, sy, 1, 1);
      }
      ctx!.restore();

      // Transform for camera
      ctx!.save();
      ctx!.translate(W / 2, H / 2);
      ctx!.scale(cam.zoom, cam.zoom);
      ctx!.translate(cam.x, cam.y);

      // Draw "The Deep" (unanchorable void)
      ctx!.beginPath();
      ctx!.arc(0, 0, 40, 0, Math.PI * 2);
      const deepGrd = ctx!.createRadialGradient(0, 0, 0, 0, 0, 40);
      deepGrd.addColorStop(0, hexToRgba("#a855f7", 0.1 + Math.sin(t) * 0.03));
      deepGrd.addColorStop(1, "transparent");
      ctx!.fillStyle = deepGrd;
      ctx!.fill();
      ctx!.font = "7px monospace";
      ctx!.textAlign = "center";
      ctx!.fillStyle = hexToRgba("#a855f7", 0.2);
      ctx!.fillText("THE DEEP", 0, 3);

      // Draw bridges (neon highways)
      for (const bridge of bridges) {
        const { from, to, strength, color } = bridge;

        ctx!.beginPath();
        // Curved bridge
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const offset = 20 * Math.sin(t + from.x * 0.01);
        const cpx = mx + offset;
        const cpy = my - offset;

        ctx!.moveTo(from.x, from.y);
        ctx!.quadraticCurveTo(cpx, cpy, to.x, to.y);
        ctx!.strokeStyle = hexToRgba(color, strength * 0.15);
        ctx!.lineWidth = 1 + strength;
        ctx!.stroke();

        // Data particle flowing along bridge
        const flowT = (t * 0.5 + from.x * 0.01) % 1;
        const fx = from.x + (to.x - from.x) * flowT;
        const fy = from.y + (to.y - from.y) * flowT;
        ctx!.beginPath();
        ctx!.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx!.fillStyle = hexToRgba(color, 0.5);
        ctx!.fill();
      }

      // Draw islands
      for (const island of islands) {
        const { x, y, radius, color, crystal, terrain, particles: pts } = island;
        const isHovered = hoveredRef.current === crystal.id;
        const hover = isHovered ? 1.15 : 1;

        // Floating motion
        const floatY = Math.sin(t + island.angle) * 3;
        const iy = y + floatY;

        // Island shadow
        ctx!.beginPath();
        ctx!.ellipse(x, iy + radius * 0.8, radius * 0.7, radius * 0.2, 0, 0, Math.PI * 2);
        ctx!.fillStyle = hexToRgba("#000", 0.2);
        ctx!.fill();

        // Island body (terrain-based)
        ctx!.save();
        ctx!.translate(x, iy);
        ctx!.scale(hover, hover);

        // Glow ring
        ctx!.beginPath();
        ctx!.arc(0, 0, radius + 5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx!.strokeStyle = hexToRgba(color, 0.15 + (isHovered ? 0.15 : 0));
        ctx!.lineWidth = 1.5;
        ctx!.stroke();

        // Main island
        const islandGrd = ctx!.createRadialGradient(0, 0, 0, 0, 0, radius);
        if (terrain === "city") {
          islandGrd.addColorStop(0, hexToRgba(color, 0.4));
          islandGrd.addColorStop(0.6, hexToRgba(color, 0.2));
          islandGrd.addColorStop(1, hexToRgba(color, 0.05));
        } else if (terrain === "wasteland") {
          islandGrd.addColorStop(0, hexToRgba("#ef4444", 0.4));
          islandGrd.addColorStop(0.6, hexToRgba("#ef4444", 0.15));
          islandGrd.addColorStop(1, hexToRgba("#ef4444", 0.03));
        } else {
          islandGrd.addColorStop(0, hexToRgba("#39ff14", 0.3));
          islandGrd.addColorStop(0.6, hexToRgba("#39ff14", 0.12));
          islandGrd.addColorStop(1, hexToRgba("#39ff14", 0.03));
        }
        ctx!.beginPath();
        ctx!.arc(0, 0, radius, 0, Math.PI * 2);
        ctx!.fillStyle = islandGrd;
        ctx!.fill();

        // Terrain features
        if (terrain === "city") {
          // Mini buildings
          for (let b = 0; b < 4; b++) {
            const bx = -radius * 0.4 + b * radius * 0.25;
            const bh = 5 + Math.random() * 8 + crystal.star_rating * 2;
            ctx!.fillStyle = hexToRgba(color, 0.3);
            ctx!.fillRect(bx, -bh, 4, bh);
            // Window
            ctx!.fillStyle = hexToRgba(color, 0.6);
            ctx!.fillRect(bx + 1, -bh + 2, 2, 1);
          }
        } else if (terrain === "wasteland") {
          // Cracks
          ctx!.beginPath();
          ctx!.moveTo(-radius * 0.3, 0);
          ctx!.lineTo(-radius * 0.1, -radius * 0.2);
          ctx!.lineTo(radius * 0.2, radius * 0.1);
          ctx!.strokeStyle = hexToRgba("#ef4444", 0.3);
          ctx!.lineWidth = 0.5;
          ctx!.stroke();
        } else {
          // Trees
          for (let tr = 0; tr < 3; tr++) {
            const tx = -radius * 0.3 + tr * radius * 0.3;
            ctx!.beginPath();
            ctx!.moveTo(tx, 0);
            ctx!.lineTo(tx - 3, -6);
            ctx!.lineTo(tx + 3, -6);
            ctx!.closePath();
            ctx!.fillStyle = hexToRgba("#39ff14", 0.3);
            ctx!.fill();
          }
        }

        // Crystal at center
        const cSize = 6 + crystal.star_rating * 2;
        ctx!.beginPath();
        const sides = crystal.is_legendary ? 8 : 6;
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + t * 0.5;
          const px = Math.cos(angle) * cSize;
          const py = Math.sin(angle) * cSize - radius * 0.15;
          if (i === 0) ctx!.moveTo(px, py);
          else ctx!.lineTo(px, py);
        }
        ctx!.closePath();
        ctx!.shadowColor = color;
        ctx!.shadowBlur = 10;
        ctx!.fillStyle = hexToRgba(color, 0.7);
        ctx!.fill();
        ctx!.shadowBlur = 0;

        // Label
        ctx!.font = `${isHovered ? "bold " : ""}7px monospace`;
        ctx!.textAlign = "center";
        ctx!.fillStyle = hexToRgba(color, isHovered ? 0.9 : 0.5);
        ctx!.fillText(crystal.name.substring(0, 16), 0, radius + 12);

        // Star rating below name
        ctx!.font = "6px monospace";
        ctx!.fillStyle = hexToRgba("#fbbf24", 0.5);
        ctx!.fillText("★".repeat(crystal.star_rating), 0, radius + 20);

        // Legendary corona
        if (crystal.is_legendary) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + t;
            const len = radius * 0.4 + Math.sin(t * 3 + i) * 5;
            ctx!.beginPath();
            ctx!.moveTo(Math.cos(a) * cSize * 1.5, Math.sin(a) * cSize * 1.5 - radius * 0.15);
            ctx!.lineTo(Math.cos(a) * (cSize + len), Math.sin(a) * (cSize + len) - radius * 0.15);
            ctx!.strokeStyle = hexToRgba("#fbbf24", 0.3);
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        }

        ctx!.restore();

        // Spawn island particles
        if (frame % 8 === 0 && crystal.star_rating >= 2) {
          pts.push({
            ox: (Math.random() - 0.5) * radius,
            oy: (Math.random() - 0.5) * radius,
            vx: (Math.random() - 0.5) * 0.3,
            vy: -0.2 - Math.random() * 0.3,
            life: 0,
            maxLife: 40 + Math.random() * 30,
            size: 1 + Math.random(),
            color,
          });
        }

        // Draw particles
        for (let i = pts.length - 1; i >= 0; i--) {
          const p = pts[i];
          p.life++;
          p.ox += p.vx;
          p.oy += p.vy;
          const alpha = 1 - p.life / p.maxLife;
          if (p.life >= p.maxLife) { pts.splice(i, 1); continue; }
          ctx!.beginPath();
          ctx!.arc(x + p.ox, iy + p.oy, p.size * alpha, 0, Math.PI * 2);
          ctx!.fillStyle = hexToRgba(p.color, alpha * 0.4);
          ctx!.fill();
        }
        while (pts.length > 20) pts.shift();
      }

      ctx!.restore(); // camera transform

      // HUD overlay
      ctx!.font = "9px monospace";
      ctx!.textAlign = "left";
      ctx!.fillStyle = hexToRgba("#00f0ff", 0.3);
      ctx!.fillText(`MEMORY COSMOS · ${islands.length} islands · zoom ${cam.zoom.toFixed(1)}x`, 10, 16);

      // Hovered island info
      if (hoveredRef.current) {
        const hIsland = islands.find((i) => i.crystal.id === hoveredRef.current);
        if (hIsland) {
          const c = hIsland.crystal;
          const infoX = W - 180;
          const infoY = 10;

          ctx!.fillStyle = hexToRgba("#05080f", 0.9);
          ctx!.fillRect(infoX - 5, infoY - 5, 175, 85);
          ctx!.strokeStyle = hexToRgba(hIsland.color, 0.3);
          ctx!.lineWidth = 1;
          ctx!.strokeRect(infoX - 5, infoY - 5, 175, 85);

          ctx!.textAlign = "left";
          ctx!.font = "bold 10px monospace";
          ctx!.fillStyle = hIsland.color;
          ctx!.fillText(c.name, infoX, infoY + 12);

          ctx!.font = "8px monospace";
          ctx!.fillStyle = hexToRgba(hIsland.color, 0.6);
          ctx!.fillText(`${c.star_rating}★ ${c.class.toUpperCase()} · Lv.${c.level}`, infoX, infoY + 24);
          ctx!.fillText(`${c.crystal_type} · ${c.xp} XP`, infoX, infoY + 36);

          // Effects
          const effects = Object.entries(c.effects).slice(0, 3);
          effects.forEach(([k, v], ei) => {
            ctx!.fillStyle = hexToRgba(hIsland.color, 0.4);
            ctx!.fillText(`+${v}% ${k.replace(/_/g, " ")}`, infoX, infoY + 48 + ei * 10);
          });
        }
      }

      raf = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [islands, bridges]);

  return (
    <div
      className="rounded-lg overflow-hidden relative"
      style={{
        background: "#020408",
        border: "1px solid #00f0ff10",
        height: 500,
      }}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-10 px-4 py-2 flex items-center justify-between"
        style={{ background: "linear-gradient(180deg, #05080fcc, transparent)" }}
      >
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4" style={{ color: "#a855f7" }} />
          <span className="text-xs font-mono font-bold tracking-wider" style={{ color: "#a855f7" }}>
            MEMORY COSMOS
          </span>
          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
            // explorable memory space · {islands.length} islands
          </span>
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setCamera((p) => ({ ...p, zoom: Math.min(p.zoom + 0.2, 3) }))}
            className="p-1 rounded"
            style={{ color: "#4a6a8a", border: "1px solid #00f0ff15" }}
          >
            <ZoomIn className="h-3 w-3" />
          </button>
          <button
            onClick={() => setCamera((p) => ({ ...p, zoom: Math.max(p.zoom - 0.2, 0.3) }))}
            className="p-1 rounded"
            style={{ color: "#4a6a8a", border: "1px solid #00f0ff15" }}
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <button
            onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}
            className="p-1 rounded"
            style={{ color: "#4a6a8a", border: "1px solid #00f0ff15" }}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="w-full h-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ cursor: hoveredId ? "pointer" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { dragRef.current.active = false; hoveredRef.current = null; setHoveredId(null); }}
          onWheel={handleWheel}
        />
      </div>

      {/* Legend */}
      <div
        className="absolute bottom-2 left-2 z-10 flex gap-3 px-3 py-1.5 rounded"
        style={{ background: "#05080fcc", border: "1px solid #00f0ff08" }}
      >
        {[
          { label: "Milestone (City)", color: "#fbbf24" },
          { label: "Decision (Forest)", color: "#39ff14" },
          { label: "Incident (Wasteland)", color: "#ef4444" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full" style={{ background: l.color, boxShadow: `0 0 4px ${l.color}44` }} />
            <span className="text-[7px] font-mono" style={{ color: "#4a6a8a" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
