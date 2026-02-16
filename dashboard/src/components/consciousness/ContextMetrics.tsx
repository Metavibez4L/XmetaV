"use client";

import React from "react";
import type { MemoryQuery } from "@/hooks/useConsciousness";
import { BarChart3, Clock, Search, Target } from "lucide-react";

interface Props {
  queries: MemoryQuery[];
  avgRelevance: number;
  avgQueryTime: number;
  totalInjections: number;
  memoryCount: number;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const ContextMetrics = React.memo(function ContextMetrics({
  queries,
  avgRelevance,
  avgQueryTime,
  totalInjections,
  memoryCount,
}: Props) {
  const coverage = memoryCount > 0 ? Math.min(100, Math.round((totalInjections / memoryCount) * 100)) : 0;
  const recentQueries = queries.slice(0, 5);

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4" style={{ color: "#f59e0b" }} />
        <h2
          className="text-sm font-mono font-bold tracking-wider"
          style={{ color: "#f59e0b" }}
        >
          CONTEXT INJECTION
        </h2>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <MetricCard
          value={totalInjections}
          label="Injections"
          icon={<Search className="h-3 w-3" />}
          color="#00f0ff"
        />
        <MetricCard
          value={`${Math.round(avgRelevance * 100)}%`}
          label="Relevance"
          icon={<Target className="h-3 w-3" />}
          color="#39ff14"
        />
        <MetricCard
          value={`${avgQueryTime.toFixed(1)}s`}
          label="Query Time"
          icon={<Clock className="h-3 w-3" />}
          color="#a855f7"
        />
        <MetricCard
          value={`${coverage}%`}
          label="Coverage"
          icon={<BarChart3 className="h-3 w-3" />}
          color="#f59e0b"
        />
      </div>

      {/* Recent injections feed */}
      {recentQueries.length > 0 && (
        <div>
          <div
            className="text-[9px] font-mono uppercase tracking-wider mb-2"
            style={{ color: "#4a6a8a" }}
          >
            RECENT INJECTIONS
          </div>
          <div className="space-y-1.5">
            {recentQueries.map((q) => (
              <div
                key={q.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] font-mono"
                style={{
                  background: "#0d152510",
                  border: "1px solid #00f0ff08",
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background:
                      q.relevance_scores.length > 0
                        ? q.relevance_scores[0] > 0.7
                          ? "#39ff14"
                          : q.relevance_scores[0] > 0.4
                            ? "#f59e0b"
                            : "#ef4444"
                        : "#4a6a8a",
                  }}
                />
                <span style={{ color: "#00f0ff88" }}>{q.agent_id}</span>
                <span style={{ color: "#4a6a8a" }}>→</span>
                <span className="truncate flex-1" style={{ color: "#c8d6e5aa" }}>
                  {q.task_keywords.join(", ") || "—"}
                </span>
                <span className="flex-shrink-0" style={{ color: "#4a6a8a66" }}>
                  {q.retrieved_memory_ids.length} hits
                </span>
                <span className="flex-shrink-0" style={{ color: "#4a6a8a44" }}>
                  {fmtTime(q.query_time)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentQueries.length === 0 && (
        <div className="text-center py-4 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
          No context injections recorded yet.
        </div>
      )}
    </div>
  );
});

function MetricCard({
  value,
  label,
  icon,
  color,
}: {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className="rounded-lg p-3 text-center"
      style={{
        background: `${color}06`,
        border: `1px solid ${color}18`,
      }}
    >
      <div className="flex items-center justify-center mb-1.5" style={{ color: `${color}66` }}>
        {icon}
      </div>
      <div className="text-lg font-mono font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[8px] font-mono tracking-wider mt-0.5" style={{ color: "#4a6a8a" }}>
        {label}
      </div>
    </div>
  );
}
