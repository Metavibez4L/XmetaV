"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { KNOWN_AGENTS, type AgentSession, type AgentStatus } from "@/lib/types";
import { Send, Circle, Cpu, X } from "lucide-react";

const statusConfig: Record<AgentStatus, { color: string; bg: string; border: string; glow: string; label: string }> = {
  online: { color: '#39ff14', bg: '#39ff1410', border: '#39ff1425', glow: '0 0 6px #39ff14', label: 'ONLINE' },
  idle: { color: '#f59e0b', bg: '#f59e0b10', border: '#f59e0b25', glow: '0 0 6px #f59e0b', label: 'IDLE' },
  busy: { color: '#00f0ff', bg: '#00f0ff10', border: '#00f0ff25', glow: '0 0 6px #00f0ff', label: 'BUSY' },
  offline: { color: '#ff2d5e', bg: '#ff2d5e08', border: '#ff2d5e20', glow: 'none', label: 'OFFLINE' },
};

export function FleetTable() {
  const [sessions, setSessions] = useState<Record<string, AgentSession>>({});
  const [taskAgent, setTaskAgent] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState("");
  const [sending, setSending] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("agent_sessions")
      .select("*")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, AgentSession> = {};
          data.forEach((s) => (map[s.agent_id] = s));
          setSessions(map);
        }
      });

    const channel = supabase
      .channel("fleet-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_sessions" },
        (payload) => {
          const row = payload.new as AgentSession;
          setSessions((prev) => ({ ...prev, [row.agent_id]: row }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function sendTask() {
    if (!taskAgent || !taskMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: taskAgent, message: taskMessage.trim() }),
      });
      if (res.ok) {
        setTaskMessage("");
        setTaskAgent(null);
      }
    } finally {
      setSending(false);
    }
  }

  function getStatus(agentId: string): AgentStatus {
    const session = sessions[agentId];
    if (!session) return "offline";
    const lastBeat = new Date(session.last_heartbeat).getTime();
    if (Date.now() - lastBeat > 60_000) return "offline";
    return session.status as AgentStatus;
  }

  return (
    <>
      {/* Fleet cards */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-1">
        {KNOWN_AGENTS.map((agent, i) => {
          const status = getStatus(agent.id);
          const cfg = statusConfig[status];

          return (
            <div key={agent.id} className="cyber-card rounded-lg p-5 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {/* Status indicator */}
                  <div className="mt-1 relative">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ background: cfg.color, boxShadow: cfg.glow }}
                    />
                    {status === "busy" && (
                      <div
                        className="absolute inset-0 h-3 w-3 rounded-full animate-ping"
                        style={{ background: cfg.color, opacity: 0.3 }}
                      />
                    )}
                  </div>

                  {/* Agent info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-bold" style={{ color: '#c8d6e5' }}>
                        {agent.name}
                      </span>
                      <span
                        className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono" style={{ color: '#4a6a8a' }}>ID:</span>
                        <code className="text-[10px] font-mono" style={{ color: '#00f0ff88' }}>{agent.id}</code>
                      </div>
                      <div className="h-3 w-px" style={{ background: '#00f0ff12' }} />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono" style={{ color: '#4a6a8a' }}>TOOLS:</span>
                        <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded cyber-badge">
                          {agent.tools}
                        </span>
                      </div>
                      <div className="h-3 w-px" style={{ background: '#00f0ff12' }} />
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-3 w-3" style={{ color: '#4a6a8a' }} />
                        <code className="text-[10px] font-mono" style={{ color: '#4a6a8a' }}>{agent.model}</code>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono" style={{ color: '#4a6a8a' }}>WORKSPACE:</span>
                      <code className="text-[10px] font-mono" style={{ color: '#4a6a8a' }}>{agent.workspace}</code>
                    </div>
                  </div>
                </div>

                {/* Send Task button */}
                <button
                  onClick={() => setTaskAgent(taskAgent === agent.id ? null : agent.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider cyber-btn"
                >
                  <Send className="h-3 w-3" />
                  Task
                </button>
              </div>

              {/* Inline task input */}
              {taskAgent === agent.id && (
                <div
                  className="mt-4 pt-4 space-y-3"
                  style={{ borderTop: '1px solid #00f0ff10' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono" style={{ color: '#00f0ff44' }}>
                      TASK &gt;&gt; {agent.id}
                    </span>
                    <button
                      onClick={() => { setTaskAgent(null); setTaskMessage(""); }}
                      className="ml-auto"
                    >
                      <X className="h-3 w-3" style={{ color: '#4a6a8a' }} />
                    </button>
                  </div>
                  <textarea
                    value={taskMessage}
                    onChange={(e) => setTaskMessage(e.target.value)}
                    placeholder={`// command for ${agent.id}...`}
                    rows={3}
                    className="w-full rounded p-3 font-mono text-sm resize-none cyber-input"
                    autoFocus
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={sendTask}
                      disabled={sending || !taskMessage.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded text-[10px] font-mono uppercase tracking-wider cyber-btn cyber-btn-primary disabled:opacity-30"
                    >
                      {sending ? (
                        <>
                          <span className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00f0ff' }} />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3" />
                          Execute Task
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
