"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, DollarSign, Beaker, Zap, BarChart3, RefreshCcw } from "lucide-react";

interface Overview {
  totalRevenue: string;
  revenue7d: string;
  revenue30d: string;
  totalPayments: number;
  payments7d: number;
  payments30d: number;
  avgPayment: string;
  currency: string;
  topEndpoints: { endpoint: string; revenue: number }[];
}

interface EndpointAnalytics {
  endpoint_path: string;
  total_calls: number;
  paid_calls: number;
  avg_payment_usd: number;
  revenue_7d: number;
  revenue_30d: number;
  growth_trend: string;
}

interface ABSummary {
  endpoint: string;
  controlPrice: number;
  premiumPrice: number;
  controlConversionRate: number;
  premiumConversionRate: number;
  controlRevenue: number;
  premiumRevenue: number;
  winner: string;
}

interface SpawnBilling {
  totalSpawnRevenue: string;
  totalSpawns: number;
  uniqueSwarms: number;
  agentSpawnCounts: Record<string, number>;
}

interface GrowthOpp {
  type: string;
  title: string;
  description: string;
  priority: number;
  roi_score: number;
  status: string;
}

const GOLD = "#f59e0b";
const GOLD_DIM = "#f59e0b44";
const CYAN = "#00f0ff";
const GREEN = "#22c55e";
const RED = "#ef4444";

export default function MidasPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointAnalytics[]>([]);
  const [abSummary, setABSummary] = useState<ABSummary[]>([]);
  const [abActive, setABActive] = useState(0);
  const [spawnBilling, setSpawnBilling] = useState<SpawnBilling | null>(null);
  const [opportunities, setOpportunities] = useState<GrowthOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, expRes, spawnRes] = await Promise.all([
        fetch("/api/midas?action=dashboard"),
        fetch("/api/midas?action=experiments"),
        fetch("/api/midas?action=spawn-billing"),
      ]);

      if (dashRes.ok) {
        const d = await dashRes.json();
        setOverview(d.overview);
        setEndpoints(d.endpointAnalytics || []);
        setOpportunities(d.growthOpportunities || []);
      }
      if (expRes.ok) {
        const e = await expRes.json();
        setABSummary(e.summary || []);
        setABActive(e.activeExperiments || 0);
      }
      if (spawnRes.ok) {
        const s = await spawnRes.json();
        setSpawnBilling(s);
      }
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      /* best effort */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5" style={{ color: GOLD }} />
            <h1
              className="text-xl font-bold font-mono tracking-wider"
              style={{ color: GOLD, textShadow: `0 0 20px ${GOLD_DIM}` }}
            >
              MIDAS REVENUE
            </h1>
            <span
              className="text-[7px] font-mono tracking-widest px-2 py-0.5 rounded"
              style={{ background: "#f59e0b15", color: GOLD, border: `1px solid ${GOLD_DIM}` }}
            >
              GROWTH ENGINE
            </span>
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            // x402 revenue intelligence · A/B pricing · swarm monetization · growth analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[9px] font-mono" style={{ color: "#4a6a8a" }}>
              {lastRefresh}
            </span>
          )}
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-1.5 rounded border transition-colors"
            style={{ borderColor: GOLD_DIM, color: GOLD }}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Total Revenue"
          value={overview ? `$${overview.totalRevenue}` : "—"}
          sub={`${overview?.totalPayments ?? 0} payments`}
          color={GOLD}
        />
        <KPICard
          label="7d Revenue"
          value={overview ? `$${overview.revenue7d}` : "—"}
          sub={`${overview?.payments7d ?? 0} txns`}
          color={CYAN}
        />
        <KPICard
          label="30d Revenue"
          value={overview ? `$${overview.revenue30d}` : "—"}
          sub={`${overview?.payments30d ?? 0} txns`}
          color={GREEN}
        />
        <KPICard
          label="Avg Payment"
          value={overview ? `$${overview.avgPayment}` : "—"}
          sub="USDC"
          color="#a78bfa"
        />
      </div>

      {/* A/B Experiments & Spawn Billing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* A/B Experiments */}
        <Card className="border" style={{ borderColor: "#1a2a3a", background: "#0a0f1a" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Beaker className="h-4 w-4" style={{ color: GOLD }} />
              <CardTitle className="text-sm font-mono" style={{ color: GOLD }}>
                A/B PRICING EXPERIMENTS
              </CardTitle>
            </div>
            <CardDescription className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              {abActive} active experiments · comparing control vs premium pricing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {abSummary.length === 0 ? (
              <p className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
                No experiment data yet. Pricing experiments track automatically on each payment.
              </p>
            ) : (
              abSummary.map((ab) => (
                <div
                  key={ab.endpoint}
                  className="p-2 rounded border"
                  style={{ borderColor: "#1a2a3a", background: "#0d1520" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold" style={{ color: CYAN }}>
                      {ab.endpoint}
                    </span>
                    <span
                      className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: ab.winner === "premium" ? "#22c55e15" : "#f59e0b15",
                        color: ab.winner === "premium" ? GREEN : GOLD,
                        border: `1px solid ${ab.winner === "premium" ? GREEN + "30" : GOLD_DIM}`,
                      }}
                    >
                      {ab.winner.toUpperCase()} WINNING
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <VariantBar
                      label="Control"
                      price={ab.controlPrice}
                      rate={ab.controlConversionRate}
                      revenue={ab.controlRevenue}
                      color="#94a3b8"
                    />
                    <VariantBar
                      label="Premium"
                      price={ab.premiumPrice}
                      rate={ab.premiumConversionRate}
                      revenue={ab.premiumRevenue}
                      color={GOLD}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Swarm Spawn Billing */}
        <Card className="border" style={{ borderColor: "#1a2a3a", background: "#0a0f1a" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: GOLD }} />
              <CardTitle className="text-sm font-mono" style={{ color: GOLD }}>
                SWARM SPAWN BILLING
              </CardTitle>
            </div>
            <CardDescription className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              Per-agent spawn billing at $0.02/spawn across swarm & neural-swarm endpoints
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!spawnBilling ? (
              <p className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>Loading…</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Spawn Revenue" value={`$${spawnBilling.totalSpawnRevenue}`} color={GOLD} />
                  <MiniStat label="Total Spawns" value={String(spawnBilling.totalSpawns)} color={CYAN} />
                  <MiniStat label="Unique Swarms" value={String(spawnBilling.uniqueSwarms)} color={GREEN} />
                </div>
                {Object.keys(spawnBilling.agentSpawnCounts).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#4a6a8a" }}>
                      Spawns by Agent
                    </p>
                    {Object.entries(spawnBilling.agentSpawnCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([agent, count]) => (
                        <div
                          key={agent}
                          className="flex items-center justify-between px-2 py-1 rounded"
                          style={{ background: "#0d1520" }}
                        >
                          <span className="text-[10px] font-mono" style={{ color: CYAN }}>
                            {agent}
                          </span>
                          <span className="text-[10px] font-mono" style={{ color: GOLD }}>
                            {count} spawn{count !== 1 ? "s" : ""} · ${(count * 0.02).toFixed(2)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Endpoint Analytics Table */}
      <Card className="border" style={{ borderColor: "#1a2a3a", background: "#0a0f1a" }}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" style={{ color: GOLD }} />
            <CardTitle className="text-sm font-mono" style={{ color: GOLD }}>
              ENDPOINT ANALYTICS
            </CardTitle>
          </div>
          <CardDescription className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
            Per-endpoint revenue tracking · calls · avg payment · growth trend
          </CardDescription>
        </CardHeader>
        <CardContent>
          {endpoints.length === 0 ? (
            <p className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
              No endpoint data yet. Analytics populate as x402 payments are processed.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr style={{ color: "#4a6a8a" }}>
                    <th className="text-left pb-2">Endpoint</th>
                    <th className="text-right pb-2">Calls</th>
                    <th className="text-right pb-2">Paid</th>
                    <th className="text-right pb-2">Avg $</th>
                    <th className="text-right pb-2">7d Rev</th>
                    <th className="text-right pb-2">30d Rev</th>
                    <th className="text-right pb-2">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((ep) => (
                    <tr key={ep.endpoint_path} className="border-t" style={{ borderColor: "#1a2a3a" }}>
                      <td className="py-1.5" style={{ color: CYAN }}>{ep.endpoint_path}</td>
                      <td className="py-1.5 text-right" style={{ color: "#94a3b8" }}>{ep.total_calls}</td>
                      <td className="py-1.5 text-right" style={{ color: "#94a3b8" }}>{ep.paid_calls}</td>
                      <td className="py-1.5 text-right" style={{ color: GOLD }}>
                        ${(ep.avg_payment_usd || 0).toFixed(4)}
                      </td>
                      <td className="py-1.5 text-right" style={{ color: GREEN }}>
                        ${(ep.revenue_7d || 0).toFixed(4)}
                      </td>
                      <td className="py-1.5 text-right" style={{ color: GREEN }}>
                        ${(ep.revenue_30d || 0).toFixed(4)}
                      </td>
                      <td className="py-1.5 text-right">
                        <TrendBadge trend={ep.growth_trend} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Growth Opportunities */}
      {opportunities.length > 0 && (
        <Card className="border" style={{ borderColor: "#1a2a3a", background: "#0a0f1a" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: GOLD }} />
              <CardTitle className="text-sm font-mono" style={{ color: GOLD }}>
                GROWTH OPPORTUNITIES
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {opportunities.map((opp, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-2 rounded border"
                style={{ borderColor: "#1a2a3a", background: "#0d1520" }}
              >
                <span
                  className="text-[8px] font-mono px-1.5 py-0.5 rounded mt-0.5"
                  style={{
                    background: opp.priority <= 2 ? "#ef444415" : "#f59e0b15",
                    color: opp.priority <= 2 ? RED : GOLD,
                    border: `1px solid ${opp.priority <= 2 ? RED + "30" : GOLD_DIM}`,
                  }}
                >
                  P{opp.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono font-bold" style={{ color: "#e2e8f0" }}>
                    {opp.title}
                  </p>
                  <p className="text-[9px] font-mono mt-0.5" style={{ color: "#4a6a8a" }}>
                    {opp.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-mono" style={{ color: GOLD }}>
                    ROI {(opp.roi_score || 0).toFixed(1)}
                  </p>
                  <p className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                    {opp.status}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────── */

function KPICard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <Card className="border" style={{ borderColor: "#1a2a3a", background: "#0a0f1a" }}>
      <CardContent className="p-4">
        <p className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "#4a6a8a" }}>
          {label}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color, textShadow: `0 0 15px ${color}44` }}>
          {value}
        </p>
        <p className="text-[9px] font-mono mt-0.5" style={{ color: "#4a6a8a" }}>{sub}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center p-2 rounded" style={{ background: "#0d1520" }}>
      <p className="text-[8px] font-mono uppercase tracking-wider mb-0.5" style={{ color: "#4a6a8a" }}>
        {label}
      </p>
      <p className="text-sm font-bold font-mono" style={{ color }}>{value}</p>
    </div>
  );
}

function VariantBar({
  label,
  price,
  rate,
  revenue,
  color,
}: {
  label: string;
  price: number;
  rate: number;
  revenue: number;
  color: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono uppercase" style={{ color }}>
          {label}
        </span>
        <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
          ${price?.toFixed(2) ?? "?"}
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "#1a2a3a" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, (rate || 0) * 100)}%`,
            background: color,
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[7px] font-mono" style={{ color: "#4a6a8a" }}>
          {((rate || 0) * 100).toFixed(1)}% cvr
        </span>
        <span className="text-[7px] font-mono" style={{ color }}>
          ${(revenue || 0).toFixed(4)}
        </span>
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const isUp = trend === "growing" || trend === "up";
  const isDown = trend === "declining" || trend === "down";
  const color = isUp ? GREEN : isDown ? RED : "#4a6a8a";
  const arrow = isUp ? "▲" : isDown ? "▼" : "—";
  return (
    <span className="text-[9px] font-mono" style={{ color }}>
      {arrow} {trend || "new"}
    </span>
  );
}
