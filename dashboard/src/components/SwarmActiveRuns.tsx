"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
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
import { cleanAgentOutput } from "@/lib/utils";

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
  const prevRunIdsRef = useRef<string[]>([]);

  // Auto-expand newly appeared runs
  useEffect(() => {
    const prevIds = new Set(prevRunIdsRef.current);
    const newIds = runs.filter((r) => !prevIds.has(r.id)).map((r) => r.id);
    if (newIds.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.add(id));
        return next;
      });
    }
    // Auto-expand if only one run
    if (runs.length === 1) {
      setExpanded(new Set([runs[0].id]));
    }
    prevRunIdsRef.current = runs.map((r) => r.id);
  }, [runs]);

  // Fetch tasks for expanded runs that don't have tasks yet
  useEffect(() => {
    for (const id of expanded) {
      if (!taskMap[id]) fetchTasks(id);
    }
  }, [expanded, taskMap, fetchTasks]);

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
      const res = await fetch(`/api/swarms/${id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[swarm-cancel]", data.error || res.statusText);
      }
    } catch (err) {
      console.error("[swarm-cancel]", err);
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  // Clean up expanded set when runs disappear (moved to history)
  useEffect(() => {
    const runIds = new Set(runs.map((r) => r.id));
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        if (!runIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [runs]);

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Activity className="h-10 w-10" style={{ color: "#00f0ff22" }} />
        <p className="text-[11px] font-mono" style={{ color: "#4a6a8a" }}>
          No active swarm runs
        </p>
        <p className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>
          Create a swarm from the Create tab to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <ActiveRunCard
          key={run.id}
          run={run}
          tasks={taskMap[run.id] ?? []}
          isExpanded={expanded.has(run.id)}
          isCancelling={cancelling.has(run.id)}
          onToggle={toggle}
          onCancel={cancelRun}
        />
      ))}
    </div>
  );
});

// ============================================================
// Extracted run card for better memoization
// ============================================================

interface RunCardProps {
  run: SwarmRun;
  tasks: SwarmTask[];
  isExpanded: boolean;
  isCancelling: boolean;
  onToggle: (id: string) => void;
  onCancel: (id: string) => void;
}

const ActiveRunCard = React.memo(function ActiveRunCard({
  run,
  tasks,
  isExpanded,
  isCancelling,
  onToggle,
  onCancel,
}: RunCardProps) {
  const mc = modeColors[run.mode as SwarmMode] ?? "#00f0ff";
  const mi = modeIcons[run.mode as SwarmMode];

  const { completedCount, totalCount, progress } = useMemo(() => {
    const done = tasks.filter(
      (t) => t.status === "completed" || t.status === "failed" || t.status === "skipped"
    ).length;
    const total = tasks.length;
    return { completedCount: done, totalCount: total, progress: total > 0 ? (done / total) * 100 : 0 };
  }, [tasks]);

  return (
    <div className="cyber-card rounded-lg overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(run.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(run.id); }
        }}
        className="w-full px-5 py-4 flex items-center gap-4 text-left cursor-pointer"
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
                onCancel(run.id);
              }}
              disabled={isCancelling}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider transition-all disabled:opacity-40"
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
      </div>

      {/* Tasks Detail */}
      {isExpanded && (
        <div className="px-5 pb-4 space-y-2" style={{ borderTop: "1px solid #00f0ff08" }}>
          <div className="pt-3">
            {/* Pipeline visual */}
            {run.mode === "pipeline" && tasks.length > 0 && (
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
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const sc = taskStatusColors[task.status] ?? taskStatusColors.pending;
                return <TaskRow key={task.id} task={task} sc={sc} />;
              })
            ) : (
              <div className="text-[10px] font-mono py-2" style={{ color: "#4a6a8a" }}>
                Waiting for tasks to be created...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================
// Task row with auto-scroll output
// ============================================================

const TaskRow = React.memo(function TaskRow({
  task,
  sc,
}: {
  task: SwarmTask;
  sc: { color: string; bg: string };
}) {
  const [showOutput, setShowOutput] = useState(task.status === "running");
  const outputRef = useRef<HTMLPreElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll when output updates (only for running tasks)
  useEffect(() => {
    if (showOutput && autoScrollRef.current && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [task.output, showOutput]);

  // Auto-open when task starts running
  useEffect(() => {
    if (task.status === "running") setShowOutput(true);
  }, [task.status]);

  const handleScroll = useCallback(() => {
    if (!outputRef.current) return;
    const el = outputRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  }, []);

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
            ref={outputRef}
            onScroll={handleScroll}
            className="p-3 rounded text-[10px] font-mono leading-relaxed overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap"
            style={{ background: "#05080f", color: "#4a6a8a", border: "1px solid #00f0ff08" }}
          >
            {cleanAgentOutput(task.output || "") || (task.status === "running" ? "Waiting for output..." : "(no output)")}
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
