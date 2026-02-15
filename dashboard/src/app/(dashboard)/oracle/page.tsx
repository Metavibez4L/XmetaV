"use client";

import AgentDiscoveryPanel from "@/components/oracle/AgentDiscoveryPanel";
import { Eye, Radio } from "lucide-react";

export default function OraclePage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5" style={{ color: "#fbbf24" }} />
            <h1
              className="text-xl font-bold font-mono tracking-wider"
              style={{ color: "#fbbf24", textShadow: "0 0 20px #fbbf2444" }}
            >
              ORACLE
            </h1>
            <span
              className="text-[7px] font-mono tracking-widest px-2 py-0.5 rounded"
              style={{
                background: "#fbbf2415",
                color: "#fbbf24",
                border: "1px solid #fbbf2430",
              }}
            >
              IDENTITY SCOUT
            </span>
          </div>
          <p
            className="text-[11px] font-mono mt-1"
            style={{ color: "#4a6a8a" }}
          >
            // ERC-8004 registry scanner · agent discovery · ecosystem mapping
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Radio
            className="h-3.5 w-3.5 animate-pulse"
            style={{ color: "#fbbf2466" }}
          />
          <span
            className="text-[9px] font-mono uppercase tracking-wider"
            style={{ color: "#fbbf2444" }}
          >
            Scanning Base Mainnet
          </span>
        </div>
      </div>

      {/* Agent Discovery Panel */}
      <AgentDiscoveryPanel />
    </div>
  );
}
