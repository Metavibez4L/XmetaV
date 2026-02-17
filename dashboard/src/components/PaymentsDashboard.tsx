"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { X402Payment } from "@/lib/types";
import Link from "next/link";
import {
  DollarSign,
  Activity,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Server,
  Loader2,
  TrendingUp,
  BarChart3,
} from "lucide-react";

interface WalletResponse {
  wallet: {
    configured: boolean;
    address: string | null;
    owner: string | null;
    agentId: string;
    network: string;
    budgetLimit: string;
  };
  stats: {
    totalSpend: string;
    todaySpend: string;
    paymentCount: number;
    currency: string;
  };
  bridge: {
    online: boolean;
    lastHeartbeat: string | null;
  };
}

interface PaymentsResponse {
  payments: X402Payment[];
  summary: {
    todaySpend: string;
    currency: string;
    paymentCount: number;
  };
}

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  completed: { color: "#39ff14", bg: "#39ff1410", border: "#39ff1425", icon: CheckCircle2 },
  pending: { color: "#f59e0b", bg: "#f59e0b10", border: "#f59e0b25", icon: Clock },
  failed: { color: "#ff2d5e", bg: "#ff2d5e10", border: "#ff2d5e25", icon: XCircle },
};

const networkLabels: Record<string, string> = {
  "eip155:84532": "Base Sepolia",
  "eip155:8453": "Base Mainnet",
};

interface EndpointAnalytics {
  endpoint_path: string;
  total_calls: number;
  paid_calls: number;
  avg_payment_usd: number;
  revenue_7d: number;
  revenue_30d: number;
  growth_trend: string;
}

export const PaymentsDashboard = React.memo(function PaymentsDashboard() {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [payments, setPayments] = useState<PaymentsResponse | null>(null);
  const [endpointAnalytics, setEndpointAnalytics] = useState<EndpointAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError(null);
    try {
      const [walletRes, paymentsRes, midasRes] = await Promise.all([
        fetch("/api/x402/wallet").catch(() => null),
        fetch("/api/x402/payments").catch(() => null),
        fetch("/api/midas?action=endpoints").catch(() => null),
      ]);
      if (walletRes?.ok) setWallet(await walletRes.json());
      else if (walletRes) setError(`Wallet API returned ${walletRes.status}`);
      if (paymentsRes?.ok) setPayments(await paymentsRes.json());
      if (midasRes?.ok) {
        const md = await midasRes.json();
        setEndpointAnalytics(md.endpoints || []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load wallet data: ${msg}`);
      console.error("Failed to fetch x402 data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00f0ff" }} />
      </div>
    );
  }

  if (error && !wallet) {
    return (
      <div className="rounded-lg border p-6 text-center" style={{ background: "#0a1020", borderColor: "#ff2d5e20" }}>
        <XCircle className="h-8 w-8 mx-auto mb-3" style={{ color: "#ff2d5e44" }} />
        <div className="text-sm font-mono" style={{ color: "#ff2d5e" }}>{error}</div>
        <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
          Wallet data is loaded server-side — MetaMask is not required
        </div>
        <button
          onClick={() => fetchData(true)}
          className="mt-3 text-[10px] font-mono px-3 py-1.5 rounded transition-colors"
          style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = wallet?.stats;
  const walletInfo = wallet?.wallet;
  const networkName = walletInfo?.network
    ? networkLabels[walletInfo.network] || walletInfo.network
    : "Unknown";

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Wallet Status */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              Wallet
            </span>
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: walletInfo?.configured ? "#39ff14" : "#ff2d5e",
                boxShadow: walletInfo?.configured
                  ? "0 0 6px #39ff14"
                  : "0 0 6px #ff2d5e",
              }}
            />
          </div>
          <div className="text-sm font-mono" style={{ color: "#e0e8f0" }}>
            {walletInfo?.configured
              ? truncateAddress(walletInfo.address || "")
              : "Not Configured"}
          </div>
          <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            {networkName}
          </div>
        </div>

        {/* Total Spend */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              Total Spend
            </span>
            <DollarSign className="h-3.5 w-3.5" style={{ color: "#00f0ff44" }} />
          </div>
          <div className="text-lg font-mono font-bold" style={{ color: "#e0e8f0" }}>
            ${stats?.totalSpend || "0.0000"}
          </div>
          <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            {stats?.currency || "USDC"} on Base
          </div>
        </div>

        {/* Today's Spend */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              Today
            </span>
            <ArrowUpRight className="h-3.5 w-3.5" style={{ color: "#00f0ff44" }} />
          </div>
          <div className="text-lg font-mono font-bold" style={{ color: "#e0e8f0" }}>
            ${stats?.todaySpend || "0.0000"}
          </div>
          <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            Budget: ${walletInfo?.budgetLimit || "1.00"}/req
          </div>
        </div>

        {/* Payment Count */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              Transactions
            </span>
            <Activity className="h-3.5 w-3.5" style={{ color: "#00f0ff44" }} />
          </div>
          <div className="text-lg font-mono font-bold" style={{ color: "#e0e8f0" }}>
            {stats?.paymentCount || 0}
          </div>
          <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            Total payments
          </div>
        </div>
      </div>

      {/* Token Discount Tier */}
      <TokenTierCard wallet={walletInfo?.address} />

      {/* x402 Server Status — Gated Endpoints */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4" style={{ color: "#00f0ff66" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              x402 Gated Endpoints · 16 endpoints
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/midas"
              className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded transition-colors hover:opacity-80"
              style={{ color: "#f59e0b", border: "1px solid #f59e0b30", background: "#f59e0b08" }}
            >
              <TrendingUp className="h-3 w-3" />
              Midas Revenue
            </Link>
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  background: wallet?.bridge.online ? "#39ff14" : "#ff2d5e",
                  boxShadow: wallet?.bridge.online
                    ? "0 0 6px #39ff14"
                    : "0 0 6px #ff2d5e",
                }}
              />
              <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
                Bridge {wallet?.bridge.online ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
          {[
            { ep: "POST /agent-task", price: "$0.10", desc: "Dispatch task to agent" },
            { ep: "POST /intent", price: "$0.05", desc: "Goal → commands" },
            { ep: "GET /fleet-status", price: "$0.01", desc: "Live agent fleet" },
            { ep: "POST /swarm", price: "$0.50", desc: "Multi-agent swarm" },
            { ep: "POST /memory-crystal", price: "$0.05", desc: "Memory crystal summon" },
            { ep: "POST /neural-swarm", price: "$0.10", desc: "Neural swarm delegation" },
            { ep: "POST /fusion-chamber", price: "$0.15", desc: "Fuse memory crystals" },
            { ep: "POST /cosmos-explore", price: "$0.20", desc: "Explore Memory Cosmos" },
            { ep: "POST /voice/transcribe", price: "$0.05", desc: "Speech-to-text" },
            { ep: "POST /voice/synthesize", price: "$0.08", desc: "Text-to-speech" },
            { ep: "POST /execute-trade", price: "$0.50+", desc: "Swap tx bundle (0.5%)" },
            { ep: "POST /rebalance-portfolio", price: "$2.00+", desc: "Portfolio rebalance (0.3%)" },
            { ep: "GET /arb-opportunity", price: "$0.25", desc: "Arb scan" },
            { ep: "POST /execute-arb", price: "$0.10+", desc: "Execute arb (1% profit)" },
            { ep: "GET /yield-optimize", price: "$0.50", desc: "Yield farming scan" },
            { ep: "POST /deploy-yield-strategy", price: "$3.00+", desc: "Deploy capital (0.5%)" },
          ].map(({ ep, price, desc }) => (
            <div key={ep} className="p-2 rounded" style={{ background: "#060c18" }}>
              <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                {ep}
              </div>
              <div className="text-xs font-mono font-bold" style={{ color: "#e0e8f0" }}>
                {price}
              </div>
              <div className="text-[9px] font-mono mt-0.5" style={{ color: "#4a6a8a66" }}>
                {desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Staking Tiers + Endpoint Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Staking Discount Tiers */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#ffd70015" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4" style={{ color: "#ffd70066" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#ffd70066" }}>
              $XMETAV Staking Discounts
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "None",    min: "0",     disc: "0%",  limit: "$5",    color: "#4a6a8a" },
              { name: "Starter", min: "100",   disc: "10%", limit: "$25",   color: "#a3e635" },
              { name: "Bronze",  min: "1K",    disc: "15%", limit: "$50",   color: "#cd7f32" },
              { name: "Silver",  min: "10K",   disc: "25%", limit: "$200",  color: "#c0c0c0" },
              { name: "Gold",    min: "100K",  disc: "50%", limit: "$1K",   color: "#ffd700" },
              { name: "Diamond", min: "1M",    disc: "75%", limit: "$5K",   color: "#b9f2ff" },
            ].map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between px-3 py-1.5 rounded"
                style={{ background: "#060c18" }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  <span className="text-[10px] font-mono font-bold" style={{ color: t.color }}>
                    {t.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
                    ≥{t.min}
                  </span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: t.name === "None" ? "#4a6a8a" : "#39ff14" }}>
                    {t.disc}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>
                    {t.limit}/day
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Endpoint Analytics */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4" style={{ color: "#00f0ff66" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              Endpoint Revenue Analytics
            </span>
          </div>
          {endpointAnalytics.length === 0 ? (
            <div className="text-center py-6">
              <BarChart3 className="h-6 w-6 mx-auto mb-2" style={{ color: "#00f0ff15" }} />
              <p className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                Analytics populate as x402 payments are processed
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {endpointAnalytics.slice(0, 8).map((ep) => (
                <div
                  key={ep.endpoint_path}
                  className="flex items-center justify-between px-3 py-1.5 rounded"
                  style={{ background: "#060c18" }}
                >
                  <span className="text-[10px] font-mono" style={{ color: "#00f0ff88" }}>
                    {ep.endpoint_path}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
                      {ep.total_calls} calls
                    </span>
                    <span className="text-[10px] font-mono font-bold" style={{ color: "#39ff14" }}>
                      ${(ep.revenue_30d || 0).toFixed(4)}
                    </span>
                    <TrendBadge trend={ep.growth_trend} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment History Table */}
      <div
        className="rounded-lg border"
        style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "#00f0ff10" }}>
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
            Payment History
          </span>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded transition-colors"
            style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {(!payments?.payments || payments.payments.length === 0) ? (
          <div className="p-8 text-center">
            <DollarSign className="h-8 w-8 mx-auto mb-3" style={{ color: "#00f0ff22" }} />
            <div className="text-sm font-mono" style={{ color: "#4a6a8a" }}>
              No payments yet
            </div>
            <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a66" }}>
              Payments will appear here when agents make x402 transactions
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff44" }}>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Endpoint</th>
                  <th className="text-left p-3">Agent</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Network</th>
                  <th className="text-left p-3">Tx Hash</th>
                  <th className="text-left p-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {payments.payments.map((payment) => {
                  const sc = statusConfig[payment.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr
                      key={payment.id}
                      className="border-t transition-colors hover:bg-[#00f0ff05]"
                      style={{ borderColor: "#00f0ff08" }}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className="h-3 w-3" style={{ color: sc.color }} />
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}
                          >
                            {payment.status.toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-mono" style={{ color: "#e0e8f0" }}>
                          {payment.endpoint}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-mono" style={{ color: "#00f0ff88" }}>
                          {payment.agent_id}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-xs font-mono font-bold" style={{ color: "#e0e8f0" }}>
                          ${payment.amount}
                        </span>
                        <span className="text-[9px] font-mono ml-1" style={{ color: "#4a6a8a" }}>
                          {payment.currency}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                          {networkLabels[payment.network] || payment.network}
                        </span>
                      </td>
                      <td className="p-3">
                        {payment.tx_hash ? (
                          <a
                            href={getExplorerUrl(payment.network, payment.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] font-mono hover:underline"
                            style={{ color: "#00f0ff88" }}
                          >
                            {truncateHash(payment.tx_hash)}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="text-[10px] font-mono" style={{ color: "#4a6a8a44" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                          {formatTime(payment.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

// ---- Helpers ----

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function truncateHash(hash: string): string {
  if (!hash || hash.length < 12) return hash || "—";
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function getExplorerUrl(network: string, txHash: string): string {
  if (network === "eip155:84532") {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
  if (network === "eip155:8453") {
    return `https://basescan.org/tx/${txHash}`;
  }
  return `#`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

// ── Trend Badge ──

function TrendBadge({ trend }: { trend: string }) {
  const isUp = trend === "growing" || trend === "up";
  const isDown = trend === "declining" || trend === "down";
  const color = isUp ? "#39ff14" : isDown ? "#ff2d5e" : "#4a6a8a";
  const arrow = isUp ? "▲" : isDown ? "▼" : "—";
  return (
    <span className="text-[9px] font-mono" style={{ color }}>
      {arrow}
    </span>
  );
}

// ── Token Tier Card ──

function TokenTierCard({ wallet: walletAddr }: { wallet?: string | null }) {
  const [tier, setTier] = useState<{
    name: string;
    discount: string;
    color: string;
    balance: number;
  } | null>(null);
  const [tierError, setTierError] = useState(false);

  useEffect(() => {
    if (!walletAddr) return;
    setTierError(false);
    fetch(`/api/token?wallet=${walletAddr}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.wallet) {
          setTier({
            name: d.wallet.tier,
            discount: d.wallet.discount,
            color: d.wallet.tierColor,
            balance: d.wallet.balance,
          });
        }
      })
      .catch(() => setTierError(true));
  }, [walletAddr]);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        background: "#0a1020",
        borderColor: tier ? tier.color + "20" : "#00f0ff15",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#ffd70066" }}>
          Token Tier
        </span>
      </div>
      <div className="text-lg font-mono font-bold" style={{ color: tier?.color || "#4a6a8a" }}>
        {tier?.name || (tierError ? "Unavailable" : "—")}
      </div>
      <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
        {tier
          ? `${tier.discount} discount · ${tier.balance.toLocaleString()} XMETAV`
          : tierError
            ? "Could not load token tier — RPC may be unavailable"
            : "Loading..."}
      </div>
    </div>
  );
}
