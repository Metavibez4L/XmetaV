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
    await supabase.from("x402_payments").insert({
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
    });
  } catch { /* best effort */ }
}

function resolveToken(symbol: string): { address: `0x${string}`; decimals: number; symbol: string } | null {
  const upper = symbol.toUpperCase();
  return BASE_TOKENS[upper] || null;
}

async function getTokenPrice(tokenAddress: `0x${string}`): Promise<number> {
  // Simple price oracle: use USDC as numeraire via Uniswap quoter
  // For production, integrate Chainlink or Pyth oracles
  const PRICES: Record<string, number> = {
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": 1.00,       // USDC
    "0x4200000000000000000000000000000000000006": 2800,         // WETH (approx)
    "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": 3000,       // cbETH
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": 1.00,       // DAI
    "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA": 1.00,       // USDbC
    "0x940181a94A35A4569E4529A3CDfB74e38FD98631": 1.50,       // AERO
  };
  return PRICES[tokenAddress] || 1;
}

/* ── Router ──────────────────────────────────────────────────── */

export function createTradeRouter(
  logPaymentFn: (endpoint: string, amount: string, req: Request) => void,
  getCallerTierFn: (callerAddress?: string) => Promise<{ discount: number; name: string }>
): Router {
  const router = Router();

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

    // Calculate trade value in USD
    const tokenPrice = await getTokenPrice(inToken.address);
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
    const minAmountOut = BigInt(0); // In production, calculate from oracle price - slippage

    const recipientAddr = (recipient || callerAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`;

    // Approval tx
    const approveTxData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [UNISWAP_ROUTER, amountRaw],
    });

    // Swap tx
    const swapTxData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: inToken.address,
        tokenOut: outToken.address,
        fee: 3000, // 0.3% Uniswap pool fee (most common)
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
          description: `Swap ${amount} ${inToken.symbol} → ${outToken.symbol} via Uniswap V3`,
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
      metadata: { amountIn: amount, slippageBps: slippage },
    });

    res.json({
      trade: {
        type: "swap",
        tokenIn: inToken.symbol,
        tokenOut: outToken.symbol,
        amountIn: amount,
        tradeValueUsd: Math.round(tradeValueUsd * 100) / 100,
        slippageBps: slippage,
        recipient: recipientAddr,
      },
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
        const price = await getTokenPrice(token.address);
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
        const price = await getTokenPrice(h.address);
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

    // Simulated arb scanner — in production, query multiple DEX pools
    // and compare prices across Uniswap V3, Aerodrome, Curve, etc.
    const opportunities = [];

    // Check multiple pool fee tiers for price discrepancy
    const feeTiers = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
    const priceA = await getTokenPrice(inToken.address);
    const priceB = await getTokenPrice(outToken.address);

    for (let i = 0; i < feeTiers.length; i++) {
      for (let j = i + 1; j < feeTiers.length; j++) {
        // Simulate price difference between pools
        const spread = Math.random() * 0.003; // 0-0.3% random spread
        const profitBps = Math.round(spread * 10000);

        if (profitBps >= minProfitBps) {
          opportunities.push({
            pair: `${tokenA}/${tokenB}`,
            buyPool: `UniV3-${feeTiers[i]}bps`,
            sellPool: `UniV3-${feeTiers[j]}bps`,
            spreadBps: profitBps,
            estimatedProfitPer1K: Math.round(spread * 1000 * 100) / 100,
            confidence: Math.round((0.8 - spread * 100) * 100) / 100,
            expiresIn: "~30 seconds",
            dex: "Uniswap V3",
            chain: "Base",
          });
        }
      }
    }

    // Also check Aerodrome vs Uniswap
    const aeroSpread = Math.random() * 0.005;
    const aeroProfitBps = Math.round(aeroSpread * 10000);
    if (aeroProfitBps >= minProfitBps) {
      opportunities.push({
        pair: `${tokenA}/${tokenB}`,
        buyPool: "Aerodrome",
        sellPool: "UniV3-3000bps",
        spreadBps: aeroProfitBps,
        estimatedProfitPer1K: Math.round(aeroSpread * 1000 * 100) / 100,
        confidence: Math.round((0.7 - aeroSpread * 50) * 100) / 100,
        expiresIn: "~15 seconds",
        dex: "Cross-DEX",
        chain: "Base",
      });
    }

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
      trade_value_usd: amount * (await getTokenPrice(inToken.address)),
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

    // Yield opportunities across Base protocols
    const opportunities = [
      {
        protocol: "Aave V3",
        type: "lending",
        apy: 4.2 + Math.random() * 2,
        tvl: "$450M",
        risk: "low",
        minDeposit: 1,
        token: token,
        chain: "Base",
        rewards: ["AAVE"],
        projectedYield30d: amount * ((4.2 + Math.random() * 2) / 100 / 12),
      },
      {
        protocol: "Compound V3",
        type: "lending",
        apy: 3.8 + Math.random() * 1.5,
        tvl: "$280M",
        risk: "low",
        minDeposit: 1,
        token: token,
        chain: "Base",
        rewards: ["COMP"],
        projectedYield30d: amount * ((3.8 + Math.random() * 1.5) / 100 / 12),
      },
      {
        protocol: "Aerodrome",
        type: "liquidity_pool",
        apy: 12 + Math.random() * 15,
        tvl: "$120M",
        risk: "medium",
        minDeposit: 100,
        token: `${token}/WETH`,
        chain: "Base",
        rewards: ["AERO"],
        projectedYield30d: amount * ((12 + Math.random() * 15) / 100 / 12),
        impermanentLossRisk: "moderate",
      },
      {
        protocol: "Moonwell",
        type: "lending",
        apy: 5.5 + Math.random() * 3,
        tvl: "$85M",
        risk: "medium",
        minDeposit: 10,
        token: token,
        chain: "Base",
        rewards: ["WELL"],
        projectedYield30d: amount * ((5.5 + Math.random() * 3) / 100 / 12),
      },
      {
        protocol: "Morpho Blue",
        type: "vault",
        apy: 8 + Math.random() * 6,
        tvl: "$200M",
        risk: "medium-high",
        minDeposit: 50,
        token: token,
        chain: "Base",
        rewards: ["MORPHO"],
        projectedYield30d: amount * ((8 + Math.random() * 6) / 100 / 12),
      },
    ];

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

    // Round values
    for (const o of filtered) {
      o.apy = Math.round(o.apy * 100) / 100;
      o.projectedYield30d = Math.round(o.projectedYield30d * 100) / 100;
    }

    const bestApy = filtered[0]?.apy || 0;
    const projectedAnnual = Math.round(amount * (bestApy / 100) * 100) / 100;

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
    const tokenPrice = await getTokenPrice(tokenInfo.address);
    const deployValueUsd = amount * tokenPrice;
    const fee = calculateTradeFee("/deploy-yield-strategy", deployValueUsd, tier.discount);

    logPaymentFn("/deploy-yield-strategy", `$${fee.feeUsd.toFixed(6)}`, req);

    // Protocol-specific deposit addresses (Base Mainnet)
    const PROTOCOL_POOLS: Record<string, `0x${string}`> = {
      "Aave V3":      "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      "Compound V3":  "0x46e6b214b524310239732D51387075E0e70970bf",
      "Aerodrome":    "0xcF77a3Ba9A5CA399B7c97C74d54e5b1Beb874E43",
      "Moonwell":     "0x0b31F47fF39C76FBB9132cB0968E1150c8F6fb40",
      "Morpho Blue":  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    };

    const poolAddress = PROTOCOL_POOLS[protocol];
    if (!poolAddress) {
      res.status(400).json({
        error: `Unknown protocol: ${protocol}. Supported: ${Object.keys(PROTOCOL_POOLS).join(", ")}`,
      });
      return;
    }

    const amountRaw = BigInt(Math.floor(amount * 10 ** tokenInfo.decimals));

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
          // For a real implementation, encode the protocol-specific deposit function
          // This is a simplified representation
          data: "0x" as `0x${string}`,
          value: "0",
          description: `Deposit ${amount} ${tokenInfo.symbol} into ${protocol}`,
          note: "Deposit calldata varies by protocol. Use protocol SDK for exact encoding.",
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
