"use client";

import React, { useMemo } from "react";
import type { DreamInsight } from "@/hooks/useConsciousness";
import { Moon, Sparkles, AlertCircle, BookOpen, RefreshCw } from "lucide-react";

interface Props {
  dreamInsights: DreamInsight[];
  lastDreamAt: string | null;
  dreamReady: boolean;
  memoryCount: number;
}

const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string }> = {
  pattern: { icon: <Sparkles className="h-3 w-3" />, color: "#a855f7" },
  recommendation: { icon: <BookOpen className="h-3 w-3" />, color: "#39ff14" },
  summary: { icon: <RefreshCw className="h-3 w-3" />, color: "#00f0ff" },
  correction: { icon: <AlertCircle className="h-3 w-3" />, color: "#ef4444" },
};

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const DreamModeStatus = React.memo(function DreamModeStatus({
  dreamInsights,
  lastDreamAt,
  dreamReady,
  memoryCount,
}: Props) {
  const status = dreamReady ? "READY" : lastDreamAt ? "COOLDOWN" : "WAITING";
  const statusColor = dreamReady ? "#39ff14" : lastDreamAt ? "#f59e0b" : "#4a6a8a";

  // Estimate idle progress towards dream trigger (6 hours)
  const idleProgress = useMemo(() => {
    if (dreamReady) return 100;
    // We don't have exact idle time, so estimate from last dream
    if (!lastDreamAt) return Math.min(50, memoryCount * 3);
    const since = Date.now() - new Date(lastDreamAt).getTime();
    const sixHrs = 6 * 60 * 60 * 1000;
    return Math.min(100, Math.round((since / sixHrs) * 100));
  }, [dreamReady, lastDreamAt, memoryCount]);

  const recentInsights = dreamInsights.slice(0, 5);

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4" style={{ color: "#a855f7" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#a855f7" }}
          >
            DREAM MODE
          </h2>
        </div>
        <span
          className="text-[9px] font-mono px-2 py-0.5 rounded"
          style={{
            color: statusColor,
            border: `1px solid ${statusColor}33`,
            background: `${statusColor}08`,
          }}
        >
          {status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
            Idle threshold (6hr required)
          </span>
          <span className="text-[9px] font-mono" style={{ color: statusColor }}>
            {idleProgress}%
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "#0d1525", border: "1px solid #00f0ff10" }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${idleProgress}%`,
              background: `linear-gradient(90deg, ${statusColor}88, ${statusColor})`,
              boxShadow: dreamReady ? `0 0 8px ${statusColor}44` : "none",
            }}
          />
        </div>
        <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a66" }}>
          {memoryCount} memories ready for consolidation
        </div>
      </div>

      {/* Latest dream insights */}
      {recentInsights.length > 0 ? (
        <div>
          <div
            className="text-[9px] font-mono uppercase tracking-wider mb-2"
            style={{ color: "#4a6a8a" }}
          >
            RECENT INSIGHTS
          </div>
          <div className="space-y-2">
            {recentInsights.map((insight) => {
              const meta = CATEGORY_META[insight.category] ?? CATEGORY_META.pattern;
              return (
                <div
                  key={insight.id}
                  className="px-3 py-2 rounded"
                  style={{
                    background: `${meta.color}06`,
                    border: `1px solid ${meta.color}15`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span
                      className="text-[9px] font-mono uppercase tracking-wider"
                      style={{ color: meta.color }}
                    >
                      {insight.category}
                    </span>
                    <span className="flex-1" />
                    <span
                      className="text-[8px] font-mono"
                      style={{ color: "#4a6a8a66" }}
                    >
                      {timeSince(insight.generated_at)}
                    </span>
                    <span
                      className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        color: `${meta.color}88`,
                        border: `1px solid ${meta.color}22`,
                      }}
                    >
                      {Math.round(insight.confidence * 100)}%
                    </span>
                  </div>
                  <div
                    className="text-[10px] font-mono leading-relaxed"
                    style={{ color: "#c8d6e5cc" }}
                  >
                    {insight.insight.length > 200
                      ? insight.insight.slice(0, 200) + "…"
                      : insight.insight}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <Moon className="h-6 w-6 mx-auto mb-2" style={{ color: "#4a6a8a33" }} />
          <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
            No dream cycles completed yet.
          </div>
          <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a66" }}>
            Dreams consolidate memory after 6 hours of idle time.
          </div>
        </div>
      )}

      {/* Last dream timestamp */}
      {lastDreamAt && (
        <div
          className="text-[9px] font-mono mt-3 pt-2 text-center"
          style={{ color: "#4a6a8a66", borderTop: "1px solid #00f0ff08" }}
        >
          Last dream cycle: {timeSince(lastDreamAt)}
        </div>
      )}
    </div>
  );
});
