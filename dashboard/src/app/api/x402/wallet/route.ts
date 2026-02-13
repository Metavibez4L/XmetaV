import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const runtime = "nodejs";

// ---- ERC-8004 constants (same as identity route) ----
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const AGENT_ID = BigInt(process.env.ERC8004_AGENT_ID || "16905");

const IDENTITY_ABI = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getAgentWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const viemClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org", { timeout: 10_000 }),
});

/** GET /api/x402/wallet -- wallet info (from ERC-8004 on-chain) + payment stats */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ---- Read wallet address from ERC-8004 on-chain ----
  let walletAddress: string | null = null;
  let ownerAddress: string | null = null;
  let onChainOk = false;

  try {
    const [owner, agentWallet] = await Promise.all([
      viemClient
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "ownerOf",
          args: [AGENT_ID],
        })
        .catch(() => null),
      viemClient
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "getAgentWallet",
          args: [AGENT_ID],
        })
        .catch(() => null),
    ]);

    ownerAddress = owner as string | null;
    walletAddress = (agentWallet as string | null) || ownerAddress;
    onChainOk = ownerAddress !== null;
  } catch (err) {
    console.error("[api/x402/wallet] On-chain read failed:", err instanceof Error ? err.message : err);
  }

  // ---- Check bridge status ----
  const { data: bridgeSession } = await supabase
    .from("agent_sessions")
    .select("agent_id, status, last_heartbeat")
    .eq("agent_id", "bridge")
    .maybeSingle();

  // ---- Get payment stats ----
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
      configured: onChainOk,
      address: walletAddress,
      owner: ownerAddress,
      agentId: AGENT_ID.toString(),
      network: "eip155:8453",
      budgetLimit: process.env.X402_BUDGET_LIMIT || "1.00",
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
