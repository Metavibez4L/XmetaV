"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Fingerprint,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Hexagon,
  Globe,
  Star,
  Link2,
  Wallet,
  DollarSign,
  ArrowUpRight,
  Activity,
  Users,
  Brain,
  Gem,
  Shield,
  Zap,
  Moon,
  Anchor,
  Sparkles,
  Award,
  Coins,
  Github,
} from "lucide-react";

// ---- Types ----

interface FleetAgent {
  id: string;
  role: string;
  room: string;
  skills?: string[];
}

interface FleetData {
  agents: FleetAgent[];
  model: string;
  meetingCapacity?: number;
  rooms: string[];
}

interface ContractData {
  address: string;
  symbol?: string;
  standard: string;
  network?: string;
}

interface X402Pricing {
  [endpoint: string]: string;
}

interface X402Support {
  enabled: boolean;
  network: string;
  payTo: string;
  denomination: string;
  pricing: X402Pricing;
  tokenDiscounts?: {
    token: string;
    address: string;
    tiers: Record<string, { minBalance: number; discount: string }>;
  };
}

interface ReputationData {
  count: number;
  summaryValue: number;
  decimals: number;
  displayScore: string;
}

interface SoulStats {
  totalMemories: number;
  totalAssociations: number;
  totalAnchors: number;
  onChainAnchors: number;
  anchorsSynced: boolean;
  recentDreams: { category: string; confidence: number; created_at: string }[];
  dreamCount: number;
}

interface CrystalStats {
  totalCrystals: number;
  totalXP: number;
  equippedCount: number;
  legendaryCount: number;
  avgStars: string;
}

interface IdentityData {
  identity: {
    agentId: string;
    name: string;
    owner: string | null;
    agentWallet: string | null;
    tokenURI: string | null;
    registered: boolean;
    network: string;
    registryAddress: string;
    reputationAddress: string;
    basescanUrl: string | null;
  };
  reputation: ReputationData | null;
  registration: {
    name?: string;
    description?: string;
    services?: { type: string; url: string; description?: string }[];
    capabilities?: string[];
    supportedTrust?: string[];
    fleet?: FleetData;
    contracts?: Record<string, ContractData>;
    wallet?: { address: string; network: string; supports: string[] };
    x402Support?: X402Support;
    external_url?: string;
  } | null;
  x402: {
    totalSpend: string;
    todaySpend: string;
    paymentCount: number;
    currency: string;
    network: string;
    budgetLimit: string;
  } | null;
  soul: SoulStats | null;
  crystals: CrystalStats | null;
}

// ---- Constants ----

const DEFAULT_AGENT_ID = "16905";

const AGENT_COLORS: Record<string, string> = {
  main: "#00f0ff",
  sentinel: "#ef4444",
  soul: "#ff006e",
  briefing: "#38bdf8",
  oracle: "#a855f7",
  alchemist: "#f59e0b",
  web3dev: "#f97316",
  basedintern: "#39ff14",
  akua: "#06b6d4",
};

const ROOM_ICONS: Record<string, string> = {
  command: "⚡",
  meeting: "🤝",
  intel: "🔍",
  web3Lab: "🔬",
  devFloor: "💻",
  soul: "🧠",
};

// ---- Main Component ----

export const AgentIdentity = React.memo(function AgentIdentity() {
  const [data, setData] = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchIdentity = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      setError(null);
      try {
        const res = await fetch(`/api/erc8004/identity?agentId=${agentId}`);
        if (res.ok) {
          setData(await res.json());
        } else {
          setError(`Identity lookup failed (HTTP ${res.status})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to fetch identity: ${msg}`);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [agentId]
  );

  useEffect(() => {
    fetchIdentity();
    // Auto-refresh every 30s to keep anchor counts in sync
    const iv = setInterval(() => fetchIdentity(false), 30_000);
    return () => clearInterval(iv);
  }, [fetchIdentity]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00f0ff" }} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <AgentIdLookup agentId={agentId} setAgentId={setAgentId} onLookup={() => fetchIdentity(true)} refreshing={refreshing} />
        <div className="rounded-lg border p-6 text-center" style={{ background: "#0a1020", borderColor: "#ff2d5e20" }}>
          <Fingerprint className="h-8 w-8 mx-auto mb-3" style={{ color: "#ff2d5e44" }} />
          <div className="text-sm font-mono" style={{ color: "#ff2d5e" }}>{error}</div>
          <div className="text-[10px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            Identity data is read from on-chain contracts — MetaMask is not required
          </div>
          <button
            onClick={() => fetchIdentity(true)}
            className="mt-3 text-[10px] font-mono px-3 py-1.5 rounded transition-colors"
            style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const identity = data?.identity;
  const registration = data?.registration;
  const x402 = data?.x402;
  const reputation = data?.reputation;
  const soul = data?.soul;
  const crystals = data?.crystals;
  const isRegistered = identity?.registered ?? false;
  const fleet = registration?.fleet;
  const contracts = registration?.contracts;
  const walletSupports = registration?.wallet?.supports;
  const x402Support = registration?.x402Support;

  return (
    <div className="space-y-4">
      {/* Agent ID Lookup */}
      <AgentIdLookup agentId={agentId} setAgentId={setAgentId} onLookup={() => fetchIdentity(true)} refreshing={refreshing} />

      {/* Identity Card */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: "#0a1020", borderColor: isRegistered ? "#00f0ff25" : "#ff2d5e20" }}
      >
        <div
          className="p-5 border-b"
          style={{
            borderColor: "#00f0ff10",
            background: isRegistered
              ? "linear-gradient(135deg, #00f0ff08, #0a102080)"
              : "linear-gradient(135deg, #ff2d5e08, #0a102080)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="h-14 w-14 rounded-lg flex items-center justify-center"
                style={{
                  background: isRegistered ? "#00f0ff10" : "#ff2d5e10",
                  border: `1px solid ${isRegistered ? "#00f0ff25" : "#ff2d5e25"}`,
                }}
              >
                <Hexagon className="h-7 w-7" style={{ color: isRegistered ? "#00f0ff" : "#ff2d5e" }} />
              </div>
              <div>
                <h2 className="text-lg font-mono font-bold" style={{ color: "#e0e8f0" }}>
                  {registration?.name || identity?.name || "XmetaV"}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded"
                    style={{
                      color: isRegistered ? "#39ff14" : "#ff2d5e",
                      background: isRegistered ? "#39ff1410" : "#ff2d5e10",
                      border: `1px solid ${isRegistered ? "#39ff1425" : "#ff2d5e25"}`,
                    }}
                  >
                    {isRegistered ? "REGISTERED" : "NOT REGISTERED"}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                    ERC-8004 on Base
                  </span>
                  {reputation && reputation.count > 0 && (
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1"
                      style={{ color: "#ffd700", background: "#ffd70010", border: "1px solid #ffd70025" }}
                    >
                      <Star className="h-2.5 w-2.5" />
                      Rep: {reputation.displayScore}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {registration?.external_url && (
                <a
                  href={registration.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors hover:bg-[#00f0ff10]"
                  style={{ color: "#4a6a8a", border: "1px solid #00f0ff15" }}
                >
                  <Github className="h-2.5 w-2.5" />
                  GitHub
                </a>
              )}
              {identity?.basescanUrl && (
                <a
                  href={identity.basescanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors hover:bg-[#00f0ff10]"
                  style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}
                >
                  BaseScan
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailRow label="Agent ID (Token ID)" value={identity?.agentId ?? "—"} icon={<Fingerprint className="h-3.5 w-3.5" />}
            onCopy={identity?.agentId ? () => copyToClipboard(identity.agentId, "agentId") : undefined} copied={copied === "agentId"} />
          <DetailRow label="Owner" value={identity?.owner ? truncateAddress(identity.owner) : "—"} icon={<Hexagon className="h-3.5 w-3.5" />}
            onCopy={identity?.owner ? () => copyToClipboard(identity.owner!, "owner") : undefined} copied={copied === "owner"}
            href={identity?.owner ? `https://basescan.org/address/${identity.owner}` : undefined} />
          <DetailRow label="Agent Wallet" value={identity?.agentWallet ? truncateAddress(identity.agentWallet) : "—"} icon={<Wallet className="h-3.5 w-3.5" />}
            onCopy={identity?.agentWallet ? () => copyToClipboard(identity.agentWallet!, "wallet") : undefined} copied={copied === "wallet"}
            href={identity?.agentWallet ? `https://basescan.org/address/${identity.agentWallet}` : undefined} />
          <DetailRow label="Network" value="Base Mainnet (8453)" icon={<Globe className="h-3.5 w-3.5" />} />
          <DetailRow label="Identity Registry" value={truncateAddress(identity?.registryAddress || "")} icon={<Link2 className="h-3.5 w-3.5" />}
            onCopy={() => copyToClipboard(identity?.registryAddress || "", "registry")} copied={copied === "registry"}
            href={`https://basescan.org/address/${identity?.registryAddress}`} />
          <DetailRow label="Token URI" value={identity?.tokenURI || "—"} icon={<Link2 className="h-3.5 w-3.5" />} truncateVal />
        </div>
      </div>

      {/* ---- Soul & Crystal Core Stats ---- */}
      {(soul || crystals || reputation) && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {soul && (
            <>
              <StatCard icon={<Brain className="h-4 w-4" />} label="Memories" value={soul.totalMemories} color="#ff006e" />
              <StatCard icon={<Zap className="h-4 w-4" />} label="Associations" value={soul.totalAssociations} color="#a855f7" />
              <StatCard icon={<Anchor className="h-4 w-4" />} label="On-Chain Anchors" value={soul.onChainAnchors || soul.totalAnchors} color="#00f0ff"
                sub={soul.anchorsSynced ? "synced" : `db: ${soul.totalAnchors}`}
                subColor={soul.anchorsSynced ? "#39ff14" : "#f59e0b"} />
              <StatCard icon={<Moon className="h-4 w-4" />} label="Dream Insights" value={soul.dreamCount} color="#38bdf8" />
            </>
          )}
          {crystals && (
            <>
              <StatCard icon={<Gem className="h-4 w-4" />} label="Crystals" value={crystals.totalCrystals} color="#ffd700" sub={`${crystals.equippedCount} equipped`} />
              <StatCard icon={<Sparkles className="h-4 w-4" />} label="Crystal XP" value={crystals.totalXP.toLocaleString()} color="#39ff14" sub={`★${crystals.avgStars} avg`} />
            </>
          )}
          {reputation && (
            <StatCard icon={<Award className="h-4 w-4" />} label="Reputation" value={reputation.displayScore} color="#ffd700" sub={`${reputation.count} ratings`} />
          )}
          {crystals && crystals.legendaryCount > 0 && (
            <StatCard icon={<Star className="h-4 w-4" />} label="Legendary" value={crystals.legendaryCount} color="#ff006e" />
          )}
        </div>
      )}

      {/* ---- Agent Wallet & x402 Payments ---- */}
      {isRegistered && (
        <div className="rounded-lg border overflow-hidden" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
          <SectionHeader icon={<Wallet className="h-4 w-4" />} label="Agent Wallet & x402 Payments" />

          {/* Wallet Address Row */}
          <div className="p-4 border-b" style={{ borderColor: "#00f0ff08" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "#00f0ff08", border: "1px solid #00f0ff15" }}>
                  <Hexagon className="h-5 w-5" style={{ color: "#00f0ff" }} />
                </div>
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>Wallet Address</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <a href={`https://basescan.org/address/${identity?.agentWallet || identity?.owner}`}
                      target="_blank" rel="noopener noreferrer" className="text-sm font-mono hover:underline" style={{ color: "#00f0ff" }}>
                      {identity?.agentWallet || identity?.owner || "—"}
                    </a>
                    {(identity?.agentWallet || identity?.owner) && (
                      <button onClick={() => copyToClipboard(identity?.agentWallet || identity?.owner || "", "walletFull")} className="shrink-0">
                        {copied === "walletFull" ? <Check className="h-3 w-3" style={{ color: "#39ff14" }} /> : <Copy className="h-3 w-3" style={{ color: "#4a6a8a" }} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono px-2 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ color: "#39ff14", background: "#39ff1408", border: "1px solid #39ff1415" }}>
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#39ff14", boxShadow: "0 0 4px #39ff14" }} />
                  Base Mainnet
                </div>
              </div>
            </div>
          </div>

          {/* $XMETAV Token Balance + Tier */}
          <TokenBalanceRow wallet={data?.identity?.agentWallet || data?.identity?.owner} />

          {/* Wallet Supported Tokens */}
          {walletSupports && walletSupports.length > 0 && (
            <div className="px-4 py-3 border-b" style={{ borderColor: "#00f0ff08" }}>
              <div className="flex items-center gap-2 mb-2">
                <Coins className="h-3 w-3" style={{ color: "#ffd70044" }} />
                <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>Supported Tokens</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {walletSupports.map((token) => (
                  <span key={token} className="text-[10px] font-mono px-2 py-0.5 rounded"
                    style={{ color: token === "$XMETAV" ? "#ffd700" : "#e0e8f0", background: token === "$XMETAV" ? "#ffd70010" : "#ffffff08", border: `1px solid ${token === "$XMETAV" ? "#ffd70020" : "#ffffff10"}` }}>
                    {token}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* x402 Spend Stats */}
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <SpendStat icon={<DollarSign className="h-3 w-3" />} label="Total Spend" value={`$${x402?.totalSpend || "0.0000"}`} sub={x402?.currency || "USDC"} />
            <SpendStat icon={<ArrowUpRight className="h-3 w-3" />} label="Today" value={`$${x402?.todaySpend || "0.0000"}`} sub={`Budget: $${x402?.budgetLimit || "1.00"}/req`} />
            <SpendStat icon={<Activity className="h-3 w-3" />} label="Transactions" value={String(x402?.paymentCount || 0)} sub="x402 payments" />
            <SpendStat icon={<Globe className="h-3 w-3" />} label="Protocol" value="x402" sub="USDC on Base" smallValue />
          </div>
        </div>
      )}

      {/* ---- x402 Pricing Table ---- */}
      {x402Support?.pricing && (
        <div className="rounded-lg border overflow-hidden" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
          <SectionHeader icon={<DollarSign className="h-4 w-4" />} label="x402 Endpoint Pricing" />
          <div className="p-4 space-y-1.5">
            {Object.entries(x402Support.pricing).map(([endpoint, price]) => {
              const parts = endpoint.split(" ");
              const method = parts[0];
              const path = parts.slice(1).join(" ");
              return (
                <div key={endpoint} className="flex items-center justify-between p-2.5 rounded" style={{ background: "#06091280" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{
                      color: method === "POST" ? "#f59e0b" : "#39ff14",
                      background: method === "POST" ? "#f59e0b10" : "#39ff1410",
                    }}>{method}</span>
                    <span className="text-xs font-mono" style={{ color: "#e0e8f0" }}>{path}</span>
                  </div>
                  <span className="text-xs font-mono font-bold" style={{ color: "#00f0ff" }}>{price}</span>
                </div>
              );
            })}
          </div>
          {/* Token Discount Tiers */}
          {x402Support.tokenDiscounts?.tiers && (
            <div className="px-4 pb-4">
              <div className="text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#ffd70066" }}>
                $XMETAV Holder Discounts
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(x402Support.tokenDiscounts.tiers).map(([tier, info]) => {
                  const tierColors: Record<string, string> = { Bronze: "#cd7f32", Silver: "#c0c0c0", Gold: "#ffd700", Diamond: "#b9f2ff" };
                  const color = tierColors[tier] || "#4a6a8a";
                  return (
                    <div key={tier} className="p-2 rounded text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                      <div className="text-[10px] font-mono font-bold" style={{ color }}>{tier}</div>
                      <div className="text-lg font-mono font-bold" style={{ color }}>{info.discount}</div>
                      <div className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>≥{info.minBalance.toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Soul Engine Status ---- */}
      {soul && (
        <div className="rounded-lg border overflow-hidden" style={{ background: "#0a1020", borderColor: "#ff006e20" }}>
          <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: "#ff006e10", background: "linear-gradient(90deg, #ff006e08, transparent)" }}>
            <Brain className="h-4 w-4" style={{ color: "#ff006e" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: "#ff006e" }}>Soul Engine Status</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-auto" style={{ color: "#39ff14", background: "#39ff1408", border: "1px solid #39ff1415" }}>ACTIVE</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <SoulMetric label="Persistent Memories" value={soul.totalMemories} color="#ff006e" />
              <SoulMetric label="Association Graph" value={soul.totalAssociations} color="#a855f7" sub="edges" />
              <SoulMetric label="On-Chain Anchors" value={soul.onChainAnchors || soul.totalAnchors} color="#00f0ff" sub={soul.anchorsSynced ? "synced ✓" : `db: ${soul.totalAnchors} (${soul.anchorsSynced ? "" : "out of sync"})`} />
              <SoulMetric label="Dream Insights" value={soul.dreamCount} color="#38bdf8" />
            </div>
            {/* Recent Dream Insights */}
            {soul.recentDreams.length > 0 && (
              <div>
                <div className="text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#38bdf866" }}>Recent Dream Insights</div>
                <div className="space-y-1">
                  {soul.recentDreams.map((d, i) => {
                    const catColors: Record<string, string> = { pattern: "#39ff14", recommendation: "#f59e0b", summary: "#00f0ff", correction: "#ff2d5e" };
                    return (
                      <div key={i} className="flex items-center justify-between p-2 rounded" style={{ background: "#06091280" }}>
                        <div className="flex items-center gap-2">
                          <Moon className="h-3 w-3" style={{ color: catColors[d.category] || "#4a6a8a" }} />
                          <span className="text-[10px] font-mono font-bold" style={{ color: catColors[d.category] || "#4a6a8a" }}>{d.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>{(d.confidence * 100).toFixed(0)}% conf</span>
                          <span className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>
                            {new Date(d.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Soul Capabilities */}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "#ff006e10" }}>
              <div className="text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#ff006e44" }}>Soul Capabilities</div>
              <div className="flex flex-wrap gap-1.5">
                {["Context Curation", "Association Building", "Dream Consolidation", "Memory Retrieval Learning", "Context Packet Injection", "Keyword Scoring", "Recency Weighting", "Cluster Analysis"].map((cap) => (
                  <span key={cap} className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ color: "#ff006e88", background: "#ff006e08", border: "1px solid #ff006e15" }}>
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Crystal System Summary ---- */}
      {crystals && crystals.totalCrystals > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ background: "#0a1020", borderColor: "#ffd70020" }}>
          <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: "#ffd70010", background: "linear-gradient(90deg, #ffd70008, transparent)" }}>
            <Gem className="h-4 w-4" style={{ color: "#ffd700" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: "#ffd700" }}>Memory Crystal System</span>
            <span className="text-[9px] font-mono ml-auto" style={{ color: "#4a6a8a" }}>Materia Engine</span>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <SoulMetric label="Total Crystals" value={crystals.totalCrystals} color="#ffd700" />
            <SoulMetric label="Total XP" value={crystals.totalXP.toLocaleString()} color="#39ff14" />
            <SoulMetric label="Avg Stars" value={`★${crystals.avgStars}`} color="#f59e0b" />
            <SoulMetric label="Equipped" value={crystals.equippedCount} color="#00f0ff" />
            <SoulMetric label="Legendary" value={crystals.legendaryCount} color="#ff006e" sub="6★ Godhand" />
          </div>
        </div>
      )}

      {/* ---- Fleet Roster ---- */}
      {fleet && fleet.agents.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
          <SectionHeader icon={<Users className="h-4 w-4" />} label={`Fleet Roster (${fleet.agents.length} Agents)`} />
          <div className="p-4">
            {/* Model */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>Model:</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ color: "#00f0ff", background: "#00f0ff08", border: "1px solid #00f0ff15" }}>
                {fleet.model}
              </span>
              {fleet.meetingCapacity && (
                <>
                  <span className="text-[9px] font-mono uppercase tracking-wider ml-3" style={{ color: "#4a6a8a" }}>Meeting Capacity:</span>
                  <span className="text-[10px] font-mono" style={{ color: "#e0e8f0" }}>{fleet.meetingCapacity}</span>
                </>
              )}
            </div>
            {/* Agent Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {fleet.agents.map((agent) => {
                const color = AGENT_COLORS[agent.id] || "#4a6a8a";
                const roomIcon = ROOM_ICONS[agent.room] || "📍";
                return (
                  <div key={agent.id} className="flex items-center gap-3 p-2.5 rounded" style={{ background: `${color}06`, border: `1px solid ${color}15` }}>
                    <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                      <div className="h-3 w-3 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}60` }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold" style={{ color }}>{agent.id}</span>
                        <span className="text-[9px]">{roomIcon}</span>
                        <span className="text-[8px] font-mono px-1 rounded" style={{ color: "#4a6a8a", background: "#ffffff06" }}>{agent.room}</span>
                      </div>
                      <div className="text-[9px] font-mono truncate" style={{ color: "#4a6a8a" }}>{agent.role}</div>
                      {agent.skills && agent.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.skills.map((skill) => (
                            <span key={skill} className="text-[8px] font-mono px-1 py-px rounded" style={{ color: `${color}99`, background: `${color}08`, border: `1px solid ${color}12` }}>
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Rooms */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap" style={{ borderColor: "#00f0ff08" }}>
              <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>Rooms:</span>
              {fleet.rooms.map((room) => (
                <span key={room} className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ color: "#e0e8f0", background: "#ffffff08", border: "1px solid #ffffff10" }}>
                  {ROOM_ICONS[room] || "📍"} {room}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Description ---- */}
      {registration?.description && (
        <div className="rounded-lg border p-4" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
          <div className="text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#00f0ff66" }}>Description</div>
          <p className="text-xs font-mono leading-relaxed" style={{ color: "#b0c0d0" }}>{registration.description}</p>
        </div>
      )}

      {/* ---- Capabilities + Trust Model ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {registration?.capabilities && registration.capabilities.length > 0 && (
          <div className="rounded-lg border p-4" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-3.5 w-3.5" style={{ color: "#00f0ff44" }} />
              <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
                Capabilities ({registration.capabilities.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {registration.capabilities.map((cap) => {
                const isSoul = cap.includes("soul") || cap.includes("dream") || cap.includes("memory-association") || cap.includes("context-packet") || cap.includes("memory-retrieval");
                const isSwap = cap.includes("swap") || cap.includes("dex") || cap.includes("trading");
                const isWeb3 = cap.includes("contract") || cap.includes("solidity") || cap.includes("audit") || cap.includes("gas-optimization");
                const isSkill = cap.includes("l2-") || cap.includes("defi-") || cap.includes("frontend-") || cap.includes("ethereum-") || cap.includes("dev-tooling") || cap.includes("cross-chain") || cap.includes("security-patterns") || cap.includes("dapp-orchestration") || cap.includes("verified-contract");
                const capColor = isSoul ? "#ff006e" : isSwap ? "#39ff14" : isWeb3 ? "#f97316" : isSkill ? "#e879f9" : "#00f0ff";
                return (
                  <span key={cap} className="text-[10px] font-mono px-2 py-0.5 rounded"
                    style={{ color: `${capColor}88`, background: `${capColor}08`, border: `1px solid ${capColor}15` }}>
                    {cap}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {registration?.supportedTrust && registration.supportedTrust.length > 0 && (
          <div className="rounded-lg border p-4" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-3.5 w-3.5" style={{ color: "#f59e0b44" }} />
              <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>Trust Model</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {registration.supportedTrust.map((trust) => (
                <span key={trust} className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{ color: "#f59e0b", background: "#f59e0b08", border: "1px solid #f59e0b15" }}>
                  <Star className="h-2.5 w-2.5" />
                  {trust}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- Services ---- */}
      {registration?.services && registration.services.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
          <SectionHeader icon={<Globe className="h-4 w-4" />} label="Advertised Services" />
          <div className="p-4 space-y-2">
            {registration.services.map((svc, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded" style={{ background: "#06091280", border: "1px solid #00f0ff08" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold" style={{ color: "#e0e8f0" }}>{svc.type}</span>
                    {svc.type === "github" && <Github className="h-3 w-3" style={{ color: "#4a6a8a" }} />}
                  </div>
                  {svc.description && (
                    <div className="text-[9px] font-mono mt-0.5 truncate" style={{ color: "#4a6a8a" }}>{svc.description}</div>
                  )}
                </div>
                <a href={svc.url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-mono shrink-0 flex items-center gap-1 hover:underline" style={{ color: "#00f0ff66" }}>
                  {svc.url.replace(/^https?:\/\//, "").slice(0, 35)}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- On-Chain Contracts ---- */}
      <div className="rounded-lg border overflow-hidden" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
        <SectionHeader icon={<Link2 className="h-4 w-4" />} label="On-Chain Contracts (Base Mainnet)" />
        <div className="p-4 space-y-2">
          {contracts ? (
            Object.entries(contracts).map(([name, contract]) => (
              <ContractRow
                key={name}
                label={`${name.charAt(0).toUpperCase() + name.slice(1)} (${contract.standard})`}
                address={contract.address}
                symbol={contract.symbol}
                onCopy={() => copyToClipboard(contract.address, `contract_${name}`)}
                copied={copied === `contract_${name}`}
              />
            ))
          ) : (
            <>
              <ContractRow label="IdentityRegistry (ERC-8004)" address="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
                onCopy={() => copyToClipboard("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "irAddr")} copied={copied === "irAddr"} />
              <ContractRow label="ReputationRegistry (ERC-8004)" address="0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
                onCopy={() => copyToClipboard("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63", "rrAddr")} copied={copied === "rrAddr"} />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

// ---- Sub-components ----

function AgentIdLookup({ agentId, setAgentId, onLookup, refreshing }: {
  agentId: string; setAgentId: (v: string) => void; onLookup: () => void; refreshing: boolean;
}) {
  return (
    <div className="rounded-lg border p-4" style={{ background: "#0a1020", borderColor: "#00f0ff15" }}>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>Agent ID</span>
        <input type="text" value={agentId} onChange={(e) => setAgentId(e.target.value)}
          className="flex-1 bg-transparent border rounded px-3 py-1.5 text-sm font-mono outline-none"
          style={{ borderColor: "#00f0ff20", color: "#e0e8f0" }} placeholder="Enter agentId (token ID)" />
        <button onClick={onLookup} disabled={refreshing}
          className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded transition-colors hover:bg-[#00f0ff10]"
          style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Lookup
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: "#00f0ff10" }}>
      <div style={{ color: "#00f0ff66" }}>{icon}</div>
      <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>{label}</span>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub, subColor }: {
  icon: React.ReactNode; label: string; value: string | number; color: string; sub?: string; subColor?: string;
}) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: `${color}06`, border: `1px solid ${color}15` }}>
      <div className="flex items-center justify-center mb-1" style={{ color: `${color}66` }}>{icon}</div>
      <div className="text-lg font-mono font-bold" style={{ color }}>{value}</div>
      <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>{label}</div>
      {sub && <div className="text-[8px] font-mono mt-0.5" style={{ color: subColor || "#4a6a8a66" }}>{sub}</div>}
    </div>
  );
}

function SoulMetric({ label, value, color, sub }: {
  label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <div className="p-2.5 rounded" style={{ background: `${color}06`, border: `1px solid ${color}12` }}>
      <div className="text-xl font-mono font-bold" style={{ color }}>{value}</div>
      <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>{label}</div>
      {sub && <div className="text-[8px] font-mono" style={{ color: "#4a6a8a66" }}>{sub}</div>}
    </div>
  );
}

function SpendStat({ icon, label, value, sub, smallValue }: {
  icon: React.ReactNode; label: string; value: string; sub: string; smallValue?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <div style={{ color: "#00f0ff44" }}>{icon}</div>
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>{label}</span>
      </div>
      <div className={`font-mono font-bold ${smallValue ? "text-sm" : "text-lg"}`} style={{ color: "#e0e8f0" }}>{value}</div>
      <div className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>{sub}</div>
    </div>
  );
}

function DetailRow({ label, value, icon, onCopy, copied, href, truncateVal }: {
  label: string; value: string; icon: React.ReactNode; onCopy?: () => void; copied?: boolean; href?: string; truncateVal?: boolean;
}) {
  const displayValue = truncateVal && value.length > 40 ? value.slice(0, 38) + "..." : value;
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5" style={{ color: "#00f0ff44" }}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>{label}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-mono hover:underline" style={{ color: "#00f0ff88" }}>
              {displayValue}
            </a>
          ) : (
            <span className="text-xs font-mono" style={{ color: "#e0e8f0" }}>{displayValue}</span>
          )}
          {onCopy && (
            <button onClick={onCopy} className="shrink-0">
              {copied ? <Check className="h-3 w-3" style={{ color: "#39ff14" }} /> : <Copy className="h-3 w-3" style={{ color: "#4a6a8a" }} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractRow({ label, address, symbol, onCopy, copied }: {
  label: string; address: string; symbol?: string; onCopy: () => void; copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded" style={{ background: "#06091280" }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>{label}</span>
          {symbol && <span className="text-[9px] font-mono font-bold px-1 rounded" style={{ color: "#ffd700", background: "#ffd70010" }}>{symbol}</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono hover:underline" style={{ color: "#00f0ff88" }}>{address}</a>
          <button onClick={onCopy} className="shrink-0">
            {copied ? <Check className="h-3 w-3" style={{ color: "#39ff14" }} /> : <Copy className="h-3 w-3" style={{ color: "#4a6a8a" }} />}
          </button>
          <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" style={{ color: "#4a6a8a" }} />
          </a>
        </div>
      </div>
    </div>
  );
}

function TokenBalanceRow({ wallet }: { wallet?: string | null }) {
  const [tokenData, setTokenData] = useState<{
    balance: number; tier: string; discount: string; tierColor: string;
  } | null>(null);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    setTokenError(false);
    fetch(`/api/token?wallet=${wallet}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => {
        if (d.wallet) {
          setTokenData({ balance: d.wallet.balance, tier: d.wallet.tier, discount: d.wallet.discount, tierColor: d.wallet.tierColor });
        }
      })
      .catch(() => setTokenError(true));
  }, [wallet]);

  if (!tokenData && !tokenError) return null;

  if (tokenError) {
    return (
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "#00f0ff08" }}>
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#ffd70066" }}>$XMETAV</span>
        <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>Token data unavailable — RPC may be down</span>
      </div>
    );
  }
  if (!tokenData) return null;

  return (
    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#00f0ff08" }}>
      <div className="flex items-center gap-2">
        <Coins className="h-3.5 w-3.5" style={{ color: "#ffd700" }} />
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#ffd70066" }}>$XMETAV</span>
        <span className="text-sm font-mono font-bold" style={{ color: "#c8d6e5" }}>{tokenData.balance.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded" style={{
          color: tokenData.tierColor, background: tokenData.tierColor + "15", border: `1px solid ${tokenData.tierColor}30`,
        }}>{tokenData.tier}</span>
        <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>{tokenData.discount} off</span>
      </div>
    </div>
  );
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
