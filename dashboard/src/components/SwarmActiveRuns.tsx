"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  ArrowRight,
  Users,
  Activity,
} from "lucide-react";
import type { SwarmRun, SwarmTask, SwarmMode } from "@/lib/types";

const modeIcons: Record<SwarmMode, React.ReactNode> = {
  parallel: <Zap className="h-3.5 w-3.5" />,
  pipeline: <ArrowRight className="h-3.5 w-3.5" />,
  collaborative: <Users className="h-3.5 w-3.5" />,
};

const modeColors: Record<SwarmMode, string> = {
  parallel: "#00f0ff",
  pipeline: "#39ff14",
  collaborative: "#a855f7",
};

const taskStatusColors: Record<string, { color: string; bg: string }> = {
  pending: { color: "#4a6a8a", bg: "#4a6a8a15" },
  running: { color: "#00f0ff", bg: "#00f0ff12" },
  completed: { color: "#39ff14", bg: "#39ff1412" },
  failed: { color: "#ff2d5e", bg: "#ff2d5e12" },
  skipped: { color: "#f59e0b", bg: "#f59e0b12" },
};

interface Props {
  runs: SwarmRun[];
  taskMap: Record<string, SwarmTask[]>;
  fetchTasks: (swarmId: string) => void;
}

export const SwarmActiveRuns = React.memo(function SwarmActiveRuns({
  runs,
  taskMap,
  fetchTasks,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  // Auto-expand first active run and fetch tasks
  useEffect(() => {
    for (const run of runs) {
      if (!taskMap[run.id]) {
        fetchTasks(run.id);
      }
    }
    if (runs.length === 1 && !expanded.has(runs[0].id)) {
      setExpanded(new Set([runs[0].id]));
    }
  }, [runs, taskMap, fetchTasks, expanded]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const cancelRun = useCallback(async (id: string) => {
    setCancelling((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/swarms/${id}/cancel`, { method: "POST" });
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Activity className="h-10 w-10" style={{ color: "#00f0ff22" }} />
        <p className="text-[11px] font-mono" style={{ color: "#4a6a8a" }}>
          No active swarm runs
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => {
        const tasks = taskMap[run.id] ?? [];
        const isExpanded = expanded.has(run.id);
        const mc = modeColors[run.mode as SwarmMode] ?? "#00f0ff";
        const mi = modeIcons[run.mode as SwarmMode];
        const isCancelling = cancelling.has(run.id);

        const completedCount = tasks.filter(
          (t) => t.status === "completed" || t.status === "failed" || t.status === "skipped"
        ).length;
        const totalCount = tasks.length;
        const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

        return (
          <div key={run.id} className="cyber-card rounded-lg overflow-hidden">
            {/* Header */}
            <button
              onClick={() => toggle(run.id)}
              className="w-full px-5 py-4 flex items-center gap-4 text-left"
            >
              <span style={{ color: mc }}>{mi}</span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-mono font-bold truncate" style={{ color: "#c8d6e5" }}>
                    {run.name}
                  </h3>
                  <span
                    className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: `${mc}12`, border: `1px solid ${mc}30`, color: mc }}
                  >
                    {run.mode}
                  </span>
                  <span
                    className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      background: run.status === "running" ? "#00f0ff12" : "#f59e0b12",
                      border: `1px solid ${run.status === "running" ? "#00f0ff30" : "#f59e0b30"}`,
                      color: run.status === "running" ? "#00f0ff" : "#f59e0b",
                    }}
                  >
                    {run.status === "running" && (
                      <Loader2 className="h-2.5 w-2.5 inline animate-spin mr-1" />
                    )}
                    {run.status}
                  </span>
                </div>

                {/* Progress bar */}
                {totalCount > 0 && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 h-1 rounded-full" style={{ background: "#0a0f1a" }}>
                      <div
                        className="h-1 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, background: mc, boxShadow: `0 0 6px ${mc}` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
                      {completedCount}/{totalCount}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(run.status === "pending" || run.status === "running") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelRun(run.id);
                    }}
                    disabled={isCancelling}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider transition-all"
                    style={{
                      background: "#ff2d5e10",
                      border: "1px solid #ff2d5e30",
                      color: "#ff2d5e",
                    }}
                  >
                    {isCancelling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Cancel
                  </button>
                )}
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" style={{ color: "#4a6a8a" }} />
                ) : (
                  <ChevronRight className="h-4 w-4" style={{ color: "#4a6a8a" }} />
                )}
              </div>
            </button>

            {/* Tasks Detail */}
            {isExpanded && tasks.length > 0 && (
              <div className="px-5 pb-4 space-y-2" style={{ borderTop: "1px solid #00f0ff08" }}>
                <div className="pt-3">
                  {/* Pipeline visual */}
                  {run.mode === "pipeline" && (
                    <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-2">
                      {tasks
                        .filter((t) => t.task_id !== "__synthesis__")
                        .map((task, i) => {
                          const sc = taskStatusColors[task.status] ?? taskStatusColors.pending;
                          return (
                            <React.Fragment key={task.id}>
                              {i > 0 && (
                                <ArrowRight className="h-3 w-3 shrink-0" style={{ color: "#00f0ff20" }} />
                              )}
                              <div
                                className="px-2 py-1 rounded text-[8px] font-mono uppercase shrink-0"
                                style={{ background: sc.bg, border: `1px solid ${sc.color}20`, color: sc.color }}
                              >
                                {task.task_id}
                              </div>
                            </React.Fragment>
                          );
                        })}
                    </div>
                  )}

                  {/* Task rows */}
                  {tasks.map((task) => {
                    const sc = taskStatusColors[task.status] ?? taskStatusColors.pending;
                    return (
                      <TaskRow key={task.id} task={task} sc={sc} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

const TaskRow = React.memo(function TaskRow({
  task,
  sc,
}: {
  task: SwarmTask;
  sc: { color: string; bg: string };
}) {
  const [showOutput, setShowOutput] = useState(task.status === "running");

  return (
    <div className="rounded-lg mb-2 overflow-hidden" style={{ background: "#060b14", border: "1px solid #00f0ff08" }}>
      <button
        onClick={() => setShowOutput((p) => !p)}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left"
      >
        <div
          className="h-2 w-2 rounded-full shrink-0"
          style={{
            background: sc.color,
            boxShadow: task.status === "running" ? `0 0 6px ${sc.color}` : "none",
          }}
        />
        <span className="text-[10px] font-mono" style={{ color: "#c8d6e5" }}>
          {task.task_id}
        </span>
        <span
          className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded"
          style={{ background: sc.bg, color: sc.color }}
        >
          {task.agent_id}
        </span>
        <div className="flex-1" />
        <span
          className="text-[8px] font-mono uppercase tracking-wider"
          style={{ color: sc.color }}
        >
          {task.status === "running" && <Loader2 className="h-2.5 w-2.5 inline animate-spin mr-1" />}
          {task.status}
        </span>
        {showOutput ? (
          <ChevronDown className="h-3 w-3" style={{ color: "#4a6a8a" }} />
        ) : (
          <ChevronRight className="h-3 w-3" style={{ color: "#4a6a8a" }} />
        )}
      </button>

      {showOutput && (
        <div className="px-3 pb-3">
          <pre
            className="p-3 rounded text-[10px] font-mono leading-relaxed overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap"
            style={{ background: "#05080f", color: "#4a6a8a", border: "1px solid #00f0ff08" }}
          >
            {task.output || (task.status === "running" ? "Waiting for output..." : "(no output)")}
          </pre>
          {task.exit_code !== null && task.exit_code !== undefined && (
            <div className="mt-1 text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
              exit code: {task.exit_code}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
