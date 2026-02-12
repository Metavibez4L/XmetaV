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

const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

/**
 * GET /api/token?wallet=0x...
 *
 * Returns token info and the caller's tier.
 * If no wallet param, returns general token info + full tier table.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");

  try {
    // Fetch on-chain token data
    const [totalSupplyRaw, symbol, name, decimals] = await Promise.all([
      client.readContract({
        address: XMETAV_TOKEN.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      }),
      client.readContract({
        address: XMETAV_TOKEN.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "symbol",
      }),
      client.readContract({
        address: XMETAV_TOKEN.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "name",
      }),
      client.readContract({
        address: XMETAV_TOKEN.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
    ]);

    const totalSupply = formatTokenBalance(totalSupplyRaw as bigint);

    const response: Record<string, unknown> = {
      token: {
        name,
        symbol,
        decimals: Number(decimals),
        address: XMETAV_TOKEN.address,
        network: XMETAV_TOKEN.network,
        chainId: XMETAV_TOKEN.chainId,
        totalSupply,
      },
      tiers: TIERS.map((t) => ({
        name: t.name,
        minBalance: t.minBalance,
        discount: `${(t.discount * 100).toFixed(0)}%`,
        dailyLimit: `$${t.dailyLimit}`,
        color: t.color,
      })),
    };

    // If a wallet address is provided, look up its balance and tier
    if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      const balanceRaw = (await client.readContract({
        address: XMETAV_TOKEN.address as `0x${string}`,
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
