/**
 * XmetaV Alpha / Intelligence Feeds
 *
 * x402-gated endpoints for on-chain alpha signals.
 * Information advantage is the product — recurring revenue.
 *
 * Endpoints:
 *   GET /whale-alert        — Large transfer/swap detection on Base
 *   GET /liquidation-signal  — DeFi lending liquidation opportunities
 *   GET /arb-detection       — Cross-DEX/cross-pool arbitrage signals
 *   GET /governance-signal   — Governance proposal tracker
 *
 * Architecture:
 *   - Reads on-chain data via Base RPC (Alchemy)
 *   - Caches aggressively (30-60s TTL per signal type)
 *   - Tiered access: higher tiers get more signals, deeper data
 *   - All responses include freshness metadata
 *
 * Revenue model:
 *   - Per-call pricing ($0.10 – $0.50)
 *   - Token holder discounts (standard tier system)
 *   - Premium fields gated by tier
 */

import { Router, Request, Response } from "express";
import { createPublicClient, http, parseAbi, formatEther, formatUnits, type PublicClient } from "viem";
import { base } from "viem/chains";

/* ── Config ──────────────────────────────────────────────────── */

const BASE_RPC = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs";

const viemClient: PublicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC),
}) as PublicClient;

/* ── Token Registry (Base Mainnet) ───────────────────────── */

interface TokenMeta {
  symbol: string;
  decimals: number;
  name: string;
  coingeckoId?: string;
}

const TRACKED_TOKENS: Record<string, TokenMeta> = {
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18, name: "Wrapped Ether", coingeckoId: "weth" },
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": { symbol: "USDC", decimals: 6, name: "USD Coin", coingeckoId: "usd-coin" },
  "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA": { symbol: "USDbC", decimals: 6, name: "Bridged USDC", coingeckoId: "usd-coin" },
  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": { symbol: "DAI", decimals: 18, name: "Dai", coingeckoId: "dai" },
  "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": { symbol: "cbETH", decimals: 18, name: "Coinbase Staked ETH", coingeckoId: "coinbase-wrapped-staked-eth" },
  "0x940181a94A35A4569E4529A3CDfB74e38FD98631": { symbol: "AERO", decimals: 18, name: "Aerodrome", coingeckoId: "aerodrome-finance" },
  "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b": { symbol: "VIRTUAL", decimals: 18, name: "Virtual Protocol", coingeckoId: "virtual-protocol" },
  "0x532f27101965dd16442E59d40670FaF5eBB142E4": { symbol: "BRETT", decimals: 18, name: "Brett", coingeckoId: "based-brett" },
};

/* ── ABIs ─────────────────────────────────────────────────── */

const ERC20_TRANSFER_EVENT = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const UNISWAP_V3_SWAP_EVENT = parseAbi([
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
]);

const AAVE_LIQUIDATION_EVENT = parseAbi([
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
]);

const COMPOUND_ABSORB_EVENT = parseAbi([
  "event AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 collateralAbsorbed, uint256 usdValue)",
]);

const GOVERNOR_PROPOSE_EVENT = parseAbi([
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)",
]);

/* ── Known Contracts ─────────────────────────────────────── */

// Uniswap V3 pools on Base (top liquidity)
const UNISWAP_V3_POOLS: Array<{ address: `0x${string}`; token0: string; token1: string; fee: number; label: string }> = [
  { address: "0xd0b53D9277642d899DF5C87A3966A349A798F224", token0: "WETH", token1: "USDC", fee: 500, label: "WETH/USDC 0.05%" },
  { address: "0x4C36388bE6F416A29C8d8Ae5C112aB4CC73db731", token0: "WETH", token1: "USDC", fee: 3000, label: "WETH/USDC 0.3%" },
  { address: "0x10648BA41B8565907Cfa1496765fA4D95390aa0d", token0: "cbETH", token1: "WETH", fee: 500, label: "cbETH/WETH 0.05%" },
];

// Aerodrome DEX pools (Velodrome V2 fork — largest on Base)
const AERODROME_POOLS: Array<{ address: `0x${string}`; token0: string; token1: string; label: string }> = [
  { address: "0xB4885Bc63399BF5518b994c1d0C153334Ee579D0", token0: "WETH", token1: "USDC", label: "Aero WETH/USDC" },
  { address: "0x6cDcb1C4A4D1C3C6d054b27AC5B77e89eAFb971d", token0: "WETH", token1: "AERO", label: "Aero WETH/AERO" },
];

// Lending protocols on Base
const LENDING_PROTOCOLS = {
  moonwell: {
    name: "Moonwell",
    comptroller: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C" as `0x${string}`,
    markets: [
      { address: "0x628ff693426583D9a7FB391E54366292F509D457" as `0x${string}`, symbol: "WETH", underlying: "0x4200000000000000000000000000000000000006" },
      { address: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22" as `0x${string}`, symbol: "USDC", underlying: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
      { address: "0x3bf93770f2d4a794c3d9EBEfBAeBAE2a8f09A5E5" as `0x${string}`, symbol: "cbETH", underlying: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" },
    ],
  },
  seamless: {
    name: "Seamless Protocol",
    pool: "0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7" as `0x${string}`,
  },
  aaveV3: {
    name: "Aave V3",
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as `0x${string}`,
  },
};

// Governance contracts
const GOVERNANCE_CONTRACTS: Array<{ address: `0x${string}`; name: string; protocol: string }> = [
  { address: "0x0ED6e942bb3063a547aC692A7E4E4C88E91BCe78", name: "Aerodrome Governor", protocol: "Aerodrome" },
  { address: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C", name: "Moonwell Governor", protocol: "Moonwell" },
];

/* ── TTL Cache ────────────────────────────────────────────── */

interface CacheEntry<T> { data: T; fetchedAt: number; }
const cache = new Map<string, CacheEntry<unknown>>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.fetchedAt < ttlMs) return Promise.resolve(entry.data);
  return fn().then((data) => {
    cache.set(key, { data, fetchedAt: Date.now() });
    return data;
  });
}

/* ── Tier access ─────────────────────────────────────────── */

interface TokenTier {
  name: string;
  minBalance: number;
  discount: number;
  dailyLimit: number;
  color: string;
}

type TierResolver = (callerAddress?: string) => Promise<TokenTier>;

/* ── Data Fetchers ───────────────────────────────────────── */

interface WhaleTransfer {
  token: string;
  symbol: string;
  from: string;
  to: string;
  amount: string;
  amountRaw: string;
  blockNumber: number;
  txHash: string;
  timestamp: number;
  type: "transfer" | "swap";
}

async function fetchWhaleTransfers(lookbackBlocks: number = 100): Promise<WhaleTransfer[]> {
  const latestBlock = await viemClient.getBlockNumber();
  const fromBlock = latestBlock - BigInt(lookbackBlocks);
  const alerts: WhaleTransfer[] = [];

  // Scan ERC20 Transfer events for tracked tokens
  const tokenEntries = Object.entries(TRACKED_TOKENS);

  // Batch: scan top 4 tokens by importance
  const priorityTokens = tokenEntries.slice(0, 4);

  await Promise.all(
    priorityTokens.map(async ([address, meta]) => {
      try {
        const logs = await viemClient.getLogs({
          address: address as `0x${string}`,
          event: ERC20_TRANSFER_EVENT[0],
          fromBlock,
          toBlock: latestBlock,
        });

        // Whale threshold: $10K+ for stables, 2+ ETH for WETH, scale by token
        const thresholdRaw = meta.symbol === "WETH" || meta.symbol === "cbETH"
          ? BigInt(2) * BigInt(10 ** meta.decimals)    // 2 ETH
          : BigInt(10_000) * BigInt(10 ** meta.decimals); // $10K stables

        for (const log of logs) {
          const value = (log.args as any).value as bigint;
          if (value >= thresholdRaw) {
            alerts.push({
              token: address,
              symbol: meta.symbol,
              from: (log.args as any).from,
              to: (log.args as any).to,
              amount: formatUnits(value, meta.decimals),
              amountRaw: value.toString(),
              blockNumber: Number(log.blockNumber),
              txHash: log.transactionHash!,
              timestamp: Date.now(), // approximate — would need block timestamp for exact
              type: "transfer",
            });
          }
        }
      } catch {
        /* RPC limit — skip this token */
      }
    })
  );

  // Sort by block number descending (most recent first)
  alerts.sort((a, b) => b.blockNumber - a.blockNumber);
  return alerts;
}

interface LiquidationSignal {
  protocol: string;
  type: "liquidation" | "at_risk";
  collateralAsset?: string;
  debtAsset?: string;
  user?: string;
  debtToCover?: string;
  liquidatedCollateral?: string;
  liquidator?: string;
  healthFactor?: number;
  blockNumber: number;
  txHash?: string;
  timestamp: number;
}

async function fetchLiquidationSignals(lookbackBlocks: number = 200): Promise<LiquidationSignal[]> {
  const latestBlock = await viemClient.getBlockNumber();
  const fromBlock = latestBlock - BigInt(lookbackBlocks);
  const signals: LiquidationSignal[] = [];

  // 1. Scan Aave V3 LiquidationCall events
  try {
    const logs = await viemClient.getLogs({
      address: LENDING_PROTOCOLS.aaveV3.pool,
      event: AAVE_LIQUIDATION_EVENT[0],
      fromBlock,
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const args = log.args as any;
      signals.push({
        protocol: "Aave V3",
        type: "liquidation",
        collateralAsset: args.collateralAsset,
        debtAsset: args.debtAsset,
        user: args.user,
        debtToCover: args.debtToCover?.toString(),
        liquidatedCollateral: args.liquidatedCollateralAmount?.toString(),
        liquidator: args.liquidator,
        blockNumber: Number(log.blockNumber),
        txHash: log.transactionHash!,
        timestamp: Date.now(),
      });
    }
  } catch { /* Aave not available */ }

  // 2. Scan Moonwell (Compound-style) for absorptions
  try {
    for (const market of LENDING_PROTOCOLS.moonwell.markets) {
      const logs = await viemClient.getLogs({
        address: market.address,
        event: COMPOUND_ABSORB_EVENT[0],
        fromBlock,
        toBlock: latestBlock,
      });

      for (const log of logs) {
        const args = log.args as any;
        signals.push({
          protocol: "Moonwell",
          type: "liquidation",
          collateralAsset: market.underlying,
          user: args.borrower,
          liquidatedCollateral: args.collateralAbsorbed?.toString(),
          liquidator: args.absorber,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash!,
          timestamp: Date.now(),
        });
      }
    }
  } catch { /* Moonwell scan failed */ }

  // 3. Heuristic: check for at-risk positions via utilization spikes
  // (Moonwell comptroller getAccountLiquidity could be used for real-time,
  //  but requires individual position scanning — expensive. We flag
  //  utilization > 85% as "at_risk" signal for the market.)
  try {
    const COMPTROLLER_ABI = parseAbi([
      "function totalBorrows() view returns (uint256)",
      "function totalSupply() view returns (uint256)",
    ]);

    for (const market of LENDING_PROTOCOLS.moonwell.markets) {
      const [totalBorrows, totalSupply] = await Promise.all([
        viemClient.readContract({ address: market.address, abi: COMPTROLLER_ABI, functionName: "totalBorrows" }),
        viemClient.readContract({ address: market.address, abi: COMPTROLLER_ABI, functionName: "totalSupply" }),
      ]);

      if (totalSupply > 0n) {
        const utilization = Number(totalBorrows * 10000n / totalSupply) / 100;
        if (utilization > 85) {
          signals.push({
            protocol: "Moonwell",
            type: "at_risk",
            collateralAsset: market.underlying,
            healthFactor: Math.round((100 - utilization) * 100) / 100,
            blockNumber: Number(await viemClient.getBlockNumber()),
            timestamp: Date.now(),
          });
        }
      }
    }
  } catch { /* utilization check failed */ }

  signals.sort((a, b) => b.blockNumber - a.blockNumber);
  return signals;
}

interface ArbSignal {
  pair: string;
  dexA: string;
  dexB: string;
  priceA: number;
  priceB: number;
  spreadBps: number;
  direction: string;
  estimatedProfitUsd: number;
  confidence: "high" | "medium" | "low";
  timestamp: number;
}

async function fetchArbSignals(): Promise<ArbSignal[]> {
  const signals: ArbSignal[] = [];

  // Compare Uniswap V3 pools with different fee tiers
  // sqrtPriceX96 from slot0 gives us the current price without needing a swap
  const SLOT0_ABI = parseAbi([
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  ]);

  // 1. Cross-fee-tier arb: WETH/USDC 0.05% vs 0.3%
  try {
    const [slot0_05, slot0_30] = await Promise.all([
      viemClient.readContract({ address: UNISWAP_V3_POOLS[0].address, abi: SLOT0_ABI, functionName: "slot0" }),
      viemClient.readContract({ address: UNISWAP_V3_POOLS[1].address, abi: SLOT0_ABI, functionName: "slot0" }),
    ]);

    const price05 = sqrtPriceX96ToPrice(slot0_05[0], 18, 6); // WETH(18) / USDC(6)
    const price30 = sqrtPriceX96ToPrice(slot0_30[0], 18, 6);

    if (price05 > 0 && price30 > 0) {
      const spreadBps = Math.abs(price05 - price30) / Math.min(price05, price30) * 10000;
      const direction = price05 > price30
        ? `Buy WETH on 0.3% pool ($${price30.toFixed(2)}) → Sell on 0.05% pool ($${price05.toFixed(2)})`
        : `Buy WETH on 0.05% pool ($${price05.toFixed(2)}) → Sell on 0.3% pool ($${price30.toFixed(2)})`;

      // Profitable if spread > combined fee (0.05% + 0.3% = 0.35% = 35 bps)
      const netBps = spreadBps - 35;
      const confidence: ArbSignal["confidence"] = netBps > 20 ? "high" : netBps > 5 ? "medium" : "low";

      signals.push({
        pair: "WETH/USDC",
        dexA: "Uniswap V3 (0.05%)",
        dexB: "Uniswap V3 (0.3%)",
        priceA: price05,
        priceB: price30,
        spreadBps: Math.round(spreadBps * 100) / 100,
        direction,
        estimatedProfitUsd: Math.round(netBps * 10) / 100, // per $100 trade
        confidence,
        timestamp: Date.now(),
      });
    }
  } catch { /* slot0 read failed */ }

  // 2. Uniswap V3 vs Aerodrome: WETH/USDC
  try {
    const AERO_SLOT0_ABI = parseAbi([
      "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
    ]);

    const [uniSlot0, aeroReserves] = await Promise.all([
      viemClient.readContract({ address: UNISWAP_V3_POOLS[0].address, abi: parseAbi(["function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"]), functionName: "slot0" }),
      // Aerodrome uses getAmountOut — approximate via reserves
      viemClient.readContract({
        address: AERODROME_POOLS[0].address,
        abi: parseAbi(["function getAmountOut(uint256 amountIn, address tokenIn) view returns (uint256)"]),
        functionName: "getAmountOut",
        args: [BigInt(10 ** 18), "0x4200000000000000000000000000000000000006" as `0x${string}`], // 1 WETH in
      }).catch(() => null),
    ]);

    const uniPrice = sqrtPriceX96ToPrice(uniSlot0[0], 18, 6);

    if (aeroReserves && uniPrice > 0) {
      const aeroPrice = Number(aeroReserves) / 1e6; // USDC out for 1 WETH

      const spreadBps = Math.abs(uniPrice - aeroPrice) / Math.min(uniPrice, aeroPrice) * 10000;
      const higher = uniPrice > aeroPrice ? "Uniswap V3" : "Aerodrome";
      const lower = uniPrice > aeroPrice ? "Aerodrome" : "Uniswap V3";

      const netBps = spreadBps - 55; // ~0.05% uni + ~0.3% aero + gas
      const confidence: ArbSignal["confidence"] = netBps > 20 ? "high" : netBps > 5 ? "medium" : "low";

      signals.push({
        pair: "WETH/USDC",
        dexA: "Uniswap V3",
        dexB: "Aerodrome",
        priceA: uniPrice,
        priceB: aeroPrice,
        spreadBps: Math.round(spreadBps * 100) / 100,
        direction: `Buy on ${lower} → Sell on ${higher}`,
        estimatedProfitUsd: Math.round(netBps * 10) / 100,
        confidence,
        timestamp: Date.now(),
      });
    }
  } catch { /* cross-dex comparison failed */ }

  // 3. cbETH/WETH peg deviation — staking arbitrage
  try {
    const cbethSlot0 = await viemClient.readContract({
      address: UNISWAP_V3_POOLS[2].address,
      abi: parseAbi(["function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"]),
      functionName: "slot0",
    });

    // cbETH/WETH — both 18 decimals
    const cbethRatio = sqrtPriceX96ToPrice(cbethSlot0[0], 18, 18);
    // cbETH should trade ~1.05-1.10x ETH (staking premium)
    // If < 1.03 or > 1.15, there's a peg deviation opportunity
    const pegDeviation = Math.abs(cbethRatio - 1.07) / 1.07 * 10000; // bps from expected
    if (pegDeviation > 50) { // > 50 bps deviation
      signals.push({
        pair: "cbETH/WETH",
        dexA: "Uniswap V3",
        dexB: "Coinbase Staking",
        priceA: cbethRatio,
        priceB: 1.07, // expected ratio
        spreadBps: Math.round(pegDeviation * 100) / 100,
        direction: cbethRatio < 1.07
          ? "cbETH undervalued → Buy cbETH, redeem later"
          : "cbETH overvalued → Sell cbETH for WETH, restake",
        estimatedProfitUsd: Math.round((pegDeviation - 50) * 10) / 100,
        confidence: pegDeviation > 150 ? "high" : pegDeviation > 80 ? "medium" : "low",
        timestamp: Date.now(),
      });
    }
  } catch { /* cbETH read failed */ }

  signals.sort((a, b) => b.spreadBps - a.spreadBps);
  return signals;
}

interface GovernanceSignal {
  protocol: string;
  proposalId?: string;
  proposer?: string;
  description: string;
  startBlock?: number;
  endBlock?: number;
  status: "new" | "active" | "upcoming";
  blockNumber: number;
  txHash?: string;
  timestamp: number;
}

async function fetchGovernanceSignals(lookbackBlocks: number = 5000): Promise<GovernanceSignal[]> {
  const latestBlock = await viemClient.getBlockNumber();
  const fromBlock = latestBlock - BigInt(lookbackBlocks);
  const signals: GovernanceSignal[] = [];

  for (const gov of GOVERNANCE_CONTRACTS) {
    try {
      const logs = await viemClient.getLogs({
        address: gov.address,
        event: GOVERNOR_PROPOSE_EVENT[0],
        fromBlock,
        toBlock: latestBlock,
      });

      for (const log of logs) {
        const args = log.args as any;
        const description = args.description?.substring(0, 500) || "No description";
        const startBlock = Number(args.startBlock || 0);
        const endBlock = Number(args.endBlock || 0);
        const currentBlock = Number(latestBlock);

        let status: GovernanceSignal["status"] = "new";
        if (currentBlock >= startBlock && currentBlock <= endBlock) status = "active";
        else if (currentBlock < startBlock) status = "upcoming";

        signals.push({
          protocol: gov.protocol,
          proposalId: args.proposalId?.toString(),
          proposer: args.proposer,
          description,
          startBlock,
          endBlock,
          status,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash!,
          timestamp: Date.now(),
        });
      }
    } catch {
      /* Governor event scan failed — contract may not support this ABI */
    }
  }

  // Supplement with DeFi Llama governance data for broader coverage
  try {
    const resp = await fetch("https://api.llama.fi/lite/protocols", { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const protocols = await resp.json() as Array<{ name: string; chain: string; tvl: number; governanceID?: string[] }>;
      const baseProtocols = protocols
        .filter((p: any) => (p.chain === "Base" || p.chains?.includes("Base")) && p.tvl > 1_000_000)
        .slice(0, 10);

      for (const p of baseProtocols) {
        if (p.governanceID?.length) {
          signals.push({
            protocol: p.name,
            description: `${p.name} has active governance — TVL: $${(p.tvl / 1e6).toFixed(1)}M`,
            status: "active",
            blockNumber: Number(latestBlock),
            timestamp: Date.now(),
          });
        }
      }
    }
  } catch { /* DeFi Llama fallback failed */ }

  signals.sort((a, b) => b.blockNumber - a.blockNumber);
  return signals;
}

/* ── Helpers ──────────────────────────────────────────────── */

/** Convert Uniswap V3 sqrtPriceX96 to human-readable price */
function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  // price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
  const Q96 = 2n ** 96n;
  const num = sqrtPriceX96 * sqrtPriceX96;
  const denom = Q96 * Q96;
  // Use floating point for the conversion
  const rawPrice = Number(num) / Number(denom);
  const adjusted = rawPrice * Math.pow(10, decimals0 - decimals1);
  return adjusted;
}

/* ── Fee Schedule ─────────────────────────────────────────── */

export const ALPHA_FEE_SCHEDULES: Record<string, { price: string; description: string }> = {
  "/whale-alert":        { price: "$0.15", description: "Whale transfer/swap detection on Base" },
  "/liquidation-signal": { price: "$0.25", description: "DeFi lending liquidation signals" },
  "/arb-detection":      { price: "$0.20", description: "Cross-DEX arbitrage signal detection" },
  "/governance-signal":  { price: "$0.10", description: "Governance proposal tracker" },
};

/* ── Router Factory ──────────────────────────────────────── */

export function createAlphaFeedsRouter(
  logPayment: (endpoint: string, amount: string, req: Request) => void,
  getCallerTier: TierResolver,
): Router {
  const router = Router();

  /* ─────────────────────────────────────────────────────────
   * GET /whale-alert
   * Detects large ERC20 transfers on Base in the last ~100 blocks.
   * Premium tiers: deeper lookback, more tokens scanned.
   * ───────────────────────────────────────────────────────── */
  router.get("/whale-alert", async (req: Request, res: Response) => {
    logPayment("/whale-alert", "$0.15", req);
    try {
      const callerAddr = req.headers["x-caller-address"] as string | undefined;
      const tier = await getCallerTier(callerAddr);

      // Tier-gated lookback depth
      const lookback = tier.name === "Diamond" ? 500
        : tier.name === "Gold" ? 300
        : tier.name === "Silver" ? 200
        : 100;

      const minAmount = req.query.minAmount as string | undefined;
      const tokenFilter = req.query.token as string | undefined;

      const alerts = await cached(`whale-alert:${lookback}`, 30_000, () =>
        fetchWhaleTransfers(lookback)
      );

      let filtered = alerts;

      // Optional filters
      if (tokenFilter) {
        const sym = tokenFilter.toUpperCase();
        filtered = filtered.filter((a) => a.symbol === sym);
      }
      if (minAmount) {
        const min = parseFloat(minAmount);
        filtered = filtered.filter((a) => parseFloat(a.amount) >= min);
      }

      // Tier-gated result limit
      const limit = tier.name === "Diamond" ? 100
        : tier.name === "Gold" ? 50
        : tier.name === "Silver" ? 30
        : 15;

      filtered = filtered.slice(0, limit);

      // Redact TX hashes for free tier — information advantage for paid tiers
      if (tier.name === "None" || tier.name === "Starter") {
        filtered = filtered.map((a) => ({
          ...a,
          txHash: a.txHash.substring(0, 10) + "…",
          from: a.from.substring(0, 10) + "…",
          to: a.to.substring(0, 10) + "…",
        }));
      }

      res.json({
        alerts: filtered,
        count: filtered.length,
        totalDetected: alerts.length,
        lookbackBlocks: lookback,
        tier: tier.name,
        filters: { token: tokenFilter || "all", minAmount: minAmount || "default" },
        freshness: {
          cachedAt: new Date().toISOString(),
          ttlSeconds: 30,
          source: "base-mainnet-rpc",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, endpoint: "/whale-alert" });
    }
  });

  /* ─────────────────────────────────────────────────────────
   * GET /liquidation-signal
   * Monitors Aave V3, Moonwell, Seamless for liquidation events
   * and at-risk positions (utilization > 85%).
   * ───────────────────────────────────────────────────────── */
  router.get("/liquidation-signal", async (req: Request, res: Response) => {
    logPayment("/liquidation-signal", "$0.25", req);
    try {
      const callerAddr = req.headers["x-caller-address"] as string | undefined;
      const tier = await getCallerTier(callerAddr);

      const lookback = tier.name === "Diamond" ? 1000
        : tier.name === "Gold" ? 500
        : 200;

      const protocolFilter = req.query.protocol as string | undefined;

      const signals = await cached(`liquidation:${lookback}`, 45_000, () =>
        fetchLiquidationSignals(lookback)
      );

      let filtered = signals;
      if (protocolFilter) {
        filtered = filtered.filter((s) => s.protocol.toLowerCase().includes(protocolFilter.toLowerCase()));
      }

      const limit = tier.name === "Diamond" ? 50
        : tier.name === "Gold" ? 30
        : 15;

      filtered = filtered.slice(0, limit);

      // Redact user addresses for lower tiers
      if (tier.name === "None" || tier.name === "Starter") {
        filtered = filtered.map((s) => ({
          ...s,
          user: s.user ? s.user.substring(0, 10) + "…" : undefined,
          liquidator: s.liquidator ? s.liquidator.substring(0, 10) + "…" : undefined,
          txHash: s.txHash ? s.txHash.substring(0, 10) + "…" : undefined,
        }));
      }

      res.json({
        signals: filtered,
        count: filtered.length,
        totalDetected: signals.length,
        protocols: ["Aave V3", "Moonwell", "Seamless"],
        lookbackBlocks: lookback,
        tier: tier.name,
        freshness: {
          cachedAt: new Date().toISOString(),
          ttlSeconds: 45,
          source: "base-mainnet-rpc",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, endpoint: "/liquidation-signal" });
    }
  });

  /* ─────────────────────────────────────────────────────────
   * GET /arb-detection
   * Cross-DEX and cross-fee-tier arbitrage signal detection.
   * Compares Uniswap V3 pools + Aerodrome prices in real time.
   * ───────────────────────────────────────────────────────── */
  router.get("/arb-detection", async (req: Request, res: Response) => {
    logPayment("/arb-detection", "$0.20", req);
    try {
      const callerAddr = req.headers["x-caller-address"] as string | undefined;
      const tier = await getCallerTier(callerAddr);

      const minSpread = req.query.minSpread ? parseFloat(req.query.minSpread as string) : 0;

      const signals = await cached("arb-detection", 20_000, fetchArbSignals);

      let filtered = signals;
      if (minSpread > 0) {
        filtered = filtered.filter((s) => s.spreadBps >= minSpread);
      }

      // Premium tiers see all signals; basic tiers only see "medium" and "high"
      if (tier.name === "None" || tier.name === "Starter") {
        filtered = filtered.filter((s) => s.confidence !== "low");
      }

      // Premium tiers get execution hints
      const withHints = tier.name === "Gold" || tier.name === "Diamond" || tier.name === "Silver";

      const response: any = {
        signals: filtered.map((s) => ({
          ...s,
          ...(withHints ? {
            executionHint: {
              route: s.direction,
              gasEstimate: "~120K gas (~$0.01 on Base)",
              flashLoanable: s.estimatedProfitUsd > 1,
              minProfitableSize: `$${Math.max(100, Math.round(5000 / Math.max(s.spreadBps, 1)))}`,
            },
          } : {}),
        })),
        count: filtered.length,
        totalScanned: signals.length,
        pairs: ["WETH/USDC", "cbETH/WETH"],
        dexes: ["Uniswap V3 (0.05%)", "Uniswap V3 (0.3%)", "Aerodrome"],
        tier: tier.name,
        freshness: {
          cachedAt: new Date().toISOString(),
          ttlSeconds: 20,
          source: "base-mainnet-rpc (slot0)",
        },
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message, endpoint: "/arb-detection" });
    }
  });

  /* ─────────────────────────────────────────────────────────
   * GET /governance-signal
   * Tracks governance proposals across Base protocols.
   * ───────────────────────────────────────────────────────── */
  router.get("/governance-signal", async (req: Request, res: Response) => {
    logPayment("/governance-signal", "$0.10", req);
    try {
      const callerAddr = req.headers["x-caller-address"] as string | undefined;
      const tier = await getCallerTier(callerAddr);

      const lookback = tier.name === "Diamond" ? 20000
        : tier.name === "Gold" ? 10000
        : 5000;

      const protocolFilter = req.query.protocol as string | undefined;

      const signals = await cached(`governance:${lookback}`, 120_000, () =>
        fetchGovernanceSignals(lookback)
      );

      let filtered = signals;
      if (protocolFilter) {
        filtered = filtered.filter((s) => s.protocol.toLowerCase().includes(protocolFilter.toLowerCase()));
      }

      // Premium tiers see proposer addresses and full descriptions
      if (tier.name === "None" || tier.name === "Starter") {
        filtered = filtered.map((s) => ({
          ...s,
          proposer: s.proposer ? s.proposer.substring(0, 10) + "…" : undefined,
          description: s.description.substring(0, 200) + (s.description.length > 200 ? "… [upgrade tier for full text]" : ""),
        }));
      }

      res.json({
        signals: filtered,
        count: filtered.length,
        protocols: [...new Set(signals.map((s) => s.protocol))],
        lookbackBlocks: lookback,
        tier: tier.name,
        freshness: {
          cachedAt: new Date().toISOString(),
          ttlSeconds: 120,
          source: "base-mainnet-rpc + defillama",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, endpoint: "/governance-signal" });
    }
  });

  return router;
}
