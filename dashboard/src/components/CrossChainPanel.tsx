"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeftRight, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface QueueStats {
  pendingJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalBridgedUsd: number;
  batchThreshold: number;
  emergencyPause: boolean;
}

interface QuoteResult {
  input: number;
  outputToken: string;
  estimatedFees: number;
  estimatedOutput: number;
  margin: string;
  jupiterQuote: Record<string, unknown> | null;
  batched: boolean;
  note: string;
}

export function CrossChainPanel() {
  const [queue, setQueue] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [amount, setAmount] = useState("10");
  const [outputToken, setOutputToken] = useState("SOL");
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/trading/cross-chain");
      if (res.ok) setQueue(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const getQuote = async () => {
    setQuoting(true);
    setError(null);
    setQuote(null);
    try {
      const res = await fetch("/api/trading/cross-chain?action=quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, outputToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
      setQuote(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Quote failed");
    }
    setQuoting(false);
  };

  return (
    <div className="space-y-4">
      {/* Queue Stats */}
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" style={{ color: "#a855f7" }} />
            <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "#a855f7" }}>
              Cross-Chain Queue
            </h3>
          </div>
          <button onClick={fetchQueue} className="p-1 rounded hover:opacity-80" style={{ color: "#4a6a8a" }}>
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#4a6a8a" }} />
          </div>
        ) : queue ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Pending", value: queue.pendingJobs, color: "#f59e0b" },
              { label: "Active", value: queue.activeJobs, color: "#00f0ff" },
              { label: "Completed", value: queue.completedJobs, color: "#39ff14" },
              { label: "Failed", value: queue.failedJobs, color: "#ff2d5e" },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded text-center" style={{ background: "#060c18" }}>
                <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
                <div className="text-[9px] font-mono uppercase mt-1" style={{ color: "#4a6a8a" }}>{label}</div>
              </div>
            ))}
            <div className="p-3 rounded text-center col-span-2 md:col-span-4" style={{ background: "#060c18" }}>
              <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                Total Bridged: <span style={{ color: "#39ff14" }}>${(queue.totalBridgedUsd || 0).toFixed(2)}</span>
                {" · "}Batch Threshold: <span style={{ color: "#00f0ff" }}>${queue.batchThreshold}</span>
                {queue.emergencyPause && (
                  <span className="ml-2" style={{ color: "#ff2d5e" }}>
                    <AlertTriangle className="inline h-3 w-3 mr-1" />PAUSED
                  </span>
                )}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[10px] font-mono text-center py-4" style={{ color: "#4a6a8a" }}>
            x402 server unreachable
          </p>
        )}
      </div>

      {/* Quote Tool */}
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="h-4 w-4" style={{ color: "#00f0ff88" }} />
          <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "#00f0ff88" }}>
            Cross-Chain Swap Quote
          </h3>
          <span className="text-[9px] font-mono ml-1 px-1.5 py-0.5 rounded" style={{ color: "#39ff14", background: "#39ff1408", border: "1px solid #39ff1420" }}>
            FREE
          </span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[9px] font-mono block mb-1" style={{ color: "#4a6a8a" }}>USDC Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 px-2 py-1.5 rounded text-xs font-mono"
              style={{ background: "#060c18", border: "1px solid #00f0ff20", color: "#e0e8f0" }}
              min="1"
              step="1"
            />
          </div>
          <div>
            <label className="text-[9px] font-mono block mb-1" style={{ color: "#4a6a8a" }}>Output Token</label>
            <select
              value={outputToken}
              onChange={(e) => setOutputToken(e.target.value)}
              className="px-2 py-1.5 rounded text-xs font-mono"
              style={{ background: "#060c18", border: "1px solid #00f0ff20", color: "#e0e8f0" }}
            >
              {["SOL", "USDC", "BONK", "JUP"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            onClick={getQuote}
            disabled={quoting}
            className="px-4 py-1.5 rounded text-xs font-mono font-bold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "#a855f720", border: "1px solid #a855f740", color: "#a855f7" }}
          >
            {quoting ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
            Get Quote
          </button>
        </div>

        {error && (
          <div className="mt-3 text-[10px] font-mono px-3 py-2 rounded" style={{ color: "#ff2d5e", background: "#ff2d5e08", border: "1px solid #ff2d5e20" }}>
            {error}
          </div>
        )}

        {quote && (
          <div className="mt-4 p-3 rounded space-y-2" style={{ background: "#060c18" }}>
            <div className="flex justify-between">
              <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>Input</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: "#e0e8f0" }}>${quote.input} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>Est. Fees</span>
              <span className="text-[10px] font-mono" style={{ color: "#f59e0b" }}>${quote.estimatedFees.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>Est. Output</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: "#39ff14" }}>
                {quote.estimatedOutput.toFixed(4)} {quote.outputToken}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>Margin</span>
              <span className="text-[10px] font-mono" style={{ color: "#00f0ff" }}>{quote.margin}</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <CheckCircle2 className="h-3 w-3" style={{ color: quote.batched ? "#f59e0b" : "#39ff14" }} />
              <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
                {quote.note}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
