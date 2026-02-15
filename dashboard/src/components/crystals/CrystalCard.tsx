"use client";

import React, { useRef, useEffect, useState } from "react";
import type { MemoryCrystal } from "@/lib/types";
import { CRYSTAL_COLORS } from "@/hooks/useMemoryCrystals";
import { Star, Zap, Shield, Sword, BookOpen, Eye, Ghost, Sparkles, Hand } from "lucide-react";

/* ── Props ─────────────────────────────────────────────────── */

interface CrystalCardProps {
  crystal: MemoryCrystal;
  selected?: boolean;
  onClick?: (crystal: MemoryCrystal) => void;
  onEquip?: (crystal: MemoryCrystal) => void;
  onSummon?: (crystal: MemoryCrystal) => void;
  compact?: boolean;
}

/* ── Class Icons ───────────────────────────────────────────── */

const CLASS_ICONS: Record<string, React.ReactNode> = {
  anchor: <Star className="h-3 w-3" />,
  knight: <Shield className="h-3 w-3" />,
  paladin: <Shield className="h-3 w-3" />,
  mage: <BookOpen className="h-3 w-3" />,
  sage: <Eye className="h-3 w-3" />,
  rogue: <Ghost className="h-3 w-3" />,
  ninja: <Ghost className="h-3 w-3" />,
  summoner: <Sparkles className="h-3 w-3" />,
  godhand: <Hand className="h-3 w-3" />,
};

/* ── Helpers ───────────────────────────────────────────────── */

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function xpToNextLevel(crystal: MemoryCrystal): { current: number; needed: number; pct: number } {
  const thresholds = [0,100,200,300,400,600,800,1000,1200,1400,1800,2200,2600,3000,3400,4200,5000,5800,6600,7400,8600,9800,11000,12200,13400,15000,17000,19000,21000,23000];
  const current = crystal.xp - (thresholds[crystal.level - 1] || 0);
  const needed = (thresholds[crystal.level] || 23000) - (thresholds[crystal.level - 1] || 0);
  return { current, needed, pct: needed > 0 ? Math.min(current / needed, 1) : 1 };
}

/* ── Component ─────────────────────────────────────────────── */

export const CrystalCard = React.memo(function CrystalCard({
  crystal,
  selected,
  onClick,
  onEquip,
  onSummon,
  compact,
}: CrystalCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = CRYSTAL_COLORS[crystal.crystal_color] || "#00f0ff";
  const xp = xpToNextLevel(crystal);
  const [hovered, setHovered] = useState(false);

  // Crystal animation canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    let frame = 0;
    let raf: number;

    const particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }[] = [];

    function draw() {
      frame++;
      ctx!.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const t = frame * 0.02;

      // Background glow
      const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, W * 0.4);
      grd.addColorStop(0, hexToRgba(color, 0.15 + Math.sin(t) * 0.05));
      grd.addColorStop(1, "transparent");
      ctx!.fillStyle = grd;
      ctx!.fillRect(0, 0, W, H);

      // Crystal shape (hexagonal for ≤3★, octagonal for 4★+, star for 6★)
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(Math.sin(t * 0.5) * 0.05);

      const size = W * 0.2 + Math.sin(t) * 2;
      const sides = crystal.is_legendary ? 8 : crystal.star_rating >= 4 ? 8 : 6;

      // Outer glow
      ctx!.shadowColor = color;
      ctx!.shadowBlur = 15 + Math.sin(t * 2) * 5;

      // Main crystal body
      ctx!.beginPath();
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const r = size * (1 + (i % 2 === 0 ? 0.1 : 0) * Math.sin(t * 3));
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.closePath();

      // Gradient fill
      const crystalGrd = ctx!.createLinearGradient(-size, -size, size, size);
      crystalGrd.addColorStop(0, hexToRgba(color, 0.8));
      crystalGrd.addColorStop(0.5, hexToRgba(color, 0.4));
      crystalGrd.addColorStop(1, hexToRgba(color, 0.6));
      ctx!.fillStyle = crystalGrd;
      ctx!.fill();

      // Crystal edge
      ctx!.strokeStyle = color;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();

      // Inner facets
      if (crystal.star_rating >= 3) {
        ctx!.beginPath();
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          ctx!.moveTo(0, 0);
          ctx!.lineTo(Math.cos(angle) * size * 0.6, Math.sin(angle) * size * 0.6);
        }
        ctx!.strokeStyle = hexToRgba(color, 0.3);
        ctx!.lineWidth = 0.5;
        ctx!.stroke();
      }

      // Legendary corona
      if (crystal.is_legendary) {
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + t;
          const rayLen = size * (1.5 + Math.sin(t * 3 + i) * 0.3);
          ctx!.beginPath();
          ctx!.moveTo(Math.cos(angle) * size, Math.sin(angle) * size);
          ctx!.lineTo(Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
          ctx!.strokeStyle = hexToRgba("#fbbf24", 0.4 + Math.sin(t + i) * 0.2);
          ctx!.lineWidth = 2;
          ctx!.stroke();
        }
      }

      ctx!.restore();

      // Spawn particles
      if (frame % 3 === 0 && crystal.star_rating >= 2) {
        const angle = Math.random() * Math.PI * 2;
        const dist = W * 0.15 + Math.random() * W * 0.1;
        particles.push({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.3 - Math.random() * 0.5,
          life: 0,
          maxLife: 30 + Math.random() * 30,
          size: 1 + Math.random() * 2,
        });
      }

      // Draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        const alpha = 1 - p.life / p.maxLife;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx!.fillStyle = hexToRgba(color, alpha * 0.6);
        ctx!.fill();
      }

      // Star rating display
      const starY = H - 8;
      ctx!.textAlign = "center";
      ctx!.font = "8px monospace";
      ctx!.fillStyle = hexToRgba(color, 0.8);
      ctx!.fillText("★".repeat(crystal.star_rating), cx, starY);

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [crystal, color]);

  if (compact) {
    return (
      <button
        onClick={() => onClick?.(crystal)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative rounded transition-all duration-200"
        style={{
          width: 64,
          height: 80,
          background: selected ? hexToRgba(color, 0.12) : "#05080f",
          border: `1px solid ${selected ? color : hexToRgba(color, 0.15)}`,
          boxShadow: hovered ? `0 0 12px ${hexToRgba(color, 0.3)}` : "none",
        }}
      >
        <canvas ref={canvasRef} width={64} height={64} className="w-full" />
        <div
          className="absolute bottom-0 left-0 right-0 text-[7px] font-mono truncate px-1 pb-1"
          style={{ color: hexToRgba(color, 0.7) }}
        >
          {crystal.name}
        </div>
      </button>
    );
  }

  return (
    <div
      onClick={() => onClick?.(crystal)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-lg overflow-hidden cursor-pointer transition-all duration-300"
      style={{
        background: selected ? hexToRgba(color, 0.08) : "#05080fcc",
        border: `1px solid ${selected ? color : hexToRgba(color, 0.15)}`,
        boxShadow: hovered
          ? `0 0 20px ${hexToRgba(color, 0.2)}, inset 0 0 20px ${hexToRgba(color, 0.05)}`
          : "none",
      }}
    >
      {/* Crystal Canvas */}
      <div className="relative">
        <canvas ref={canvasRef} width={200} height={120} className="w-full" />

        {/* Legendary badge */}
        {crystal.is_legendary && (
          <div
            className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold"
            style={{
              background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              color: "#000",
            }}
          >
            LEGENDARY
          </div>
        )}

        {/* Fused badge */}
        {crystal.is_fused && !crystal.is_legendary && (
          <div
            className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-mono"
            style={{
              background: hexToRgba(color, 0.2),
              color: color,
              border: `1px solid ${hexToRgba(color, 0.3)}`,
            }}
          >
            FUSED
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Name + Class */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span style={{ color }}>{CLASS_ICONS[crystal.class]}</span>
            <span
              className="text-xs font-mono font-bold tracking-wide truncate max-w-[120px]"
              style={{ color }}
            >
              {crystal.name}
            </span>
          </div>
          <span
            className="text-[9px] font-mono uppercase"
            style={{ color: hexToRgba(color, 0.5) }}
          >
            {crystal.class}
          </span>
        </div>

        {/* Star rating */}
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color }}>
            {"★".repeat(crystal.star_rating)}
            {"☆".repeat(Math.max(0, 6 - crystal.star_rating))}
          </span>
          <span
            className="text-[9px] font-mono"
            style={{ color: hexToRgba(color, 0.4) }}
          >
            Lv.{crystal.level}
          </span>
        </div>

        {/* XP Bar */}
        <div>
          <div className="flex justify-between mb-0.5">
            <span className="text-[8px] font-mono" style={{ color: hexToRgba(color, 0.4) }}>
              XP
            </span>
            <span className="text-[8px] font-mono" style={{ color: hexToRgba(color, 0.4) }}>
              {xp.current}/{xp.needed}
            </span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: hexToRgba(color, 0.1) }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${xp.pct * 100}%`,
                background: `linear-gradient(90deg, ${hexToRgba(color, 0.5)}, ${color})`,
                boxShadow: `0 0 6px ${hexToRgba(color, 0.4)}`,
              }}
            />
          </div>
        </div>

        {/* Effects */}
        {Object.keys(crystal.effects).length > 0 && (
          <div className="space-y-0.5">
            {Object.entries(crystal.effects).slice(0, 3).map(([key, val]) => (
              <div
                key={key}
                className="flex justify-between text-[8px] font-mono"
                style={{ color: hexToRgba(color, 0.5) }}
              >
                <span>{key.replace(/_/g, " ")}</span>
                <span style={{ color: hexToRgba(color, 0.7) }}>+{val}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Equipped status */}
        {crystal.equipped_by && (
          <div
            className="flex items-center gap-1 text-[8px] font-mono"
            style={{ color: "#39ff14" }}
          >
            <Sword className="h-2.5 w-2.5" />
            Equipped by {crystal.equipped_by}
          </div>
        )}

        {/* Action buttons */}
        {(onEquip || onSummon) && (
          <div className="flex gap-1 pt-1">
            {onEquip && (
              <button
                onClick={(e) => { e.stopPropagation(); onEquip(crystal); }}
                className="flex-1 py-1 rounded text-[8px] font-mono transition-all"
                style={{
                  border: `1px solid ${hexToRgba(color, 0.2)}`,
                  color: hexToRgba(color, 0.6),
                  background: hexToRgba(color, 0.05),
                }}
              >
                {crystal.equipped_by ? "UNEQUIP" : "EQUIP"}
              </button>
            )}
            {onSummon && (
              <button
                onClick={(e) => { e.stopPropagation(); onSummon(crystal); }}
                className="flex-1 py-1 rounded text-[8px] font-mono transition-all"
                style={{
                  border: `1px solid ${hexToRgba("#a855f7", 0.2)}`,
                  color: hexToRgba("#a855f7", 0.6),
                  background: hexToRgba("#a855f7", 0.05),
                }}
              >
                SUMMON
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
