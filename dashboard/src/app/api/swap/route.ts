import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * POST /api/swap — queue a swap command through the bridge.
 *
 * Body: { from: "USDC", to: "ETH", amount: "5", agent_id?: "main" }
 *
 * This inserts a formatted swap command into agent_commands,
 * which the bridge executor picks up and executes via swap-executor.ts.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { from, to, amount, agent_id = "main" } = body;

  if (!from || !to || !amount) {
    return NextResponse.json(
      { error: "from, to, and amount are required" },
      { status: 400 },
    );
  }

  // Validate amount is a positive number
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 },
    );
  }

  // Format as a swap command the bridge executor will intercept
  const message = `swap ${amount} ${from} to ${to}`;

  const { data, error } = await supabase
    .from("agent_commands")
    .insert({
      agent_id,
      message,
      status: "pending",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    swap: { from, to, amount, message },
  });
}

/**
 * GET /api/swap — list recent swap history.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("agent_swaps")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
