"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, Clock, ArrowRight, TrendingUp, ThumbsUp, ThumbsDown } from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface Prediction {
  id: string;
  agent_id: string;
  trigger_type: string;
  predicted_intent: string;
  preloaded_memory_ids: string[];
  preloaded_shard_ids: string[];
  confidence: number;
  was_useful: boolean | null;
  prediction_context: Record<string, any>;
  created_at: string;
  used_at: string | null;
}

interface PredictionStats {
  totalPredictions: number;
  consumed: number;
  useful: number;
  accuracy: number;
  byTrigger: Record<string, { total: number; useful: number }>;
}

// ── Constants ────────────────────────────────────────────────

const TRIGGER_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  time_of_day: { icon: <Clock className="h-3 w-3" />,        color: "#f59e0b", label: "TIME" },
  day_of_week: { icon: <Clock className="h-3 w-3" />,        color: "#00f0ff", label: "DAY" },
  sequential:  { icon: <ArrowRight className="h-3 w-3" />,   color: "#a855f7", label: "SEQ" },
  cadence:     { icon: <TrendingUp className="h-3 w-3" />,   color: "#39ff14", label: "CADENCE" },
  calendar:    { icon: <Sparkles className="h-3 w-3" />,     color: "#ef4444", label: "CALENDAR" },
};

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Component ────────────────────────────────────────────────

export function PredictiveContext() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [predRes, statsRes] = await Promise.all([
        fetch("/api/soul/consciousness?action=predictions"),
        fetch("/api/soul/consciousness?action=prediction_stats"),
      ]);

      if (predRes.ok) {
        const d = await predRes.json();
        setPredictions(d.predictions || []);
      }
      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats || null);
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

  const handleFeedback = async (predictionId: string, wasUseful: boolean) => {
    try {
      await fetch("/api/soul/consciousness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "consume_prediction", predictionId, wasUseful }),
      });
      // Optimistically update
      setPredictions((prev) =>
        prev.map((p) =>
          p.id === predictionId ? { ...p, was_useful: wasUseful, used_at: new Date().toISOString() } : p
        )
      );
    } catch {
      // Silently handle
    }
  };

  return (
    <div className="cyber-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "#00f0ff" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#00f0ff" }}
          >
            PREDICTIVE LOADING
          </h2>
          <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
            // soul anticipates your next move
          </span>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "PREDICTIONS", value: stats.totalPredictions, color: "#00f0ff" },
            { label: "CONSUMED", value: stats.consumed, color: "#f59e0b" },
            { label: "USEFUL", value: stats.useful, color: "#39ff14" },
            {
              label: "ACCURACY",
              value: `${stats.accuracy}%`,
              color: stats.accuracy >= 70 ? "#39ff14" : stats.accuracy >= 40 ? "#f59e0b" : "#ef4444",
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

      {/* Accuracy by Trigger Type */}
      {stats && Object.keys(stats.byTrigger).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(stats.byTrigger).map(([trigger, data]) => {
            const meta = TRIGGER_META[trigger] || TRIGGER_META.sequential;
            const triggerAcc = data.total > 0 ? Math.round((data.useful / data.total) * 100) : 0;
            return (
              <div
                key={trigger}
                className="flex items-center gap-1.5 px-2 py-1 rounded"
                style={{ background: `${meta.color}08`, border: `1px solid ${meta.color}22` }}
              >
                <span style={{ color: meta.color }}>{meta.icon}</span>
                <span className="text-[8px] font-mono" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                  {data.total} ({triggerAcc}%)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Predictions */}
      {loading ? (
        <div className="text-[10px] font-mono text-center py-4" style={{ color: "#4a6a8a" }}>
          Loading predictions...
        </div>
      ) : predictions.length === 0 ? (
        <div
          className="text-center py-4 rounded-lg"
          style={{ background: "#00f0ff05", border: "1px solid #00f0ff11" }}
        >
          <Sparkles className="h-5 w-5 mx-auto mb-2" style={{ color: "#00f0ff33" }} />
          <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
            No active predictions. Soul will generate anticipatory context during the next dream cycle.
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {predictions.map((pred) => {
            const meta = TRIGGER_META[pred.trigger_type] || TRIGGER_META.sequential;
            const isConsumed = pred.used_at !== null;

            return (
              <div
                key={pred.id}
                className="p-3 rounded-lg transition-all"
                style={{
                  background: isConsumed ? "#0a0f1a" : `${meta.color}06`,
                  border: `1px solid ${isConsumed ? "#1a2a3a" : meta.color + "22"}`,
                  opacity: isConsumed ? 0.6 : 1,
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span
                      className="text-[9px] font-mono font-bold"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                      {Math.round(pred.confidence * 100)}% confident
                    </span>
                  </div>
                  <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                    {timeSince(pred.created_at)}
                  </span>
                </div>

                <div className="text-[10px] font-mono mb-2" style={{ color: "#c8d6e5" }}>
                  🔮 {pred.predicted_intent}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {pred.preloaded_memory_ids.length > 0 && (
                      <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                        {pred.preloaded_memory_ids.length} memories pre-staged
                      </span>
                    )}
                    {pred.preloaded_shard_ids.length > 0 && (
                      <span className="text-[8px] font-mono" style={{ color: "#ffd700" }}>
                        + {pred.preloaded_shard_ids.length} shards
                      </span>
                    )}
                  </div>

                  {!isConsumed && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFeedback(pred.id, true); }}
                        className="p-1 rounded transition-all hover:bg-[#39ff1410]"
                        title="This was useful"
                      >
                        <ThumbsUp className="h-3 w-3" style={{ color: "#39ff14" }} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFeedback(pred.id, false); }}
                        className="p-1 rounded transition-all hover:bg-[#ef444410]"
                        title="Not useful"
                      >
                        <ThumbsDown className="h-3 w-3" style={{ color: "#ef4444" }} />
                      </button>
                    </div>
                  )}

                  {isConsumed && (
                    <span
                      className="text-[8px] font-mono"
                      style={{ color: pred.was_useful ? "#39ff14" : "#ef4444" }}
                    >
                      {pred.was_useful ? "✓ USEFUL" : "✗ NOT USEFUL"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
