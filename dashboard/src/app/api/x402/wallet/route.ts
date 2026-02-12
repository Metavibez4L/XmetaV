import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** GET /api/x402/wallet -- get wallet info and payment stats */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check bridge status — maybeSingle avoids error when no row exists
  const { data: bridgeSession } = await supabase
    .from("agent_sessions")
    .select("agent_id, status, last_heartbeat")
    .eq("agent_id", "bridge")
    .maybeSingle();

  // Get payment stats
  const { data: payments } = await supabase
    .from("x402_payments")
    .select("amount, status, created_at")
    .eq("status", "completed");

  const totalSpend = (payments || []).reduce(
    (sum, p) => sum + parseFloat(p.amount || "0"),
    0
  );
  const paymentCount = payments?.length || 0;

  // Today's spend
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayPayments = (payments || []).filter(
    (p) => new Date(p.created_at) >= todayStart
  );
  const todaySpend = todayPayments.reduce(
    (sum, p) => sum + parseFloat(p.amount || "0"),
    0
  );

  return NextResponse.json({
    wallet: {
      configured: false, // Bridge reports this via env var presence
      address: null,     // Derived client-side from private key (never expose key)
      network: "eip155:84532",
      budgetLimit: "1.00",
    },
    stats: {
      totalSpend: totalSpend.toFixed(4),
      todaySpend: todaySpend.toFixed(4),
      paymentCount,
      currency: "USDC",
    },
    bridge: {
      online: bridgeSession?.status === "online" || bridgeSession?.status === "idle",
      lastHeartbeat: bridgeSession?.last_heartbeat || null,
    },
  });
}
