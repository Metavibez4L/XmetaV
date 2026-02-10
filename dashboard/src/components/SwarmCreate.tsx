"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Zap,
  ArrowRight,
  Users,
  Plus,
  Trash2,
  Loader2,
  Brain,
  FileJson,
  Play,
  CheckCircle,
} from "lucide-react";
import { KNOWN_AGENTS, type SwarmMode, type SwarmTemplate, type SwarmManifestTask } from "@/lib/types";

const modeConfig: Record<SwarmMode, { icon: React.ReactNode; label: string; desc: string; color: string }> = {
  parallel: {
    icon: <Zap className="h-4 w-4" />,
    label: "PARALLEL",
    desc: "All tasks run simultaneously",
    color: "#00f0ff",
  },
  pipeline: {
    icon: <ArrowRight className="h-4 w-4" />,
    label: "PIPELINE",
    desc: "Sequential chain, output feeds next",
    color: "#39ff14",
  },
  collaborative: {
    icon: <Users className="h-4 w-4" />,
    label: "COLLABORATIVE",
    desc: "Same task to multiple agents",
    color: "#a855f7",
  },
};

const INITIAL_TASK: SwarmManifestTask = { id: "task-1", agent: "main", message: "" };

interface Props {
  onCreated?: () => void;
}

export const SwarmCreate = React.memo(function SwarmCreate({ onCreated }: Props) {
  const [tab, setTab] = useState<"templates" | "custom">("templates");
  const [templates, setTemplates] = useState<SwarmTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Custom builder state
  const [mode, setMode] = useState<SwarmMode>("parallel");
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState<SwarmManifestTask[]>([{ ...INITIAL_TASK }]);
  const [collabTask, setCollabTask] = useState("");
  const [collabAgents, setCollabAgents] = useState<string[]>(["main"]);
  const [synthesizeAgent, setSynthesizeAgent] = useState("main");
  const [synthesize, setSynthesize] = useState(true);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templatesCacheRef = useRef<SwarmTemplate[] | null>(null);

  // Fetch templates (cached)
  useEffect(() => {
    if (templatesCacheRef.current) {
      setTemplates(templatesCacheRef.current);
      setLoadingTemplates(false);
      return;
    }
    fetch("/api/swarms/templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          templatesCacheRef.current = data;
          setTemplates(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, []);

  // Clear success after timeout
  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setError(null);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccess(null), 4000);
  }, []);

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setName("");
    setTasks([{ ...INITIAL_TASK }]);
    setCollabTask("");
    setCollabAgents(["main"]);
    setSynthesizeAgent("main");
    setSynthesize(true);
    setMode("parallel");
  }, []);

  const createSwarm = useCallback(
    async (swarmName: string, swarmMode: SwarmMode, manifest: Record<string, unknown>) => {
      setCreating(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch("/api/swarms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: swarmName, mode: swarmMode, manifest }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create swarm");
        }
        showSuccess(`Swarm "${swarmName}" launched`);
        resetForm();
        onCreated?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setCreating(false);
      }
    },
    [onCreated, showSuccess, resetForm]
  );

  const handleTemplateClick = useCallback(
    (template: SwarmTemplate) => {
      createSwarm(template.name, template.mode, template.manifest as unknown as Record<string, unknown>);
    },
    [createSwarm]
  );

  const handleCustomSubmit = useCallback(() => {
    const swarmName = name.trim() || `Custom ${mode} swarm`;
    if (mode === "collaborative") {
      if (!collabTask.trim()) {
        setError("Task message is required for collaborative mode");
        return;
      }
      createSwarm(swarmName, mode, {
        mode,
        task: collabTask.trim(),
        agents: collabAgents,
        synthesize_agent: synthesizeAgent,
      });
    } else {
      const validTasks = tasks.filter((t) => t.message.trim());
      if (validTasks.length === 0) {
        setError("At least one task with a message is required");
        return;
      }
      createSwarm(swarmName, mode, {
        mode,
        tasks: validTasks,
        synthesize,
        synthesize_agent: synthesize ? synthesizeAgent : undefined,
      });
    }
  }, [mode, name, tasks, collabTask, collabAgents, synthesizeAgent, synthesize, createSwarm]);

  const handleLetMainDecide = useCallback(async () => {
    setDeciding(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: "main",
          message:
            'Analyze the current system state and create a swarm if useful. Respond with a JSON block in your output: {"__swarm__": {manifest}} where manifest follows the swarm.sh format.',
        }),
      });
      if (!res.ok) throw new Error("Failed to send command to main agent");
      showSuccess("Command sent to main agent -- check Active tab for results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeciding(false);
    }
  }, [showSuccess]);

  const addTask = useCallback(() => {
    setTasks((prev) => [
      ...prev,
      { id: `task-${prev.length + 1}`, agent: "main", message: "" },
    ]);
  }, []);

  const removeTask = useCallback((index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateTask = useCallback(
    (index: number, field: keyof SwarmManifestTask, value: string) => {
      setTasks((prev) =>
        prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
      );
    },
    []
  );

  const toggleCollabAgent = useCallback((agentId: string) => {
    setCollabAgents((prev) =>
      prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId]
    );
  }, []);

  // Memoize agent options to avoid re-render on every keystroke
  const agentOptions = useMemo(
    () => KNOWN_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.id}</option>),
    []
  );

  return (
    <div className="space-y-6">
      {/* Tab Toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "#0a0f1a" }}>
        <button
          onClick={() => setTab("templates")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${
            tab === "templates" ? "cyber-btn-primary" : ""
          }`}
          style={tab === "templates" ? { background: "#00f0ff15", borderColor: "#00f0ff40", color: "#00f0ff" } : { color: "#4a6a8a" }}
        >
          <FileJson className="h-3.5 w-3.5" />
          Templates
        </button>
        <button
          onClick={() => setTab("custom")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${
            tab === "custom" ? "cyber-btn-primary" : ""
          }`}
          style={tab === "custom" ? { background: "#00f0ff15", borderColor: "#00f0ff40", color: "#00f0ff" } : { color: "#4a6a8a" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Custom
        </button>
      </div>

      {/* Let Main Decide */}
      <button
        onClick={handleLetMainDecide}
        disabled={deciding}
        className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, #a855f715, #a855f708)",
          border: "1px solid #a855f740",
          color: "#a855f7",
        }}
      >
        {deciding ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Brain className="h-4 w-4" />
        )}
        {deciding ? "Main Agent is analyzing..." : "Let Main Agent Decide"}
      </button>

      {/* Success */}
      {success && (
        <div className="rounded border px-3 py-2 flex items-center gap-2" style={{ borderColor: "#39ff1425", background: "#39ff1408" }}>
          <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#39ff14" }} />
          <p className="text-[10px] font-mono" style={{ color: "#39ff14" }}>
            {success}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border px-3 py-2" style={{ borderColor: "#ff2d5e25", background: "#ff2d5e08" }}>
          <p className="text-[10px] font-mono" style={{ color: "#ff2d5e" }}>
            [ERROR] {error}
          </p>
        </div>
      )}

      {/* Templates Tab */}
      {tab === "templates" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loadingTemplates ? (
            <div className="col-span-full flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#00f0ff" }} />
            </div>
          ) : templates.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-[11px] font-mono" style={{ color: "#4a6a8a" }}>
                No templates found in templates/swarms/
              </p>
            </div>
          ) : (
            templates.map((template) => {
              const mc = modeConfig[template.mode];
              return (
                <TemplateCard
                  key={template.filename}
                  template={template}
                  mc={mc}
                  disabled={creating}
                  onClick={handleTemplateClick}
                />
              );
            })
          )}
        </div>
      )}

      {/* Custom Tab */}
      {tab === "custom" && (
        <div className="space-y-5">
          {/* Swarm Name */}
          <div>
            <label className="block text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#4a6a8a" }}>
              Swarm Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Swarm"
              className="w-full px-3 py-2.5 rounded text-sm font-mono cyber-input"
            />
          </div>

          {/* Mode Selector */}
          <div>
            <label className="block text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#4a6a8a" }}>
              Execution Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(modeConfig) as [SwarmMode, typeof modeConfig["parallel"]][]).map(
                ([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className="rounded-lg p-3 text-center transition-all duration-200"
                    style={{
                      background: mode === key ? `${cfg.color}12` : "#0a0f1a",
                      border: `1px solid ${mode === key ? `${cfg.color}40` : "#00f0ff10"}`,
                    }}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span style={{ color: mode === key ? cfg.color : "#4a6a8a" }}>{cfg.icon}</span>
                      <span
                        className="text-[9px] font-mono uppercase tracking-wider"
                        style={{ color: mode === key ? cfg.color : "#4a6a8a" }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                      {cfg.desc}
                    </p>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Collaborative Mode Fields */}
          {mode === "collaborative" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#4a6a8a" }}>
                  Task Message (sent to all selected agents)
                </label>
                <textarea
                  value={collabTask}
                  onChange={(e) => setCollabTask(e.target.value)}
                  placeholder="// describe the task..."
                  rows={3}
                  className="w-full rounded p-3 font-mono text-sm resize-none cyber-input"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#4a6a8a" }}>
                  Agents
                </label>
                <div className="flex flex-wrap gap-2">
                  {KNOWN_AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => toggleCollabAgent(agent.id)}
                      className="px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all"
                      style={{
                        background: collabAgents.includes(agent.id) ? "#00f0ff15" : "#0a0f1a",
                        border: `1px solid ${collabAgents.includes(agent.id) ? "#00f0ff40" : "#00f0ff10"}`,
                        color: collabAgents.includes(agent.id) ? "#00f0ff" : "#4a6a8a",
                      }}
                    >
                      {agent.id}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#4a6a8a" }}>
                  Synthesize Agent
                </label>
                <select
                  value={synthesizeAgent}
                  onChange={(e) => setSynthesizeAgent(e.target.value)}
                  className="w-full px-3 py-2.5 rounded text-sm font-mono cyber-input"
                >
                  {agentOptions}
                </select>
              </div>
            </div>
          )}

          {/* Parallel / Pipeline Task List */}
          {mode !== "collaborative" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Tasks ({tasks.length})
                </label>
                <button
                  onClick={addTask}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider cyber-btn"
                >
                  <Plus className="h-3 w-3" />
                  Add Task
                </button>
              </div>

              <div className="space-y-3">
                {tasks.map((task, i) => (
                  <TaskEditor
                    key={i}
                    index={i}
                    task={task}
                    mode={mode}
                    canRemove={tasks.length > 1}
                    agentOptions={agentOptions}
                    onUpdate={updateTask}
                    onRemove={removeTask}
                  />
                ))}
              </div>

              {/* Synthesis toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSynthesize((prev) => !prev)}
                  className="relative w-10 h-5 rounded-full transition-all duration-200"
                  style={{
                    background: synthesize ? "#00f0ff25" : "#0a0f1a",
                    border: `1px solid ${synthesize ? "#00f0ff50" : "#00f0ff15"}`,
                  }}
                >
                  <div
                    className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200"
                    style={{
                      background: synthesize ? "#00f0ff" : "#4a6a8a",
                      left: synthesize ? "calc(100% - 18px)" : "2px",
                      boxShadow: synthesize ? "0 0 6px #00f0ff" : "none",
                    }}
                  />
                </button>
                <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                  Synthesize results
                </span>
                {synthesize && (
                  <select
                    value={synthesizeAgent}
                    onChange={(e) => setSynthesizeAgent(e.target.value)}
                    className="px-2 py-1 rounded text-[10px] font-mono cyber-input"
                  >
                    {agentOptions}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleCustomSubmit}
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[11px] font-mono uppercase tracking-wider cyber-btn cyber-btn-primary disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {creating ? "Launching Swarm..." : "Launch Swarm"}
          </button>
        </div>
      )}
    </div>
  );
});

// ============================================================
// Extracted memoized sub-components
// ============================================================

const TemplateCard = React.memo(function TemplateCard({
  template,
  mc,
  disabled,
  onClick,
}: {
  template: SwarmTemplate;
  mc: { icon: React.ReactNode; label: string; color: string };
  disabled: boolean;
  onClick: (t: SwarmTemplate) => void;
}) {
  return (
    <button
      onClick={() => onClick(template)}
      disabled={disabled}
      className="cyber-card rounded-lg p-5 text-left transition-all duration-200 hover:scale-[1.02] disabled:opacity-50"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="p-2 rounded"
          style={{ background: `${mc.color}12`, border: `1px solid ${mc.color}30` }}
        >
          <span style={{ color: mc.color }}>{mc.icon}</span>
        </div>
        <div>
          <h3 className="text-sm font-mono font-bold" style={{ color: "#c8d6e5" }}>
            {template.name}
          </h3>
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: mc.color }}>
            {mc.label}
          </span>
        </div>
      </div>
      <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#4a6a8a" }}>
        {template.description}
      </p>
    </button>
  );
});

const TaskEditor = React.memo(function TaskEditor({
  index,
  task,
  mode,
  canRemove,
  agentOptions,
  onUpdate,
  onRemove,
}: {
  index: number;
  task: SwarmManifestTask;
  mode: SwarmMode;
  canRemove: boolean;
  agentOptions: React.ReactNode;
  onUpdate: (i: number, field: keyof SwarmManifestTask, value: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="cyber-card rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: "#00f0ff10", border: "1px solid #00f0ff20", color: "#00f0ff" }}
          >
            {mode === "pipeline" ? `Step ${index + 1}` : `Task ${index + 1}`}
          </span>
          <input
            type="text"
            value={task.id}
            onChange={(e) => onUpdate(index, "id", e.target.value)}
            className="px-2 py-1 rounded text-[10px] font-mono cyber-input w-28"
            placeholder="task-id"
          />
        </div>
        {canRemove && (
          <button onClick={() => onRemove(index)} className="p-1 rounded hover:bg-red-900/20">
            <Trash2 className="h-3.5 w-3.5" style={{ color: "#ff2d5e" }} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[9px] font-mono shrink-0" style={{ color: "#4a6a8a" }}>AGENT:</label>
        <select
          value={task.agent}
          onChange={(e) => onUpdate(index, "agent", e.target.value)}
          className="flex-1 px-2 py-1.5 rounded text-[10px] font-mono cyber-input"
        >
          {agentOptions}
        </select>
      </div>

      <textarea
        value={task.message}
        onChange={(e) => onUpdate(index, "message", e.target.value)}
        placeholder={`// ${mode === "pipeline" ? `step ${index + 1}` : "task"} instructions...`}
        rows={2}
        className="w-full rounded p-2.5 font-mono text-[11px] resize-none cyber-input"
      />
    </div>
  );
});
