"use client";

import React, { useMemo } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import type { IntentSession } from "@/lib/types";

interface Props {
  sessions: IntentSession[];
  onSelect: (session: IntentSession) => void;
  activeSessionId?: string | null;
}

export const IntentHistory = React.memo(function IntentHistory({
  sessions,
  onSelect,
  activeSessionId,
}: Props) {
  const sc = {
    neon: "#00f0ff",
    green: "#00ff88",
    red: "#ff6b6b",
    yellow: "#f7b731",
    dimText: "#4a6a8a",
    cardBg: "#0d1117",
    border: "#00f0ff15",
  };

  const statusConfig: Record<
    string,
    { icon: React.ReactNode; color: string; label: string }
  > = useMemo(
    () => ({
      THINKING: {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        color: sc.neon,
        label: "Thinking",
      },
      READY: {
        icon: <Zap className="h-3 w-3" />,
        color: sc.yellow,
        label: "Ready",
      },
      EXECUTING: {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        color: sc.green,
        label: "Executing",
      },
      COMPLETED: {
        icon: <CheckCircle className="h-3 w-3" />,
        color: sc.green,
        label: "Done",
      },
      FAILED: {
        icon: <XCircle className="h-3 w-3" />,
        color: sc.red,
        label: "Failed",
      },
      CANCELLED: {
        icon: <AlertCircle className="h-3 w-3" />,
        color: sc.dimText,
        label: "Cancelled",
      },
    }),
    [sc]
  );

  if (sessions.length === 0) {
    return (
      <div className="py-6 text-center">
        <Clock className="h-5 w-5 mx-auto mb-2 opacity-10" style={{ color: sc.neon }} />
        <p className="text-[9px] font-mono" style={{ color: sc.dimText }}>
          No previous sessions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-3 w-3" style={{ color: sc.dimText }} />
        <span
          className="text-[9px] font-mono uppercase tracking-wider"
          style={{ color: sc.dimText }}
        >
          History
        </span>
        <span className="text-[8px] font-mono opacity-30" style={{ color: sc.dimText }}>
          ({sessions.length})
        </span>
      </div>

      {sessions.slice(0, 20).map((session) => {
        const config = statusConfig[session.status] || statusConfig.FAILED;
        const isActive = session.id === activeSessionId;
        const timeAgo = formatTimeAgo(session.created_at);

        return (
          <button
            key={session.id}
            onClick={() => onSelect(session)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-all group"
            style={{
              background: isActive ? `${sc.neon}08` : "transparent",
              border: `1px solid ${isActive ? sc.neon + "20" : "transparent"}`,
            }}
          >
            <div style={{ color: config.color }}>{config.icon}</div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[10px] font-mono truncate"
                style={{ color: isActive ? "#fff" : "#aaa" }}
              >
                {session.goal}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[8px] font-mono" style={{ color: config.color }}>
                  {config.label}
                </span>
                <span className="text-[7px] font-mono opacity-30" style={{ color: sc.dimText }}>
                  {session.commands?.length || 0} cmds
                </span>
                <span className="text-[7px] font-mono opacity-30" style={{ color: sc.dimText }}>
                  {timeAgo}
                </span>
              </div>
            </div>
            <ChevronRight
              className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0"
              style={{ color: sc.dimText }}
            />
          </button>
        );
      })}
    </div>
  );
});

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}
