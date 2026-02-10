"use client";

import { SystemHealth } from "@/components/SystemHealth";
import { BridgeControls } from "@/components/BridgeControls";
import { CommandHistory } from "@/components/CommandHistory";
import { QuickCommand } from "@/components/QuickCommand";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { KNOWN_AGENTS } from "@/lib/types";
import { Bot, Zap, Terminal, Shield, Cpu, Activity } from "lucide-react";

export default function CommandCenterPage() {
  const { isOnline } = useBridgeStatus();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono tracking-wider neon-glow" style={{ color: '#00f0ff' }}>
              COMMAND CENTER
            </h1>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ color: '#39ff14', background: '#39ff1408', border: '1px solid #39ff1420' }}>
              ACTIVE
            </span>
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: '#4a6a8a' }}>
            // agent orchestration &amp; fleet monitoring interface
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3" style={{ color: '#00f0ff44' }} />
          <span className="text-[9px] font-mono" style={{ color: '#00f0ff44' }}>
            {new Date().toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Quick Command */}
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="h-4 w-4" style={{ color: '#00f0ff88' }} />
          <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: '#00f0ff88' }}>
            Quick Command
          </h3>
          <span className="text-[9px] font-mono ml-2" style={{ color: '#4a6a8a' }}>
            target: main
          </span>
        </div>
        <QuickCommand />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SystemHealth />
        <BridgeControls />

        {/* Agent Fleet card */}
        <div className="cyber-card rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-4 w-4" style={{ color: '#00f0ff88' }} />
            <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: '#00f0ff88' }}>
              Agent Fleet
            </h3>
          </div>
          <div className="text-3xl font-bold font-mono neon-glow" style={{ color: '#00f0ff' }}>
            {KNOWN_AGENTS.length}
          </div>
          <p className="text-[10px] font-mono mt-1" style={{ color: '#4a6a8a' }}>
            registered agents
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {KNOWN_AGENTS.map((agent) => (
              <span
                key={agent.id}
                className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded cyber-badge"
              >
                {agent.id}
              </span>
            ))}
          </div>
        </div>

        {/* System Status card */}
        <div className="cyber-card rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4" style={{ color: '#00f0ff88' }} />
            <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: '#00f0ff88' }}>
              System Status
            </h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Bridge", status: isOnline ? "CONNECTED" : "DISCONNECTED", online: isOnline, icon: Cpu },
              { label: "OpenClaw", status: "LOCAL", online: true, icon: Shield },
              { label: "Ollama", status: "11434", online: true, icon: Activity },
            ].map(({ label, status, online, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-3 w-3" style={{ color: '#4a6a8a' }} />
                  <span className="text-xs font-mono" style={{ color: '#c8d6e5' }}>{label}</span>
                </div>
                <span
                  className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: online ? '#39ff14' : '#ff2d5e',
                    background: online ? '#39ff1408' : '#ff2d5e08',
                    border: `1px solid ${online ? '#39ff1420' : '#ff2d5e20'}`,
                  }}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Command History */}
      <CommandHistory />
    </div>
  );
}
