"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Landmark, RefreshCw, Loader2, ArrowDownToLine, ArrowUpFromLine, Wallet, AlertTriangle } from "lucide-react";

interface Reserve {
  symbol: string;
  mint: string;
  depositTvl: string;
  borrowTvl: string;
  supplyApy: number;
  borrowApy: number;
  utilization: number;
}

interface MarketData {
  address: string;
  totalDepositTVL: string;
  totalBorrowTVL: string;
  reserves: Reserve[];
}

interface ObligationDeposit {
  reserve: string;
  amount: string;
}
interface ObligationBorrow {
  reserve: string;
  amount: string;
}
interface Obligation {
  address: string;
  loanToValue: number;
  deposits: ObligationDeposit[];
  borrows: ObligationBorrow[];
}

type BorrowAction = "deposit-collateral" | "borrow" | "repay" | "withdraw-collateral";

const ACTION_META: Record<BorrowAction, { label: string; color: string; price: string }> = {
  "deposit-collateral": { label: "Deposit Collateral", color: "#10b981", price: "$0.20" },
  borrow: { label: "Borrow", color: "#a855f7", price: "$0.20" },
  repay: { label: "Repay", color: "#00f0ff", price: "$0.15" },
  "withdraw-collateral": { label: "Withdraw Collateral", color: "#f59e0b", price: "$0.20" },
};

export function KaminoBorrowPanel() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [obligation, setObligation] = useState<Obligation | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<BorrowAction>("deposit-collateral");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, oRes] = await Promise.all([
        fetch("/api/trading/kamino-borrow?action=market"),
        fetch("/api/trading/kamino-borrow?action=obligation"),
      ]);
      if (mRes.ok) {
        const md = await mRes.json();
        setMarket(md);
        if (!token && md.reserves?.length > 0) {
          setToken(md.reserves[0].mint);
        }
      }
      if (oRes.ok) {
        const od = await oRes.json();
        setObligation(od.obligation ?? od);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchMarket(); }, [fetchMarket]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/trading/kamino-borrow?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, amount: parseFloat(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
      setResult(data);
      fetchMarket();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setSubmitting(false);
  };

  const fmtTvl = (v: string) => {
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  };

  const ltvColor = (ltv: number) => ltv > 0.75 ? "#ff2d5e" : ltv > 0.5 ? "#f59e0b" : "#10b981";

  return (
    <div className="space-y-4">
      {/* Market Overview */}
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4" style={{ color: "#a855f7" }} />
            <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "#a855f7" }}>
              Kamino Lending Market
            </h3>
          </div>
          <button onClick={fetchMarket} className="p-1 rounded hover:opacity-80" style={{ color: "#4a6a8a" }}>
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#4a6a8a" }} />
          </div>
        ) : market ? (
          <>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 p-3 rounded" style={{ background: "#060c18" }}>
                <div className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>Total Deposits</div>
                <div className="text-sm font-mono font-bold" style={{ color: "#10b981" }}>
                  {fmtTvl(market.totalDepositTVL)}
                </div>
              </div>
              <div className="flex-1 p-3 rounded" style={{ background: "#060c18" }}>
                <div className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>Total Borrows</div>
                <div className="text-sm font-mono font-bold" style={{ color: "#f59e0b" }}>
                  {fmtTvl(market.totalBorrowTVL)}
                </div>
              </div>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {market.reserves.slice(0, 10).map((r) => (
                <div
                  key={r.mint}
                  className="flex items-center justify-between p-2 rounded cursor-pointer hover:opacity-90 transition-all"
                  style={{
                    background: token === r.mint ? "#a855f710" : "#060c18",
                    border: `1px solid ${token === r.mint ? "#a855f730" : "transparent"}`,
                  }}
                  onClick={() => setToken(r.mint)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold" style={{ color: "#e0e8f0" }}>{r.symbol}</span>
                    <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                      {(r.utilization * 100).toFixed(1)}% util
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[9px] font-mono" style={{ color: "#10b981" }}>
                      Supply {(r.supplyApy * 100).toFixed(2)}%
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: "#f59e0b" }}>
                      Borrow {(r.borrowApy * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[10px] font-mono text-center py-4" style={{ color: "#4a6a8a" }}>
            Market unavailable — x402 server may be offline
          </p>
        )}
      </div>

      {/* User Obligation */}
      {obligation && (
        <div className="cyber-card rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4" style={{ color: "#00f0ff" }} />
            <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "#00f0ff" }}>
              Your Position
            </h3>
          </div>
          <div className="flex gap-4 mb-3">
            <div className="p-3 rounded flex-1" style={{ background: "#060c18" }}>
              <div className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>Loan-to-Value</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold" style={{ color: ltvColor(obligation.loanToValue) }}>
                  {(obligation.loanToValue * 100).toFixed(1)}%
                </span>
                {obligation.loanToValue > 0.7 && (
                  <AlertTriangle className="h-3 w-3" style={{ color: "#ff2d5e" }} />
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-mono mb-1" style={{ color: "#10b981" }}>Collateral</div>
              {obligation.deposits.length > 0 ? obligation.deposits.map((d, i) => (
                <div key={i} className="text-[10px] font-mono" style={{ color: "#e0e8f0" }}>
                  {d.amount} <span style={{ color: "#4a6a8a" }}>({d.reserve.slice(0, 8)}...)</span>
                </div>
              )) : (
                <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>None</div>
              )}
            </div>
            <div>
              <div className="text-[9px] font-mono mb-1" style={{ color: "#f59e0b" }}>Borrows</div>
              {obligation.borrows.length > 0 ? obligation.borrows.map((b, i) => (
                <div key={i} className="text-[10px] font-mono" style={{ color: "#e0e8f0" }}>
                  {b.amount} <span style={{ color: "#4a6a8a" }}>({b.reserve.slice(0, 8)}...)</span>
                </div>
              )) : (
                <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>None</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          {action.includes("deposit") || action === "repay" ? (
            <ArrowDownToLine className="h-4 w-4" style={{ color: ACTION_META[action].color }} />
          ) : (
            <ArrowUpFromLine className="h-4 w-4" style={{ color: ACTION_META[action].color }} />
          )}
          <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: ACTION_META[action].color }}>
            {ACTION_META[action].label}
          </h3>
          <span className="text-[9px] font-mono ml-1 px-1.5 py-0.5 rounded"
            style={{ color: "#a855f7", background: "#a855f708", border: "1px solid #a855f720" }}>
            {ACTION_META[action].price}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {(Object.keys(ACTION_META) as BorrowAction[]).map((a) => (
            <button
              key={a}
              onClick={() => { setAction(a); setResult(null); setError(null); }}
              className="px-2 py-1 rounded text-[9px] font-mono uppercase font-bold transition-all"
              style={{
                color: action === a ? ACTION_META[a].color : "#4a6a8a",
                background: action === a ? `${ACTION_META[a].color}10` : "transparent",
                border: `1px solid ${action === a ? `${ACTION_META[a].color}30` : "#4a6a8a20"}`,
              }}
            >
              {ACTION_META[a].label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[9px] font-mono block mb-1" style={{ color: "#4a6a8a" }}>Token Mint</label>
            {market?.reserves ? (
              <select
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="px-2 py-1.5 rounded text-xs font-mono"
                style={{ background: "#060c18", border: "1px solid #a855f720", color: "#e0e8f0" }}
              >
                {market.reserves.map((r) => (
                  <option key={r.mint} value={r.mint}>{r.symbol}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Token mint address"
                className="w-48 px-2 py-1.5 rounded text-xs font-mono"
                style={{ background: "#060c18", border: "1px solid #a855f720", color: "#e0e8f0" }}
              />
            )}
          </div>
          <div>
            <label className="text-[9px] font-mono block mb-1" style={{ color: "#4a6a8a" }}>Amount</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              className="w-32 px-2 py-1.5 rounded text-xs font-mono"
              style={{ background: "#060c18", border: "1px solid #a855f720", color: "#e0e8f0" }}
            />
          </div>
          <button
            onClick={submit}
            disabled={submitting || !amount || !token}
            className="px-4 py-1.5 rounded text-xs font-mono font-bold transition-all hover:opacity-90 disabled:opacity-40"
            style={{
              background: `${ACTION_META[action].color}20`,
              border: `1px solid ${ACTION_META[action].color}40`,
              color: ACTION_META[action].color,
            }}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
            {ACTION_META[action].label}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-[10px] font-mono px-3 py-2 rounded"
            style={{ color: "#ff2d5e", background: "#ff2d5e08", border: "1px solid #ff2d5e20" }}>
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
          </div>
        )}
      </div>
    </div>
  );
}
