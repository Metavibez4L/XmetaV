"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Monitor, Circle } from "lucide-react";

/* ── Mini arena: stylized view of Main + Soul positions ──── */

interface AgentDot {
  id: string;
  label: string;
  color: string;
  status: string;
  x: number;
  y: number;
}

const AGENTS: { id: string; label: string; color: string; baseX: number; baseY: number }[] = [
  { id: "main", label: "MAIN", color: "#00f0ff", baseX: 35, baseY: 30 },
  { id: "soul", label: "SOUL", color: "#ff006e", baseX: 65, baseY: 30 },
  { id: "oracle", label: "ORACLE", color: "#fbbf24", baseX: 25, baseY: 65 },
  { id: "briefing", label: "BRIEFING", color: "#38bdf8", baseX: 15, baseY: 65 },
  { id: "alchemist", label: "ALCHEMIST", color: "#a855f7", baseX: 45, baseY: 75 },
  { id: "web3dev", label: "WEB3DEV", color: "#39ff14", baseX: 75, baseY: 65 },
  { id: "akua", label: "AKUA", color: "#06b6d4", baseX: 85, baseY: 65 },
  { id: "basedintern", label: "BASEDINTERN", color: "#f472b6", baseX: 55, baseY: 75 },
];

type Focus = "both" | "main" | "soul";

export const MiniArena = React.memo(function MiniArena() {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<AgentDot[]>(() =>
    AGENTS.map((a) => ({ ...a, status: "offline", x: a.baseX, y: a.baseY })),
  );
  const [focus, setFocus] = useState<Focus>("both");

  // Subscribe to agent_sessions for live status
  useEffect(() => {
    // Initial fetch
    supabase
      .from("agent_sessions")
      .select("agent_id, status")
      .then(({ data }) => {
        if (!data) return;
        setAgents((prev) =>
          prev.map((a) => {
            const session = data.find((s: { agent_id: string }) => s.agent_id === a.id);
            return session ? { ...a, status: session.status } : a;
          }),
        );
      });

    // Realtime
    const channel = supabase
      .channel("mini-arena-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_sessions" },
        (payload) => {
          const row = payload.new as { agent_id: string; status: string } | undefined;
          if (!row) return;
          setAgents((prev) =>
            prev.map((a) =>
              a.id === row.agent_id ? { ...a, status: row.status } : a,
            ),
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // Filter by focus
  const visibleAgents = useMemo(() => {
    if (focus === "both") return agents;
    if (focus === "main") return agents.filter((a) => a.id === "main");
    return agents.filter((a) => a.id === "soul");
  }, [agents, focus]);

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4" style={{ color: "#00f0ff" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#00f0ff" }}
          >
            MINI ARENA
          </h2>
        </div>
        <div className="flex gap-1">
          {(["both", "main", "soul"] as Focus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFocus(f)}
              className="px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider transition-all"
              style={{
                color: focus === f ? "#00f0ff" : "#4a6a8a",
                border: `1px solid ${focus === f ? "#00f0ff33" : "#4a6a8a22"}`,
                background: focus === f ? "#00f0ff08" : "transparent",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Mini arena canvas */}
      <div
        className="relative rounded overflow-hidden"
        style={{
          height: 180,
          background: "#05080f",
          border: "1px solid #00f0ff10",
        }}
      >
        {/* Grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ opacity: 0.15 }}
        >
          {/* Diamond grid lines */}
          {Array.from({ length: 8 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1={0}
              y1={`${(i + 1) * 12.5}%`}
              x2="100%"
              y2={`${(i + 1) * 12.5}%`}
              stroke="#00f0ff"
              strokeWidth="0.5"
            />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={`${(i + 1) * 8.33}%`}
              y1={0}
              x2={`${(i + 1) * 8.33}%`}
              y2="100%"
              stroke="#00f0ff"
              strokeWidth="0.5"
            />
          ))}
        </svg>

        {/* Connection beam between Main and Soul */}
        {focus === "both" && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <line
              x1="35%"
              y1="30%"
              x2="65%"
              y2="30%"
              stroke="url(#beam-gradient)"
              strokeWidth="2"
              strokeDasharray="4 3"
              className="animate-pulse"
            />
            <defs>
              <linearGradient id="beam-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#ff006e" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#ff006e" stopOpacity="0.6" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {/* Agent dots */}
        {visibleAgents.map((agent) => {
          const isActive = agent.status !== "offline";
          return (
            <div
              key={agent.id}
              className="absolute transition-all duration-500"
              style={{
                left: `${agent.x}%`,
                top: `${agent.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {/* Outer glow */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{
                    width: 24,
                    height: 24,
                    marginLeft: -4,
                    marginTop: -4,
                    background: `${agent.color}15`,
                  }}
                />
              )}
              {/* Core dot */}
              <div
                className="w-4 h-4 rounded-full relative"
                style={{
                  background: isActive ? agent.color : `${agent.color}33`,
                  boxShadow: isActive
                    ? `0 0 12px ${agent.color}88, 0 0 4px ${agent.color}`
                    : "none",
                }}
              />
              {/* Label */}
              <div
                className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap"
              >
                <span
                  className="text-[7px] font-mono tracking-wider"
                  style={{
                    color: isActive ? agent.color : `${agent.color}44`,
                    textShadow: isActive ? `0 0 4px ${agent.color}44` : "none",
                  }}
                >
                  {agent.label}
                </span>
              </div>
            </div>
          );
        })}

        {/* Link to full arena */}
        <a
          href="/arena"
          className="absolute bottom-2 right-2 text-[8px] font-mono px-2 py-1 rounded transition-all hover:border-[#00f0ff44]"
          style={{
            color: "#00f0ff66",
            border: "1px solid #00f0ff15",
            background: "#05080fcc",
          }}
        >
          FULL ARENA →
        </a>
      </div>
    </div>
  );
});
