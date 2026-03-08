"use client";

import { CrossChainPanel } from "@/components/CrossChainPanel";
import { KaminoPanel } from "@/components/KaminoPanel";
import { ArrowLeftRight, Globe, Vault, Zap } from "lucide-react";

export default function TradingPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono tracking-wider neon-glow" style={{ color: "#a855f7" }}>
              TRADING / DEFI
            </h1>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ color: "#39ff14", background: "#39ff1408", border: "1px solid #39ff1420" }}>
              LIVE
            </span>
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            // cross-chain swaps · Jupiter Ultra · Kamino vaults · Base ↔ Solana
          </p>
        </div>
      </div>

      {/* Feature Tags */}
      <div className="flex flex-wrap gap-2">
        {[
          { icon: ArrowLeftRight, label: "Base ↔ Solana Bridge (CCTP)", color: "#a855f7" },
          { icon: Zap, label: "Jupiter Ultra Swaps", color: "#00f0ff" },
          { icon: Vault, label: "Kamino Yield Vaults", color: "#10b981" },
          { icon: Globe, label: "Multi-Chain", color: "#f59e0b" },
        ].map(({ icon: Icon, label, color }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono"
            style={{ color, background: `${color}08`, border: `1px solid ${color}20` }}
          >
            <Icon className="h-3 w-3" />
            {label}
          </div>
        ))}
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Cross-Chain */}
        <div>
          <CrossChainPanel />
        </div>

        {/* Right: Kamino Vaults */}
        <div>
          <KaminoPanel />
        </div>
      </div>

      {/* Endpoint Reference */}
      <div className="cyber-card rounded-lg p-5">
        <h3 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: "#00f0ff88" }}>
          API Endpoints
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            { method: "POST", path: "/cross-chain-swap", price: "$0.65", desc: "Execute cross-chain swap" },
            { method: "POST", path: "/cross-chain-swap/quote", price: "Free", desc: "Get swap estimate" },
            { method: "GET", path: "/bridge-status/:jobId", price: "$0.05", desc: "Check job progress" },
            { method: "POST", path: "/trigger-return/:jobId", price: "$0.25", desc: "Bridge back to Base" },
            { method: "POST", path: "/kamino/deposit", price: "$0.15", desc: "Deposit to Kamino vault" },
            { method: "POST", path: "/kamino/withdraw", price: "$0.15", desc: "Withdraw from vault" },
            { method: "GET", path: "/cross-chain/queue", price: "Free", desc: "Batch queue stats" },
            { method: "GET", path: "/cross-chain/vaults", price: "Free", desc: "Available Kamino vaults" },
          ].map(({ method, path, price, desc }) => (
            <div key={path} className="flex items-center justify-between p-2 rounded" style={{ background: "#060c18" }}>
              <div className="flex items-center gap-2">
                <span
                  className="text-[8px] font-mono font-bold px-1 py-0.5 rounded"
                  style={{
                    color: method === "GET" ? "#10b981" : "#a855f7",
                    background: method === "GET" ? "#10b98110" : "#a855f710",
                  }}
                >
                  {method}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "#e0e8f0" }}>{path}</span>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono font-bold" style={{ color: price === "Free" ? "#39ff14" : "#f59e0b" }}>
                  {price}
                </div>
                <div className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
