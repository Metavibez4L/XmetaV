import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/** Parse amount strings like "$0.10" or "0.10" → number */
function parseAmount(amt: string | null | undefined): number {
  if (!amt) return 0;
  return parseFloat(amt.replace(/[$,]/g, "")) || 0;
}

/**
 * GET /api/midas?action=report|endpoints|opportunities|pricing|dashboard
 *
 * Returns Midas revenue intelligence data.
 * Default action: "dashboard" (combined overview).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const action = request.nextUrl.searchParams.get("action") || "dashboard";
  const supabase = createAdminClient();

  try {
    switch (action) {
      case "report":
      case "dashboard": {
        // Combined dashboard view
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

        const [paymentsRes, metricsRes, endpointsRes, opportunitiesRes, pricingRes] =
          await Promise.all([
            supabase
              .from("x402_payments")
              .select("amount, endpoint, agent_id, created_at, status")
              .in("status", ["completed", "settled"]),
            supabase
              .from("revenue_metrics")
              .select("*")
              .order("date", { ascending: false })
              .limit(30),
            supabase
              .from("endpoint_analytics")
              .select("*")
              .order("revenue_30d", { ascending: false })
              .limit(20),
            supabase
              .from("growth_opportunities")
              .select("*")
              .order("priority", { ascending: true })
              .limit(10),
            supabase
              .from("pricing_recommendations")
              .select("*")
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(10),
          ]);

        const payments = paymentsRes.data || [];
        const totalRevenue = payments.reduce(
          (sum, p) => sum + parseAmount(p.amount),
          0
        );
        const last7d = payments.filter((p) => p.created_at >= sevenDaysAgo);
        const revenue7d = last7d.reduce(
          (sum, p) => sum + parseAmount(p.amount),
          0
        );
        const last30d = payments.filter((p) => p.created_at >= thirtyDaysAgo);
        const revenue30d = last30d.reduce(
          (sum, p) => sum + parseAmount(p.amount),
          0
        );

        // Top endpoints by revenue
        const endpointRevenue: Record<string, number> = {};
        for (const p of payments) {
          const ep = p.endpoint || "unknown";
          endpointRevenue[ep] =
            (endpointRevenue[ep] || 0) + parseAmount(p.amount);
        }
        const topEndpoints = Object.entries(endpointRevenue)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([endpoint, revenue]) => ({ endpoint, revenue }));

        return NextResponse.json({
          overview: {
            totalRevenue: totalRevenue.toFixed(6),
            revenue7d: revenue7d.toFixed(6),
            revenue30d: revenue30d.toFixed(6),
            totalPayments: payments.length,
            payments7d: last7d.length,
            payments30d: last30d.length,
            avgPayment:
              payments.length > 0
                ? (totalRevenue / payments.length).toFixed(6)
                : "0",
            currency: "USDC",
            topEndpoints,
          },
          recentMetrics: metricsRes.data || [],
          endpointAnalytics: endpointsRes.data || [],
          growthOpportunities: opportunitiesRes.data || [],
          pricingRecommendations: pricingRes.data || [],
          generatedAt: new Date().toISOString(),
        });
      }

      case "endpoints": {
        const { data } = await supabase
          .from("endpoint_analytics")
          .select("*")
          .order("revenue_30d", { ascending: false });
        return NextResponse.json({ endpoints: data || [] });
      }

      case "opportunities": {
        const { data } = await supabase
          .from("growth_opportunities")
          .select("*")
          .order("priority", { ascending: true })
          .order("roi_score", { ascending: false });
        return NextResponse.json({ opportunities: data || [] });
      }

      case "pricing": {
        const { data } = await supabase
          .from("pricing_recommendations")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        return NextResponse.json({ recommendations: data || [] });
      }

      // ---- Phase 2: A/B Pricing Experiments ----
      case "experiments": {
        const { data } = await supabase
          .from("pricing_experiments")
          .select("*")
          .order("endpoint_path", { ascending: true })
          .order("variant_name", { ascending: true });

        const experiments = data || [];
        // Compute summary per endpoint
        const byEndpoint: Record<string, { control: typeof experiments[0] | null; premium: typeof experiments[0] | null }> = {};
        for (const exp of experiments) {
          if (!byEndpoint[exp.endpoint_path]) byEndpoint[exp.endpoint_path] = { control: null, premium: null };
          if (exp.variant_name === "control") byEndpoint[exp.endpoint_path].control = exp;
          else byEndpoint[exp.endpoint_path].premium = exp;
        }

        const summary = Object.entries(byEndpoint).map(([endpoint, variants]) => {
          const c = variants.control;
          const p = variants.premium;
          return {
            endpoint,
            controlPrice: c?.price_usd,
            premiumPrice: p?.price_usd,
            controlConversionRate: c?.conversion_rate || 0,
            premiumConversionRate: p?.conversion_rate || 0,
            controlRevenue: c?.revenue_usd || 0,
            premiumRevenue: p?.revenue_usd || 0,
            winner: (c?.conversion_rate || 0) >= (p?.conversion_rate || 0) ? "control" : "premium",
          };
        });

        return NextResponse.json({
          experiments,
          summary,
          totalExperiments: experiments.length,
          activeExperiments: experiments.filter(e => e.is_active).length,
        });
      }

      // ---- Phase 2: Swarm Spawn Billing ----
      case "spawn-billing": {
        const { data } = await supabase
          .from("swarm_spawn_billing")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        const bills = data || [];
        const totalSpawnRevenue = bills
          .filter(b => b.status === "billed")
          .reduce((sum, b) => sum + (b.spawn_price_usd || 0), 0);
        const uniqueSwarms = new Set(bills.map(b => b.swarm_id)).size;
        const agentSpawnCounts: Record<string, number> = {};
        for (const b of bills) {
          agentSpawnCounts[b.agent_id] = (agentSpawnCounts[b.agent_id] || 0) + 1;
        }

        return NextResponse.json({
          recentBills: bills.slice(0, 50),
          totalSpawnRevenue: totalSpawnRevenue.toFixed(4),
          totalSpawns: bills.length,
          uniqueSwarms,
          agentSpawnCounts,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Midas query failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
