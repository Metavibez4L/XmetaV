"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, Eye, AlertTriangle, TrendingUp, Layers, Moon } from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface InsightShard {
  id: string;
  synthesis: string;
  pattern_type: string;
  confidence: number;
  awakening_message: string;
  shard_class: string;
  keywords: string[];
  agents_involved: string[];
  created_at: string;
}

interface SynthesisStats {
  totalShards: number;
  byPattern: Record<string, number>;
  byClass: Record<string, number>;
  recentAwakenings: number;
}

// ── Constants ────────────────────────────────────────────────

const PATTERN_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  convergence:   { icon: <Layers className="h-3 w-3" />,        color: "#00f0ff", label: "CONVERGENCE" },
  contradiction: { icon: <AlertTriangle className="h-3 w-3" />, color: "#ef4444", label: "CONTRADICTION" },
  evolution:     { icon: <TrendingUp className="h-3 w-3" />,    color: "#39ff14", label: "EVOLUTION" },
  blind_spot:    { icon: <Eye className="h-3 w-3" />,           color: "#f59e0b", label: "BLIND SPOT" },
  emergence:     { icon: <Sparkles className="h-3 w-3" />,      color: "#a855f7", label: "EMERGENCE" },
};

const CLASS_COLORS: Record<string, string> = {
  raw: "#4a6a8a",
  refined: "#00f0ff",
  crystallized: "#a855f7",
  transcendent: "#ffd700",
};

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Component ────────────────────────────────────────────────

export function DreamSynthesis() {
  const [shards, setShards] = useState<InsightShard[]>([]);
  const [stats, setStats] = useState<SynthesisStats | null>(null);
  const [awakenings, setAwakenings] = useState<InsightShard[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [shardsRes, statsRes, awakRes] = await Promise.all([
        fetch("/api/soul/consciousness?action=shards&limit=12"),
        fetch("/api/soul/consciousness?action=synthesis_stats"),
        fetch("/api/soul/consciousness?action=awakenings"),
      ]);

      if (shardsRes.ok) {
        const d = await shardsRes.json();
        setShards(d.shards || []);
      }
      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats || null);
      }
      if (awakRes.ok) {
        const d = await awakRes.json();
        setAwakenings(d.awakenings || []);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const triggerSynthesis = async () => {
    setTriggering(true);
    try {
      await fetch("/api/soul/consciousness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger_synthesis" }),
      });
      setTimeout(fetchData, 3000);
    } catch {
      // Silently handle
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="cyber-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4" style={{ color: "#ffd700" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#ffd700" }}
          >
            DREAM SYNTHESIS
          </h2>
          <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
            // anchor fusion → insight shards
          </span>
        </div>
        <button
          onClick={triggerSynthesis}
          disabled={triggering}
          className="text-[9px] font-mono px-2 py-1 rounded transition-all"
          style={{
            color: triggering ? "#4a6a8a" : "#ffd700",
            border: `1px solid ${triggering ? "#4a6a8a33" : "#ffd70033"}`,
            background: triggering ? "#4a6a8a08" : "#ffd70008",
          }}
        >
          {triggering ? "SYNTHESIZING..." : "⚗ SYNTHESIZE NOW"}
        </button>
      </div>

      {/* Awakening Messages */}
      {awakenings.length > 0 && (
        <div
          className="mb-4 p-3 rounded-lg"
          style={{ background: "#ffd70008", border: "1px solid #ffd70022" }}
        >
          <div className="text-[9px] font-mono mb-2" style={{ color: "#ffd700" }}>
            ✦ WHILE YOU WERE AWAY...
          </div>
          {awakenings.slice(0, 3).map((a) => (
            <div key={a.id} className="text-[10px] font-mono mb-1" style={{ color: "#c8d6e5" }}>
              {a.awakening_message}
            </div>
          ))}
        </div>
      )}

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "SHARDS", value: stats.totalShards, color: "#ffd700" },
            { label: "24H NEW", value: stats.recentAwakenings, color: "#39ff14" },
            {
              label: "TOP TYPE",
              value: Object.entries(stats.byPattern).sort((a, b) => b[1] - a[1])[0]?.[0]?.toUpperCase() ?? "—",
              color: "#00f0ff",
            },
            {
              label: "BEST CLASS",
              value: Object.entries(stats.byClass).sort((a, b) => b[1] - a[1])[0]?.[0]?.toUpperCase() ?? "—",
              color: "#a855f7",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="text-[16px] font-mono font-bold" style={{ color }}>
                {value}
              </div>
              <div className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shards List */}
      {loading ? (
        <div className="text-[10px] font-mono text-center py-4" style={{ color: "#4a6a8a" }}>
          Loading insight shards...
        </div>
      ) : shards.length === 0 ? (
        <div className="text-[10px] font-mono text-center py-4" style={{ color: "#4a6a8a" }}>
          No insight shards yet. Trigger a dream cycle to synthesize anchor patterns.
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {shards.map((shard) => {
            const meta = PATTERN_META[shard.pattern_type] || PATTERN_META.convergence;
            const classColor = CLASS_COLORS[shard.shard_class] || "#4a6a8a";
            const isExpanded = expanded === shard.id;

            return (
              <div
                key={shard.id}
                onClick={() => setExpanded(isExpanded ? null : shard.id)}
                className="p-3 rounded-lg cursor-pointer transition-all"
                style={{
                  background: isExpanded ? `${meta.color}10` : "#0a0f1a",
                  border: `1px solid ${isExpanded ? meta.color + "44" : "#1a2a3a"}`,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span
                      className="text-[9px] font-mono font-bold"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span
                      className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        color: classColor,
                        border: `1px solid ${classColor}33`,
                        background: `${classColor}08`,
                      }}
                    >
                      {shard.shard_class.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                      {Math.round(shard.confidence * 100)}%
                    </span>
                    <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                      {timeSince(shard.created_at)}
                    </span>
                  </div>
                </div>

                <div
                  className={`text-[10px] font-mono ${isExpanded ? "" : "line-clamp-2"}`}
                  style={{ color: "#c8d6e5" }}
                >
                  {shard.synthesis}
                </div>

                {isExpanded && (
                  <div className="mt-2 pt-2" style={{ borderTop: "1px solid #1a2a3a" }}>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {shard.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                          style={{ color: "#00f0ff", background: "#00f0ff10" }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                    {shard.agents_involved.length > 0 && (
                      <div className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                        Agents: {shard.agents_involved.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
