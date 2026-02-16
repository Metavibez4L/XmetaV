"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import type { AnchorEntry } from "@/hooks/useConsciousness";
import { ExternalLink, Link2, CheckCircle, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

interface AnchorSyncStatus {
  onChainCount: number;
  supabaseCount: number;
  synced: boolean;
  syncDelta: number;
  contractConfigured: boolean;
}

interface Props {
  anchors: AnchorEntry[];
}

const BASESCAN = "https://basescan.org/tx/";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const AnchorTimeline = React.memo(function AnchorTimeline({
  anchors,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<AnchorSyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch sync status from dedicated anchors API
  const fetchSyncStatus = useCallback(async () => {
    setSyncLoading(true);
    try {
      const res = await fetch("/api/anchors?count=0");
      if (res.ok) {
        const data = await res.json();
        setSyncStatus({
          onChainCount: data.onChainCount,
          supabaseCount: data.supabaseCount,
          synced: data.synced,
          syncDelta: data.syncDelta,
          contractConfigured: data.contractConfigured,
        });
      }
    } catch {
      // Non-fatal
    } finally {
      setSyncLoading(false);
    }
  }, []);

  // Auto-refresh sync status every 30s + when anchors change
  const prevAnchorLen = useRef(anchors.length);
  useEffect(() => {
    fetchSyncStatus();
    const iv = setInterval(fetchSyncStatus, 30_000);
    return () => clearInterval(iv);
  }, [fetchSyncStatus]);

  useEffect(() => {
    if (anchors.length !== prevAnchorLen.current) {
      prevAnchorLen.current = anchors.length;
      fetchSyncStatus();
    }
  }, [anchors.length, fetchSyncStatus]);

  const handleClick = useCallback(
    (anchor: AnchorEntry) => {
      if (anchor.txHash) {
        window.open(BASESCAN + anchor.txHash, "_blank", "noopener");
      }
    },
    [],
  );

  if (anchors.length === 0) {
    return (
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="h-4 w-4" style={{ color: "#39ff14" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#39ff14" }}
          >
            ON-CHAIN ANCHORS
          </h2>
          {syncStatus && <SyncBadge status={syncStatus} loading={syncLoading} onRefresh={fetchSyncStatus} />}
        </div>
        <div className="text-center py-8">
          <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
            No memories anchored on-chain yet.
          </div>
          <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a66" }}>
            Significant milestones, decisions, and incidents will appear here.
          </div>
          {syncStatus && syncStatus.onChainCount > 0 && (
            <div className="text-[9px] font-mono mt-2 px-2 py-1 rounded inline-block"
              style={{ color: "#f59e0b", background: "#f59e0b10", border: "1px solid #f59e0b20" }}>
              {syncStatus.onChainCount} anchor(s) found on-chain but missing from database
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4" style={{ color: "#39ff14" }} />
          <h2
            className="text-sm font-mono font-bold tracking-wider"
            style={{ color: "#39ff14" }}
          >
            ON-CHAIN ANCHORS
          </h2>
          {syncStatus && <SyncBadge status={syncStatus} loading={syncLoading} onRefresh={fetchSyncStatus} />}
        </div>
        <div className="flex items-center gap-2">
          {syncStatus && syncStatus.contractConfigured && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded"
              style={{ color: "#00f0ff66", border: "1px solid #00f0ff15" }}>
              Chain: {syncStatus.onChainCount} | DB: {syncStatus.supabaseCount}
            </span>
          )}
          <span
            className="text-[9px] font-mono px-2 py-0.5 rounded"
            style={{ color: "#39ff14", border: "1px solid #39ff1433", background: "#39ff1408" }}
          >
            {anchors.length} ANCHORED
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto pb-1"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="flex items-center gap-0 min-w-max px-2 py-4">
          {anchors.map((anchor, idx) => (
            <React.Fragment key={anchor.id}>
              {/* Node */}
              <div
                className="relative flex flex-col items-center cursor-pointer group"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => handleClick(anchor)}
              >
                {/* Dot */}
                <div
                  className="w-4 h-4 rounded-full border-2 transition-all z-10"
                  style={{
                    borderColor: hoveredIdx === idx ? "#39ff14" : "#39ff1466",
                    background: hoveredIdx === idx ? "#39ff14" : "#39ff1433",
                    boxShadow:
                      hoveredIdx === idx
                        ? "0 0 12px #39ff14, 0 0 4px #39ff14"
                        : "0 0 4px #39ff1433",
                    transform: hoveredIdx === idx ? "scale(1.3)" : "scale(1)",
                  }}
                />
                {/* Index */}
                <span
                  className="text-[8px] font-mono mt-1.5"
                  style={{ color: hoveredIdx === idx ? "#39ff14" : "#4a6a8a" }}
                >
                  {idx + 1}
                </span>

                {/* Hover tooltip */}
                {hoveredIdx === idx && (
                  <div
                    className="absolute bottom-full mb-3 px-3 py-2 rounded whitespace-nowrap"
                    style={{
                      background: "#0a0f1af0",
                      border: "1px solid #39ff1433",
                      backdropFilter: "blur(8px)",
                      zIndex: 50,
                      minWidth: 200,
                      maxWidth: 300,
                    }}
                  >
                    <div className="text-[9px] font-mono mb-1" style={{ color: "#39ff14" }}>
                      {fmtDate(anchor.created_at)}
                    </div>
                    <div
                      className="text-[10px] font-mono break-all"
                      style={{ color: "#c8d6e5cc", whiteSpace: "pre-wrap" }}
                    >
                      {anchor.content.length > 120
                        ? anchor.content.slice(0, 120) + "…"
                        : anchor.content}
                    </div>
                    {anchor.txHash && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <ExternalLink className="h-2.5 w-2.5" style={{ color: "#39ff1488" }} />
                        <span className="text-[8px] font-mono" style={{ color: "#39ff1488" }}>
                          {anchor.txHash.slice(0, 10)}…{anchor.txHash.slice(-6)}
                        </span>
                      </div>
                    )}
                    {anchor.ipfsCid && (
                      <div className="text-[8px] font-mono mt-0.5" style={{ color: "#a855f788" }}>
                        ipfs://{anchor.ipfsCid.slice(0, 12)}…
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Connector line */}
              {idx < anchors.length - 1 && (
                <div
                  className="h-0.5 flex-shrink-0"
                  style={{
                    width: 24,
                    background: `linear-gradient(90deg, #39ff1444, #39ff1422)`,
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
});

/* ── Sync Badge ─────────────────────────────────────────── */

function SyncBadge({
  status,
  loading,
  onRefresh,
}: {
  status: AnchorSyncStatus;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!status.contractConfigured) {
    return (
      <span
        className="text-[8px] font-mono px-1.5 py-0.5 rounded"
        style={{ color: "#4a6a8a", background: "#ffffff06", border: "1px solid #ffffff08" }}
      >
        Contract not configured
      </span>
    );
  }

  if (status.synced) {
    return (
      <button
        onClick={onRefresh}
        className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded transition-colors hover:bg-[#39ff1410]"
        style={{ color: "#39ff14", background: "#39ff1408", border: "1px solid #39ff1420" }}
        title="On-chain and database are in sync"
      >
        {loading ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <CheckCircle className="h-2.5 w-2.5" />
        )}
        SYNCED
      </button>
    );
  }

  return (
    <button
      onClick={onRefresh}
      className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded transition-colors hover:bg-[#f59e0b10]"
      style={{ color: "#f59e0b", background: "#f59e0b08", border: "1px solid #f59e0b20" }}
      title={`Delta: ${status.syncDelta > 0 ? "+" : ""}${status.syncDelta} (chain: ${status.onChainCount}, db: ${status.supabaseCount})`}
    >
      {loading ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <AlertTriangle className="h-2.5 w-2.5" />
      )}
      OUT OF SYNC ({Math.abs(status.syncDelta)})
    </button>
  );
}
