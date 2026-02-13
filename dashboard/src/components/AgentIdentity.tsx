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
} from "lucide-react";

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
  registration: {
    name?: string;
    description?: string;
    services?: { type: string; url: string; description: string }[];
    capabilities?: string[];
    supportedTrust?: string[];
  } | null;
  x402: {
    totalSpend: string;
    todaySpend: string;
    paymentCount: number;
    currency: string;
    network: string;
    budgetLimit: string;
  } | null;
}

// XmetaV main agent — registered on Base mainnet
const DEFAULT_AGENT_ID = "16905";

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
        console.error("Failed to fetch identity:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [agentId]
  );

  useEffect(() => {
    fetchIdentity();
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
        {/* Agent ID Lookup — keep visible even on error */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              Agent ID
            </span>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="flex-1 bg-transparent border rounded px-3 py-1.5 text-sm font-mono outline-none"
              style={{ borderColor: "#00f0ff20", color: "#e0e8f0" }}
              placeholder="Enter agentId (token ID)"
            />
            <button
              onClick={() => fetchIdentity(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded transition-colors"
              style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Lookup
            </button>
          </div>
        </div>
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
  const isRegistered = identity?.registered ?? false;

  return (
    <div className="space-y-6">
      {/* Agent ID Lookup */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
            Agent ID
          </span>
          <input
            type="text"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="flex-1 bg-transparent border rounded px-3 py-1.5 text-sm font-mono outline-none"
            style={{ borderColor: "#00f0ff20", color: "#e0e8f0" }}
            placeholder="Enter agentId (token ID)"
          />
          <button
            onClick={() => fetchIdentity(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded transition-colors"
            style={{ color: "#00f0ff88", border: "1px solid #00f0ff20" }}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Lookup
          </button>
        </div>
      </div>

      {/* Identity Card */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: "#0a1020", borderColor: isRegistered ? "#00f0ff25" : "#ff2d5e20" }}
      >
        {/* Header */}
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
                <Hexagon
                  className="h-7 w-7"
                  style={{ color: isRegistered ? "#00f0ff" : "#ff2d5e" }}
                />
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
                </div>
              </div>
            </div>
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

        {/* Details Grid */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Agent ID */}
          <DetailRow
            label="Agent ID (Token ID)"
            value={identity?.agentId ?? "—"}
            icon={<Fingerprint className="h-3.5 w-3.5" />}
            onCopy={identity?.agentId ? () => copyToClipboard(identity.agentId, "agentId") : undefined}
            copied={copied === "agentId"}
          />

          {/* Owner */}
          <DetailRow
            label="Owner"
            value={identity?.owner ? truncateAddress(identity.owner) : "—"}
            icon={<Hexagon className="h-3.5 w-3.5" />}
            onCopy={identity?.owner ? () => copyToClipboard(identity.owner!, "owner") : undefined}
            copied={copied === "owner"}
            href={identity?.owner ? `https://basescan.org/address/${identity.owner}` : undefined}
          />

          {/* Agent Wallet */}
          <DetailRow
            label="Agent Wallet"
            value={identity?.agentWallet ? truncateAddress(identity.agentWallet) : "—"}
            icon={<Hexagon className="h-3.5 w-3.5" />}
            onCopy={
              identity?.agentWallet
                ? () => copyToClipboard(identity.agentWallet!, "wallet")
                : undefined
            }
            copied={copied === "wallet"}
            href={
              identity?.agentWallet
                ? `https://basescan.org/address/${identity.agentWallet}`
                : undefined
            }
          />

          {/* Network */}
          <DetailRow
            label="Network"
            value="Base Mainnet (8453)"
            icon={<Globe className="h-3.5 w-3.5" />}
          />

          {/* Registry */}
          <DetailRow
            label="Identity Registry"
            value={truncateAddress(identity?.registryAddress || "")}
            icon={<Link2 className="h-3.5 w-3.5" />}
            onCopy={() => copyToClipboard(identity?.registryAddress || "", "registry")}
            copied={copied === "registry"}
            href={`https://basescan.org/address/${identity?.registryAddress}`}
          />

          {/* Token URI */}
          <DetailRow
            label="Token URI"
            value={identity?.tokenURI || "—"}
            icon={<Link2 className="h-3.5 w-3.5" />}
            truncateVal
          />
        </div>
      </div>

      {/* Agent Wallet & x402 Payments */}
      {isRegistered && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div
            className="p-4 border-b flex items-center gap-2"
            style={{ borderColor: "#00f0ff10" }}
          >
            <Wallet className="h-4 w-4" style={{ color: "#00f0ff66" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00f0ff66" }}>
              Agent Wallet & x402 Payments
            </span>
          </div>

          {/* Wallet Address Row */}
          <div className="p-4 border-b" style={{ borderColor: "#00f0ff08" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center"
                  style={{ background: "#00f0ff08", border: "1px solid #00f0ff15" }}
                >
                  <Hexagon className="h-5 w-5" style={{ color: "#00f0ff" }} />
                </div>
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                    Wallet Address
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <a
                      href={`https://basescan.org/address/${identity?.agentWallet || identity?.owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono hover:underline"
                      style={{ color: "#00f0ff" }}
                    >
                      {identity?.agentWallet || identity?.owner || "—"}
                    </a>
                    {(identity?.agentWallet || identity?.owner) && (
                      <button
                        onClick={() => copyToClipboard(identity?.agentWallet || identity?.owner || "", "walletFull")}
                        className="shrink-0"
                      >
                        {copied === "walletFull" ? (
                          <Check className="h-3 w-3" style={{ color: "#39ff14" }} />
                        ) : (
                          <Copy className="h-3 w-3" style={{ color: "#4a6a8a" }} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-[10px] font-mono px-2 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ color: "#39ff14", background: "#39ff1408", border: "1px solid #39ff1415" }}
                >
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#39ff14", boxShadow: "0 0 4px #39ff14" }} />
                  Base Mainnet
                </div>
              </div>
            </div>
          </div>

          {/* XMETAV Token Balance + Tier */}
          <TokenBalanceRow wallet={data?.identity?.agentWallet || data?.identity?.owner} />

          {/* x402 Spend Stats */}
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <DollarSign className="h-3 w-3" style={{ color: "#00f0ff44" }} />
                <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Total Spend
                </span>
              </div>
              <div className="text-lg font-mono font-bold" style={{ color: "#e0e8f0" }}>
                ${x402?.totalSpend || "0.0000"}
              </div>
              <div className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>
                {x402?.currency || "USDC"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <ArrowUpRight className="h-3 w-3" style={{ color: "#00f0ff44" }} />
                <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Today
                </span>
              </div>
              <div className="text-lg font-mono font-bold" style={{ color: "#e0e8f0" }}>
                ${x402?.todaySpend || "0.0000"}
              </div>
              <div className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>
                Budget: ${x402?.budgetLimit || "1.00"}/req
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Activity className="h-3 w-3" style={{ color: "#00f0ff44" }} />
                <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Transactions
                </span>
              </div>
              <div className="text-lg font-mono font-bold" style={{ color: "#e0e8f0" }}>
                {x402?.paymentCount || 0}
              </div>
              <div className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>
                x402 payments
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Globe className="h-3 w-3" style={{ color: "#00f0ff44" }} />
                <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                  Protocol
                </span>
              </div>
              <div className="text-sm font-mono font-bold" style={{ color: "#e0e8f0" }}>
                x402
              </div>
              <div className="text-[9px] font-mono" style={{ color: "#4a6a8a66" }}>
                USDC on Base
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {registration?.description && (
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#00f0ff66" }}>
            Description
          </div>
          <p className="text-xs font-mono leading-relaxed" style={{ color: "#b0c0d0" }}>
            {registration.description}
          </p>
        </div>
      )}

      {/* Capabilities + Services */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Capabilities */}
        {registration?.capabilities && registration.capabilities.length > 0 && (
          <div
            className="rounded-lg border p-4"
            style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
          >
            <div className="text-[9px] font-mono uppercase tracking-wider mb-3" style={{ color: "#00f0ff66" }}>
              Capabilities
            </div>
            <div className="flex flex-wrap gap-1.5">
              {registration.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{ color: "#00f0ff88", background: "#00f0ff08", border: "1px solid #00f0ff15" }}
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Trust Model */}
        {registration?.supportedTrust && registration.supportedTrust.length > 0 && (
          <div
            className="rounded-lg border p-4"
            style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
          >
            <div className="text-[9px] font-mono uppercase tracking-wider mb-3" style={{ color: "#00f0ff66" }}>
              Trust Model
            </div>
            <div className="flex flex-wrap gap-1.5">
              {registration.supportedTrust.map((trust) => (
                <span
                  key={trust}
                  className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{ color: "#f59e0b", background: "#f59e0b08", border: "1px solid #f59e0b15" }}
                >
                  <Star className="h-2.5 w-2.5" />
                  {trust}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Services */}
      {registration?.services && registration.services.length > 0 && (
        <div
          className="rounded-lg border p-4"
          style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
        >
          <div className="text-[9px] font-mono uppercase tracking-wider mb-3" style={{ color: "#00f0ff66" }}>
            Advertised Services
          </div>
          <div className="space-y-2">
            {registration.services.map((svc, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded"
                style={{ background: "#0a1020", border: "1px solid #00f0ff10" }}
              >
                <div>
                  <span className="text-xs font-mono font-bold" style={{ color: "#e0e8f0" }}>
                    {svc.type}
                  </span>
                  <span className="text-[10px] font-mono ml-2" style={{ color: "#4a6a8a" }}>
                    {svc.description}
                  </span>
                </div>
                <span className="text-[10px] font-mono" style={{ color: "#00f0ff66" }}>
                  {svc.url}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contract Addresses */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "#0a1020", borderColor: "#00f0ff15" }}
      >
        <div className="text-[9px] font-mono uppercase tracking-wider mb-3" style={{ color: "#00f0ff66" }}>
          ERC-8004 Contracts (Base Mainnet)
        </div>
        <div className="space-y-2">
          <ContractRow
            label="IdentityRegistry"
            address="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
            onCopy={() =>
              copyToClipboard("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "irAddr")
            }
            copied={copied === "irAddr"}
          />
          <ContractRow
            label="ReputationRegistry"
            address="0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
            onCopy={() =>
              copyToClipboard("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63", "rrAddr")
            }
            copied={copied === "rrAddr"}
          />
        </div>
      </div>
    </div>
  );
});

// ---- Sub-components ----

function DetailRow({
  label,
  value,
  icon,
  onCopy,
  copied,
  href,
  truncateVal,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  onCopy?: () => void;
  copied?: boolean;
  href?: string;
  truncateVal?: boolean;
}) {
  const displayValue = truncateVal && value.length > 40 ? value.slice(0, 38) + "..." : value;
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5" style={{ color: "#00f0ff44" }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
          {label}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono hover:underline"
              style={{ color: "#00f0ff88" }}
            >
              {displayValue}
            </a>
          ) : (
            <span className="text-xs font-mono" style={{ color: "#e0e8f0" }}>
              {displayValue}
            </span>
          )}
          {onCopy && (
            <button onClick={onCopy} className="shrink-0">
              {copied ? (
                <Check className="h-3 w-3" style={{ color: "#39ff14" }} />
              ) : (
                <Copy className="h-3 w-3" style={{ color: "#4a6a8a" }} />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractRow({
  label,
  address,
  onCopy,
  copied,
}: {
  label: string;
  address: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded" style={{ background: "#06091280" }}>
      <div>
        <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <a
            href={`https://basescan.org/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono hover:underline"
            style={{ color: "#00f0ff88" }}
          >
            {address}
          </a>
          <button onClick={onCopy} className="shrink-0">
            {copied ? (
              <Check className="h-3 w-3" style={{ color: "#39ff14" }} />
            ) : (
              <Copy className="h-3 w-3" style={{ color: "#4a6a8a" }} />
            )}
          </button>
          <a
            href={`https://basescan.org/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3 w-3" style={{ color: "#4a6a8a" }} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ---- Token Balance Row ----

function TokenBalanceRow({ wallet }: { wallet?: string | null }) {
  const [tokenData, setTokenData] = useState<{
    balance: number;
    tier: string;
    discount: string;
    tierColor: string;
  } | null>(null);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    setTokenError(false);
    fetch(`/api/token?wallet=${wallet}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.wallet) {
          setTokenData({
            balance: d.wallet.balance,
            tier: d.wallet.tier,
            discount: d.wallet.discount,
            tierColor: d.wallet.tierColor,
          });
        }
      })
      .catch(() => setTokenError(true));
  }, [wallet]);

  if (!tokenData && !tokenError) return null;

  if (tokenError) {
    return (
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "#00f0ff08" }}>
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#ffd70066" }}>
          $XMETAV
        </span>
        <span className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
          Token data unavailable — RPC may be down
        </span>
      </div>
    );
  }

  if (!tokenData) return null;

  return (
    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#00f0ff08" }}>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#ffd70066" }}>
          $XMETAV
        </span>
        <span className="text-sm font-mono font-bold" style={{ color: "#c8d6e5" }}>
          {tokenData.balance.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: tokenData.tierColor,
            background: tokenData.tierColor + "15",
            border: `1px solid ${tokenData.tierColor}30`,
          }}
        >
          {tokenData.tier}
        </span>
        <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
          {tokenData.discount} off
        </span>
      </div>
    </div>
  );
}

// ---- Helpers ----

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
