"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { MemoryCrystal } from "@/lib/types";
import { CrystalCard } from "./CrystalCard";
import { CRYSTAL_COLORS } from "@/hooks/useMemoryCrystals";
import { Zap, ArrowRight, X } from "lucide-react";

/* ── Props ─────────────────────────────────────────────────── */

interface FusionChamberProps {
  crystals: MemoryCrystal[];
  onFuse: (aId: string, bId: string) => Promise<MemoryCrystal | null>;
}

/* ── Helpers ───────────────────────────────────────────────── */

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── Component ─────────────────────────────────────────────── */

export const FusionChamber = React.memo(function FusionChamber({
  crystals,
  onFuse,
}: FusionChamberProps) {
  const [slotA, setSlotA] = useState<MemoryCrystal | null>(null);
  const [slotB, setSlotB] = useState<MemoryCrystal | null>(null);
  const [fusing, setFusing] = useState(false);
  const [result, setResult] = useState<MemoryCrystal | null>(null);
  const [fusionPhase, setFusionPhase] = useState<"idle" | "orbiting" | "colliding" | "birthing" | "done">("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(fusionPhase);
  phaseRef.current = fusionPhase;

  const eligible = crystals.filter((c) => c.star_rating >= 1 && !c.is_legendary);

  const handleFuse = useCallback(async () => {
    if (!slotA || !slotB || fusing) return;
    setFusing(true);
    setFusionPhase("orbiting");

    // Animation sequence
    await new Promise((r) => setTimeout(r, 1500));
    setFusionPhase("colliding");
    await new Promise((r) => setTimeout(r, 1000));
    setFusionPhase("birthing");

    const res = await onFuse(slotA.id, slotB.id);
    setResult(res);

    await new Promise((r) => setTimeout(r, 1500));
    setFusionPhase("done");
    setFusing(false);
  }, [slotA, slotB, fusing, onFuse]);

  const reset = useCallback(() => {
    setSlotA(null);
    setSlotB(null);
    setResult(null);
    setFusionPhase("idle");
  }, []);

  // Fusion animation canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    let frame = 0;
    let raf: number;

    const particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }[] = [];

    function draw() {
      frame++;
      ctx!.clearRect(0, 0, W, H);
      const t = frame * 0.03;
      const phase = phaseRef.current;

      // Background grid
      ctx!.strokeStyle = hexToRgba("#00f0ff", 0.03);
      ctx!.lineWidth = 0.5;
      for (let i = 0; i < W; i += 20) {
        ctx!.beginPath();
        ctx!.moveTo(i, 0);
        ctx!.lineTo(i, H);
        ctx!.stroke();
      }
      for (let i = 0; i < H; i += 20) {
        ctx!.beginPath();
        ctx!.moveTo(0, i);
        ctx!.lineTo(W, i);
        ctx!.stroke();
      }

      // Central fusion ring
      ctx!.beginPath();
      ctx!.arc(cx, cy, 60 + Math.sin(t) * 5, 0, Math.PI * 2);
      ctx!.strokeStyle = hexToRgba("#a855f7", 0.2 + Math.sin(t * 2) * 0.1);
      ctx!.lineWidth = 2;
      ctx!.stroke();

      // Inner ring
      ctx!.beginPath();
      ctx!.arc(cx, cy, 35 + Math.sin(t * 1.5) * 3, 0, Math.PI * 2);
      ctx!.strokeStyle = hexToRgba("#ff006e", 0.15);
      ctx!.lineWidth = 1;
      ctx!.stroke();

      if (slotA && slotB) {
        const colorA = CRYSTAL_COLORS[slotA.crystal_color] || "#00f0ff";
        const colorB = CRYSTAL_COLORS[slotB.crystal_color] || "#ff006e";

        if (phase === "orbiting") {
          // Two crystals orbiting
          const orbitR = 50;
          const ax = cx + Math.cos(t * 2) * orbitR;
          const ay = cy + Math.sin(t * 2) * orbitR;
          const bx = cx + Math.cos(t * 2 + Math.PI) * orbitR;
          const by = cy + Math.sin(t * 2 + Math.PI) * orbitR;

          drawCrystalOrb(ctx!, ax, ay, 12, colorA, t);
          drawCrystalOrb(ctx!, bx, by, 12, colorB, t);

          // Trail particles
          if (frame % 2 === 0) {
            particles.push(
              { x: ax, y: ay, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 0, maxLife: 20, color: colorA, size: 2 },
              { x: bx, y: by, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 0, maxLife: 20, color: colorB, size: 2 }
            );
          }
        } else if (phase === "colliding") {
          // Converging
          const progress = Math.min((frame % 60) / 30, 1);
          const orbitR = 50 * (1 - progress);
          const ax = cx + Math.cos(t * 4) * orbitR;
          const ay = cy + Math.sin(t * 4) * orbitR;
          const bx = cx + Math.cos(t * 4 + Math.PI) * orbitR;
          const by = cy + Math.sin(t * 4 + Math.PI) * orbitR;

          drawCrystalOrb(ctx!, ax, ay, 12 + progress * 5, colorA, t);
          drawCrystalOrb(ctx!, bx, by, 12 + progress * 5, colorB, t);

          // Intense particles
          for (let i = 0; i < 3; i++) {
            particles.push({
              x: cx + (Math.random() - 0.5) * 30,
              y: cy + (Math.random() - 0.5) * 30,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4,
              life: 0,
              maxLife: 15,
              color: Math.random() > 0.5 ? colorA : colorB,
              size: 3,
            });
          }

          // Flash
          const flashAlpha = Math.sin(t * 10) * 0.1;
          ctx!.fillStyle = `rgba(255,255,255,${Math.abs(flashAlpha)})`;
          ctx!.fillRect(0, 0, W, H);
        } else if (phase === "birthing" || phase === "done") {
          // New crystal emerging
          const resultColor = result
            ? CRYSTAL_COLORS[result.crystal_color] || "#fbbf24"
            : "#fbbf24";
          const pulse = 15 + Math.sin(t * 3) * 5;

          // Explosion particles
          if (phase === "birthing" && frame % 1 === 0) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            particles.push({
              x: cx,
              y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0,
              maxLife: 40,
              color: resultColor,
              size: 2 + Math.random() * 3,
            });
          }

          // Golden glow
          const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 80);
          grd.addColorStop(0, hexToRgba(resultColor, 0.3));
          grd.addColorStop(1, "transparent");
          ctx!.fillStyle = grd;
          ctx!.fillRect(0, 0, W, H);

          drawCrystalOrb(ctx!, cx, cy, pulse, resultColor, t);

          // Star burst
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + t;
            const len = 30 + Math.sin(t * 2 + i) * 10;
            ctx!.beginPath();
            ctx!.moveTo(cx + Math.cos(angle) * pulse, cy + Math.sin(angle) * pulse);
            ctx!.lineTo(cx + Math.cos(angle) * (pulse + len), cy + Math.sin(angle) * (pulse + len));
            ctx!.strokeStyle = hexToRgba(resultColor, 0.4);
            ctx!.lineWidth = 1.5;
            ctx!.stroke();
          }
        }
      } else {
        // Idle state — placeholder slots
        ctx!.font = "10px monospace";
        ctx!.textAlign = "center";
        ctx!.fillStyle = hexToRgba("#4a6a8a", 0.5);

        if (!slotA) {
          ctx!.fillText("[ SLOT A ]", cx - 60, cy);
        }
        if (!slotB) {
          ctx!.fillText("[ SLOT B ]", cx + 60, cy);
        }
      }

      // Draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        const alpha = 1 - p.life / p.maxLife;
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx!.fillStyle = hexToRgba(p.color, alpha * 0.7);
        ctx!.fill();
      }

      // Keep max particles
      while (particles.length > 200) particles.shift();

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [slotA, slotB, result, fusionPhase]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "#05080fcc",
        border: "1px solid #a855f715",
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #a855f710" }}>
        <Zap className="h-4 w-4" style={{ color: "#a855f7" }} />
        <h3 className="text-xs font-mono font-bold tracking-wider" style={{ color: "#a855f7" }}>
          FUSION CHAMBER
        </h3>
        <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
          // combine crystals → create hybrids
        </span>
      </div>

      <div className="p-4">
        {/* Fusion Canvas */}
        <div className="flex justify-center mb-4">
          <canvas
            ref={canvasRef}
            width={400}
            height={200}
            className="rounded-lg"
            style={{ background: "#020408", border: "1px solid #a855f710" }}
          />
        </div>

        {/* Slot selection */}
        <div className="flex items-center justify-center gap-4 mb-4">
          {/* Slot A */}
          <div className="flex-1 max-w-[180px]">
            {slotA ? (
              <div className="relative">
                <CrystalCard crystal={slotA} compact />
                <button
                  onClick={() => setSlotA(null)}
                  className="absolute -top-1 -right-1 rounded-full p-0.5"
                  style={{ background: "#ef4444", color: "#fff" }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <div
                className="h-20 rounded border-dashed flex items-center justify-center cursor-pointer"
                style={{ border: "2px dashed #a855f722", color: "#4a6a8a" }}
              >
                <span className="text-[9px] font-mono">Select Crystal A</span>
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-1">
            <ArrowRight className="h-4 w-4" style={{ color: "#a855f744" }} />
            <span className="text-[8px] font-mono" style={{ color: "#a855f744" }}>FUSE</span>
          </div>

          {/* Slot B */}
          <div className="flex-1 max-w-[180px]">
            {slotB ? (
              <div className="relative">
                <CrystalCard crystal={slotB} compact />
                <button
                  onClick={() => setSlotB(null)}
                  className="absolute -top-1 -right-1 rounded-full p-0.5"
                  style={{ background: "#ef4444", color: "#fff" }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <div
                className="h-20 rounded border-dashed flex items-center justify-center cursor-pointer"
                style={{ border: "2px dashed #a855f722", color: "#4a6a8a" }}
              >
                <span className="text-[9px] font-mono">Select Crystal B</span>
              </div>
            )}
          </div>
        </div>

        {/* Fuse button */}
        {slotA && slotB && fusionPhase === "idle" && (
          <div className="flex justify-center mb-4">
            <button
              onClick={handleFuse}
              disabled={fusing}
              className="px-6 py-2 rounded font-mono text-xs tracking-wider transition-all"
              style={{
                background: "linear-gradient(135deg, #a855f7, #ff006e)",
                color: "#fff",
                boxShadow: "0 0 20px #a855f744",
              }}
            >
              ⚔️ INITIATE FUSION
            </button>
          </div>
        )}

        {/* Result display */}
        {result && fusionPhase === "done" && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-[10px] font-mono" style={{ color: "#fbbf24" }}>
              🔮 FUSION COMPLETE
            </div>
            <CrystalCard crystal={result} />
            <button
              onClick={reset}
              className="px-4 py-1.5 rounded text-[9px] font-mono"
              style={{ border: "1px solid #00f0ff22", color: "#00f0ff88" }}
            >
              NEW FUSION
            </button>
          </div>
        )}

        {/* Crystal picker */}
        {(!slotA || !slotB) && fusionPhase === "idle" && (
          <div>
            <div className="text-[9px] font-mono mb-2" style={{ color: "#4a6a8a" }}>
              Select crystals to fuse (3★+ for guaranteed result):
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">
              {eligible
                .filter((c) => c.id !== slotA?.id && c.id !== slotB?.id)
                .map((c) => (
                  <CrystalCard
                    key={c.id}
                    crystal={c}
                    compact
                    onClick={(crystal) => {
                      if (!slotA) setSlotA(crystal);
                      else if (!slotB) setSlotB(crystal);
                    }}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/* ── Helper: draw a glowing crystal orb ────────────────────── */

function drawCrystalOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, t: number) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;

  // Glow
  const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
  grd.addColorStop(0, hexToRgba(color, 0.6));
  grd.addColorStop(0.5, hexToRgba(color, 0.2));
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);

  // Core
  ctx.beginPath();
  const sides = 6;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + t * 0.5;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.5);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}
