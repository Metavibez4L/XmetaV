"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Coins,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Gem,
  TrendingUp,
  Shield,
  Zap,
} from "lucide-react";

// ── Types ──

interface TierInfo {
  name: string;
  minBalance: number;
  discount: string;
  dailyLimit: string;
  color: string;
}

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  network: string;
  chainId: number;
  totalSupply: number;
}

interface WalletInfo {
  address: string;
  balance: number;
  balanceRaw: string;
  tier: string;
  discount: string;
  dailyLimit: string;
  tierColor: string;
}

interface TokenResponse {
  token: TokenInfo;
  tiers: TierInfo[];
  wallet?: WalletInfo;
}

// ── Component ──

export function TokenDashboard() {
  const [data, setData] = useState<TokenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const agentWallet = process.env.NEXT_PUBLIC_EVM_ADDRESS || "0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/token?wallet=${agentWallet}`);
      if (!res.ok) throw new Error("Failed to fetch token data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [agentWallet]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" style={{ color: "#ffd70066" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-sm font-mono" style={{ color: "#ff2d5e88" }}>
            {error || "No data available"}
          </p>
          <button
            onClick={fetchData}
            className="mt-3 text-xs font-mono px-3 py-1 rounded"
            style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { token, tiers, wallet } = data;

  return (
    <div className="space-y-5">
      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[9px] font-mono uppercase tracking-wider transition-colors"
          style={{ color: "#4a6a8a", border: "1px solid #00f0ff10" }}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Top cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Token overview */}
        <div
          className="rounded-lg p-4"
          style={{
            background: "linear-gradient(135deg, #0d1525, #0a0f1a)",
            border: "1px solid #ffd70015",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4" style={{ color: "#ffd700" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#ffd70088" }}>
              Token
            </span>
          </div>
          <div className="text-lg font-bold font-mono" style={{ color: "#ffd700" }}>
            ${token.symbol}
          </div>
          <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            {token.name} &middot; ERC-20 &middot; Base Mainnet
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code className="text-[9px] font-mono" style={{ color: "#c8d6e5aa" }}>
              {token.address.slice(0, 6)}...{token.address.slice(-4)}
            </code>
            <button onClick={() => copyAddress(token.address)} className="shrink-0">
              {copied ? (
                <Check className="h-3 w-3" style={{ color: "#39ff14" }} />
              ) : (
                <Copy className="h-3 w-3" style={{ color: "#4a6a8a" }} />
              )}
            </button>
            <a
              href={`https://basescan.org/token/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3 w-3" style={{ color: "#4a6a8a" }} />
            </a>
          </div>
        </div>

        {/* Total Supply */}
        <div
          className="rounded-lg p-4"
          style={{
            background: "linear-gradient(135deg, #0d1525, #0a0f1a)",
            border: "1px solid #00f0ff10",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4" style={{ color: "#00f0ff66" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff44" }}>
              Total Supply
            </span>
          </div>
          <div className="text-lg font-bold font-mono" style={{ color: "#c8d6e5" }}>
            {token.totalSupply.toLocaleString()}
          </div>
          <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            {token.symbol} &middot; Fixed supply &middot; No inflation
          </div>
        </div>

        {/* Agent Balance + Tier */}
        <div
          className="rounded-lg p-4"
          style={{
            background: "linear-gradient(135deg, #0d1525, #0a0f1a)",
            border: `1px solid ${wallet ? wallet.tierColor + "30" : "#00f0ff10"}`,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Gem className="h-4 w-4" style={{ color: wallet?.tierColor || "#4a6a8a" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
              Agent Wallet
            </span>
          </div>
          {wallet ? (
            <>
              <div className="text-lg font-bold font-mono" style={{ color: wallet.tierColor }}>
                {wallet.balance.toLocaleString()} {token.symbol}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="text-[9px] font-mono font-bold px-2 py-0.5 rounded"
                  style={{
                    color: wallet.tierColor,
                    background: wallet.tierColor + "15",
                    border: `1px solid ${wallet.tierColor}30`,
                  }}
                >
                  {wallet.tier}
                </span>
                <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
                  {wallet.discount} discount &middot; {wallet.dailyLimit}/day
                </span>
              </div>
            </>
          ) : (
            <div className="text-sm font-mono" style={{ color: "#4a6a8a" }}>
              No wallet connected
            </div>
          )}
        </div>
      </div>

      {/* Tier Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0d1525, #0a0f1a)",
          border: "1px solid #00f0ff10",
        }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: "#00f0ff08" }}>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" style={{ color: "#00f0ff44" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff44" }}>
              Tier Benefits
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #00f0ff08" }}>
                <th className="px-4 py-2 text-left text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Tier
                </th>
                <th className="px-4 py-2 text-left text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Min Balance
                </th>
                <th className="px-4 py-2 text-left text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Discount
                </th>
                <th className="px-4 py-2 text-left text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Daily Limit
                </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => {
                const isActive = wallet?.tier === tier.name;
                return (
                  <tr
                    key={tier.name}
                    style={{
                      borderBottom: "1px solid #00f0ff06",
                      background: isActive ? tier.color + "08" : "transparent",
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            background: tier.color,
                            boxShadow: isActive ? `0 0 6px ${tier.color}` : "none",
                          }}
                        />
                        <span
                          className="text-xs font-mono font-bold"
                          style={{ color: tier.color }}
                        >
                          {tier.name}
                        </span>
                        {isActive && (
                          <span
                            className="text-[7px] font-mono uppercase px-1 py-0.5 rounded"
                            style={{
                              color: tier.color,
                              background: tier.color + "20",
                            }}
                          >
                            CURRENT
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#c8d6e5aa" }}>
                      {tier.minBalance === 0
                        ? "--"
                        : `${tier.minBalance.toLocaleString()} XMETAV`}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#c8d6e5aa" }}>
                      {tier.discount}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#c8d6e5aa" }}>
                      {tier.dailyLimit}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Holder Benefits */}
      <div
        className="rounded-lg p-4"
        style={{
          background: "linear-gradient(135deg, #0d1525, #0a0f1a)",
          border: "1px solid #00f0ff10",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4" style={{ color: "#ffd70066" }} />
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#ffd70066" }}>
            Holder Benefits
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: "x402 Endpoint Discounts", desc: "Up to 75% off all payment-gated agent, intent, swarm, trade, and voice endpoints" },
            { title: "Higher Daily Limits", desc: "Diamond holders can spend up to $5,000/day vs $5 for non-holders" },
            { title: "Priority Processing", desc: "Higher-tier requests are prioritized in the agent queue" },
            { title: "On-Chain Identity", desc: "Token linked to ERC-8004 agent identity on Base Mainnet" },
          ].map((benefit) => (
            <div
              key={benefit.title}
              className="p-3 rounded"
              style={{ background: "#00f0ff04", border: "1px solid #00f0ff08" }}
            >
              <div className="text-[10px] font-mono font-bold" style={{ color: "#c8d6e5cc" }}>
                {benefit.title}
              </div>
              <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
                {benefit.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
