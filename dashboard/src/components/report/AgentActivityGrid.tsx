"use client";

import { Bot, CheckCircle, AlertTriangle } from "lucide-react";
import type { AgentInfo } from "@/hooks/useReport";

interface AgentActivityGridProps {
  agents: AgentInfo[];
}

export function AgentActivityGrid({ agents }: AgentActivityGridProps) {
  function statusColor(status: string): string {
    if (status === "running" || status === "active") return "#39ff14";
    if (status === "idle" || status === "completed") return "#00f0ff";
    return "#ff2d5e";
  }

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="h-4 w-4" style={{ color: "#a29bfe88" }} />
        <h3 className="text-xs font-mono font-bold" style={{ color: "#a29bfe" }}>
          AGENT ACTIVITY
        </h3>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "#4a6a8a" }}>
          {agents.length} agents
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {agents.map((agent) => {
          const sColor = statusColor(agent.status);
          const failed = Math.round(agent.commands * (1 - agent.successRate / 100));
          const completed = agent.commands - failed;
          return (
            <div
              key={agent.id}
              className="rounded-md p-3 transition-all hover:brightness-125"
              style={{ background: "#ffffff04", border: "1px solid #ffffff08" }}
            >
              {/* Agent name + status */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold truncate" style={{ color: "#8a9ab5" }}>
                  {agent.id}
                </span>
                <span
                  className="text-[7px] font-mono px-1.5 py-0.5 rounded shrink-0"
                  style={{ color: sColor, background: sColor + "10", border: `1px solid ${sColor}20` }}
                >
                  {agent.status?.toUpperCase() || "UNKNOWN"}
                </span>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-2.5 w-2.5" style={{ color: "#39ff14" }} />
                  <span className="text-[9px] font-mono tabular-nums" style={{ color: "#39ff14" }}>
                    {completed}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" style={{ color: "#ff2d5e" }} />
                  <span className="text-[9px] font-mono tabular-nums" style={{ color: "#ff2d5e" }}>
                    {failed}
                  </span>
                </div>
                <span className="text-[8px] font-mono ml-auto" style={{ color: "#4a6a8a" }}>
                  {agent.successRate}%
                </span>
              </div>

              {/* Success bar */}
              <div
                className="h-1 rounded-full mt-2 overflow-hidden"
                style={{ background: "#ffffff06" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${agent.successRate}%`,
                    background:
                      agent.successRate >= 80
                        ? "#39ff14"
                        : agent.successRate >= 50
                        ? "#f7b731"
                        : "#ff2d5e",
                  }}
                />
              </div>

              {/* Memories */}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                  {agent.memoryCount} memories
                </span>
                <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                  {agent.commands} cmds
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
