"use client";

import React from "react";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { Server } from "lucide-react";

export const SystemHealth = React.memo(function SystemHealth() {
  const { session, isOnline } = useBridgeStatus();

  const lastSeen = session
    ? new Date(session.last_heartbeat).toLocaleString()
    : "Never";

  return (
    <div className="cyber-card rounded-lg p-5 relative">
      <div className="flex items-center gap-2 mb-4">
        <Server className="h-4 w-4" style={{ color: '#00f0ff88' }} />
        <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: '#00f0ff88' }}>
          Bridge Daemon
        </h3>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: isOnline ? '#39ff14' : '#ff2d5e',
                boxShadow: isOnline
                  ? '0 0 6px #39ff14, 0 0 12px #39ff1466'
                  : '0 0 6px #ff2d5e, 0 0 12px #ff2d5e66',
              }}
            />
            {isOnline && (
              <div
                className="absolute inset-0 h-2.5 w-2.5 rounded-full animate-ping"
                style={{ background: '#39ff14', opacity: 0.3 }}
              />
            )}
          </div>
          <span
            className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
            style={{
              color: isOnline ? '#39ff14' : '#ff2d5e',
              background: isOnline ? '#39ff1410' : '#ff2d5e10',
              border: `1px solid ${isOnline ? '#39ff1425' : '#ff2d5e25'}`,
            }}
          >
            {isOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono" style={{ color: '#4a6a8a' }}>Last heartbeat</span>
          <span className="text-[10px] font-mono" style={{ color: '#00f0ff88' }}>{lastSeen}</span>
        </div>
        {session?.hostname && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono" style={{ color: '#4a6a8a' }}>Host</span>
            <code className="text-[10px] font-mono" style={{ color: '#00f0ff66' }}>{session.hostname}</code>
          </div>
        )}
      </div>
    </div>
  );
});
