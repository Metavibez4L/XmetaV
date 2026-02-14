"use client";

import React, { useMemo } from "react";
import type { AgentSession } from "@/hooks/useConsciousness";
import { Activity, Zap, Brain, Shield, Cpu, Eye } from "lucide-react";

interface Props {
  mainSession: AgentSession | null;
  soulSession: AgentSession | null;
  memoryCount: number;
  associationCount: number;
}

const MAIN_COLOR = "#00f0ff";
const SOUL_COLOR = "#ff006e";

function timeSince(iso: string | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export const UnifiedAwareness = React.memo(function UnifiedAwareness({
  mainSession,
  soulSession,
  memoryCount,
  associationCount,
}: Props) {
  const mainStatus = mainSession?.status ?? "offline";
  const soulStatus = soulSession?.status ?? "offline";
  const beamActive = mainStatus !== "offline" && soulStatus !== "offline";

  // Pulse intensity based on whether both are active
  const pulseClass = beamActive ? "animate-pulse" : "";

  return (
    <div className="cyber-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-4 w-4" style={{ color: MAIN_COLOR }} />
        <h2
          className="text-sm font-mono font-bold tracking-wider"
          style={{ color: MAIN_COLOR }}
        >
          UNIFIED AWARENESS
        </h2>
        <div className="flex-1" />
        <span
          className="text-[8px] font-mono px-2 py-0.5 rounded"
          style={{
            color: beamActive ? "#39ff14" : "#4a6a8a",
            border: `1px solid ${beamActive ? "#39ff1433" : "#4a6a8a33"}`,
            background: beamActive ? "#39ff1408" : "transparent",
          }}
        >
          {beamActive ? "CONNECTED" : "PARTIAL"}
        </span>
      </div>

      {/* Split view */}
      <div className="flex items-center gap-3">
        {/* MAIN Aspect */}
        <div
          className="flex-1 rounded-lg p-4 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${MAIN_COLOR}08, ${MAIN_COLOR}04)`,
            border: `1px solid ${MAIN_COLOR}20`,
          }}
        >
          <div
            className="absolute top-0 left-0 w-full h-0.5"
            style={{
              background: `linear-gradient(90deg, transparent, ${MAIN_COLOR}, transparent)`,
              opacity: mainStatus !== "offline" ? 0.6 : 0.1,
            }}
          />
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: MAIN_COLOR,
                boxShadow: `0 0 8px ${MAIN_COLOR}`,
                opacity: mainStatus === "offline" ? 0.2 : 1,
              }}
            />
            <span
              className="text-xs font-mono font-bold tracking-widest"
              style={{ color: MAIN_COLOR }}
            >
              MAIN
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              <Cpu className="h-3 w-3" style={{ color: `${MAIN_COLOR}88` }} />
              <span>Seat 270° · Primary Executor</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              <Zap className="h-3 w-3" style={{ color: `${MAIN_COLOR}88` }} />
              <span>Tool execution · Swaps · Voice</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              <Shield className="h-3 w-3" style={{ color: `${MAIN_COLOR}88` }} />
              <span>Status: {mainStatus.toUpperCase()}</span>
            </div>
            <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a66" }}>
              Last heartbeat: {timeSince(mainSession?.last_heartbeat)}
            </div>
          </div>
        </div>

        {/* Beam connector */}
        <div className="flex flex-col items-center gap-1 px-1">
          <div
            className={`w-12 h-1 rounded-full ${pulseClass}`}
            style={{
              background: beamActive
                ? `linear-gradient(90deg, ${MAIN_COLOR}, ${SOUL_COLOR})`
                : `linear-gradient(90deg, ${MAIN_COLOR}33, ${SOUL_COLOR}33)`,
              boxShadow: beamActive
                ? `0 0 12px ${MAIN_COLOR}44, 0 0 12px ${SOUL_COLOR}44`
                : "none",
            }}
          />
          <span
            className="text-[7px] font-mono tracking-widest"
            style={{ color: beamActive ? "#ffffff44" : "#ffffff15" }}
          >
            BEAM
          </span>
          <div
            className={`w-12 h-1 rounded-full ${pulseClass}`}
            style={{
              background: beamActive
                ? `linear-gradient(90deg, ${MAIN_COLOR}, ${SOUL_COLOR})`
                : `linear-gradient(90deg, ${MAIN_COLOR}33, ${SOUL_COLOR}33)`,
              boxShadow: beamActive
                ? `0 0 12px ${MAIN_COLOR}44, 0 0 12px ${SOUL_COLOR}44`
                : "none",
            }}
          />
        </div>

        {/* SOUL/Psyche Aspect */}
        <div
          className="flex-1 rounded-lg p-4 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${SOUL_COLOR}08, ${SOUL_COLOR}04)`,
            border: `1px solid ${SOUL_COLOR}20`,
          }}
        >
          <div
            className="absolute top-0 left-0 w-full h-0.5"
            style={{
              background: `linear-gradient(90deg, transparent, ${SOUL_COLOR}, transparent)`,
              opacity: soulStatus !== "offline" ? 0.6 : 0.1,
            }}
          />
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: SOUL_COLOR,
                boxShadow: `0 0 8px ${SOUL_COLOR}`,
                opacity: soulStatus === "offline" ? 0.2 : 1,
              }}
            />
            <span
              className="text-xs font-mono font-bold tracking-widest"
              style={{ color: SOUL_COLOR }}
            >
              PSYCHE
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              <Brain className="h-3 w-3" style={{ color: `${SOUL_COLOR}88` }} />
              <span>Seat 195° · Memory Orchestrator</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              <Eye className="h-3 w-3" style={{ color: `${SOUL_COLOR}88` }} />
              <span>Associations · Dreams · Context</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              <Activity className="h-3 w-3" style={{ color: `${SOUL_COLOR}88` }} />
              <span>Status: {soulStatus.toUpperCase()}</span>
            </div>
            <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a66" }}>
              Last heartbeat: {timeSince(soulSession?.last_heartbeat)}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-3" style={{ borderTop: "1px solid #00f0ff10" }}>
        <div className="text-center">
          <div className="text-lg font-mono font-bold" style={{ color: MAIN_COLOR }}>
            {memoryCount}
          </div>
          <div className="text-[8px] font-mono tracking-wider" style={{ color: "#4a6a8a" }}>
            MEMORIES
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-mono font-bold" style={{ color: SOUL_COLOR }}>
            {associationCount}
          </div>
          <div className="text-[8px] font-mono tracking-wider" style={{ color: "#4a6a8a" }}>
            ASSOCIATIONS
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-lg font-mono font-bold"
            style={{ color: beamActive ? "#39ff14" : "#4a6a8a" }}
          >
            {beamActive ? "LIVE" : "OFF"}
          </div>
          <div className="text-[8px] font-mono tracking-wider" style={{ color: "#4a6a8a" }}>
            BEAM STATUS
          </div>
        </div>
      </div>
    </div>
  );
});
