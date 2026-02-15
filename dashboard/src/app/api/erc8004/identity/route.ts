import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// ---- Contract constants ----

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;
const ANCHOR_CONTRACT = (process.env.ANCHOR_CONTRACT_ADDRESS || "") as `0x${string}`;

const ANCHOR_ABI = [
  {
    name: "anchorCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Minimal ABIs — only the read functions we need
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
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "getVersion",
    type: "function",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const REPUTATION_ABI = [
  {
    name: "getSummary",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

const viemClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs", { timeout: 10_000 }),
});

/**
 * GET /api/erc8004/identity?agentId=<id>
 * Read on-chain agent identity, reputation, and core stats from ERC-8004 on Base mainnet.
 */
export async function GET(request: NextRequest) {
  const agentIdParam = request.nextUrl.searchParams.get("agentId");

  if (!agentIdParam) {
    return NextResponse.json(
      { error: "agentId query parameter is required" },
      { status: 400 }
    );
  }

  const agentId = BigInt(agentIdParam);

  try {
    // Read identity data + reputation in parallel
    const [owner, agentWallet, tokenURI, reputationResult] = await Promise.all([
      viemClient
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "ownerOf",
          args: [agentId],
        })
        .catch(() => null),
      viemClient
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "getAgentWallet",
          args: [agentId],
        })
        .catch(() => null),
      viemClient
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "tokenURI",
          args: [agentId],
        })
        .catch(() => null),
      viemClient
        .readContract({
          address: REPUTATION_REGISTRY,
          abi: REPUTATION_ABI,
          functionName: "getSummary",
          args: [agentId, [], "", ""],
        })
        .catch(() => null),
    ]);

    const registered = owner !== null;

    // Parse reputation result
    let reputation = null;
    if (reputationResult) {
      const [count, summaryValue, decimals] = reputationResult as [bigint, bigint, number];
      reputation = {
        count: Number(count),
        summaryValue: Number(summaryValue),
        decimals: Number(decimals),
        displayScore: Number(decimals) > 0
          ? (Number(summaryValue) / Math.pow(10, Number(decimals))).toFixed(2)
          : String(Number(summaryValue)),
      };
    }

    // Resolve registration metadata if tokenURI is an HTTP(S) URL
    let registrationData = null;
    if (tokenURI && typeof tokenURI === "string" && tokenURI.startsWith("http")) {
      try {
        const res = await fetch(tokenURI, { signal: AbortSignal.timeout(5000) });
        if (res.ok) registrationData = await res.json();
      } catch {
        // Metadata fetch failed — not critical
      }
    }

    // ---- Supabase stats (x402 + soul + crystals) ----
    let x402Stats = null;
    let soulStats = null;
    let crystalStats = null;
    try {
      const supabase = createAdminClient();

      // Run all Supabase queries in parallel
      // Also read on-chain anchor count in parallel
      const onChainAnchorCountP = ANCHOR_CONTRACT
        ? viemClient
            .readContract({
              address: ANCHOR_CONTRACT,
              abi: ANCHOR_ABI,
              functionName: "anchorCount",
              args: [agentId],
            })
            .then((c) => Number(c))
            .catch(() => 0)
        : Promise.resolve(0);

      const [paymentsRes, memoryRes, assocRes, dreamsRes, anchorsRes, crystalsRes, equippedRes, onChainAnchorCount] =
        await Promise.all([
          supabase.from("x402_payments").select("amount, status, created_at").eq("status", "completed"),
          supabase.from("agent_memory").select("id", { count: "exact", head: true }),
          supabase.from("memory_associations").select("id", { count: "exact", head: true }),
          supabase.from("dream_insights").select("id, category, confidence, created_at").order("created_at", { ascending: false }).limit(5),
          supabase.from("agent_memory").select("id", { count: "exact", head: true }).eq("source", "anchor"),
          supabase.from("memory_crystals").select("id, xp, star_rating, is_legendary", { count: "exact" }),
          supabase.from("memory_crystals").select("id", { count: "exact", head: true }).not("equipped_by", "is", null),
          onChainAnchorCountP,
        ]);

      // x402 stats
      const payments = paymentsRes.data || [];
      const totalSpend = payments.reduce(
        (sum: number, p: { amount?: string }) => sum + parseFloat(p.amount || "0"),
        0
      );
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayPayments = payments.filter(
        (p: { created_at: string }) => new Date(p.created_at) >= todayStart
      );
      const todaySpend = todayPayments.reduce(
        (sum: number, p: { amount?: string }) => sum + parseFloat(p.amount || "0"),
        0
      );
      x402Stats = {
        totalSpend: totalSpend.toFixed(4),
        todaySpend: todaySpend.toFixed(4),
        paymentCount: payments.length,
        currency: "USDC",
        network: "eip155:8453",
        budgetLimit: process.env.X402_BUDGET_LIMIT || "1.00",
      };

      // Soul stats
      const crystalRows = crystalsRes.data || [];
      const totalXP = crystalRows.reduce((sum: number, c: { xp?: number }) => sum + (c.xp || 0), 0);
      const legendaryCount = crystalRows.filter((c: { is_legendary?: boolean }) => c.is_legendary).length;
      const avgStars = crystalRows.length > 0
        ? (crystalRows.reduce((sum: number, c: { star_rating?: number }) => sum + (c.star_rating || 1), 0) / crystalRows.length).toFixed(1)
        : "0";

      const supabaseAnchorCount = anchorsRes.count || 0;
      soulStats = {
        totalMemories: memoryRes.count || 0,
        totalAssociations: assocRes.count || 0,
        totalAnchors: supabaseAnchorCount,
        onChainAnchors: onChainAnchorCount,
        anchorsSynced: supabaseAnchorCount === onChainAnchorCount,
        recentDreams: (dreamsRes.data || []).map((d: { category: string; confidence: number; created_at: string }) => ({
          category: d.category,
          confidence: d.confidence,
          created_at: d.created_at,
        })),
        dreamCount: dreamsRes.data?.length || 0,
      };

      crystalStats = {
        totalCrystals: crystalsRes.count || 0,
        totalXP,
        equippedCount: equippedRes.count || 0,
        legendaryCount,
        avgStars,
      };
    } catch {
      // Supabase read failed — not critical for identity
    }

    return NextResponse.json({
      identity: {
        agentId: agentIdParam,
        name: registrationData?.name || "XmetaV",
        owner: owner || null,
        agentWallet: agentWallet || null,
        tokenURI: tokenURI || null,
        registered,
        network: "eip155:8453",
        registryAddress: IDENTITY_REGISTRY,
        reputationAddress: REPUTATION_REGISTRY,
        basescanUrl: registered
          ? `https://basescan.org/token/${IDENTITY_REGISTRY}?a=${agentIdParam}`
          : null,
      },
      reputation,
      registration: registrationData,
      x402: x402Stats,
      soul: soulStats,
      crystals: crystalStats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read on-chain identity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
