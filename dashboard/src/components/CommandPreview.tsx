"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Play,
  Trash2,
  Plus,
  GripVertical,
  Edit3,
  Check,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Terminal,
  RefreshCw,
  Clock,
} from "lucide-react";
import type { IntentCommand, IntentSession } from "@/lib/types";

interface Props {
  session: IntentSession | null;
  onExecute: (commands: IntentCommand[]) => void;
  executing: boolean;
}

export const CommandPreview = React.memo(function CommandPreview({
  session,
  onExecute,
  executing,
}: Props) {
  const [commands, setCommands] = useState<IntentCommand[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Sync commands from session when they update
  React.useEffect(() => {
    if (session?.commands && session.commands.length > 0) {
      setCommands([...session.commands]);
    }
  }, [session?.commands]);

  const sc = {
    neon: "#00f0ff",
    green: "#00ff88",
    red: "#ff6b6b",
    dimText: "#4a6a8a",
    cardBg: "#0d1117",
    border: "#00f0ff15",
  };

  const isReady = session?.status === "READY";
  const isExecuting = session?.status === "EXECUTING";
  const isCompleted = session?.status === "COMPLETED";
  const isEmpty = commands.length === 0;

  const handleRemove = useCallback((idx: number) => {
    setCommands((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAdd = useCallback(() => {
    setCommands((prev) => [
      ...prev,
      { agent: "main", message: "", description: "New command" },
    ]);
    setEditingIdx(commands.length);
  }, [commands.length]);

  const handleUpdate = useCallback(
    (idx: number, field: keyof IntentCommand, value: string) => {
      setCommands((prev) =>
        prev.map((cmd, i) => (i === idx ? { ...cmd, [field]: value } : cmd))
      );
    },
    []
  );

  const handleExecute = useCallback(() => {
    const valid = commands.filter((c) => c.message.trim());
    if (valid.length === 0) return;
    onExecute(valid);
  }, [commands, onExecute]);

  const agentColor = useMemo(
    () => ({
      main: "#00f0ff",
      basedintern: "#00ff88",
      akua: "#f7b731",
      basedintern_web: "#00ff88",
      akua_web: "#f7b731",
    }),
    []
  );

  const getAgentColor = (agent: string) =>
    (agentColor as Record<string, string>)[agent] || sc.dimText;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" style={{ color: sc.neon }} />
          <span
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: sc.neon }}
          >
            Generated Commands
          </span>
          {commands.length > 0 && (
            <span
              className="text-[8px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: `${sc.neon}15`, color: sc.neon }}
            >
              {commands.length}
            </span>
          )}
        </div>
      </div>

      {/* Retry indicator */}
      {session && session.retry_count > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
          style={{ background: "#f7b73112", border: "1px solid #f7b73130" }}
        >
          <RefreshCw className="h-3.5 w-3.5" style={{ color: "#f7b731" }} />
          <span className="text-[10px] font-mono" style={{ color: "#f7b731" }}>
            Retry {session.retry_count}/{session.max_retries} — previous commands timed out after {session.timeout_seconds}s
          </span>
          <Clock className="h-3 w-3 ml-auto opacity-50" style={{ color: "#f7b731" }} />
        </div>
      )}

      {/* Command list */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4" style={{ maxHeight: "calc(100vh - 380px)" }}>
        {isEmpty && !session ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Terminal className="h-8 w-8 mb-3 opacity-10" style={{ color: sc.neon }} />
            <p className="text-[10px] font-mono" style={{ color: sc.dimText }}>
              Submit a goal to generate commands
            </p>
          </div>
        ) : isEmpty && session?.status === "THINKING" ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2
              className="h-6 w-6 animate-spin mb-3"
              style={{ color: `${sc.neon}44` }}
            />
            <p className="text-[10px] font-mono" style={{ color: sc.dimText }}>
              Cursor is generating commands...
            </p>
          </div>
        ) : (
          commands.map((cmd, idx) => (
            <CommandCard
              key={idx}
              cmd={cmd}
              idx={idx}
              isEditing={editingIdx === idx}
              onEdit={() => setEditingIdx(editingIdx === idx ? null : idx)}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
              agentColor={getAgentColor(cmd.agent)}
              sc={sc}
              disabled={isExecuting || isCompleted}
            />
          ))
        )}
      </div>

      {/* Actions */}
      {(isReady || commands.length > 0) && !isCompleted && (
        <div className="mt-auto space-y-2">
          {!isExecuting && (
            <button
              onClick={handleAdd}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[9px] font-mono uppercase tracking-wider transition-all"
              style={{
                background: "transparent",
                border: `1px dashed ${sc.border}`,
                color: sc.dimText,
              }}
            >
              <Plus className="h-3 w-3" />
              Add Command
            </button>
          )}

          <button
            onClick={handleExecute}
            disabled={
              executing ||
              isExecuting ||
              commands.filter((c) => c.message.trim()).length === 0
            }
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-30"
            style={{
              background: executing || isExecuting ? `${sc.green}08` : `${sc.green}15`,
              border: `1px solid ${executing || isExecuting ? sc.green + "20" : sc.green + "50"}`,
              color: sc.green,
              boxShadow: executing || isExecuting ? "none" : `0 0 20px ${sc.green}15`,
            }}
          >
            {executing || isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Execute All ({commands.filter((c) => c.message.trim()).length})
              </>
            )}
          </button>
        </div>
      )}

      {/* Completed */}
      {isCompleted && (
        <div
          className="mt-auto flex items-center justify-center gap-2 px-4 py-3 rounded-lg"
          style={{ background: `${sc.green}08`, border: `1px solid ${sc.green}20` }}
        >
          <CheckCircle className="h-4 w-4" style={{ color: sc.green }} />
          <span className="text-[10px] font-mono" style={{ color: sc.green }}>
            All commands executed
          </span>
        </div>
      )}

      {/* Failed */}
      {session?.status === "FAILED" && (
        <div
          className="mt-auto flex items-center justify-center gap-2 px-4 py-3 rounded-lg"
          style={{ background: "#ff000008", border: "1px solid #ff000020" }}
        >
          <AlertCircle className="h-4 w-4" style={{ color: sc.red }} />
          <span className="text-[10px] font-mono" style={{ color: sc.red }}>
            Failed to generate commands
          </span>
        </div>
      )}
    </div>
  );
});

// ---- Command Card ----

const CommandCard = React.memo(function CommandCard({
  cmd,
  idx,
  isEditing,
  onEdit,
  onUpdate,
  onRemove,
  agentColor,
  sc,
  disabled,
}: {
  cmd: IntentCommand;
  idx: number;
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (idx: number, field: keyof IntentCommand, value: string) => void;
  onRemove: (idx: number) => void;
  agentColor: string;
  sc: Record<string, string>;
  disabled: boolean;
}) {
  return (
    <div
      className="group rounded-lg overflow-hidden transition-all"
      style={{
        background: sc.cardBg,
        border: `1px solid ${isEditing ? sc.neon + "40" : "#ffffff08"}`,
      }}
    >
      <div className="flex items-start gap-2 p-3">
        {/* Grip handle */}
        <GripVertical
          className="h-3.5 w-3.5 mt-0.5 opacity-20 group-hover:opacity-50 shrink-0"
          style={{ color: sc.dimText }}
        />

        {/* Index + Agent badge */}
        <div className="shrink-0 flex flex-col items-center gap-1 min-w-[60px]">
          <span className="text-[8px] font-mono opacity-30" style={{ color: sc.dimText }}>
            #{idx + 1}
          </span>
          <span
            className="text-[8px] font-mono px-2 py-0.5 rounded-full"
            style={{ background: `${agentColor}15`, color: agentColor }}
          >
            {cmd.agent}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <select
                value={cmd.agent}
                onChange={(e) => onUpdate(idx, "agent", e.target.value)}
                className="w-full px-2 py-1 rounded text-[10px] font-mono"
                style={{
                  background: "#0a0e1a",
                  border: `1px solid ${sc.border}`,
                  color: agentColor,
                }}
              >
                {["main", "basedintern", "akua", "basedintern_web", "akua_web"].map(
                  (a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  )
                )}
              </select>
              <textarea
                value={cmd.message}
                onChange={(e) => onUpdate(idx, "message", e.target.value)}
                rows={2}
                className="w-full px-2 py-1 rounded text-[10px] font-mono resize-none"
                style={{
                  background: "#0a0e1a",
                  border: `1px solid ${sc.border}`,
                  color: "#fff",
                }}
                placeholder="Command message..."
              />
              <input
                value={cmd.description}
                onChange={(e) => onUpdate(idx, "description", e.target.value)}
                className="w-full px-2 py-1 rounded text-[10px] font-mono"
                style={{
                  background: "#0a0e1a",
                  border: `1px solid ${sc.border}`,
                  color: sc.dimText,
                }}
                placeholder="Description (optional)"
              />
            </div>
          ) : (
            <>
              <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#d0d0d0" }}>
                {cmd.message || <span className="opacity-30">(empty)</span>}
              </p>
              {cmd.description && (
                <p className="text-[8px] font-mono mt-1 opacity-40" style={{ color: sc.dimText }}>
                  {cmd.description}
                </p>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        {!disabled && (
          <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-1 rounded hover:bg-white/5 transition-colors"
            >
              {isEditing ? (
                <Check className="h-3 w-3" style={{ color: sc.green }} />
              ) : (
                <Edit3 className="h-3 w-3" style={{ color: sc.dimText }} />
              )}
            </button>
            <button
              onClick={() => onRemove(idx)}
              className="p-1 rounded hover:bg-white/5 transition-colors"
            >
              <Trash2 className="h-3 w-3" style={{ color: sc.red }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
