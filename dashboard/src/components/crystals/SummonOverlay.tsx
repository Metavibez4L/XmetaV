"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import type { MemoryCrystal } from "@/lib/types";
import { CRYSTAL_COLORS } from "@/hooks/useMemoryCrystals";
import { Sparkles, X } from "lucide-react";

/* ── Props ─────────────────────────────────────────────────── */

interface SummonOverlayProps {
  crystal: MemoryCrystal | null;
  onClose: () => void;
  onSummon: (crystalId: string, context: string) => Promise<void>;
}

/* ── Helpers ───────────────────────────────────────────────── */

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── Component ─────────────────────────────────────────────── */

export const SummonOverlay = React.memo(function SummonOverlay({
  crystal,
  onClose,
  onSummon,
}: SummonOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [context, setContext] = useState("");
  const [summoning, setSummoning] = useState(false);
  const [phase, setPhase] = useState<"input" | "summoning" | "manifested">("input");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const color = crystal
    ? CRYSTAL_COLORS[crystal.crystal_color] || "#00f0ff"
    : "#00f0ff";

  const handleSummon = useCallback(async () => {
    if (!crystal || summoning) return;
    setSummoning(true);
    setPhase("summoning");

    await new Promise((r) => setTimeout(r, 2000));
    await onSummon(crystal.id, context);

    setPhase("manifested");
    await new Promise((r) => setTimeout(r, 2000));
    setSummoning(false);
    onClose();
  }, [crystal, context, summoning, onSummon, onClose]);

  // Summon animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !crystal) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    let frame = 0;
    let raf: number;

    const crystalRef = crystal; // capture for closure (non-null)

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
    }

    const particles: Particle[] = [];

    function draw() {
      frame++;
      ctx!.clearRect(0, 0, W, H);
      const t = frame * 0.025;
      const p = phaseRef.current;

      // Ambient scanlines
      for (let y = 0; y < H; y += 4) {
        ctx!.fillStyle = hexToRgba(color, 0.02);
        ctx!.fillRect(0, y, W, 1);
      }

      if (p === "summoning") {
        // Summoning circle
        for (let ring = 0; ring < 3; ring++) {
          const r = 30 + ring * 25 + Math.sin(t + ring) * 5;
          ctx!.beginPath();
          ctx!.arc(cx, cy, r, 0, Math.PI * 2);
          ctx!.strokeStyle = hexToRgba(color, 0.3 - ring * 0.08);
          ctx!.lineWidth = 2 - ring * 0.5;
          ctx!.stroke();

          // Rune marks on rings
          for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + t * (ring + 1) * 0.5;
            const rx = cx + Math.cos(angle) * r;
            const ry = cy + Math.sin(angle) * r;
            ctx!.beginPath();
            ctx!.arc(rx, ry, 3 - ring * 0.5, 0, Math.PI * 2);
            ctx!.fillStyle = hexToRgba(color, 0.5);
            ctx!.fill();
          }
        }

        // Converging particles
        if (frame % 2 === 0) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 100 + Math.random() * 50;
          particles.push({
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            vx: -Math.cos(angle) * 1.5,
            vy: -Math.sin(angle) * 1.5,
            life: 0,
            maxLife: 40,
            size: 1 + Math.random() * 2,
          });
        }

        // Central glow pulse
        const glowSize = 20 + Math.sin(t * 3) * 10;
        const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
        grd.addColorStop(0, hexToRgba(color, 0.5));
        grd.addColorStop(1, "transparent");
        ctx!.fillStyle = grd;
        ctx!.fillRect(cx - glowSize, cy - glowSize, glowSize * 2, glowSize * 2);

      } else if (p === "manifested") {
        // Crystal materialized
        const size = 25 + Math.sin(t * 2) * 3;

        // Grand glow
        const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 100);
        grd.addColorStop(0, hexToRgba(color, 0.3));
        grd.addColorStop(0.5, hexToRgba(color, 0.1));
        grd.addColorStop(1, "transparent");
        ctx!.fillStyle = grd;
        ctx!.fillRect(0, 0, W, H);

        // Crystal body
        ctx!.save();
        ctx!.translate(cx, cy);
        ctx!.rotate(Math.sin(t * 0.5) * 0.1);
        ctx!.shadowColor = color;
        ctx!.shadowBlur = 20;

        ctx!.beginPath();
        const sides = crystalRef.star_rating >= 5 ? 8 : 6;
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          const px = Math.cos(angle) * size;
          const py = Math.sin(angle) * size;
          if (i === 0) ctx!.moveTo(px, py);
          else ctx!.lineTo(px, py);
        }
        ctx!.closePath();
        ctx!.fillStyle = hexToRgba(color, 0.6);
        ctx!.fill();
        ctx!.strokeStyle = color;
        ctx!.lineWidth = 2;
        ctx!.stroke();

        ctx!.restore();

        // Radiating energy
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + t;
          const len = 40 + Math.sin(t * 2 + i) * 15;
          ctx!.beginPath();
          ctx!.moveTo(cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
          ctx!.lineTo(cx + Math.cos(angle) * (size + len), cy + Math.sin(angle) * (size + len));
          ctx!.strokeStyle = hexToRgba(color, 0.2);
          ctx!.lineWidth = 1;
          ctx!.stroke();
        }

        // Explosion particles
        if (frame % 1 === 0) {
          const angle = Math.random() * Math.PI * 2;
          particles.push({
            x: cx + Math.cos(angle) * size,
            y: cy + Math.sin(angle) * size,
            vx: Math.cos(angle) * (1 + Math.random() * 2),
            vy: Math.sin(angle) * (1 + Math.random() * 2),
            life: 0,
            maxLife: 30,
            size: 1 + Math.random() * 2,
          });
        }

        // Name text
        ctx!.font = "bold 11px monospace";
        ctx!.textAlign = "center";
        ctx!.fillStyle = color;
        ctx!.fillText(crystalRef.name, cx, cy + size + 20);
        ctx!.font = "9px monospace";
        ctx!.fillStyle = hexToRgba(color, 0.5);
        ctx!.fillText(`${crystalRef.star_rating}★ ${crystalRef.class.toUpperCase()}`, cx, cy + size + 32);
      } else {
        // Idle resting state
        const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 60);
        grd.addColorStop(0, hexToRgba(color, 0.05));
        grd.addColorStop(1, "transparent");
        ctx!.fillStyle = grd;
        ctx!.fillRect(0, 0, W, H);
      }

      // Draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life++;
        pt.x += pt.vx;
        pt.y += pt.vy;
        const alpha = 1 - pt.life / pt.maxLife;
        if (pt.life >= pt.maxLife) { particles.splice(i, 1); continue; }
        ctx!.beginPath();
        ctx!.arc(pt.x, pt.y, pt.size * alpha, 0, Math.PI * 2);
        ctx!.fillStyle = hexToRgba(color, alpha * 0.6);
        ctx!.fill();
      }
      while (particles.length > 150) particles.shift();

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [crystal, color, phase]);

  if (!crystal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="rounded-xl overflow-hidden max-w-md w-full mx-4"
        style={{
          background: "#05080f",
          border: `1px solid ${hexToRgba(color, 0.2)}`,
          boxShadow: `0 0 40px ${hexToRgba(color, 0.15)}`,
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${hexToRgba(color, 0.1)}` }}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color }} />
            <span className="text-xs font-mono font-bold tracking-wider" style={{ color }}>
              MEMORY SUMMON
            </span>
          </div>
          <button onClick={onClose} style={{ color: "#4a6a8a" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summon canvas */}
        <div className="flex justify-center p-4">
          <canvas
            ref={canvasRef}
            width={300}
            height={200}
            className="rounded-lg"
            style={{ background: "#020408" }}
          />
        </div>

        {/* Crystal info */}
        <div className="px-4 pb-2">
          <div className="text-xs font-mono font-bold" style={{ color }}>
            {crystal.name}
          </div>
          <div className="text-[9px] font-mono mt-0.5" style={{ color: hexToRgba(color, 0.5) }}>
            {crystal.star_rating}★ {crystal.class.toUpperCase()} · Lv.{crystal.level} · {crystal.xp} XP
          </div>
          {crystal.description && (
            <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
              {crystal.description}
            </div>
          )}
        </div>

        {/* Context input */}
        {phase === "input" && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <label className="text-[8px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                Task Context (what do you need this wisdom for?)
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Describe the current task or challenge..."
                rows={2}
                className="w-full mt-1 px-3 py-2 rounded text-xs font-mono resize-none"
                style={{
                  background: "#0a0e16",
                  border: `1px solid ${hexToRgba(color, 0.15)}`,
                  color: "#c0c8d8",
                  outline: "none",
                }}
              />
            </div>
            <button
              onClick={handleSummon}
              disabled={!context.trim()}
              className="w-full py-2.5 rounded font-mono text-xs tracking-wider transition-all disabled:opacity-30"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(color, 0.3)}, ${hexToRgba(color, 0.1)})`,
                border: `1px solid ${hexToRgba(color, 0.3)}`,
                color,
                boxShadow: `0 0 15px ${hexToRgba(color, 0.1)}`,
              }}
            >
              🦋 SUMMON THIS MEMORY
            </button>
          </div>
        )}

        {/* Summoning state */}
        {phase === "summoning" && (
          <div className="px-4 pb-4 text-center">
            <div className="text-[10px] font-mono animate-pulse" style={{ color }}>
              Channeling memory crystal...
            </div>
          </div>
        )}

        {/* Manifested state */}
        {phase === "manifested" && (
          <div className="px-4 pb-4 text-center">
            <div className="text-[10px] font-mono" style={{ color: "#39ff14" }}>
              ✓ Memory manifested — context injected
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
