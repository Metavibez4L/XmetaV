"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Vault, RefreshCw, Loader2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

interface KaminoVault {
  address: string;
  name: string;
  token: string;
  tokenMint: string;
  estimatedApy: number;
}

type ActionMode = "deposit" | "withdraw";

export function KaminoPanel() {
  const [vaults, setVaults] = useState<Record<string, KaminoVault>>({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ActionMode>("deposit");
  const [selectedVault, setSelectedVault] = useState("USDC_MAIN");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchVaults = useCallback(async () => {
    try {
      const res = await fetch("/api/trading/cross-chain?action=vaults");
      if (res.ok) {
        const data = await res.json();
        setVaults(data.vaults || {});
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVaults(); }, [fetchVaults]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const body = mode === "deposit"
        ? { vault: selectedVault, amount }
        : { vault: selectedVault, shares: amount };
      const res = await fetch(`/api/trading/kamino?action=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setSubmitting(false);
  };

  const vaultEntries = Object.entries(vaults);

  return (
    <div className="space-y-4">
      {/* Vault Overview */}
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Vault className="h-4 w-4" style={{ color: "#10b981" }} />
            <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "#10b981" }}>
              Kamino Vaults
            </h3>
          </div>
          <button onClick={fetchVaults} className="p-1 rounded hover:opacity-80" style={{ color: "#4a6a8a" }}>
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#4a6a8a" }} />
          </div>
        ) : vaultEntries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vaultEntries.map(([key, vault]) => (
              <div
                key={key}
                className="p-4 rounded cursor-pointer transition-all hover:opacity-90"
                style={{
                  background: selectedVault === key ? "#10b98110" : "#060c18",
                  border: `1px solid ${selectedVault === key ? "#10b98140" : "transparent"}`,
                }}
                onClick={() => setSelectedVault(key)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold" style={{ color: "#e0e8f0" }}>
                    {vault.name}
                  </span>
                  <span
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
                    style={{ color: "#39ff14", background: "#39ff1408", border: "1px solid #39ff1420" }}
                  >
                    ~{vault.estimatedApy}% APY
                  </span>
                </div>
                <div className="text-[9px] font-mono space-y-1" style={{ color: "#4a6a8a" }}>
                  <div>Token: <span style={{ color: "#00f0ff88" }}>{vault.token}</span></div>
                  <div className="truncate">Address: <span style={{ color: "#00f0ff66" }}>{vault.address}</span></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] font-mono text-center py-4" style={{ color: "#4a6a8a" }}>
            No vaults available — x402 server may be offline
          </p>
        )}
      </div>

      {/* Deposit / Withdraw */}
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          {mode === "deposit" ? (
            <ArrowDownToLine className="h-4 w-4" style={{ color: "#10b981" }} />
          ) : (
            <ArrowUpFromLine className="h-4 w-4" style={{ color: "#f59e0b" }} />
          )}
          <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: mode === "deposit" ? "#10b981" : "#f59e0b" }}>
            Kamino {mode === "deposit" ? "Deposit" : "Withdraw"}
          </h3>
          <span className="text-[9px] font-mono ml-1 px-1.5 py-0.5 rounded" style={{ color: "#a855f7", background: "#a855f708", border: "1px solid #a855f720" }}>
            $0.15
          </span>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          {(["deposit", "withdraw"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setResult(null); setError(null); }}
              className="px-3 py-1 rounded text-[10px] font-mono uppercase font-bold transition-all"
              style={{
                color: mode === m ? (m === "deposit" ? "#10b981" : "#f59e0b") : "#4a6a8a",
                background: mode === m ? (m === "deposit" ? "#10b98110" : "#f59e0b10") : "transparent",
                border: `1px solid ${mode === m ? (m === "deposit" ? "#10b98130" : "#f59e0b30") : "#4a6a8a20"}`,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[9px] font-mono block mb-1" style={{ color: "#4a6a8a" }}>Vault</label>
            <select
              value={selectedVault}
              onChange={(e) => setSelectedVault(e.target.value)}
              className="px-2 py-1.5 rounded text-xs font-mono"
              style={{ background: "#060c18", border: "1px solid #10b98120", color: "#e0e8f0" }}
            >
              {vaultEntries.map(([key, v]) => (
                <option key={key} value={key}>{v.token} — {v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-mono block mb-1" style={{ color: "#4a6a8a" }}>
              {mode === "deposit" ? "Amount (tokens)" : "Shares (raw)"}
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === "deposit" ? "10.00" : "1000000"}
              className="w-32 px-2 py-1.5 rounded text-xs font-mono"
              style={{ background: "#060c18", border: "1px solid #10b98120", color: "#e0e8f0" }}
            />
          </div>
          <button
            onClick={submit}
            disabled={submitting || !amount}
            className="px-4 py-1.5 rounded text-xs font-mono font-bold transition-all hover:opacity-90 disabled:opacity-40"
            style={{
              background: mode === "deposit" ? "#10b98120" : "#f59e0b20",
              border: `1px solid ${mode === "deposit" ? "#10b98140" : "#f59e0b40"}`,
              color: mode === "deposit" ? "#10b981" : "#f59e0b",
            }}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
            {mode === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-[10px] font-mono px-3 py-2 rounded" style={{ color: "#ff2d5e", background: "#ff2d5e08", border: "1px solid #ff2d5e20" }}>
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 p-3 rounded space-y-2" style={{ background: "#060c18" }}>
            {Object.entries(result).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>{k}</span>
                <span className="text-[10px] font-mono font-bold truncate max-w-[50%]" style={{ color: "#e0e8f0" }}>
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
            {typeof result.explorerUrl === "string" && (
              <a
                href={result.explorerUrl as string}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[10px] font-mono mt-1 hover:underline"
                style={{ color: "#a855f7" }}
              >
                View on Solscan →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
