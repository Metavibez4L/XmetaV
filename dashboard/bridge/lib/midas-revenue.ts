/**
 * Midas Revenue Engine — aggregates x402 payment data, endpoint
 * analytics, and growth metrics for the Midas revenue agent.
 *
 * Bridge skill: called by midas commands or on schedule.
 */

import { supabase } from "./supabase.js";

/** Parse amount strings like "$0.10" or "0.10" → number */
function parseAmount(amt: string | null | undefined): number {
  if (!amt) return 0;
  return parseFloat(amt.replace(/[$,]/g, "")) || 0;
}

/* ── Types ─────────────────────────────────────────────────── */

export interface RevenueSnapshot {
  date: string;
  totalRevenueUsd: number;
  x402PaymentsCount: number;
  topEndpoint: string | null;
  topAgent: string | null;
  growthRateWeek: number;
  growthRateMonth: number;
  forecast7d: number;
  forecast30d: number;
  forecast90d: number;
}

export interface EndpointStats {
  endpointPath: string;
  totalCalls: number;
  paidCalls: number;
  freeCalls: number;
  conversionRate: number;
  avgPaymentUsd: number;
  revenue7d: number;
  revenue30d: number;
  growthTrend: "up" | "stable" | "down";
}

export interface GrowthOpportunity {
  id: string;
  name: string;
  description: string | null;
  category: string;
  expectedRevenue30d: number;
  investmentRequiredUsd: number;
  roiScore: number;
  priority: number;
  status: string;
}

/* ── Revenue Report ────────────────────────────────────────── */

/**
 * Generate a full revenue report from x402_payments data.
 * Aggregates by endpoint, calculates growth rates, and
 * writes a snapshot to revenue_metrics.
 */
export async function generateRevenueReport(): Promise<RevenueSnapshot> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  // Fetch all completed payments
  const { data: allPayments } = await supabase
    .from("x402_payments")
    .select("amount, endpoint, agent_id, created_at, status")
    .in("status", ["completed", "settled"]);

  const payments = allPayments || [];

  // Total revenue
  const totalRevenueUsd = payments.reduce(
    (sum, p) => sum + parseAmount(p.amount),
    0
  );

  // Last 7 days
  const last7d = payments.filter((p) => p.created_at >= sevenDaysAgo);
  const revenue7d = last7d.reduce(
    (sum, p) => sum + parseAmount(p.amount),
    0
  );

  // Last 30 days
  const last30d = payments.filter((p) => p.created_at >= thirtyDaysAgo);
  const revenue30d = last30d.reduce(
    (sum, p) => sum + parseAmount(p.amount),
    0
  );

  // Top endpoint by revenue
  const endpointRevenue: Record<string, number> = {};
  for (const p of payments) {
    const ep = p.endpoint || "unknown";
    endpointRevenue[ep] = (endpointRevenue[ep] || 0) + parseAmount(p.amount);
  }
  const topEndpoint =
    Object.entries(endpointRevenue).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Top agent by revenue
  const agentRevenue: Record<string, number> = {};
  for (const p of payments) {
    const aid = p.agent_id || "unknown";
    agentRevenue[aid] = (agentRevenue[aid] || 0) + parseAmount(p.amount);
  }
  const topAgent =
    Object.entries(agentRevenue).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Growth rates
  const prevWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString();
  const prevWeek = payments.filter(
    (p) => p.created_at >= prevWeekStart && p.created_at < sevenDaysAgo
  );
  const prevWeekRevenue = prevWeek.reduce(
    (sum, p) => sum + parseAmount(p.amount),
    0
  );
  const growthRateWeek =
    prevWeekRevenue > 0
      ? ((revenue7d - prevWeekRevenue) / prevWeekRevenue) * 100
      : revenue7d > 0
      ? 100
      : 0;

  const prevMonthStart = new Date(now.getTime() - 60 * 86400000).toISOString();
  const prevMonth = payments.filter(
    (p) => p.created_at >= prevMonthStart && p.created_at < thirtyDaysAgo
  );
  const prevMonthRevenue = prevMonth.reduce(
    (sum, p) => sum + parseAmount(p.amount),
    0
  );
  const growthRateMonth =
    prevMonthRevenue > 0
      ? ((revenue30d - prevMonthRevenue) / prevMonthRevenue) * 100
      : revenue30d > 0
      ? 100
      : 0;

  // Simple linear forecast
  const dailyAvg7d = revenue7d / 7;
  const dailyAvg30d = revenue30d / 30;
  const forecast7d = dailyAvg7d * 7;
  const forecast30d = dailyAvg30d * 30;
  const forecast90d = dailyAvg30d * 90;

  const snapshot: RevenueSnapshot = {
    date: today,
    totalRevenueUsd,
    x402PaymentsCount: payments.length,
    topEndpoint,
    topAgent,
    growthRateWeek: Math.round(growthRateWeek * 100) / 100,
    growthRateMonth: Math.round(growthRateMonth * 100) / 100,
    forecast7d: Math.round(forecast7d * 1000000) / 1000000,
    forecast30d: Math.round(forecast30d * 1000000) / 1000000,
    forecast90d: Math.round(forecast90d * 1000000) / 1000000,
  };

  // Upsert to revenue_metrics
  await supabase
    .from("revenue_metrics")
    .upsert(
      {
        date: today,
        total_revenue_usd: snapshot.totalRevenueUsd,
        x402_payments_count: snapshot.x402PaymentsCount,
        top_endpoint: snapshot.topEndpoint,
        top_agent: snapshot.topAgent,
        growth_rate_week: snapshot.growthRateWeek,
        growth_rate_month: snapshot.growthRateMonth,
        forecast_7d: snapshot.forecast7d,
        forecast_30d: snapshot.forecast30d,
        forecast_90d: snapshot.forecast90d,
      },
      { onConflict: "date" }
    );

  console.log(
    `[midas] Revenue report: $${totalRevenueUsd.toFixed(4)} total, ${payments.length} payments, WoW ${growthRateWeek.toFixed(1)}%`
  );

  return snapshot;
}

/* ── Endpoint Analytics ────────────────────────────────────── */

/**
 * Analyze x402 endpoint usage and update endpoint_analytics table.
 */
export async function analyzeEndpoints(): Promise<EndpointStats[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const { data: payments } = await supabase
    .from("x402_payments")
    .select("endpoint, amount, status, created_at");

  const allPayments = payments || [];

  // Group by endpoint
  const byEndpoint: Record<
    string,
    { total: number; paid: number; amounts: number[]; recent7d: number; recent30d: number }
  > = {};

  for (const p of allPayments) {
    const ep = p.endpoint || "unknown";
    if (!byEndpoint[ep]) {
      byEndpoint[ep] = { total: 0, paid: 0, amounts: [], recent7d: 0, recent30d: 0 };
    }
    byEndpoint[ep].total++;
    if (p.status === "completed" || p.status === "settled") {
      byEndpoint[ep].paid++;
      const amt = parseAmount(p.amount);
      byEndpoint[ep].amounts.push(amt);
      if (p.created_at >= sevenDaysAgo) byEndpoint[ep].recent7d += amt;
      if (p.created_at >= thirtyDaysAgo) byEndpoint[ep].recent30d += amt;
    }
  }

  const stats: EndpointStats[] = Object.entries(byEndpoint).map(
    ([endpointPath, data]) => {
      const avgPaymentUsd =
        data.amounts.length > 0
          ? data.amounts.reduce((s, v) => s + v, 0) / data.amounts.length
          : 0;
      const conversionRate =
        data.total > 0 ? (data.paid / data.total) * 100 : 0;

      // Simple trend: compare 7d to (30d - 7d) normalized
      const prev23d = data.recent30d - data.recent7d;
      const prev23dNorm = prev23d * (7 / 23);
      let growthTrend: "up" | "stable" | "down" = "stable";
      if (data.recent7d > prev23dNorm * 1.1) growthTrend = "up";
      else if (data.recent7d < prev23dNorm * 0.9) growthTrend = "down";

      return {
        endpointPath,
        totalCalls: data.total,
        paidCalls: data.paid,
        freeCalls: data.total - data.paid,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgPaymentUsd: Math.round(avgPaymentUsd * 1000000) / 1000000,
        revenue7d: Math.round(data.recent7d * 1000000) / 1000000,
        revenue30d: Math.round(data.recent30d * 1000000) / 1000000,
        growthTrend,
      };
    }
  );

  // Upsert to endpoint_analytics
  for (const s of stats) {
    await supabase.from("endpoint_analytics").upsert(
      {
        endpoint_path: s.endpointPath,
        total_calls: s.totalCalls,
        paid_calls: s.paidCalls,
        free_calls: s.freeCalls,
        conversion_rate: s.conversionRate,
        avg_payment_usd: s.avgPaymentUsd,
        revenue_7d: s.revenue7d,
        revenue_30d: s.revenue30d,
        growth_trend: s.growthTrend,
        last_called_at: new Date().toISOString(),
      },
      { onConflict: "endpoint_path" }
    );
  }

  console.log(`[midas] Endpoint analytics: ${stats.length} endpoints analyzed`);
  return stats;
}

/* ── Growth Opportunities ──────────────────────────────────── */

/**
 * Fetch current growth opportunities, sorted by priority + ROI.
 */
export async function getGrowthOpportunities(): Promise<GrowthOpportunity[]> {
  const { data } = await supabase
    .from("growth_opportunities")
    .select("*")
    .order("priority", { ascending: true })
    .order("roi_score", { ascending: false });

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    expectedRevenue30d: parseFloat(row.expected_revenue_30d || "0"),
    investmentRequiredUsd: parseFloat(row.investment_required_usd || "0"),
    roiScore: parseFloat(row.roi_score || "0"),
    priority: row.priority,
    status: row.status,
  }));
}

/**
 * Propose a new growth opportunity.
 */
export async function proposeOpportunity(opp: {
  name: string;
  description?: string;
  category?: string;
  expectedRevenue30d?: number;
  investmentRequiredUsd?: number;
  priority?: number;
}): Promise<string | null> {
  const investmentUsd = opp.investmentRequiredUsd || 0;
  const expectedRev = opp.expectedRevenue30d || 0;
  const roiScore = investmentUsd > 0 ? (expectedRev / investmentUsd) * 100 : expectedRev > 0 ? 100 : 0;

  const { data, error } = await supabase
    .from("growth_opportunities")
    .insert({
      name: opp.name,
      description: opp.description || null,
      category: opp.category || "general",
      expected_revenue_30d: expectedRev,
      investment_required_usd: investmentUsd,
      roi_score: Math.round(roiScore * 100) / 100,
      priority: opp.priority || 5,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[midas] Failed to propose opportunity:", error.message);
    return null;
  }

  console.log(`[midas] New opportunity proposed: ${opp.name} (ROI: ${roiScore.toFixed(1)}%)`);
  return data?.id || null;
}

/* ── Pricing Analysis ──────────────────────────────────────── */

/**
 * Analyze current x402 pricing and suggest adjustments.
 */
export async function analyzePricing(): Promise<
  Array<{
    endpoint: string;
    currentPrice: number;
    recommendedPrice: number;
    reasoning: string;
    confidence: number;
  }>
> {
  const { data: payments } = await supabase
    .from("x402_payments")
    .select("endpoint, amount, status, created_at")
    .eq("status", "completed");

  const allPayments = payments || [];
  const byEndpoint: Record<string, number[]> = {};

  for (const p of allPayments) {
    const ep = p.endpoint || "unknown";
    if (!byEndpoint[ep]) byEndpoint[ep] = [];
    byEndpoint[ep].push(parseAmount(p.amount));
  }

  const recommendations = Object.entries(byEndpoint).map(([endpoint, amounts]) => {
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const volume = amounts.length;

    // Simple heuristic: high volume + low price → raise; low volume + high price → lower
    let recommendedPrice = avg;
    let reasoning = "Current pricing appears optimal";
    let confidence = 0.5;

    if (volume > 50 && avg < 0.001) {
      recommendedPrice = avg * 1.5;
      reasoning = "High demand endpoint — price increase likely tolerable";
      confidence = 0.7;
    } else if (volume < 5 && avg > 0.01) {
      recommendedPrice = avg * 0.7;
      reasoning = "Low adoption — consider lowering price to drive volume";
      confidence = 0.6;
    } else if (volume > 20) {
      reasoning = "Healthy volume — maintain current pricing";
      confidence = 0.8;
    }

    return {
      endpoint,
      currentPrice: Math.round(avg * 1000000) / 1000000,
      recommendedPrice: Math.round(recommendedPrice * 1000000) / 1000000,
      reasoning,
      confidence,
    };
  });

  // Store recommendations
  for (const rec of recommendations) {
    await supabase.from("pricing_recommendations").insert({
      endpoint_path: rec.endpoint,
      current_price_usd: rec.currentPrice,
      recommended_price_usd: rec.recommendedPrice,
      reasoning: rec.reasoning,
      confidence: rec.confidence,
    });
  }

  console.log(`[midas] Pricing analysis: ${recommendations.length} endpoints analyzed`);
  return recommendations;
}

/* ── Full Midas Report ─────────────────────────────────────── */

/**
 * Run all Midas analyses and return a combined report.
 */
export async function fullMidasReport() {
  const [revenue, endpoints, opportunities, pricing] = await Promise.all([
    generateRevenueReport(),
    analyzeEndpoints(),
    getGrowthOpportunities(),
    analyzePricing(),
  ]);

  return { revenue, endpoints, opportunities, pricing, generatedAt: new Date().toISOString() };
}
