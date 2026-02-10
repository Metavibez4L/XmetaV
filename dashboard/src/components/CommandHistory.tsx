"use client";

import React from "react";
import { useCommandHistory } from "@/hooks/useCommandHistory";
import type { AgentCommand } from "@/lib/types";
import { History, Loader2 } from "lucide-react";

const statusStyle: Record<string, { color: string; bg: string; border: string }> = {
  pending: { color: '#f59e0b', bg: '#f59e0b10', border: '#f59e0b25' },
  running: { color: '#00f0ff', bg: '#00f0ff10', border: '#00f0ff25' },
  completed: { color: '#39ff14', bg: '#39ff1410', border: '#39ff1425' },
  failed: { color: '#ff2d5e', bg: '#ff2d5e10', border: '#ff2d5e25' },
  cancelled: { color: '#4a6a8a', bg: '#4a6a8a10', border: '#4a6a8a25' },
};

const CommandRow = React.memo(function CommandRow({ cmd, index }: { cmd: AgentCommand; index: number }) {
  const style = statusStyle[cmd.status] || statusStyle.cancelled;
  return (
    <div className="px-5 py-3 cyber-table-row">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono" style={{ color: '#4a6a8a' }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: '#00f0ff', background: '#00f0ff10', border: '1px solid #00f0ff20' }}
          >
            {cmd.agent_id}
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
          >
            {cmd.status}
          </span>
        </div>
        <span className="text-[9px] font-mono" style={{ color: '#4a6a8a' }}>
          {new Date(cmd.created_at).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-xs font-mono truncate" style={{ color: '#c8d6e588' }}>
        &gt; {cmd.message}
      </p>
    </div>
  );
});

export const CommandHistory = React.memo(function CommandHistory() {
  const { commands, loading } = useCommandHistory(15);

  return (
    <div className="cyber-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: '#00f0ff10' }}>
        <History className="h-4 w-4" style={{ color: '#00f0ff88' }} />
        <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: '#00f0ff88' }}>
          Command Log
        </h3>
        <span className="text-[9px] font-mono ml-auto" style={{ color: '#4a6a8a' }}>
          {loading ? "..." : `${commands.length} entries`}
        </span>
      </div>

      <div className="max-h-72 overflow-auto">
        {loading ? (
          <div className="p-5 flex items-center justify-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#00f0ff44' }} />
            <span className="text-xs font-mono" style={{ color: '#4a6a8a' }}>Loading...</span>
          </div>
        ) : commands.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-xs font-mono" style={{ color: '#4a6a8a' }}>
              // no commands in queue
            </p>
          </div>
        ) : (
          <div>
            {commands.map((cmd, i) => (
              <CommandRow key={cmd.id} cmd={cmd} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
