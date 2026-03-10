/**
 * Cross-Chain Multi-Chain Types & Configuration
 *
 * Shared types for Base ↔ Solana bridge, Jupiter swaps, and Kamino vaults.
 */

// ── Contract Addresses ──────────────────────────────────────────

export const BASE_CONTRACTS = {
  BRIDGE: "0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188" as const,
  BRIDGE_VALIDATOR: "0xAF24c1c24Ff3BF1e6D882518120fC25442d6794B" as const,
  CROSS_CHAIN_ERC20_FACTORY: "0xDD56781d0509650f8C2981231B6C917f2d5d7dF2" as const,
  SOL_TOKEN: "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82" as const, // wrapped SOL on Base
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
  XMETAV: "0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54" as const,
  ANCHOR: "0x0D1F695ea1ca6b5Ba22E3bAf6190d8553D9c4D98" as const,
  PAY_TO: "0x21fa51B40BF63E47f000eD77eC7FD018AE0ddA0B" as const,
} as const;

export const SOLANA_CONTRACTS = {
  BRIDGE_PROGRAM: "HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM" as const,
  BASE_RELAYER: "g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9" as const,
  USDC_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const,
  SOL_MINT: "So11111111111111111111111111111111111111112" as const,
  JUPITER_PROGRAM: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" as const,
} as const;

export const APIS = {
  JUPITER_ORDER: "https://api.jup.ag/ultra/v1/order",
  JUPITER_EXECUTE: "https://api.jup.ag/ultra/v1/execute",
  KAMINO_API: "https://api.kamino.finance",
  KAMINO_DEPOSIT: "https://api.kamino.finance/ktx/kvault/deposit",
  KAMINO_WITHDRAW: "https://api.kamino.finance/ktx/kvault/withdraw",
  KAMINO_VAULTS: "https://api.kamino.finance/kvaults/vaults",
} as const;

// ── Job Types ───────────────────────────────────────────────────

export type CrossChainJobStatus =
  | "pending"           // queued, waiting for batch or processing
  | "batched"           // grouped with other jobs for batching
  | "bridging_to_sol"   // USDC locked on Base, bridging to Solana
  | "bridged"           // USDC arrived on Solana
  | "swapping"          // Jupiter swap in progress
  | "swapped"           // Jupiter swap complete
  | "depositing"        // Kamino vault deposit in progress
  | "vaulted"           // Deposited in Kamino vault
  | "withdrawing"       // Withdrawing from Kamino vault
  | "bridging_to_base"  // Bridging back to Base
  | "anchoring"         // Anchoring result on Base
  | "completed"         // Fully complete
  | "failed";           // Something went wrong

export type VaultStrategy = "kamino" | "none";
export type OutputToken = "SOL" | "USDC" | "BONK" | "JUP";

export interface CrossChainJob {
  id: string;
  payerAddress: string;
  paymentAmount: number;       // USDC paid via x402
  targetChain: "solana";
  outputToken: OutputToken;
  vaultStrategy: VaultStrategy;
  returnToBase: boolean;
  status: CrossChainJobStatus;
  batchId: string | null;

  // Transaction hashes
  baseBridgeTx: string | null;
  solanaBridgeTx: string | null;
  jupiterSwapTx: string | null;
  kaminoDepositTx: string | null;
  kaminoWithdrawTx: string | null;
  returnBridgeTx: string | null;
  anchorTx: string | null;

  // Amounts
  bridgedAmount: number | null;   // USDC arrived on Solana
  swapOutputAmount: number | null; // output token amount after Jupiter
  vaultShares: number | null;      // kTokens received from Kamino
  returnAmount: number | null;     // USDC returned to Base
  yieldEarned: number | null;      // yield from Kamino vault

  // Fees breakdown
  fees: {
    bridgeToSolana: number;
    jupiterSwap: number;
    kaminoDeposit: number;
    bridgeToBase: number;
    total: number;
  } | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

// ── Batch Types ─────────────────────────────────────────────────

export interface BatchGroup {
  id: string;
  jobIds: string[];
  totalAmount: number;
  status: "collecting" | "executing" | "completed" | "failed";
  bridgeTx: string | null;
  createdAt: string;
}

// ── API Request / Response ──────────────────────────────────────

export interface CrossChainSwapRequest {
  amount: string;               // Min $0.65 USDC
  targetChain: "solana";
  outputToken?: OutputToken;    // Default: keep USDC
  vaultStrategy?: VaultStrategy; // Default: none
  returnToBase?: boolean;        // Default: false
}

export interface CrossChainSwapResponse {
  jobId: string;
  status: CrossChainJobStatus;
  estimatedCompletion: string;
  breakdown: {
    payment: number;
    estimatedFees: {
      bridgeToSolana: number;
      jupiterSwap: number;
      kaminoDeposit: number;
      bridgeToBase: number;
      total: number;
    };
    estimatedOutput: number;
    estimatedMargin: string; // percentage
  };
  batched: boolean;
  batchId: string | null;
}

export interface JobStatusResponse {
  jobId: string;
  status: CrossChainJobStatus;
  steps: {
    name: string;
    status: "pending" | "in-progress" | "completed" | "failed" | "skipped";
    txHash: string | null;
    timestamp: string | null;
  }[];
  amounts: {
    input: number;
    bridged: number | null;
    swapOutput: number | null;
    vaultShares: number | null;
    returned: number | null;
    yield: number | null;
  };
  fees: CrossChainJob["fees"];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ── Safety Configuration ────────────────────────────────────────

export const SAFETY = {
  minPayment: 0.65,
  minBatchThreshold: 6.5,        // $6.50 = 10 × $0.65
  maxSingleBridge: 500,          // $500 max single bridge
  slippageBps: 50,               // 0.5% max slippage
  maxPriceImpact: 1.0,           // 1% max price impact
  maxRetries: 3,
  retryDelays: [60_000, 300_000, 600_000], // 1m, 5m, 10m
  bridgeTimeout: 1_800_000,      // 30 min
  batchCollectTimeout: 3_600_000, // 1 hour max batch wait
  emergencyPause: false,
} as const;

// ── Fee Estimates ───────────────────────────────────────────────

export const FEE_ESTIMATES = {
  bridgeToSolana: 0.50,
  jupiterSwap: 0.01,
  kaminoDeposit: 0.01,
  bridgeToBase: 0.50,
  anchorGas: 0.0001,
} as const;

export function estimateTotalFees(opts: {
  returnToBase: boolean;
  vaultStrategy: VaultStrategy;
  batched: boolean;
  batchSize?: number;
}): number {
  const bridgeCost = opts.batched && opts.batchSize
    ? FEE_ESTIMATES.bridgeToSolana / opts.batchSize
    : FEE_ESTIMATES.bridgeToSolana;

  let total = bridgeCost + FEE_ESTIMATES.jupiterSwap;

  if (opts.vaultStrategy === "kamino") {
    total += FEE_ESTIMATES.kaminoDeposit;
  }

  if (opts.returnToBase) {
    const returnCost = opts.batched && opts.batchSize
      ? FEE_ESTIMATES.bridgeToBase / opts.batchSize
      : FEE_ESTIMATES.bridgeToBase;
    total += returnCost + FEE_ESTIMATES.anchorGas;
  }

  return total;
}
