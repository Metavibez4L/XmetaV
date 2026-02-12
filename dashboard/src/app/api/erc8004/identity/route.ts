import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const runtime = "nodejs";

// ---- Contract constants ----

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

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

const client = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * GET /api/erc8004/identity?agentId=<id>
 * Read on-chain agent identity and reputation from ERC-8004 on Base mainnet.
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
    // Read identity data
    const [owner, agentWallet, tokenURI] = await Promise.all([
      client
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "ownerOf",
          args: [agentId],
        })
        .catch(() => null),
      client
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "getAgentWallet",
          args: [agentId],
        })
        .catch(() => null),
      client
        .readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_ABI,
          functionName: "tokenURI",
          args: [agentId],
        })
        .catch(() => null),
    ]);

    const registered = owner !== null;

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
      registration: registrationData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read on-chain identity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
