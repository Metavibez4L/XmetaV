/**
 * XmetaV Trade Execution Routes
 *
 * x402-gated endpoints for DeFi trade execution, portfolio rebalancing,
 * arbitrage scanning/execution, and yield optimization.
 *
 * Architecture: CUSTODY-SAFE
 *   - We generate unsigned transaction bundles
 *   - Users sign & broadcast with their own wallets
 *   - We never hold funds or private keys
 *
 * Fee model: % of capital, not flat fees
 *   - A $10K trade pays $50 (0.5%), not $0.10
 *   - Whale tiers get lower % but higher absolute
 *   - XMETAV token holders get 5-75% off
 */

import { Router, Request, Response } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient, http, encodeFunctionData, parseAbi } from "viem";
import { base } from "viem/chains";
import {
  calculateTradeFee,
  TRADE_FEE_SCHEDULES,
  projectTradeRevenue,
  FeeResult,
} from "./trade-fee-calculator.js";
import { getOracle, PriceOracle } from "./price-oracle.js";

// Re-export for server integration
export { TRADE_FEE_SCHEDULES } from "./trade-fee-calculator.js";

/* ── Setup ───────────────────────────────────────────────────── */

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const viemClient = createPublicClient({
  chain: base,
  transport: http(
    process.env.BASE_RPC_URL ||
      "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs"
  ),
});

/* ── Common ABIs ─────────────────────────────────────────────── */

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

// Uniswap V3 Router (Base Mainnet)
const UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as const;
const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);

// Well-known Base tokens
const BASE_TOKENS: Record<string, { address: `0x${string}`; decimals: number; symbol: string }> = {
  USDC:  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6,  symbol: "USDC" },
  WETH:  { address: "0x4200000000000000000000000000000000000006", decimals: 18, symbol: "WETH" },
  cbETH: { address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18, symbol: "cbETH" },
  DAI:   { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, symbol: "DAI" },
  USDbC: { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6,  symbol: "USDbC" },
  AERO:  { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18, symbol: "AERO" },
};

/* ── Helpers ──────────────────────────────────────────────────── */

interface TradeLog {
  endpoint: string;
  trade_type: string;
  trade_value_usd: number;
  fee_usd: number;
  fee_tier: string;
  token_in?: string;
  token_out?: string;
  user_address?: string;
  status: string;
  metadata?: Record<string, unknown>;
}

async function logTrade(trade: TradeLog) {
  if (!supabase) return;
  try {
    // Log to x402_payments for unified payment tracking
    const { data: payment } = await supabase.from("x402_payments").insert({
      endpoint: trade.endpoint,
      amount: `$${trade.fee_usd.toFixed(6)}`,
      agent_id: "trade-engine",
      payer_address: trade.user_address || null,
      status: "settled",
      metadata: {
        trade_type: trade.trade_type,
        trade_value_usd: trade.trade_value_usd,
        fee_tier: trade.fee_tier,
        token_in: trade.token_in,
        token_out: trade.token_out,
        ...trade.metadata,
      },
    }).select("id").single();

    // Also log to trade_executions for structured trade analytics
    await supabase.from("trade_executions").insert({
      payment_id: payment?.id || null,
      trade_type: trade.trade_type === "swap" ? "swap"
        : trade.trade_type === "rebalance" ? "rebalance"
        : trade.trade_type === "arbitrage" ? "arbitrage"
        : trade.trade_type === "yield-deposit" ? "yield-deposit"
        : "swap",
      token_in: trade.token_in || "unknown",
      token_out: trade.token_out || null,
      amount_in: String(trade.metadata?.amountIn || "0"),
      trade_value_usd: trade.trade_value_usd || 0,
      fee_usd: trade.fee_usd || 0,
      fee_tier: trade.fee_tier || null,
      fee_percent: trade.metadata?.feePercent || null,
      protocol: trade.metadata?.protocol || null,
      caller_address: trade.user_address || null,
      status: "simulated",
      metadata: trade.metadata || {},
    });
  } catch { /* best effort */ }
}

function resolveToken(symbol: string): { address: `0x${string}`; decimals: number; symbol: string } | null {
  const upper = symbol.toUpperCase();
  return BASE_TOKENS[upper] || null;
}

/* ── DeFi Llama Yield Fetcher ─────────────────────────────── */

interface YieldPool {
  protocol: string;
  type: string;
  apy: number;
  tvlUsd: number;
  risk: string;
  token: string;
  chain: string;
  rewards: string[];
  projectedYield30d: number;
  poolId?: string;
  impermanentLossRisk?: string;
}

// Cache DeFi Llama responses (5 min TTL)
let yieldCache: { data: any[]; updatedAt: number } | null = null;
const YIELD_CACHE_TTL = 300_000;

async function fetchDefiLlamaYields(token: string): Promise<YieldPool[]> {
  // Check cache
  if (yieldCache && Date.now() - yieldCache.updatedAt < YIELD_CACHE_TTL) {
    return filterYieldPools(yieldCache.data, token);
  }

  try {
    const res = await fetch("https://yields.llama.fi/pools");
    if (!res.ok) throw new Error(`DeFi Llama returned ${res.status}`);
    const json = await res.json();
    yieldCache = { data: json.data || [], updatedAt: Date.now() };
    return filterYieldPools(yieldCache.data, token);
  } catch (err) {
    console.warn("[yield] DeFi Llama fetch failed:", (err as Error).message);
    return []; // Will fall back to protocol-specific data
  }
}

function filterYieldPools(pools: any[], token: string): YieldPool[] {
  const tokenUpper = token.toUpperCase();
  // Filter for Base chain pools containing our token
  return pools
    .filter((p: any) =>
      p.chain === "Base" &&
      p.apy > 0 &&
      p.tvlUsd > 50_000 && // Minimum $50K TVL
      (p.symbol?.toUpperCase().includes(tokenUpper) || false)
    )
    .slice(0, 20) // Top 20 by DeFi Llama ordering
    .map((p: any) => {
      const isLP = p.symbol?.includes("-") || p.symbol?.includes("/");
      return {
        protocol: p.project || "Unknown",
        type: isLP ? "liquidity_pool" : "lending",
        apy: Math.round(p.apy * 100) / 100,
        tvlUsd: Math.round(p.tvlUsd),
        risk: p.tvlUsd > 100_000_000 ? "low" : p.tvlUsd > 10_000_000 ? "medium" : "medium-high",
        token: p.symbol || token,
        chain: "Base",
        rewards: p.rewardTokens || [],
        projectedYield30d: 0, // Calculated by caller
        poolId: p.pool || undefined,
        impermanentLossRisk: isLP ? "moderate" : undefined,
      };
    });
}

/* ── Protocol Deposit ABIs (Base Mainnet) ─────────────────── */

// Aave V3 Pool — supply()
const AAVE_V3_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as const;
const AAVE_POOL_ABI = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
]);

// Compound V3 (Comet) — supply()
const COMPOUND_V3_COMET = "0x46e6b214b524310239732D51387075E0e70970bf" as const;
const COMPOUND_COMET_ABI = parseAbi([
  "function supply(address asset, uint256 amount) external",
]);

// Moonwell — mint() (Compound-fork style)
const MOONWELL_MUSDC = "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22" as const;
const MOONWELL_ABI = parseAbi([
  "function mint(uint256 mintAmount) external returns (uint256)",
]);

// Aerodrome Router — addLiquidity()
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97C74d54e5b1Beb874E43" as const;
const AERODROME_ROUTER_ABI = parseAbi([
  "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
]);

// Morpho Blue — supply()
const MORPHO_BLUE = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as const;
const MORPHO_ABI = parseAbi([
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalfOf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
]);

/* ── Router ──────────────────────────────────────────────────── */

export function createTradeRouter(
  logPaymentFn: (endpoint: string, amount: string, req: Request) => void,
  getCallerTierFn: (callerAddress?: string) => Promise<{ discount: number; name: string }>,
  oracle?: PriceOracle
): Router {
  const router = Router();
  const priceOracle = oracle || getOracle(viemClient as any);

  /* ──────────────────────────────────────────────────────────
   * POST /execute-trade
   *
   * Generate an unsigned swap transaction bundle.
   * Fee: 0.5% of trade size (min $0.50)
   *
   * Body: {
   *   tokenIn: "USDC",
   *   tokenOut: "WETH",
   *   amountIn: "1000",         // human-readable amount
   *   slippageBps: 50,          // 0.5% default
   *   recipient?: "0x..."       // defaults to caller
   * }
   *
   * Returns unsigned tx bundle for user to sign & broadcast.
   * ──────────────────────────────────────────────────────── */
  router.post("/execute-trade", async (req: Request, res: Response) => {
    const { tokenIn, tokenOut, amountIn, slippageBps, recipient } = req.body;

    if (!tokenIn || !tokenOut || !amountIn) {
      res.status(400).json({ error: "tokenIn, tokenOut, and amountIn are required" });
      return;
    }

    const inToken = resolveToken(tokenIn);
    const outToken = resolveToken(tokenOut);
    if (!inToken) { res.status(400).json({ error: `Unknown tokenIn: ${tokenIn}. Supported: ${Object.keys(BASE_TOKENS).join(", ")}` }); return; }
    if (!outToken) { res.status(400).json({ error: `Unknown tokenOut: ${tokenOut}. Supported: ${Object.keys(BASE_TOKENS).join(", ")}` }); return; }

    const amount = parseFloat(amountIn);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: "amountIn must be a positive number" });
      return;
    }

    // Calculate trade value in USD using Chainlink oracle
    const tokenPrice = await priceOracle.getPriceUsd(inToken.address);
    const tradeValueUsd = amount * tokenPrice;

    // Calculate dynamic fee
    const callerAddress = req.headers["x-caller-address"] as string | undefined;
    const tier = await getCallerTierFn(callerAddress);
    const fee = calculateTradeFee("/execute-trade", tradeValueUsd, tier.discount);

    // Log payment
    logPaymentFn("/execute-trade", `$${fee.feeUsd.toFixed(6)}`, req);

    // Generate unsigned transaction bundle
    const amountRaw = BigInt(Math.floor(amount * 10 ** inToken.decimals));
    const slippage = slippageBps || 50; // 0.5% default

    // Get real quote from Uniswap V3 Quoter for amountOutMinimum
    let minAmountOut = BigInt(0);
    let bestFeeTier = 3000;
    let quotedAmountOut: bigint | null = null;
    let priceSource = "static";

    try {
      const quoteResult = await priceOracle.getBestQuote(inToken.address, outToken.address, amountRaw);
      quotedAmountOut = quoteResult.amountOut;
      bestFeeTier = quoteResult.bestFeeTier;
      // Apply slippage tolerance: minOut = quotedOut * (1 - slippage/10000)
      minAmountOut = quotedAmountOut - (quotedAmountOut * BigInt(slippage) / BigInt(10000));
      priceSource = "uniswap-quoter";
    } catch (err) {
      console.warn(`[trade] Quoter failed for ${inToken.symbol}→${outToken.symbol}, using zero floor:`, (err as Error).message);
      // Zero floor means the tx will go through but user is unprotected from slippage
      // This is a last resort — most pairs should have quoter liquidity
    }

    const recipientAddr = (recipient || callerAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`;

    // Approval tx
    const approveTxData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [UNISWAP_ROUTER, amountRaw],
    });

    // Swap tx (using best fee tier from Quoter)
    const swapTxData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: inToken.address,
        tokenOut: outToken.address,
        fee: bestFeeTier,
        recipient: recipientAddr,
        amountIn: amountRaw,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: BigInt(0),
      }],
    });

    const txBundle = {
      transactions: [
        {
          to: inToken.address,
          data: approveTxData,
          value: "0",
          description: `Approve ${amount} ${inToken.symbol} for Uniswap Router`,
        },
        {
          to: UNISWAP_ROUTER,
          data: swapTxData,
          value: "0",
          description: `Swap ${amount} ${inToken.symbol} → ${outToken.symbol} via Uniswap V3 (${bestFeeTier / 10000}% pool)`,
        },
      ],
      chain: "eip155:8453",
      note: "Sign both transactions in order. The approval must be confirmed before the swap.",
    };

    // Log trade
    await logTrade({
      endpoint: "/execute-trade",
      trade_type: "swap",
      trade_value_usd: tradeValueUsd,
      fee_usd: fee.feeUsd,
      fee_tier: fee.tier,
      token_in: inToken.symbol,
      token_out: outToken.symbol,
      user_address: callerAddress,
      status: "bundle_generated",
      metadata: { amountIn: amount, slippageBps: slippage, bestFeeTier, priceSource },
    });

    res.json({
      trade: {
        type: "swap",
        tokenIn: inToken.symbol,
        tokenOut: outToken.symbol,
        amountIn: amount,
        tradeValueUsd: Math.round(tradeValueUsd * 100) / 100,
        tokenPriceUsd: Math.round(tokenPrice * 100) / 100,
        priceSource,
        slippageBps: slippage,
        recipient: recipientAddr,
      },
      quote: quotedAmountOut !== null ? {
        expectedAmountOut: quotedAmountOut.toString(),
        minAmountOut: minAmountOut.toString(),
        bestPoolFeeTier: bestFeeTier,
        bestPoolFeePct: `${bestFeeTier / 10000}%`,
      } : null,
      fee,
      txBundle,
      timestamp: new Date().toISOString(),
    });
  });

  /* ──────────────────────────────────────────────────────────
   * POST /rebalance-portfolio
   *
   * Analyze current holdings and generate rebalance tx bundle.
   * Fee: $2.00 flat + 0.3% of portfolio value
   *
   * Body: {
   *   walletAddress: "0x...",
   *   targetAllocation: {
   *     "USDC": 30,    // 30%
   *     "WETH": 50,    // 50%
   *     "cbETH": 20    // 20%
   *   }
   * }
   * ──────────────────────────────────────────────────────── */
  router.post("/rebalance-portfolio", async (req: Request, res: Response) => {
    const { walletAddress, targetAllocation } = req.body;

    if (!walletAddress || !targetAllocation) {
      res.status(400).json({ error: "walletAddress and targetAllocation are required" });
      return;
    }

    // Validate allocation sums to 100%
    const totalAlloc = Object.values(targetAllocation as Record<string, number>).reduce((s: number, v: number) => s + v, 0);
    if (Math.abs(totalAlloc - 100) > 0.1) {
      res.status(400).json({ error: `targetAllocation must sum to 100% (got ${totalAlloc}%)` });
      return;
    }

    // Fetch current balances for each token
    const holdings: Array<{ symbol: string; address: `0x${string}`; balance: number; valueUsd: number; currentPct: number }> = [];
    let portfolioValueUsd = 0;

    for (const symbol of Object.keys(targetAllocation)) {
      const token = resolveToken(symbol);
      if (!token) continue;

      try {
        const rawBalance = await viemClient.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [walletAddress as `0x${string}`],
        });
        const balance = Number(rawBalance) / 10 ** token.decimals;
        const price = await priceOracle.getPriceUsd(token.address);
        const valueUsd = balance * price;
        portfolioValueUsd += valueUsd;
        holdings.push({ symbol, address: token.address, balance, valueUsd, currentPct: 0 });
      } catch {
        holdings.push({ symbol, address: token.address, balance: 0, valueUsd: 0, currentPct: 0 });
      }
    }

    // Calculate current %
    for (const h of holdings) {
      h.currentPct = portfolioValueUsd > 0 ? (h.valueUsd / portfolioValueUsd) * 100 : 0;
    }

    // Calculate fee
    const callerAddress = req.headers["x-caller-address"] as string | undefined;
    const tier = await getCallerTierFn(callerAddress);
    const fee = calculateTradeFee("/rebalance-portfolio", portfolioValueUsd, tier.discount);

    logPaymentFn("/rebalance-portfolio", `$${fee.feeUsd.toFixed(6)}`, req);

    // Generate rebalance instructions (which trades to make)
    const rebalanceOps: Array<{
      action: "buy" | "sell";
      symbol: string;
      currentPct: number;
      targetPct: number;
      deltaUsd: number;
      deltaTokens: number;
    }> = [];

    for (const h of holdings) {
      const target = (targetAllocation as Record<string, number>)[h.symbol] || 0;
      const targetUsd = (target / 100) * portfolioValueUsd;
      const deltaUsd = targetUsd - h.valueUsd;

      if (Math.abs(deltaUsd) > 1) { // Skip trivial adjustments
        const price = await priceOracle.getPriceUsd(h.address);
        rebalanceOps.push({
          action: deltaUsd > 0 ? "buy" : "sell",
          symbol: h.symbol,
          currentPct: Math.round(h.currentPct * 100) / 100,
          targetPct: target,
          deltaUsd: Math.round(deltaUsd * 100) / 100,
          deltaTokens: Math.round((Math.abs(deltaUsd) / price) * 1e6) / 1e6,
        });
      }
    }

    await logTrade({
      endpoint: "/rebalance-portfolio",
      trade_type: "rebalance",
      trade_value_usd: portfolioValueUsd,
      fee_usd: fee.feeUsd,
      fee_tier: fee.tier,
      user_address: callerAddress || walletAddress,
      status: "analysis_complete",
      metadata: { holdings: holdings.length, rebalanceOps: rebalanceOps.length },
    });

    res.json({
      portfolio: {
        walletAddress,
        totalValueUsd: Math.round(portfolioValueUsd * 100) / 100,
        holdings: holdings.map(h => ({
          symbol: h.symbol,
          balance: h.balance,
          valueUsd: Math.round(h.valueUsd * 100) / 100,
          currentPct: Math.round(h.currentPct * 100) / 100,
          targetPct: (targetAllocation as Record<string, number>)[h.symbol],
        })),
      },
      rebalanceOps,
      fee,
      note: "Review rebalance operations. Execute individual swaps via POST /execute-trade for each operation.",
      timestamp: new Date().toISOString(),
    });
  });

  /* ──────────────────────────────────────────────────────────
   * GET /arb-opportunity
   *
   * Scan for cross-DEX/cross-pool arbitrage opportunities.
   * Fee: $0.25 per scan (flat)
   *
   * Query: ?tokenA=USDC&tokenB=WETH&minProfitBps=10
   * ──────────────────────────────────────────────────────── */
  router.get("/arb-opportunity", async (req: Request, res: Response) => {
    const tokenA = (req.query.tokenA as string) || "USDC";
    const tokenB = (req.query.tokenB as string) || "WETH";
    const minProfitBps = parseInt(req.query.minProfitBps as string) || 10;

    logPaymentFn("/arb-opportunity", "$0.25", req);

    const inToken = resolveToken(tokenA);
    const outToken = resolveToken(tokenB);
    if (!inToken || !outToken) {
      res.status(400).json({ error: "Invalid token pair" });
      return;
    }

    // Real arb scanner: query Uniswap V3 Quoter across fee tiers
    // and compare effective prices to find cross-pool spreads
    const opportunities = [];

    const scanAmountRaw = BigInt(1000) * BigInt(10 ** inToken.decimals); // Quote with 1000 units
    const feeTiers = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

    // Get quotes from each fee tier
    const tierQuotes: Array<{ feeTier: number; amountOut: bigint; effectivePrice: number }> = [];

    for (const feeTier of feeTiers) {
      try {
        const q = await priceOracle.getQuote(inToken.address, outToken.address, scanAmountRaw, feeTier);
        const effectivePrice = Number(q.amountOut) / (1000 * 10 ** outToken.decimals);
        tierQuotes.push({ feeTier, amountOut: q.amountOut, effectivePrice });
      } catch {
        // Pool doesn't exist or has no liquidity for this tier — skip
      }
    }

    if (tierQuotes.length < 2) {
      // Can't find arb with < 2 pools
      res.json({
        scan: { tokenA, tokenB, minProfitBps },
        opportunities: [],
        count: 0,
        fee: { amount: "$0.25", type: "flat" },
        note: `Only ${tierQuotes.length} pool(s) found for ${tokenA}/${tokenB}. Need at least 2 to detect arbitrage.`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Compare all tier pairs for spread
    tierQuotes.sort((a, b) => b.effectivePrice - a.effectivePrice);
    for (let i = 0; i < tierQuotes.length; i++) {
      for (let j = i + 1; j < tierQuotes.length; j++) {
        const high = tierQuotes[i];
        const low = tierQuotes[j];
        if (low.effectivePrice === 0) continue;
        const spread = (high.effectivePrice - low.effectivePrice) / low.effectivePrice;
        const spreadBps = Math.round(spread * 10000);

        if (spreadBps >= minProfitBps) {
          opportunities.push({
            pair: `${tokenA}/${tokenB}`,
            buyPool: `UniV3-${low.feeTier}bps`,
            sellPool: `UniV3-${high.feeTier}bps`,
            spreadBps,
            estimatedProfitPer1K: Math.round(spread * 1000 * 100) / 100,
            confidence: spreadBps > 50 ? 0.5 : spreadBps > 20 ? 0.7 : 0.85,
            expiresIn: "~30 seconds",
            dex: "Uniswap V3",
            chain: "Base",
            quoteDetails: {
              buyQuote: low.amountOut.toString(),
              sellQuote: high.amountOut.toString(),
              buyFeeTier: low.feeTier,
              sellFeeTier: high.feeTier,
            },
          });
        }
      }
    }

    // Get real prices for context
    const priceA = await priceOracle.getPriceUsd(inToken.address);
    const priceB = await priceOracle.getPriceUsd(outToken.address);

    await logTrade({
      endpoint: "/arb-opportunity",
      trade_type: "arb-scan",
      trade_value_usd: 0,
      fee_usd: 0.25,
      fee_tier: "Standard",
      user_address: req.headers["x-caller-address"] as string,
      status: "scan_complete",
      metadata: { pair: `${tokenA}/${tokenB}`, opportunities: opportunities.length },
    });

    res.json({
      scan: {
        tokenA,
        tokenB,
        minProfitBps,
        priceA,
        priceB,
        poolsScanned: tierQuotes.length,
      },
      opportunities: opportunities.sort((a, b) => b.spreadBps - a.spreadBps),
      count: opportunities.length,
      fee: { amount: "$0.25", type: "flat" },
      note: "Opportunities are time-sensitive. Execute via POST /execute-arb within 30 seconds.",
      timestamp: new Date().toISOString(),
    });
  });

  /* ──────────────────────────────────────────────────────────
   * POST /execute-arb
   *
   * Execute an arbitrage opportunity (generates tx bundle).
   * Fee: 1% of profit captured
   *
   * Body: {
   *   tokenA: "USDC",
   *   tokenB: "WETH",
   *   amountIn: "5000",
   *   buyPool: "Aerodrome",
   *   sellPool: "UniV3-3000bps",
   *   expectedProfitUsd: 25.50,
   *   recipient?: "0x..."
   * }
   * ──────────────────────────────────────────────────────── */
  router.post("/execute-arb", async (req: Request, res: Response) => {
    const { tokenA, tokenB, amountIn, buyPool, sellPool, expectedProfitUsd, recipient } = req.body;

    if (!tokenA || !tokenB || !amountIn || !expectedProfitUsd) {
      res.status(400).json({ error: "tokenA, tokenB, amountIn, and expectedProfitUsd are required" });
      return;
    }

    const inToken = resolveToken(tokenA);
    const outToken = resolveToken(tokenB);
    if (!inToken || !outToken) { res.status(400).json({ error: "Invalid token pair" }); return; }

    const profit = parseFloat(expectedProfitUsd);
    if (isNaN(profit) || profit <= 0) {
      res.status(400).json({ error: "expectedProfitUsd must be positive" });
      return;
    }

    // Fee: 1% of expected profit
    const callerAddress = req.headers["x-caller-address"] as string | undefined;
    const tier = await getCallerTierFn(callerAddress);
    const fee = calculateTradeFee("/execute-arb", profit, tier.discount);

    logPaymentFn("/execute-arb", `$${fee.feeUsd.toFixed(6)}`, req);

    const amount = parseFloat(amountIn);
    const amountRaw = BigInt(Math.floor(amount * 10 ** inToken.decimals));
    const recipientAddr = (recipient || callerAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`;

    // Generate arb tx bundle (buy low → sell high)
    const txBundle = {
      transactions: [
        {
          to: inToken.address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [UNISWAP_ROUTER, amountRaw],
          }),
          value: "0",
          description: `Approve ${amount} ${inToken.symbol} for ${buyPool}`,
        },
        {
          to: UNISWAP_ROUTER,
          data: encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [{
              tokenIn: inToken.address,
              tokenOut: outToken.address,
              fee: 3000,
              recipient: recipientAddr,
              amountIn: amountRaw,
              amountOutMinimum: BigInt(0),
              sqrtPriceLimitX96: BigInt(0),
            }],
          }),
          value: "0",
          description: `Buy ${outToken.symbol} on ${buyPool}`,
        },
        {
          to: outToken.address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [UNISWAP_ROUTER, BigInt(2) ** BigInt(256) - BigInt(1)], // max approve for sell
          }),
          value: "0",
          description: `Approve ${outToken.symbol} for ${sellPool}`,
        },
        // Note: In production, the sell-side tx would use a different router
        // address if the sell pool is on a different DEX (e.g., Aerodrome)
        {
          to: UNISWAP_ROUTER,
          data: encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [{
              tokenIn: outToken.address,
              tokenOut: inToken.address,
              fee: 3000,
              recipient: recipientAddr,
              amountIn: BigInt(0), // Will be output of previous tx
              amountOutMinimum: amountRaw, // At minimum, get back what we put in
              sqrtPriceLimitX96: BigInt(0),
            }],
          }),
          value: "0",
          description: `Sell ${outToken.symbol} on ${sellPool} → profit in ${inToken.symbol}`,
        },
      ],
      chain: "eip155:8453",
      note: "Arb bundle — execute atomically via multicall or flashbots. Profit = final balance - initial balance.",
      warning: "Arbitrage opportunities are time-sensitive. Prices may move before execution.",
    };

    await logTrade({
      endpoint: "/execute-arb",
      trade_type: "arb-execute",
      trade_value_usd: amount * (await priceOracle.getPriceUsd(inToken.address)),
      fee_usd: fee.feeUsd,
      fee_tier: fee.tier,
      token_in: inToken.symbol,
      token_out: outToken.symbol,
      user_address: callerAddress,
      status: "bundle_generated",
      metadata: { buyPool, sellPool, expectedProfitUsd: profit },
    });

    res.json({
      arb: {
        pair: `${tokenA}/${tokenB}`,
        amountIn: amount,
        buyPool,
        sellPool,
        expectedProfitUsd: profit,
      },
      fee,
      txBundle,
      timestamp: new Date().toISOString(),
    });
  });

  /* ──────────────────────────────────────────────────────────
   * GET /yield-optimize
   *
   * Analyze yield farming / lending opportunities across protocols.
   * Fee: $0.50 per query (flat)
   *
   * Query: ?token=USDC&amount=10000&riskTolerance=medium
   * ──────────────────────────────────────────────────────── */
  router.get("/yield-optimize", async (req: Request, res: Response) => {
    const token = (req.query.token as string) || "USDC";
    const amount = parseFloat(req.query.amount as string) || 1000;
    const riskTolerance = (req.query.riskTolerance as string) || "medium";

    logPaymentFn("/yield-optimize", "$0.50", req);

    const tokenInfo = resolveToken(token);
    if (!tokenInfo) { res.status(400).json({ error: `Unknown token: ${token}` }); return; }

    // Fetch real yield data from DeFi Llama
    let opportunities = await fetchDefiLlamaYields(token);

    // If DeFi Llama returned results, use them
    if (opportunities.length > 0) {
      // Calculate projected 30d yield for each
      for (const o of opportunities) {
        o.projectedYield30d = Math.round(amount * (o.apy / 100 / 12) * 100) / 100;
      }
    } else {
      // Fallback: known Base protocols with on-chain rate queries
      // These are real protocols but we can't get live APY without DeFi Llama
      const tokenPrice = await priceOracle.getPriceUsd(tokenInfo.address);
      opportunities = [
        {
          protocol: "aave-v3",
          type: "lending",
          apy: 0, // Will be marked as "rate unavailable"
          tvlUsd: 0,
          risk: "low",
          token: token,
          chain: "Base",
          rewards: [],
          projectedYield30d: 0,
        },
        {
          protocol: "compound-v3",
          type: "lending",
          apy: 0,
          tvlUsd: 0,
          risk: "low",
          token: token,
          chain: "Base",
          rewards: [],
          projectedYield30d: 0,
        },
        {
          protocol: "moonwell",
          type: "lending",
          apy: 0,
          tvlUsd: 0,
          risk: "medium",
          token: token,
          chain: "Base",
          rewards: [],
          projectedYield30d: 0,
        },
      ];
    }

    // Filter by risk tolerance
    const riskMap: Record<string, string[]> = {
      low: ["low"],
      medium: ["low", "medium"],
      high: ["low", "medium", "medium-high", "high"],
    };
    const allowed = riskMap[riskTolerance] || riskMap["medium"];
    const filtered = opportunities
      .filter(o => allowed.includes(o.risk))
      .sort((a, b) => b.apy - a.apy);

    const bestApy = filtered[0]?.apy || 0;
    const projectedAnnual = Math.round(amount * (bestApy / 100) * 100) / 100;

    const dataSource = opportunities.length > 0 && opportunities[0].apy > 0 ? "defillama" : "fallback";

    await logTrade({
      endpoint: "/yield-optimize",
      trade_type: "yield-scan",
      trade_value_usd: amount,
      fee_usd: 0.50,
      fee_tier: "Standard",
      user_address: req.headers["x-caller-address"] as string,
      status: "scan_complete",
      metadata: { token, riskTolerance, opportunities: filtered.length },
    });

    res.json({
      query: { token, amount, riskTolerance },
      dataSource,
      bestOpportunity: filtered[0] || null,
      opportunities: filtered,
      summary: {
        totalOptions: filtered.length,
        bestApy: `${bestApy}%`,
        projectedAnnualYield: `$${projectedAnnual}`,
        projectedMonthlyYield: `$${Math.round(projectedAnnual / 12 * 100) / 100}`,
      },
      fee: { amount: "$0.50", type: "flat" },
      note: "Deploy capital via POST /deploy-yield-strategy to execute the top recommendation.",
      timestamp: new Date().toISOString(),
    });
  });

  /* ──────────────────────────────────────────────────────────
   * POST /deploy-yield-strategy
   *
   * Generate tx bundle to deploy capital into a yield strategy.
   * Fee: $3.00 + 0.5% of deployed capital
   *
   * Body: {
   *   protocol: "Aave V3",
   *   token: "USDC",
   *   amount: "10000",
   *   walletAddress: "0x..."
   * }
   * ──────────────────────────────────────────────────────── */
  router.post("/deploy-yield-strategy", async (req: Request, res: Response) => {
    const { protocol, token, amount: amountStr, walletAddress } = req.body;

    if (!protocol || !token || !amountStr) {
      res.status(400).json({ error: "protocol, token, and amount are required" });
      return;
    }

    const tokenInfo = resolveToken(token);
    if (!tokenInfo) { res.status(400).json({ error: `Unknown token: ${token}` }); return; }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    // Calculate fee based on deployed capital
    const callerAddress = req.headers["x-caller-address"] as string | undefined;
    const tier = await getCallerTierFn(callerAddress);
    const tokenPrice = await priceOracle.getPriceUsd(tokenInfo.address);
    const deployValueUsd = amount * tokenPrice;
    const fee = calculateTradeFee("/deploy-yield-strategy", deployValueUsd, tier.discount);

    logPaymentFn("/deploy-yield-strategy", `$${fee.feeUsd.toFixed(6)}`, req);

    // Protocol-specific deposit addresses (Base Mainnet)
    const PROTOCOL_POOLS: Record<string, `0x${string}`> = {
      "Aave V3":      AAVE_V3_POOL,
      "Compound V3":  COMPOUND_V3_COMET,
      "Aerodrome":    AERODROME_ROUTER,
      "Moonwell":     MOONWELL_MUSDC,
      "Morpho Blue":  MORPHO_BLUE,
      // Normalize DeFi Llama project names
      "aave-v3":      AAVE_V3_POOL,
      "compound-v3":  COMPOUND_V3_COMET,
      "aerodrome-v2": AERODROME_ROUTER,
      "aerodrome-v1": AERODROME_ROUTER,
      "moonwell":     MOONWELL_MUSDC,
      "morpho-blue":  MORPHO_BLUE,
    };

    const poolAddress = PROTOCOL_POOLS[protocol];
    if (!poolAddress) {
      res.status(400).json({
        error: `Unknown protocol: ${protocol}. Supported: Aave V3, Compound V3, Aerodrome, Moonwell, Morpho Blue`,
      });
      return;
    }

    const amountRaw = BigInt(Math.floor(amount * 10 ** tokenInfo.decimals));
    const depositorAddr = (walletAddress || callerAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`;

    // Generate protocol-specific deposit calldata
    let depositTxData: `0x${string}`;
    let depositDescription: string;
    const normalizedProtocol = protocol.toLowerCase().replace(/\s+/g, "-");

    if (normalizedProtocol === "aave-v3" || protocol === "Aave V3") {
      depositTxData = encodeFunctionData({
        abi: AAVE_POOL_ABI,
        functionName: "supply",
        args: [tokenInfo.address, amountRaw, depositorAddr, 0],
      });
      depositDescription = `Supply ${amount} ${tokenInfo.symbol} to Aave V3 Pool on behalf of ${depositorAddr}`;

    } else if (normalizedProtocol === "compound-v3" || protocol === "Compound V3") {
      depositTxData = encodeFunctionData({
        abi: COMPOUND_COMET_ABI,
        functionName: "supply",
        args: [tokenInfo.address, amountRaw],
      });
      depositDescription = `Supply ${amount} ${tokenInfo.symbol} to Compound V3 (Comet)`;

    } else if (normalizedProtocol.includes("moonwell") || protocol === "Moonwell") {
      depositTxData = encodeFunctionData({
        abi: MOONWELL_ABI,
        functionName: "mint",
        args: [amountRaw],
      });
      depositDescription = `Mint mToken by depositing ${amount} ${tokenInfo.symbol} into Moonwell`;

    } else if (normalizedProtocol.includes("aerodrome") || protocol === "Aerodrome") {
      // Aerodrome LP requires two tokens — default pair with WETH
      const wethToken = resolveToken("WETH")!;
      const wethAmount = BigInt(0); // User needs to supply paired token separately
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min
      depositTxData = encodeFunctionData({
        abi: AERODROME_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          tokenInfo.address,
          wethToken.address,
          false, // volatile pool
          amountRaw,
          wethAmount,
          BigInt(0), // minA
          BigInt(0), // minB
          depositorAddr,
          deadline,
        ],
      });
      depositDescription = `Add liquidity: ${amount} ${tokenInfo.symbol} + WETH to Aerodrome (volatile pool). Note: you must also have paired WETH.`;

    } else {
      // Morpho Blue — supply requires market params
      // Use a generic USDC market (loanToken=USDC, collateral=WETH)
      const wethToken = resolveToken("WETH")!;
      depositTxData = encodeFunctionData({
        abi: MORPHO_ABI,
        functionName: "supply",
        args: [
          {
            loanToken: tokenInfo.address,
            collateralToken: wethToken.address,
            oracle: "0x0000000000000000000000000000000000000000" as `0x${string}`, // Market-specific oracle
            irm: "0x0000000000000000000000000000000000000000" as `0x${string}`,    // Market-specific IRM
            lltv: BigInt(0),
          },
          amountRaw,
          BigInt(0), // 0 shares = supply by assets
          depositorAddr,
          "0x" as `0x${string}`,
        ],
      });
      depositDescription = `Supply ${amount} ${tokenInfo.symbol} to Morpho Blue vault. Note: market params (oracle, IRM, LLTV) must match the target market.`;
    }

    // Generate deposit tx bundle
    const txBundle = {
      transactions: [
        {
          to: tokenInfo.address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [poolAddress, amountRaw],
          }),
          value: "0",
          description: `Approve ${amount} ${tokenInfo.symbol} for ${protocol}`,
        },
        {
          to: poolAddress,
          data: depositTxData,
          value: "0",
          description: depositDescription,
        },
      ],
      chain: "eip155:8453",
      protocol,
      note: `Deploy ${amount} ${tokenInfo.symbol} into ${protocol}. Approval tx must be confirmed first.`,
    };

    await logTrade({
      endpoint: "/deploy-yield-strategy",
      trade_type: "yield-deploy",
      trade_value_usd: deployValueUsd,
      fee_usd: fee.feeUsd,
      fee_tier: fee.tier,
      token_in: tokenInfo.symbol,
      user_address: callerAddress || walletAddress,
      status: "bundle_generated",
      metadata: { protocol, amount, deployValueUsd },
    });

    res.json({
      deployment: {
        protocol,
        token: tokenInfo.symbol,
        amount,
        deployValueUsd: Math.round(deployValueUsd * 100) / 100,
        poolAddress,
      },
      fee,
      txBundle,
      note: "Sign and broadcast these transactions to deploy capital.",
      timestamp: new Date().toISOString(),
    });
  });

  /* ──────────────────────────────────────────────────────────
   * GET /trade-fees — Fee schedule and revenue projections (FREE)
   * ──────────────────────────────────────────────────────── */
  router.get("/trade-fees", async (req: Request, res: Response) => {
    const callerAddress = req.headers["x-caller-address"] as string | undefined;
    const tier = await getCallerTierFn(callerAddress);

    // Example fee calculations at various trade sizes
    const examples = [100, 1000, 10000, 50000, 100000].map(value => ({
      tradeValueUsd: value,
      fees: Object.fromEntries(
        Object.keys(TRADE_FEE_SCHEDULES).map(ep => [
          ep,
          calculateTradeFee(ep, value, tier.discount),
        ])
      ),
    }));

    // Revenue projection
    const projection = projectTradeRevenue([
      { endpoint: "/execute-trade",         callsPerMonth: 1000, avgValueUsd: 2500 },
      { endpoint: "/rebalance-portfolio",   callsPerMonth: 200,  avgValueUsd: 15000 },
      { endpoint: "/arb-opportunity",       callsPerMonth: 5000, avgValueUsd: 0 },
      { endpoint: "/execute-arb",           callsPerMonth: 500,  avgValueUsd: 500 },
      { endpoint: "/yield-optimize",        callsPerMonth: 2000, avgValueUsd: 0 },
      { endpoint: "/deploy-yield-strategy", callsPerMonth: 100,  avgValueUsd: 20000 },
    ]);

    res.json({
      callerTier: tier,
      schedules: TRADE_FEE_SCHEDULES,
      examples,
      projection,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
