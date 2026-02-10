"use client";

import { KNOWN_AGENTS } from "@/lib/types";

interface AgentSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function AgentSelector({ value, onChange }: AgentSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: '#00f0ff44' }}>
        Target:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded px-2 text-[11px] font-mono cursor-pointer"
        style={{
          background: '#05080f',
          border: '1px solid #00f0ff20',
          color: '#00f0ff',
          outline: 'none',
        }}
      >
        {KNOWN_AGENTS.map((agent) => (
          <option key={agent.id} value={agent.id} style={{ background: '#0a0f1a' }}>
            {agent.id}
          </option>
        ))}
      </select>
    </div>
  );
}
