import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const ANCHOR_CONTRACT = (process.env.ANCHOR_CONTRACT_ADDRESS || "") as `0x${string}`;
const AGENT_ID = Number(process.env.ERC8004_AGENT_ID || "16905");

const ANCHOR_ABI = [
  {
    name: "anchorCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getAnchors",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "from", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "contentHash", type: "bytes32" },
          { name: "previousAnchor", type: "bytes32" },
          { name: "category", type: "uint8" },
        ],
      },
    ],
  },
] as const satisfies readonly Record<string, unknown>[];

const viemClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs", { timeout: 10_000 }),
});

const CATEGORY_NAMES = ["milestone", "decision", "incident"] as const;

/**
 * GET /api/anchors?agentId=<id>&from=0&count=50
 *
 * Returns:
 *  - supabaseAnchors: anchor records from Supabase (with IPFS CID + TX hash)
 *  - onChainCount: anchor count from Base contract
 *  - supabaseCount: anchor count from Supabase
 *  - synced: whether the two counts match
 *  - onChainAnchors: (if contract configured) raw on-chain anchor structs
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const agentIdParam = request.nextUrl.searchParams.get("agentId") || String(AGENT_ID);
  const from = Number(request.nextUrl.searchParams.get("from") || "0");
  const count = Math.min(Number(request.nextUrl.searchParams.get("count") || "50"), 100);
  const agentId = BigInt(agentIdParam);

  try {
    // Read on-chain + Supabase in parallel
    const supabase = createAdminClient();

    const [onChainCountResult, supabaseRes] = await Promise.all([
      ANCHOR_CONTRACT
        ? viemClient
            .readContract({
              address: ANCHOR_CONTRACT,
              abi: ANCHOR_ABI,
              functionName: "anchorCount",
              args: [agentId],
            })
            .then((c) => Number(c))
            .catch(() => 0)
        : Promise.resolve(0),
      supabase
        .from("agent_memory")
        .select("id, agent_id, content, created_at", { count: "exact" })
        .eq("source", "anchor")
        .order("created_at", { ascending: true })
        .range(from, from + count - 1),
    ]);

    const supabaseAnchors = (supabaseRes.data || []).map((row) => {
      const txMatch = row.content.match(/tx:\s*(0x[a-fA-F0-9]+)/);
      const ipfsMatch = row.content.match(/ipfs:\/\/(\w+)/);
      return {
        id: row.id,
        agent_id: row.agent_id,
        content: row.content,
        created_at: row.created_at,
        txHash: txMatch?.[1] || null,
        ipfsCid: ipfsMatch?.[1] || null,
        basescanUrl: txMatch?.[1] ? `https://basescan.org/tx/${txMatch[1]}` : null,
        ipfsUrl: ipfsMatch?.[1]
          ? `https://gateway.pinata.cloud/ipfs/${ipfsMatch[1]}`
          : null,
      };
    });

    const supabaseCount = supabaseRes.count || supabaseAnchors.length;

    // Read on-chain anchors if contract is configured
    let onChainAnchors: Array<{
      timestamp: number;
      contentHash: string;
      previousAnchor: string;
      category: string;
      index: number;
    }> = [];

    if (ANCHOR_CONTRACT && onChainCountResult > 0) {
      try {
        const readCount = Math.min(count, onChainCountResult - from);
        if (readCount > 0) {
          const raw = await viemClient.readContract({
            address: ANCHOR_CONTRACT,
            abi: ANCHOR_ABI,
            functionName: "getAnchors",
            args: [agentId, BigInt(from), BigInt(readCount)],
          });

          onChainAnchors = (
            raw as Array<{
              timestamp: bigint;
              contentHash: string;
              previousAnchor: string;
              category: number;
            }>
          ).map((a, i) => ({
            timestamp: Number(a.timestamp),
            contentHash: a.contentHash,
            previousAnchor: a.previousAnchor,
            category: CATEGORY_NAMES[a.category] || `unknown(${a.category})`,
            index: from + i,
          }));
        }
      } catch {
        // On-chain read failed — only return Supabase data
      }
    }

    return NextResponse.json({
      agentId: agentIdParam,
      onChainCount: onChainCountResult,
      supabaseCount,
      synced: supabaseCount === onChainCountResult,
      syncDelta: onChainCountResult - supabaseCount,
      contractConfigured: !!ANCHOR_CONTRACT,
      contractAddress: ANCHOR_CONTRACT || null,
      supabaseAnchors,
      onChainAnchors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Anchor fetch failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
