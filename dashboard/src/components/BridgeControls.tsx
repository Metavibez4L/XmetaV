"use client";

import React, { useMemo } from "react";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { useBridgeControl } from "@/hooks/useBridgeControl";
import { Power, PlugZap, AlertTriangle } from "lucide-react";

export const BridgeControls = React.memo(function BridgeControls() {
  const { isOnline, session } = useBridgeStatus(); // Supabase heartbeat
  const { status, loading, error, start, stop, canStart, canStop } = useBridgeControl(); // local process

  const heartbeatText = useMemo(() => {
    if (!session) return "Never";
    return new Date(session.last_heartbeat).toLocaleTimeString();
  }, [session]);

  return (
    <div className="cyber-card rounded-lg p-5 relative">
      <div className="flex items-center gap-2 mb-4">
        <Power className="h-4 w-4" style={{ color: "#00f0ff88" }} />
        <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "#00f0ff88" }}>
          Bridge Control
        </h3>
      </div>

      {!status.supported ? (
        <div
          className="rounded border px-3 py-2"
          style={{ borderColor: "#f59e0b25", background: "#f59e0b08" }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" style={{ color: "#f59e0b" }} />
            <div>
              <p className="text-[11px] font-mono" style={{ color: "#f59e0b" }}>
                Local bridge control is unsupported in serverless (Vercel).
              </p>
              <p className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
                Run the dashboard locally to start/stop the bridge from the UI.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                Local process
              </span>
              <span
                className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  color: status.running ? "#39ff14" : "#ff2d5e",
                  background: status.running ? "#39ff1410" : "#ff2d5e10",
                  border: `1px solid ${status.running ? "#39ff1425" : "#ff2d5e25"}`,
                }}
              >
                {status.running ? `RUNNING${status.pid ? ` (pid ${status.pid})` : ""}` : "STOPPED"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                Supabase heartbeat
              </span>
              <span
                className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  color: isOnline ? "#39ff14" : "#ff2d5e",
                  background: isOnline ? "#39ff1408" : "#ff2d5e08",
                  border: `1px solid ${isOnline ? "#39ff1420" : "#ff2d5e20"}`,
                }}
              >
                {isOnline ? `ONLINE (last ${heartbeatText})` : "OFFLINE"}
              </span>
            </div>
          </div>

          {error && (
            <div
              className="rounded border px-3 py-2 mb-3"
              style={{ borderColor: "#ff2d5e25", background: "#ff2d5e08" }}
            >
              <p className="text-[10px] font-mono" style={{ color: "#ff2d5e" }}>
                [ERROR] {error}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => start()}
              disabled={!canStart}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono uppercase tracking-wider cyber-btn cyber-btn-primary disabled:opacity-30"
            >
              <PlugZap className="h-3.5 w-3.5" />
              {loading ? "..." : "Start Bridge"}
            </button>
            <button
              onClick={() => stop()}
              disabled={!canStop}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono uppercase tracking-wider cyber-btn disabled:opacity-30"
              style={{ borderColor: "#ff2d5e40" }}
            >
              <Power className="h-3.5 w-3.5" />
              {loading ? "..." : "Stop Bridge"}
            </button>
          </div>

          <p className="mt-3 text-[9px] font-mono" style={{ color: "#4a6a8a44" }}>
            Note: stopping the bridge will halt command execution until restarted.
          </p>
        </>
      )}
    </div>
  );
});

