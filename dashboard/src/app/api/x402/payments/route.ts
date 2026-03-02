import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** GET /api/x402/payments -- list x402 payment history */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const status = request.nextUrl.searchParams.get("status");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);

  let query = supabase
    .from("x402_payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agentId) {
    query = query.eq("agent_id", agentId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch daily spend summary
  const { data: spendData } = await supabase
    .from("x402_payments")
    .select("amount, currency")
    .in("status", ["completed", "settled"])
    .gte("created_at", new Date(Date.now() - 86400000).toISOString());

  const todaySpend = (spendData || []).reduce(
    (sum, p) => sum + parseFloat(p.amount || "0"),
    0
  );

  return NextResponse.json({
    payments: data ?? [],
    summary: {
      todaySpend: todaySpend.toFixed(4),
      currency: "USDC",
      paymentCount: data?.length ?? 0,
    },
  });
}
