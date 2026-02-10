"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  ArrowRight,
  Users,
  Check,
  XCircle,
  Ban,
  Filter,
} from "lucide-react";
import type { SwarmRun, SwarmTask, SwarmMode, SwarmRunStatus } from "@/lib/types";

const modeIcons: Record<SwarmMode, React.ReactNode> = {
  parallel: <Zap className="h-3 w-3" />,
  pipeline: <ArrowRight className="h-3 w-3" />,
  collaborative: <Users className="h-3 w-3" />,
};

const modeColors: Record<SwarmMode, string> = {
  parallel: "#00f0ff",
  pipeline: "#39ff14",
  collaborative: "#a855f7",
};

const statusIcons: Record<string, React.ReactNode> = {
  completed: <Check className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
  cancelled: <Ban className="h-3 w-3" />,
};

const statusColors: Record<string, string> = {
  completed: "#39ff14",
  failed: "#ff2d5e",
  cancelled: "#f59e0b",
};

interface Props {
  runs: SwarmRun[];
  taskMap: Record<string, SwarmTask[]>;
  fetchTasks: (swarmId: string) => void;
}

export const SwarmHistory = React.memo(function SwarmHistory({
  runs,
  taskMap,
  fetchTasks,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modeFilter, setModeFilter] = useState<SwarmMode | "all">("all");
  const [statusFilter, setStatusFilter] = useState<SwarmRunStatus | "all">("all");

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (modeFilter !== "all" && r.mode !== modeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [runs, modeFilter, statusFilter]);

  const toggle = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
          if (!taskMap[id]) fetchTasks(id);
        }
        return next;
      });
    },
    [taskMap, fetchTasks]
  );

  const formatDuration = useCallback((start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }, []);

  const formatTime = useCallback((ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3 w-3" style={{ color: "#4a6a8a" }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
            Filters:
          </span>
        </div>

        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as SwarmMode | "all")}
          className="px-2 py-1 rounded text-[10px] font-mono cyber-input"
        >
          <option value="all">All Modes</option>
          <option value="parallel">Parallel</option>
          <option value="pipeline">Pipeline</option>
          <option value="collaborative">Collaborative</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SwarmRunStatus | "all")}
          className="px-2 py-1 rounded text-[10px] font-mono cyber-input"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
          {filteredRuns.length} runs
        </span>
      </div>

      {/* Runs list */}
      {filteredRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Clock className="h-10 w-10" style={{ color: "#00f0ff22" }} />
          <p className="text-[11px] font-mono" style={{ color: "#4a6a8a" }}>
            No swarm runs in history
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRuns.map((run) => {
            const isExpanded = expanded.has(run.id);
            const mc = modeColors[run.mode as SwarmMode] ?? "#00f0ff";
            const sc = statusColors[run.status] ?? "#4a6a8a";
            const si = statusIcons[run.status];
            const mi = modeIcons[run.mode as SwarmMode];
            const tasks = taskMap[run.id] ?? [];

            return (
              <div key={run.id} className="cyber-card rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(run.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left"
                >
                  {/* Status icon */}
                  <span style={{ color: sc }}>{si}</span>

                  {/* Name */}
                  <span className="text-[11px] font-mono font-bold truncate" style={{ color: "#c8d6e5" }}>
                    {run.name}
                  </span>

                  {/* Mode badge */}
                  <span
                    className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1"
                    style={{ background: `${mc}10`, border: `1px solid ${mc}25`, color: mc }}
                  >
                    {mi}
                    {run.mode}
                  </span>

                  {/* Status */}
                  <span
                    className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: `${sc}10`, border: `1px solid ${sc}25`, color: sc }}
                  >
                    {run.status}
                  </span>

                  <div className="flex-1" />

                  {/* Duration */}
                  <span className="text-[9px] font-mono shrink-0" style={{ color: "#4a6a8a" }}>
                    <Clock className="h-2.5 w-2.5 inline mr-1" />
                    {formatDuration(run.created_at, run.updated_at)}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[9px] font-mono shrink-0 hidden sm:inline" style={{ color: "#4a6a8a" }}>
                    {formatTime(run.created_at)}
                  </span>

                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "#4a6a8a" }} />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "#4a6a8a" }} />
                  )}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid #00f0ff08" }}>
                    {/* Synthesis */}
                    {run.synthesis && (
                      <div className="mt-3 rounded-lg p-3" style={{ background: "#060b14", border: "1px solid #a855f720" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#a855f7" }}>
                            Synthesis
                          </span>
                        </div>
                        <pre
                          className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto"
                          style={{ color: "#c8d6e5" }}
                        >
                          {run.synthesis}
                        </pre>
                      </div>
                    )}

                    {/* Task list */}
                    {tasks.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {tasks.map((task) => {
                          const tsc = statusColors[task.status] ?? "#4a6a8a";
                          return (
                            <HistoryTaskRow key={task.id} task={task} color={tsc} />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                        Loading tasks...
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
});

const HistoryTaskRow = React.memo(function HistoryTaskRow({
  task,
  color,
}: {
  task: SwarmTask;
  color: string;
}) {
  const [showOutput, setShowOutput] = useState(false);

  return (
    <div className="rounded" style={{ background: "#060b14", border: "1px solid #00f0ff06" }}>
      <button
        onClick={() => setShowOutput((p) => !p)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
      >
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-mono" style={{ color: "#c8d6e5" }}>
          {task.task_id}
        </span>
        <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
          @{task.agent_id}
        </span>
        <div className="flex-1" />
        <span className="text-[8px] font-mono uppercase" style={{ color }}>
          {task.status}
        </span>
        {task.exit_code !== null && (
          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
            exit:{task.exit_code}
          </span>
        )}
        {showOutput ? (
          <ChevronDown className="h-2.5 w-2.5" style={{ color: "#4a6a8a" }} />
        ) : (
          <ChevronRight className="h-2.5 w-2.5" style={{ color: "#4a6a8a" }} />
        )}
      </button>
      {showOutput && task.output && (
        <div className="px-3 pb-2">
          <pre
            className="p-2 rounded text-[9px] font-mono leading-relaxed overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap"
            style={{ background: "#05080f", color: "#4a6a8a" }}
          >
            {task.output}
          </pre>
        </div>
      )}
    </div>
  );
});
