import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
  XMETAV_TOKEN,
  ERC20_ABI,
  TIERS,
  getTier,
  formatTokenBalance,
} from "@/lib/token-tiers";

export const runtime = "nodejs";

const tokenAddress = XMETAV_TOKEN.address as `0x${string}`;

// Use batch-enabled transport so multicall collapses into fewer RPC calls
const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs", { timeout: 10_000 }),
  batch: { multicall: true },
});

// These are immutable on-chain values — no need to fetch every request
const STATIC_TOKEN = {
  name: "XmetaV",
  symbol: "XMETAV",
  decimals: 18,
  address: XMETAV_TOKEN.address,
  network: XMETAV_TOKEN.network,
  chainId: XMETAV_TOKEN.chainId,
  totalSupply: 1_000_000_000, // 1B fixed supply
};

/**
 * GET /api/token?wallet=0x...
 *
 * Returns token info and the caller's tier.
 * If no wallet param, returns general token info + full tier table.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");

  try {
    const response: Record<string, unknown> = {
      token: STATIC_TOKEN,
      tiers: TIERS.map((t) => ({
        name: t.name,
        minBalance: t.minBalance,
        discount: `${(t.discount * 100).toFixed(0)}%`,
        dailyLimit: `$${t.dailyLimit}`,
        color: t.color,
      })),
    };

    // If a wallet address is provided, make a single RPC call for balance
    if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      const balanceRaw = (await client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet as `0x${string}`],
      })) as bigint;

      const balance = formatTokenBalance(balanceRaw);
      const tier = getTier(balance);

      response.wallet = {
        address: wallet,
        balance,
        balanceRaw: balanceRaw.toString(),
        tier: tier.name,
        discount: `${(tier.discount * 100).toFixed(0)}%`,
        dailyLimit: `$${tier.dailyLimit}`,
        tierColor: tier.color,
      };
    }

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch token data";
    console.error("[api/token]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
