/**
 * XmetaV Price Oracle — Chainlink + Uniswap V3 Quoter
 *
 * Real on-chain price feeds for trade execution endpoints.
 * Tiered fallback:
 *   1. Chainlink price feeds (most reliable, ~20s heartbeat on Base)
 *   2. Uniswap V3 Quoter (on-chain TWAP-ish spot quote)
 *   3. Static fallback (last resort — stale but non-zero)
 */

import { parseAbi, type PublicClient } from "viem";

/* ── Chainlink Feed Addresses (Base Mainnet) ──────────────── */

const CHAINLINK_FEEDS: Record<string, `0x${string}`> = {
  "ETH/USD":   "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  "USDC/USD":  "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
  "cbETH/USD": "0xd7818272B9e248357d13057AAb0B417aF31E817d",
  "DAI/USD":   "0x591e79239a7d679378eC8c847e5038150364C78F",
  "AERO/USD":  "0x4EC5970fC728C5f65ba413992CD5aD3c7cBdc7aB",
};

// Token address → feed key mapping
const TOKEN_TO_FEED: Record<string, string> = {
  "0x4200000000000000000000000000000000000006": "ETH/USD",     // WETH
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": "USDC/USD",   // USDC
  "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": "cbETH/USD",  // cbETH
  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": "DAI/USD",    // DAI
  "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA": "USDC/USD",   // USDbC (pegged to USDC)
  "0x940181a94A35A4569E4529A3CDfB74e38FD98631": "AERO/USD",   // AERO
};

/* ── Uniswap V3 Quoter V2 (Base Mainnet) ─────────────────── */

const QUOTER_V2 = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/* ── ABIs ─────────────────────────────────────────────────── */

const CHAINLINK_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

/* ── Static Fallback Prices ───────────────────────────────── */

const STATIC_PRICES: Record<string, number> = {
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": 1.00,     // USDC
  "0x4200000000000000000000000000000000000006": 2800,       // WETH
  "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": 3000,     // cbETH
  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": 1.00,     // DAI
  "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA": 1.00,     // USDbC
  "0x940181a94A35A4569E4529A3CDfB74e38FD98631": 1.50,     // AERO
};

/* ── TTL Cache ────────────────────────────────────────────── */

interface PriceEntry {
  price: number;
  source: "chainlink" | "uniswap-quoter" | "static";
  updatedAt: number;
  feedDecimals?: number;
}

const priceCache = new Map<string, PriceEntry>();
const CACHE_TTL_MS = 30_000; // 30s — Chainlink Base heartbeat is ~20s

/* ── Oracle Class ─────────────────────────────────────────── */

export class PriceOracle {
  private client: PublicClient;

  constructor(client: PublicClient) {
    this.client = client;
  }

  /**
   * Get token price in USD with tiered fallback.
   * Returns { price, source } — source tells you how fresh it is.
   */
  async getPrice(tokenAddress: `0x${string}`): Promise<PriceEntry> {
    const addr = tokenAddress.toLowerCase();

    // Check cache
    const cached = priceCache.get(addr);
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
      return cached;
    }

    // Tier 1: Chainlink
    const feedKey = TOKEN_TO_FEED[tokenAddress];
    if (feedKey) {
      try {
        const entry = await this.fetchChainlink(tokenAddress, feedKey);
        priceCache.set(addr, entry);
        return entry;
      } catch (err) {
        console.warn(`[oracle] Chainlink ${feedKey} failed, falling back to Quoter:`, (err as Error).message);
      }
    }

    // Tier 2: Uniswap V3 Quoter (quote 1 unit → USDC)
    try {
      const entry = await this.fetchUniswapQuote(tokenAddress);
      priceCache.set(addr, entry);
      return entry;
    } catch (err) {
      console.warn(`[oracle] Quoter failed for ${tokenAddress}, using static fallback:`, (err as Error).message);
    }

    // Tier 3: Static fallback
    const staticPrice = STATIC_PRICES[tokenAddress] ?? 1;
    const entry: PriceEntry = {
      price: staticPrice,
      source: "static",
      updatedAt: Date.now(),
    };
    priceCache.set(addr, entry);
    return entry;
  }

  /**
   * Convenience: just the number.
   */
  async getPriceUsd(tokenAddress: `0x${string}`): Promise<number> {
    const entry = await this.getPrice(tokenAddress);
    return entry.price;
  }

  /**
   * Get a Uniswap V3 Quoter quote for amountIn → amountOut.
   * Used for slippage calculations in execute-trade.
   */
  async getQuote(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint,
    feeTier: number = 3000
  ): Promise<{ amountOut: bigint; sqrtPriceX96After: bigint; gasEstimate: bigint }> {
    const result = await this.client.simulateContract({
      address: QUOTER_V2,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn,
        tokenOut,
        amountIn,
        fee: feeTier,
        sqrtPriceLimitX96: BigInt(0),
      }],
    });

    const [amountOut, sqrtPriceX96After, , gasEstimate] = result.result as [bigint, bigint, number, bigint];
    return { amountOut, sqrtPriceX96After, gasEstimate };
  }

  /**
   * Get best quote across multiple fee tiers.
   */
  async getBestQuote(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint,
  ): Promise<{ amountOut: bigint; bestFeeTier: number; gasEstimate: bigint; quotes: Array<{ feeTier: number; amountOut: bigint }> }> {
    const feeTiers = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%
    const quotes: Array<{ feeTier: number; amountOut: bigint; gasEstimate: bigint }> = [];

    for (const feeTier of feeTiers) {
      try {
        const q = await this.getQuote(tokenIn, tokenOut, amountIn, feeTier);
        quotes.push({ feeTier, amountOut: q.amountOut, gasEstimate: q.gasEstimate });
      } catch {
        // Pool may not exist for this fee tier — skip
      }
    }

    if (quotes.length === 0) {
      throw new Error(`No liquidity found for ${tokenIn} → ${tokenOut}`);
    }

    // Best = highest output
    quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
    const best = quotes[0];

    return {
      amountOut: best.amountOut,
      bestFeeTier: best.feeTier,
      gasEstimate: best.gasEstimate,
      quotes: quotes.map(q => ({ feeTier: q.feeTier, amountOut: q.amountOut })),
    };
  }

  /* ── Private ────────────────────────────────────────────── */

  private async fetchChainlink(tokenAddress: string, feedKey: string): Promise<PriceEntry> {
    const feedAddress = CHAINLINK_FEEDS[feedKey];
    if (!feedAddress) throw new Error(`No Chainlink feed for ${feedKey}`);

    const [roundData, decimals] = await Promise.all([
      this.client.readContract({
        address: feedAddress,
        abi: CHAINLINK_ABI,
        functionName: "latestRoundData",
      }),
      this.client.readContract({
        address: feedAddress,
        abi: CHAINLINK_ABI,
        functionName: "decimals",
      }),
    ]);

    const [, answer, , updatedAt] = roundData as [bigint, bigint, bigint, bigint, bigint];
    const price = Number(answer) / 10 ** Number(decimals);

    // Staleness check: reject if older than 2 hours
    const age = Date.now() / 1000 - Number(updatedAt);
    if (age > 7200) {
      throw new Error(`Chainlink ${feedKey} stale: ${Math.round(age)}s old`);
    }

    return {
      price,
      source: "chainlink",
      updatedAt: Date.now(),
      feedDecimals: Number(decimals),
    };
  }

  private async fetchUniswapQuote(tokenAddress: `0x${string}`): Promise<PriceEntry> {
    // Stablecoins: just return 1.0
    if (
      tokenAddress === USDC_ADDRESS ||
      tokenAddress === "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA" || // USDbC
      tokenAddress === "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"    // DAI
    ) {
      return { price: 1.0, source: "uniswap-quoter", updatedAt: Date.now() };
    }

    // Quote 1 unit of token → USDC
    const tokenDecimals = this.getDecimals(tokenAddress);
    const oneUnit = BigInt(10 ** tokenDecimals);

    const result = await this.client.simulateContract({
      address: QUOTER_V2,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn: tokenAddress,
        tokenOut: USDC_ADDRESS,
        amountIn: oneUnit,
        fee: 3000,
        sqrtPriceLimitX96: BigInt(0),
      }],
    });

    const [amountOut] = result.result as [bigint, bigint, number, bigint];
    const price = Number(amountOut) / 1e6; // USDC has 6 decimals

    return {
      price,
      source: "uniswap-quoter",
      updatedAt: Date.now(),
    };
  }

  private getDecimals(tokenAddress: string): number {
    const map: Record<string, number> = {
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": 6,   // USDC
      "0x4200000000000000000000000000000000000006": 18,    // WETH
      "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": 18,  // cbETH
      "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": 18,  // DAI
      "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA": 6,   // USDbC
      "0x940181a94A35A4569E4529A3CDfB74e38FD98631": 18,  // AERO
    };
    return map[tokenAddress] ?? 18;
  }

  /**
   * Clear all cached prices.
   */
  clearCache() {
    priceCache.clear();
  }
}

/* ── Singleton ────────────────────────────────────────────── */

let _oracle: PriceOracle | null = null;

export function getOracle(client?: PublicClient): PriceOracle {
  if (!_oracle) {
    if (!client) throw new Error("PriceOracle requires a PublicClient on first initialization");
    _oracle = new PriceOracle(client);
  }
  return _oracle;
}
