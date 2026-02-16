"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Flame, Archive, Gem, AlertCircle, RefreshCw, ChevronDown } from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface ReforgeStats {
  totalMemories: number;
  archived: number;
  decaying: number;
  healthy: number;
  reforgedCrystals: number;
  totalCompressed: number;
  avgDecay: number;
}

interface ReforgedCrystal {
  id: string;
  legendary_name: string;
  summary: string;
  source_count: number;
  compression_ratio: number;
  keywords: string[];
  reforged_by: string;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getDecayColor(score: number): string {
  if (score >= 0.7) return "#39ff14";
  if (score >= 0.4) return "#f59e0b";
  if (score >= 0.15) return "#ef4444";
  return "#4a6a8a";
}

function getDecayLabel(score: number): string {
  if (score >= 0.7) return "STRONG";
  if (score >= 0.4) return "FADING";
  if (score >= 0.15) return "DECAYING";
  return "FORGOTTEN";
}

// ── Component ────────────────────────────────────────────────

export function MemoryReforge() {
  const [stats, setStats] = useState<ReforgeStats | null>(null);
  const [reforges, setReforges] = useState<ReforgedCrystal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, reforgesRes] = await Promise.all([
        fetch("/api/soul/consciousness?action=reforge_stats"),
        fetch("/api/soul/consciousness?action=reforges"),
      ]);

      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats || null);
      }
      if (reforgesRes.ok) {
        const d = await reforgesRes.json();
        setReforges(d.reforges || []);
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

  // Memory health donut calculation
  const total = stats ? stats.healthy + stats.decaying + stats.archived : 0;
  const healthyPct = total > 0 ? (stats!.healthy / total) * 100 : 100;
  const decayingPct = total > 0 ? (stats!.decaying / total) * 100 : 0;
  const archivedPct = total > 0 ? (stats!.archived / total) * 100 : 0;

  return (
    <div className="cyber-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4" style={{ color: "#ef4444" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#ef4444" }}
          >
            MEMORY REFORGE
          </h2>
          <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
            // decay · archive · compress → legendary
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-[10px] font-mono text-center py-4" style={{ color: "#4a6a8a" }}>
          <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" style={{ color: "#4a6a8a" }} />
          Scanning memory decay...
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 gap-4 mb-5">
              {/* Memory Health Bar */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
                    MEMORY HEALTH
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: getDecayColor(stats.avgDecay) }}>
                    avg {getDecayLabel(stats.avgDecay)} ({Math.round(stats.avgDecay * 100)}%)
                  </span>
                </div>
                <div
                  className="h-3 rounded-full overflow-hidden flex"
                  style={{ background: "#0a0f1a" }}
                >
                  {healthyPct > 0 && (
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${healthyPct}%`, background: "#39ff14" }}
                      title={`Healthy: ${stats.healthy}`}
                    />
                  )}
                  {decayingPct > 0 && (
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${decayingPct}%`, background: "#f59e0b" }}
                      title={`Decaying: ${stats.decaying}`}
                    />
                  )}
                  {archivedPct > 0 && (
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${archivedPct}%`, background: "#4a6a8a" }}
                      title={`Archived: ${stats.archived}`}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: "#39ff14" }} />
                      <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                        {stats.healthy} healthy
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />
                      <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                        {stats.decaying} fading
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: "#4a6a8a" }} />
                      <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                        {stats.archived} archived
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Stat Cards */}
              {[
                {
                  label: "TRACKED",
                  value: stats.totalMemories,
                  icon: <Archive className="h-3.5 w-3.5" />,
                  color: "#00f0ff",
                },
                {
                  label: "LEGENDARIES",
                  value: stats.reforgedCrystals,
                  icon: <Gem className="h-3.5 w-3.5" />,
                  color: "#ffd700",
                },
                {
                  label: "COMPRESSED",
                  value: stats.totalCompressed,
                  icon: <Flame className="h-3.5 w-3.5" />,
                  color: "#ef4444",
                },
                {
                  label: "AVG DECAY",
                  value: `${Math.round(stats.avgDecay * 100)}%`,
                  icon: <AlertCircle className="h-3.5 w-3.5" />,
                  color: getDecayColor(stats.avgDecay),
                },
              ].map(({ label, value, icon, color }) => (
                <div
                  key={label}
                  className="p-3 rounded-lg flex items-center gap-3"
                  style={{ background: `${color}06`, border: `1px solid ${color}18` }}
                >
                  <span style={{ color }}>{icon}</span>
                  <div>
                    <div className="text-[14px] font-mono font-bold" style={{ color }}>
                      {value}
                    </div>
                    <div className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                      {label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent Reforges */}
          <div className="flex items-center gap-2 mb-3">
            <Gem className="h-3.5 w-3.5" style={{ color: "#ffd700" }} />
            <span className="text-[10px] font-mono font-bold" style={{ color: "#ffd700" }}>
              LEGENDARY CRYSTALS
            </span>
          </div>

          {reforges.length === 0 ? (
            <div
              className="text-center py-4 rounded-lg"
              style={{ background: "#ffd70005", border: "1px solid #ffd70011" }}
            >
              <Gem className="h-5 w-5 mx-auto mb-2" style={{ color: "#ffd70033" }} />
              <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                No reforged crystals yet. Memories will be auto-reforged during dream cycles
                once enough low-vitality memories accumulate.
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {reforges.map((crystal) => {
                const isExpanded = expanded === crystal.id;
                return (
                  <div
                    key={crystal.id}
                    onClick={() => setExpanded(isExpanded ? null : crystal.id)}
                    className="p-3 rounded-lg cursor-pointer transition-all"
                    style={{
                      background: isExpanded ? "#ffd70010" : "#0a0f1a",
                      border: `1px solid ${isExpanded ? "#ffd70044" : "#1a2a3a"}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Gem className="h-3 w-3" style={{ color: "#ffd700" }} />
                        <span
                          className="text-[10px] font-mono font-bold"
                          style={{ color: "#ffd700" }}
                        >
                          {crystal.legendary_name}
                        </span>
                        <span
                          className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                          style={{
                            color: "#a855f7",
                            background: "#a855f708",
                            border: "1px solid #a855f722",
                          }}
                        >
                          5★ LEGENDARY
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono" style={{ color: "#ef4444" }}>
                          {crystal.source_count}→1
                        </span>
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          style={{ color: "#4a6a8a" }}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 pt-2" style={{ borderTop: "1px solid #1a2a3a" }}>
                        <div
                          className="text-[10px] font-mono whitespace-pre-wrap mb-2"
                          style={{ color: "#c8d6e5" }}
                        >
                          {crystal.summary}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {crystal.keywords.map((kw) => (
                            <span
                              key={kw}
                              className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                              style={{ color: "#ffd700", background: "#ffd70010" }}
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                            Reforged by: {crystal.reforged_by}
                          </span>
                          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                            {timeSince(crystal.created_at)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
