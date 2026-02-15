"use client";

import React, { useState, useCallback } from "react";
import {
  Search,
  Radar,
  Shield,
  Star,
  Users,
  Eye,
  Clock,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  ExternalLink,
  Zap,
  Activity,
  Globe,
} from "lucide-react";
import { useERC8004Registry } from "@/hooks/useERC8004Registry";
import type { CachedAgent, AgentSearchFilters } from "@/lib/types/erc8004";

// ── Colors ──────────────────────────────────────────────────
const ORACLE_COLOR = "#fbbf24";
const MAIN_COLOR = "#00f0ff";
const ALLY_COLOR = "#22c55e";
const NEUTRAL_COLOR = "#6b7280";
const AVOIDED_COLOR = "#ef4444";
const UNKNOWN_COLOR = "#8b5cf6";
const MUTED = "#4a6a8a";

const RELATIONSHIP_COLORS: Record<string, string> = {
  ally: ALLY_COLOR,
  neutral: NEUTRAL_COLOR,
  avoided: AVOIDED_COLOR,
  unknown: UNKNOWN_COLOR,
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  ally: "ALLY",
  neutral: "NEUTRAL",
  avoided: "AVOIDED",
  unknown: "UNKNOWN",
};

// ── Stat Card ───────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2"
      style={{
        background: `${color}08`,
        border: `1px solid ${color}25`,
      }}
    >
      <Icon size={14} style={{ color, opacity: 0.8 }} />
      <div>
        <div className="font-mono text-xs font-bold" style={{ color }}>
          {value}
        </div>
        <div
          className="font-mono text-[8px] tracking-widest uppercase"
          style={{ color: MUTED }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Agent Row ───────────────────────────────────────────────
const AgentRow = React.memo(function AgentRow({
  agent,
  onClassify,
  onRefresh,
  selfId,
}: {
  agent: CachedAgent;
  onClassify: (
    id: number,
    rel: "ally" | "neutral" | "avoided" | "unknown"
  ) => void;
  onRefresh: (id: number) => void;
  selfId: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSelf = agent.agent_id === selfId;
  const relColor = RELATIONSHIP_COLORS[agent.relationship] || UNKNOWN_COLOR;

  return (
    <div
      className="rounded-lg p-3 transition-all"
      style={{
        background: isSelf ? `${MAIN_COLOR}0a` : `${ORACLE_COLOR}05`,
        border: `1px solid ${isSelf ? MAIN_COLOR : ORACLE_COLOR}15`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1"
          >
            <ChevronDown
              size={12}
              style={{
                color: ORACLE_COLOR,
                transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 0.2s",
              }}
            />
            <span
              className="font-mono text-xs font-bold"
              style={{ color: isSelf ? MAIN_COLOR : ORACLE_COLOR }}
            >
              #{agent.agent_id}
            </span>
          </button>

          {agent.agent_name && (
            <span
              className="font-mono text-[10px] tracking-wider"
              style={{ color: "#e2e8f0" }}
            >
              {agent.agent_name}
            </span>
          )}

          {isSelf && (
            <span
              className="font-mono text-[7px] tracking-widest px-1.5 py-0.5 rounded"
              style={{
                background: `${MAIN_COLOR}20`,
                color: MAIN_COLOR,
                border: `1px solid ${MAIN_COLOR}40`,
              }}
            >
              SELF
            </span>
          )}

          {agent.is_verified && (
            <span title="Verified">
              <Shield
                size={10}
                style={{ color: ALLY_COLOR }}
              />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Reputation badge */}
          {agent.has_reputation && (
            <div className="flex items-center gap-1">
              <Star size={9} style={{ color: ORACLE_COLOR }} />
              <span
                className="font-mono text-[9px]"
                style={{ color: ORACLE_COLOR }}
              >
                {agent.reputation_score}
              </span>
            </div>
          )}

          {/* Relationship */}
          <span
            className="font-mono text-[7px] tracking-widest px-1.5 py-0.5 rounded"
            style={{
              background: `${relColor}15`,
              color: relColor,
              border: `1px solid ${relColor}30`,
            }}
          >
            {RELATIONSHIP_LABELS[agent.relationship]}
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 space-y-2 pl-4">
          {/* Owner / Wallet */}
          <div className="flex gap-4 text-[9px] font-mono" style={{ color: MUTED }}>
            <span>
              Owner:{" "}
              <a
                href={`https://basescan.org/address/${agent.owner}`}
                target="_blank"
                rel="noopener"
                className="hover:underline"
                style={{ color: "#94a3b8" }}
              >
                {agent.owner.slice(0, 6)}...{agent.owner.slice(-4)}
                <ExternalLink
                  size={7}
                  className="inline ml-0.5"
                  style={{ verticalAlign: "middle" }}
                />
              </a>
            </span>
            {agent.agent_wallet &&
              agent.agent_wallet !== "0x0000000000000000000000000000000000000000" && (
                <span>
                  Wallet:{" "}
                  <a
                    href={`https://basescan.org/address/${agent.agent_wallet}`}
                    target="_blank"
                    rel="noopener"
                    className="hover:underline"
                    style={{ color: "#94a3b8" }}
                  >
                    {agent.agent_wallet.slice(0, 6)}...
                    {agent.agent_wallet.slice(-4)}
                    <ExternalLink
                      size={7}
                      className="inline ml-0.5"
                      style={{ verticalAlign: "middle" }}
                    />
                  </a>
                </span>
              )}
          </div>

          {/* Capabilities */}
          {agent.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="font-mono text-[7px] tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    background: `${MAIN_COLOR}10`,
                    color: `${MAIN_COLOR}cc`,
                    border: `1px solid ${MAIN_COLOR}20`,
                  }}
                >
                  {cap}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[7px] tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    background: `${ORACLE_COLOR}10`,
                    color: `${ORACLE_COLOR}cc`,
                    border: `1px solid ${ORACLE_COLOR}20`,
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Metadata URI */}
          {agent.metadata_uri && (
            <div
              className="font-mono text-[8px] truncate"
              style={{ color: MUTED }}
            >
              URI:{" "}
              <a
                href={
                  agent.metadata_uri.startsWith("ipfs://")
                    ? `https://gateway.pinata.cloud/ipfs/${agent.metadata_uri.slice(7)}`
                    : agent.metadata_uri
                }
                target="_blank"
                rel="noopener"
                className="hover:underline"
                style={{ color: "#94a3b8" }}
              >
                {agent.metadata_uri.slice(0, 60)}
                {agent.metadata_uri.length > 60 ? "..." : ""}
                <ExternalLink
                  size={7}
                  className="inline ml-0.5"
                  style={{ verticalAlign: "middle" }}
                />
              </a>
            </div>
          )}

          {/* Timestamps */}
          <div
            className="flex gap-4 font-mono text-[8px]"
            style={{ color: MUTED }}
          >
            {agent.registered_at && (
              <span>
                Registered: {new Date(agent.registered_at).toLocaleDateString()}
              </span>
            )}
            {agent.last_scanned && (
              <span>
                Scanned:{" "}
                {new Date(agent.last_scanned).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {/* Actions */}
          {!isSelf && (
            <div className="flex gap-1 pt-1">
              {(["ally", "neutral", "avoided", "unknown"] as const).map(
                (rel) => (
                  <button
                    key={rel}
                    onClick={() => onClassify(agent.agent_id, rel)}
                    className="font-mono text-[7px] tracking-wider px-2 py-1 rounded transition-colors"
                    style={{
                      background:
                        agent.relationship === rel
                          ? `${RELATIONSHIP_COLORS[rel]}20`
                          : "transparent",
                      color: RELATIONSHIP_COLORS[rel],
                      border: `1px solid ${RELATIONSHIP_COLORS[rel]}${
                        agent.relationship === rel ? "50" : "20"
                      }`,
                    }}
                  >
                    {RELATIONSHIP_LABELS[rel]}
                  </button>
                )
              )}
              <button
                onClick={() => onRefresh(agent.agent_id)}
                className="font-mono text-[7px] tracking-wider px-2 py-1 rounded ml-auto"
                style={{
                  color: ORACLE_COLOR,
                  border: `1px solid ${ORACLE_COLOR}30`,
                }}
                title="Re-scan this agent"
              >
                <RefreshCw size={9} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Main Panel ──────────────────────────────────────────────
const AgentDiscoveryPanel = React.memo(function AgentDiscoveryPanel() {
  const {
    agents,
    total,
    stats,
    loading,
    scanning,
    error,
    filters,
    setFilters,
    scanRange,
    scanEvents,
    classifyAgent,
    refreshAgent,
    refresh,
  } = useERC8004Registry(30_000);

  const SELF_AGENT_ID = 16905;

  // ── Local scan inputs ──
  const [scanFrom, setScanFrom] = useState("16900");
  const [scanTo, setScanTo] = useState("17100");
  const [searchQuery, setSearchQuery] = useState("");
  const [scanResult, setScanResult] = useState<string | null>(null);

  // ── Handlers ──
  const handleScanRange = useCallback(async () => {
    const from = Number(scanFrom);
    const to = Number(scanTo);
    if (isNaN(from) || isNaN(to) || to < from) return;
    setScanResult(null);
    const result = await scanRange(from, to);
    if (result) {
      setScanResult(
        `Scanned ${result.scanned} IDs — Found ${result.found} agents (${result.newAgents} new, ${result.updated} updated) in ${result.durationMs}ms`
      );
    }
  }, [scanFrom, scanTo, scanRange]);

  const handleScanEvents = useCallback(async () => {
    setScanResult(null);
    const result = await scanEvents();
    if (result) {
      setScanResult(
        `Event scan — Found ${result.found} events (${result.newAgents} new agents) in ${result.durationMs}ms`
      );
    }
  }, [scanEvents]);

  const handleSearch = useCallback(() => {
    setFilters({
      ...filters,
      query: searchQuery || undefined,
      offset: 0,
    });
  }, [searchQuery, filters, setFilters]);

  const handleFilterReputation = useCallback(
    (min: number) => {
      setFilters({ ...filters, minReputation: min || undefined, offset: 0 });
    },
    [filters, setFilters]
  );

  const handleFilterRelationship = useCallback(
    (rel: string) => {
      setFilters({
        ...filters,
        relationship: (rel || undefined) as AgentSearchFilters["relationship"],
        offset: 0,
      });
    },
    [filters, setFilters]
  );

  return (
    <div
      className="cyber-card rounded-lg p-5 space-y-4"
      style={{
        background: `linear-gradient(135deg, ${ORACLE_COLOR}06, ${ORACLE_COLOR}02)`,
        border: `1px solid ${ORACLE_COLOR}20`,
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar
            size={16}
            style={{ color: ORACLE_COLOR }}
            className="animate-pulse"
          />
          <h2
            className="font-mono text-sm font-bold tracking-wider"
            style={{ color: ORACLE_COLOR }}
          >
            ORACLE IDENTITY SCOUT
          </h2>
          <span
            className="font-mono text-[7px] tracking-widest px-1.5 py-0.5 rounded"
            style={{
              background: `${ORACLE_COLOR}15`,
              color: ORACLE_COLOR,
              border: `1px solid ${ORACLE_COLOR}30`,
            }}
          >
            ERC-8004
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-1.5 rounded transition-colors"
          style={{
            color: ORACLE_COLOR,
            border: `1px solid ${ORACLE_COLOR}25`,
          }}
        >
          <RefreshCw
            size={12}
            className={loading ? "animate-spin" : ""}
          />
        </button>
      </div>

      {/* ── Stats Bar ── */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <StatCard
            label="Cached"
            value={stats.totalCached}
            icon={Globe}
            color={ORACLE_COLOR}
          />
          <StatCard
            label="Verified"
            value={stats.totalVerified}
            icon={Shield}
            color={ALLY_COLOR}
          />
          <StatCard
            label="Reputation"
            value={stats.totalWithReputation}
            icon={Star}
            color="#f59e0b"
          />
          <StatCard
            label="Allies"
            value={stats.allies}
            icon={Users}
            color={ALLY_COLOR}
          />
          <StatCard
            label="New (7d)"
            value={stats.recentRegistrations}
            icon={Zap}
            color={MAIN_COLOR}
          />
          <StatCard
            label="Last Scan"
            value={
              stats.lastScanAt
                ? new Date(stats.lastScanAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            }
            icon={Clock}
            color={MUTED}
          />
        </div>
      )}

      {/* ── Scan Controls ── */}
      <div
        className="rounded-lg p-3 space-y-2"
        style={{
          background: `${ORACLE_COLOR}05`,
          border: `1px solid ${ORACLE_COLOR}15`,
        }}
      >
        <div
          className="font-mono text-[9px] tracking-widest uppercase"
          style={{ color: ORACLE_COLOR }}
        >
          <Eye size={10} className="inline mr-1" />
          SCAN CONTROLS
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          {/* Range scan */}
          <div className="flex items-center gap-1">
            <label
              className="font-mono text-[8px]"
              style={{ color: MUTED }}
            >
              Range:
            </label>
            <input
              type="number"
              value={scanFrom}
              onChange={(e) => setScanFrom(e.target.value)}
              className="font-mono text-[10px] w-16 px-1.5 py-1 rounded bg-black/30 border"
              style={{ color: "#e2e8f0", borderColor: `${ORACLE_COLOR}25` }}
              placeholder="From"
            />
            <span className="font-mono text-[8px]" style={{ color: MUTED }}>
              →
            </span>
            <input
              type="number"
              value={scanTo}
              onChange={(e) => setScanTo(e.target.value)}
              className="font-mono text-[10px] w-16 px-1.5 py-1 rounded bg-black/30 border"
              style={{ color: "#e2e8f0", borderColor: `${ORACLE_COLOR}25` }}
              placeholder="To"
            />
            <button
              onClick={handleScanRange}
              disabled={scanning}
              className="font-mono text-[8px] tracking-wider px-2.5 py-1 rounded transition-colors"
              style={{
                background: scanning ? `${ORACLE_COLOR}10` : `${ORACLE_COLOR}20`,
                color: ORACLE_COLOR,
                border: `1px solid ${ORACLE_COLOR}40`,
                opacity: scanning ? 0.5 : 1,
              }}
            >
              {scanning ? "SCANNING..." : "SCAN RANGE"}
            </button>
          </div>

          {/* Event scan */}
          <button
            onClick={handleScanEvents}
            disabled={scanning}
            className="font-mono text-[8px] tracking-wider px-2.5 py-1 rounded transition-colors"
            style={{
              background: `${MAIN_COLOR}15`,
              color: MAIN_COLOR,
              border: `1px solid ${MAIN_COLOR}30`,
              opacity: scanning ? 0.5 : 1,
            }}
          >
            <Activity size={9} className="inline mr-1" />
            SCAN NEW REGISTRATIONS
          </button>
        </div>

        {/* Scan result */}
        {scanResult && (
          <div
            className="font-mono text-[9px] px-2 py-1 rounded"
            style={{
              background: `${ALLY_COLOR}10`,
              color: ALLY_COLOR,
              border: `1px solid ${ALLY_COLOR}20`,
            }}
          >
            {scanResult}
          </div>
        )}
      </div>

      {/* ── Search & Filters ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <Search size={12} style={{ color: MUTED }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search agents by name, type..."
            className="font-mono text-[10px] w-full px-2 py-1 rounded bg-black/30 border"
            style={{ color: "#e2e8f0", borderColor: `${ORACLE_COLOR}15` }}
          />
          <button
            onClick={handleSearch}
            className="font-mono text-[8px] tracking-wider px-2 py-1 rounded"
            style={{
              color: ORACLE_COLOR,
              border: `1px solid ${ORACLE_COLOR}30`,
            }}
          >
            GO
          </button>
        </div>

        {/* Reputation filter */}
        <select
          onChange={(e) => handleFilterReputation(Number(e.target.value))}
          className="font-mono text-[9px] px-2 py-1 rounded bg-black/30 border"
          style={{ color: "#e2e8f0", borderColor: `${ORACLE_COLOR}15` }}
          defaultValue=""
        >
          <option value="">All Rep</option>
          <option value="50">Rep &gt; 50</option>
          <option value="70">Rep &gt; 70</option>
          <option value="90">Rep &gt; 90</option>
        </select>

        {/* Relationship filter */}
        <select
          onChange={(e) => handleFilterRelationship(e.target.value)}
          className="font-mono text-[9px] px-2 py-1 rounded bg-black/30 border"
          style={{ color: "#e2e8f0", borderColor: `${ORACLE_COLOR}15` }}
          defaultValue=""
        >
          <option value="">All Relations</option>
          <option value="ally">Allies</option>
          <option value="neutral">Neutral</option>
          <option value="avoided">Avoided</option>
          <option value="unknown">Unknown</option>
        </select>

        <span
          className="font-mono text-[8px] tracking-wider"
          style={{ color: MUTED }}
        >
          {total} result{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Error ── */}
      {error && (
        <div
          className="flex items-center gap-2 font-mono text-[9px] px-3 py-2 rounded"
          style={{
            background: `${AVOIDED_COLOR}10`,
            color: AVOIDED_COLOR,
            border: `1px solid ${AVOIDED_COLOR}20`,
          }}
        >
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* ── Agent List ── */}
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
        {loading && agents.length === 0 ? (
          <div
            className="text-center font-mono text-[10px] py-8"
            style={{ color: MUTED }}
          >
            <Radar
              size={24}
              className="mx-auto mb-2 animate-spin"
              style={{ color: ORACLE_COLOR, opacity: 0.4 }}
            />
            Scanning the ecosystem...
          </div>
        ) : agents.length === 0 ? (
          <div
            className="text-center font-mono text-[10px] py-8"
            style={{ color: MUTED }}
          >
            <Globe
              size={24}
              className="mx-auto mb-2"
              style={{ color: ORACLE_COLOR, opacity: 0.3 }}
            />
            No agents cached yet — run a scan to discover agents on Base
          </div>
        ) : (
          agents.map((agent) => (
            <AgentRow
              key={agent.agent_id}
              agent={agent}
              onClassify={classifyAgent}
              onRefresh={refreshAgent}
              selfId={SELF_AGENT_ID}
            />
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      {total > (filters.limit || 50) && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() =>
              setFilters({
                ...filters,
                offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)),
              })
            }
            disabled={(filters.offset || 0) === 0}
            className="font-mono text-[8px] px-3 py-1 rounded"
            style={{
              color: ORACLE_COLOR,
              border: `1px solid ${ORACLE_COLOR}25`,
              opacity: (filters.offset || 0) === 0 ? 0.3 : 1,
            }}
          >
            ← PREV
          </button>
          <span
            className="font-mono text-[8px] py-1"
            style={{ color: MUTED }}
          >
            {(filters.offset || 0) + 1}–
            {Math.min((filters.offset || 0) + (filters.limit || 50), total)} of{" "}
            {total}
          </span>
          <button
            onClick={() =>
              setFilters({
                ...filters,
                offset: (filters.offset || 0) + (filters.limit || 50),
              })
            }
            disabled={
              (filters.offset || 0) + (filters.limit || 50) >= total
            }
            className="font-mono text-[8px] px-3 py-1 rounded"
            style={{
              color: ORACLE_COLOR,
              border: `1px solid ${ORACLE_COLOR}25`,
              opacity:
                (filters.offset || 0) + (filters.limit || 50) >= total
                  ? 0.3
                  : 1,
            }}
          >
            NEXT →
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      <div
        className="flex items-center justify-between pt-2"
        style={{ borderTop: `1px solid ${ORACLE_COLOR}10` }}
      >
        <span
          className="font-mono text-[7px] tracking-widest"
          style={{ color: MUTED }}
        >
          ORACLE IDENTITY SCOUT v1.0 — ERC-8004 REGISTRY ON BASE
        </span>
        <a
          href={`https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`}
          target="_blank"
          rel="noopener"
          className="font-mono text-[7px] tracking-wider flex items-center gap-1"
          style={{ color: `${ORACLE_COLOR}80` }}
        >
          CONTRACT
          <ExternalLink size={7} />
        </a>
      </div>
    </div>
  );
});

export default AgentDiscoveryPanel;
