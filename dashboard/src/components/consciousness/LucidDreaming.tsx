"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Eye,
  Zap,
  Check,
  X,
  Sparkles,
  GitMerge,
  AlertTriangle,
  Users,
  DollarSign,
  Wrench,
  TrendingUp,
  Clock,
  Moon,
  Play,
} from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

/* ── Types ─────────────────────────────────────────────────── */

interface Manifestation {
  id: string;
  title: string;
  description: string;
  category: string;
  confidence: number;
  priority: number;
  source_memories: string[];
  source_insights: string[];
  proposed_action: Record<string, unknown>;
  status: string;
  dream_session_id: string | null;
  approved_by: string | null;
  executed_at: string | null;
  created_at: string;
}

interface DreamSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  memories_scanned: number;
  clusters_found: number;
  insights_generated: number;
  proposals_created: number;
  auto_executed: number;
  trigger_type: string;
  status: string;
}

/* ── Category Config ───────────────────────────────────────── */

const CATEGORY_META: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  fusion: {
    icon: <GitMerge className="h-3 w-3" />,
    color: "#ff006e",
    label: "Crystal Fusion",
  },
  association: {
    icon: <Sparkles className="h-3 w-3" />,
    color: "#a855f7",
    label: "Association",
  },
  pricing: {
    icon: <DollarSign className="h-3 w-3" />,
    color: "#39ff14",
    label: "Pricing",
  },
  skill: {
    icon: <Wrench className="h-3 w-3" />,
    color: "#00f0ff",
    label: "Skill",
  },
  meeting: {
    icon: <Users className="h-3 w-3" />,
    color: "#f59e0b",
    label: "Meeting",
  },
  pattern: {
    icon: <TrendingUp className="h-3 w-3" />,
    color: "#818cf8",
    label: "Pattern",
  },
  correction: {
    icon: <AlertTriangle className="h-3 w-3" />,
    color: "#ef4444",
    label: "Correction",
  },
};

const STATUS_COLORS: Record<string, string> = {
  proposed: "#f59e0b",
  approved: "#00f0ff",
  rejected: "#ef4444",
  executed: "#39ff14",
  auto_executed: "#a855f7",
  expired: "#4a6a8a",
};

/* ── Helpers ───────────────────────────────────────────────── */

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function priorityLabel(p: number): string {
  switch (p) {
    case 5: return "CRITICAL";
    case 4: return "HIGH";
    case 3: return "MEDIUM";
    case 2: return "LOW";
    default: return "MINIMAL";
  }
}

function priorityColor(p: number): string {
  switch (p) {
    case 5: return "#ef4444";
    case 4: return "#f59e0b";
    case 3: return "#00f0ff";
    case 2: return "#818cf8";
    default: return "#4a6a8a";
  }
}

/* ── Component ─────────────────────────────────────────────── */

export const LucidDreaming = React.memo(function LucidDreaming() {
  const supabase = useMemo(() => createClient(), []);
  const [manifestations, setManifestations] = useState<Manifestation[]>([]);
  const [sessions, setSessions] = useState<DreamSessionRow[]>([]);
  const [filter, setFilter] = useState<"proposed" | "all">("proposed");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [manifRes, sessRes] = await Promise.all([
        filter === "proposed"
          ? supabase
              .from("soul_dream_manifestations")
              .select("*")
              .eq("status", "proposed")
              .order("priority", { ascending: false })
              .order("confidence", { ascending: false })
              .limit(30)
          : supabase
              .from("soul_dream_manifestations")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(50),
        supabase
          .from("soul_dream_sessions")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(5),
      ]);

      setManifestations((manifRes.data ?? []) as Manifestation[]);
      setSessions((sessRes.data ?? []) as DreamSessionRow[]);
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [supabase, filter]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // Stats
  const stats = useMemo(() => {
    const all = manifestations;
    return {
      proposed: all.filter((m) => m.status === "proposed").length,
      executed: all.filter((m) => m.status === "executed" || m.status === "auto_executed").length,
      rejected: all.filter((m) => m.status === "rejected").length,
      total: all.length,
    };
  }, [manifestations]);

  // Approve
  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await fetch("/api/soul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id }),
      });
      await fetchData();
    } catch {
      // Non-fatal
    } finally {
      setActionLoading(null);
    }
  };

  // Reject
  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await fetch("/api/soul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", id }),
      });
      await fetchData();
    } catch {
      // Non-fatal
    } finally {
      setActionLoading(null);
    }
  };

  // Trigger dream
  const handleTriggerDream = async () => {
    setTriggerLoading(true);
    try {
      await fetch("/api/soul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger_dream" }),
      });
    } catch {
      // Non-fatal
    } finally {
      setTriggerLoading(false);
    }
  };

  return (
    <div className="cyber-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" style={{ color: "#ff006e" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#ff006e" }}
          >
            LUCID DREAMING
          </h2>
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded"
            style={{
              color: "#ff006e88",
              border: "1px solid #ff006e22",
              background: "#ff006e06",
            }}
          >
            PHASE 5
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Dream trigger button */}
          <button
            onClick={handleTriggerDream}
            disabled={triggerLoading}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono transition-all hover:border-[#ff006e44]"
            style={{
              color: triggerLoading ? "#4a6a8a" : "#ff006e",
              border: `1px solid ${triggerLoading ? "#4a6a8a22" : "#ff006e22"}`,
              background: "#05080fcc",
            }}
          >
            <Play className="h-3 w-3" />
            {triggerLoading ? "TRIGGERING…" : "DREAM NOW"}
          </button>
          {/* Filter toggle */}
          <button
            onClick={() => setFilter((f) => (f === "proposed" ? "all" : "proposed"))}
            className="px-2 py-1 rounded text-[9px] font-mono transition-all"
            style={{
              color: filter === "proposed" ? "#f59e0b" : "#4a6a8a",
              border: `1px solid ${filter === "proposed" ? "#f59e0b22" : "#4a6a8a22"}`,
              background: "#05080fcc",
            }}
          >
            {filter === "proposed" ? "PENDING" : "ALL"}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "Pending", value: stats.proposed, color: "#f59e0b" },
          { label: "Executed", value: stats.executed, color: "#39ff14" },
          { label: "Rejected", value: stats.rejected, color: "#ef4444" },
          { label: "Total", value: stats.total, color: "#00f0ff" },
        ].map((s) => (
          <div
            key={s.label}
            className="text-center py-2 rounded"
            style={{
              background: `${s.color}06`,
              border: `1px solid ${s.color}12`,
            }}
          >
            <div
              className="text-lg font-mono font-bold"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
            <div
              className="text-[8px] font-mono uppercase tracking-wider"
              style={{ color: `${s.color}88` }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Manifestation List */}
      {loading ? (
        <div className="text-center py-6">
          <Moon className="h-6 w-6 mx-auto mb-2 animate-pulse" style={{ color: "#ff006e44" }} />
          <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
            Loading dream proposals…
          </div>
        </div>
      ) : manifestations.length > 0 ? (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {manifestations.map((m) => {
            const meta = CATEGORY_META[m.category] ?? CATEGORY_META.pattern;
            const isActionable = m.status === "proposed";
            const isLoading = actionLoading === m.id;
            const statusColor = STATUS_COLORS[m.status] ?? "#4a6a8a";

            return (
              <div
                key={m.id}
                className="px-3 py-3 rounded transition-all"
                style={{
                  background: `${meta.color}06`,
                  border: `1px solid ${meta.color}15`,
                }}
              >
                {/* Top row: category + priority + confidence + status */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ color: meta.color }}>{meta.icon}</span>
                  <span
                    className="text-[9px] font-mono uppercase tracking-wider"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      color: priorityColor(m.priority),
                      border: `1px solid ${priorityColor(m.priority)}22`,
                    }}
                  >
                    P{m.priority} {priorityLabel(m.priority)}
                  </span>
                  <span className="flex-1" />
                  <span
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      color: `${meta.color}88`,
                      border: `1px solid ${meta.color}22`,
                    }}
                  >
                    {Math.round(m.confidence * 100)}%
                  </span>
                  <span
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded uppercase"
                    style={{
                      color: statusColor,
                      border: `1px solid ${statusColor}22`,
                      background: `${statusColor}08`,
                    }}
                  >
                    {m.status.replace("_", " ")}
                  </span>
                </div>

                {/* Title */}
                <div
                  className="text-[11px] font-mono font-bold mb-1"
                  style={{ color: "#e8f0fe" }}
                >
                  {m.title}
                </div>

                {/* Description */}
                <div
                  className="text-[10px] font-mono leading-relaxed mb-2"
                  style={{ color: "#c8d6e5aa" }}
                >
                  {m.description.length > 250
                    ? m.description.slice(0, 250) + "…"
                    : m.description}
                </div>

                {/* Footer: timestamp + actions */}
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" style={{ color: "#4a6a8a44" }} />
                  <span
                    className="text-[8px] font-mono"
                    style={{ color: "#4a6a8a66" }}
                  >
                    {timeSince(m.created_at)}
                  </span>
                  {m.source_memories.length > 0 && (
                    <span
                      className="text-[8px] font-mono"
                      style={{ color: "#4a6a8a44" }}
                    >
                      · {m.source_memories.length} memories
                    </span>
                  )}
                  <span className="flex-1" />

                  {isActionable && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleApprove(m.id)}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono transition-all hover:border-[#39ff1444]"
                        style={{
                          color: isLoading ? "#4a6a8a" : "#39ff14",
                          border: `1px solid ${isLoading ? "#4a6a8a22" : "#39ff1422"}`,
                          background: "#05080fcc",
                        }}
                      >
                        <Check className="h-3 w-3" />
                        APPROVE
                      </button>
                      <button
                        onClick={() => handleReject(m.id)}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono transition-all hover:border-[#ef444444]"
                        style={{
                          color: isLoading ? "#4a6a8a" : "#ef4444",
                          border: `1px solid ${isLoading ? "#4a6a8a22" : "#ef444422"}`,
                          background: "#05080fcc",
                        }}
                      >
                        <X className="h-3 w-3" />
                        REJECT
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6">
          <Eye className="h-6 w-6 mx-auto mb-2" style={{ color: "#4a6a8a33" }} />
          <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
            No dream proposals yet.
          </div>
          <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a66" }}>
            Soul generates proposals during lucid dream cycles.
            <br />
            Click &quot;DREAM NOW&quot; to trigger one manually.
          </div>
        </div>
      )}

      {/* Recent Dream Sessions */}
      {sessions.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid #00f0ff08" }}>
          <div
            className="text-[9px] font-mono uppercase tracking-wider mb-2"
            style={{ color: "#4a6a8a" }}
          >
            RECENT DREAM SESSIONS
          </div>
          <div className="space-y-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-2 py-1 rounded"
                style={{
                  background: "#ff006e04",
                  border: "1px solid #ff006e08",
                }}
              >
                <Zap
                  className="h-3 w-3"
                  style={{
                    color:
                      s.status === "completed"
                        ? "#39ff14"
                        : s.status === "dreaming"
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                />
                <span
                  className="text-[9px] font-mono"
                  style={{ color: "#c8d6e5cc" }}
                >
                  {s.memories_scanned} memories → {s.clusters_found} clusters →{" "}
                  {s.insights_generated} insights → {s.proposals_created} proposals
                </span>
                {s.auto_executed > 0 && (
                  <span
                    className="text-[8px] font-mono px-1 rounded"
                    style={{ color: "#a855f7", border: "1px solid #a855f722" }}
                  >
                    {s.auto_executed} auto
                  </span>
                )}
                <span className="flex-1" />
                <span
                  className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded"
                  style={{
                    color: s.trigger_type === "manual" ? "#ff006e" : "#4a6a8a",
                    border: `1px solid ${s.trigger_type === "manual" ? "#ff006e22" : "#4a6a8a22"}`,
                  }}
                >
                  {s.trigger_type}
                </span>
                <span
                  className="text-[8px] font-mono"
                  style={{ color: "#4a6a8a66" }}
                >
                  {timeSince(s.started_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
