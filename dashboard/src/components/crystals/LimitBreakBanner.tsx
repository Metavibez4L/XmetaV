"use client";

import React, { useRef, useEffect } from "react";
import type { LimitBreak } from "@/lib/types";
import { Zap, X } from "lucide-react";

/* ── Props ─────────────────────────────────────────────────── */

interface LimitBreakBannerProps {
  limitBreak: LimitBreak | null;
  onDismiss?: () => void;
}

/* ── Helpers ───────────────────────────────────────────────── */

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── Component ─────────────────────────────────────────────── */

export const LimitBreakBanner = React.memo(function LimitBreakBanner({
  limitBreak,
  onDismiss,
}: LimitBreakBannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!limitBreak) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    let frame = 0;
    let raf: number;

    const color = "#fbbf24";

    interface Spark {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
    }

    const sparks: Spark[] = [];

    function draw() {
      frame++;
      ctx!.clearRect(0, 0, W, H);
      const t = frame * 0.03;

      // Golden gradient background
      const grd = ctx!.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, hexToRgba(color, 0.05));
      grd.addColorStop(0.5, hexToRgba(color, 0.12 + Math.sin(t) * 0.03));
      grd.addColorStop(1, hexToRgba(color, 0.05));
      ctx!.fillStyle = grd;
      ctx!.fillRect(0, 0, W, H);

      // Scanlines
      for (let y = 0; y < H; y += 3) {
        ctx!.fillStyle = hexToRgba("#000", 0.1);
        ctx!.fillRect(0, y, W, 1);
      }

      // Edge lightning bolts
      const bolts = 3;
      for (let b = 0; b < bolts; b++) {
        ctx!.beginPath();
        let lx = Math.random() < 0.5 ? 0 : W;
        let ly = Math.random() * H;
        ctx!.moveTo(lx, ly);
        const segments = 5 + Math.floor(Math.random() * 5);
        for (let s = 0; s < segments; s++) {
          lx += (Math.random() - 0.5) * 40;
          ly += (Math.random() - 0.5) * 15;
          ctx!.lineTo(lx, ly);
        }
        ctx!.strokeStyle = hexToRgba(color, 0.3 + Math.random() * 0.3);
        ctx!.lineWidth = 1 + Math.random();
        ctx!.stroke();
      }

      // Spawn sparks
      if (frame % 3 === 0) {
        sparks.push({
          x: Math.random() * W,
          y: H,
          vx: (Math.random() - 0.5) * 2,
          vy: -1 - Math.random() * 2,
          life: 0,
          maxLife: 30 + Math.random() * 20,
          size: 1 + Math.random() * 2,
        });
      }

      // Draw sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        const alpha = 1 - s.life / s.maxLife;
        if (s.life >= s.maxLife) { sparks.splice(i, 1); continue; }
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.size * alpha, 0, Math.PI * 2);
        ctx!.fillStyle = hexToRgba(color, alpha * 0.8);
        ctx!.fill();
      }
      while (sparks.length > 50) sparks.shift();

      // Power boost indicator
      const boostWidth = W * 0.6;
      const boostX = (W - boostWidth) / 2;
      const boostY = H - 6;
      ctx!.fillStyle = hexToRgba(color, 0.15);
      ctx!.fillRect(boostX, boostY, boostWidth, 3);
      const fillW = boostWidth * (0.5 + Math.sin(t * 2) * 0.1);
      ctx!.fillStyle = hexToRgba(color, 0.6);
      ctx!.fillRect(boostX, boostY, fillW, 3);

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [limitBreak]);

  if (!limitBreak) return null;

  const elapsed = Date.now() - new Date(limitBreak.activated_at).getTime();
  const minutes = Math.floor(elapsed / 60000);

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{
        border: "1px solid #fbbf2444",
        boxShadow: "0 0 30px #fbbf2422, inset 0 0 20px #fbbf2408",
      }}
    >
      {/* Background canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={80}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.8 }}
      />

      {/* Content */}
      <div className="relative z-10 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 animate-pulse">
          <Zap className="h-5 w-5" style={{ color: "#fbbf24", filter: "drop-shadow(0 0 8px #fbbf24)" }} />
          <span className="text-sm font-mono font-bold tracking-wider" style={{ color: "#fbbf24" }}>
            ⚡ LIMIT BREAK ACTIVE
          </span>
        </div>

        <div className="flex-1">
          <div className="text-[10px] font-mono" style={{ color: "#fbbf24cc" }}>
            {limitBreak.trigger_event}
          </div>
          <div className="text-[8px] font-mono" style={{ color: "#fbbf2466" }}>
            +{(limitBreak.power_boost * 100).toFixed(0)}% power boost · {limitBreak.agents_affected.length} agents affected · {minutes}m active
          </div>
        </div>

        {onDismiss && (
          <button onClick={onDismiss} style={{ color: "#fbbf2466" }}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});
