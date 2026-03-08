/**
 * Jupiter Ultra Swap Module
 *
 * Executes token swaps on Solana via Jupiter Ultra API.
 * Ultra API = RPC-less: Jupiter manages execution, we just sign.
 *
 * Flow: GET /ultra/v1/order → sign → POST /ultra/v1/execute
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  APIS,
  SOLANA_CONTRACTS,
  SAFETY,
  type OutputToken,
} from "./cross-chain-types.js";

// ── Solana Token Mints ──────────────────────────────────────────

const SOLANA_MINTS: Record<OutputToken, string> = {
  SOL: SOLANA_CONTRACTS.SOL_MINT,
  USDC: SOLANA_CONTRACTS.USDC_MINT,
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
};

// ── Connection Setup ────────────────────────────────────────────

let connection: Connection | null = null;
let keypair: Keypair | null = null;

function getConnection(): Connection {
  if (!connection) {
    const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    connection = new Connection(rpc, "confirmed");
  }
  return connection;
}

function getKeypair(): Keypair {
  if (!keypair) {
    const key = process.env.SOLANA_PRIVATE_KEY;
    if (!key) throw new Error("SOLANA_PRIVATE_KEY required for Jupiter swaps");
    keypair = Keypair.fromSecretKey(bs58.decode(key));
  }
  return keypair;
}

// ── Jupiter Ultra: Get Order ────────────────────────────────────

export interface JupiterOrder {
  transaction: string; // base64-encoded VersionedTransaction
  requestId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

/**
 * Request a swap order from Jupiter Ultra API.
 *
 * @param inputMint - Input token mint (e.g. USDC mint)
 * @param outputMint - Output token mint (e.g. SOL mint)
 * @param amount - Amount in smallest units (lamports for SOL, raw for SPL)
 * @param slippageBps - Max slippage in basis points (default: 50 = 0.5%)
 */
export async function getJupiterOrder(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps?: number
): Promise<JupiterOrder> {
  const kp = getKeypair();
  const slippage = slippageBps ?? SAFETY.slippageBps;

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    taker: kp.publicKey.toBase58(),
    slippageBps: slippage.toString(),
  });

  const res = await fetch(`${APIS.JUPITER_ORDER}?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter order failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ── Jupiter Ultra: Sign & Execute ───────────────────────────────

export interface JupiterExecuteResult {
  status: "Success" | "Failed";
  signature: string;
  slot: number;
  inputAmountResult: string;
  outputAmountResult: string;
}

/**
 * Sign and execute a Jupiter Ultra swap order.
 *
 * 1. Deserialize the transaction from the order
 * 2. Sign with our keypair
 * 3. POST to /ultra/v1/execute
 * 4. Jupiter handles submission, confirmation, and retry
 */
export async function executeJupiterOrder(
  order: JupiterOrder
): Promise<JupiterExecuteResult> {
  const kp = getKeypair();

  // Deserialize and sign the transaction
  const txBytes = Buffer.from(order.transaction, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([kp]);

  // Send signed transaction to Jupiter for execution
  const signedTxBase64 = Buffer.from(tx.serialize()).toString("base64");

  const res = await fetch(APIS.JUPITER_EXECUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signedTransaction: signedTxBase64,
      requestId: order.requestId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter execute failed (${res.status}): ${body}`);
  }

  const result: JupiterExecuteResult = await res.json();

  if (result.status !== "Success") {
    throw new Error(`Jupiter swap failed: ${JSON.stringify(result)}`);
  }

  return result;
}

// ── High-Level Swap Function ────────────────────────────────────

export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  outputToken: OutputToken;
  priceImpact: number;
  route: string[];
  requestId: string;
}

/**
 * Execute a full USDC → target token swap on Jupiter.
 *
 * @param amountUsdc - USDC amount (human-readable, e.g. 10.5)
 * @param outputToken - Target token (SOL, BONK, JUP, or USDC for no-op)
 */
export async function swapOnJupiter(
  amountUsdc: number,
  outputToken: OutputToken
): Promise<SwapResult> {
  if (outputToken === "USDC") {
    // No-op: already USDC, no swap needed
    return {
      signature: "no-swap",
      inputAmount: amountUsdc,
      outputAmount: amountUsdc,
      outputToken: "USDC",
      priceImpact: 0,
      route: ["USDC"],
      requestId: "no-swap",
    };
  }

  const inputMint = SOLANA_MINTS.USDC;
  const outputMint = SOLANA_MINTS[outputToken];
  if (!outputMint) {
    throw new Error(`Unsupported output token: ${outputToken}`);
  }

  // USDC has 6 decimals
  const amountRaw = Math.floor(amountUsdc * 1e6).toString();

  // 1. Get order from Jupiter
  const order = await getJupiterOrder(inputMint, outputMint, amountRaw);

  // 2. Check price impact
  const priceImpact = parseFloat(order.priceImpactPct);
  if (priceImpact > SAFETY.maxPriceImpact) {
    throw new Error(
      `Price impact ${priceImpact}% exceeds max ${SAFETY.maxPriceImpact}%. Aborting swap.`
    );
  }

  // 3. Execute the swap
  const result = await executeJupiterOrder(order);

  // 4. Parse output amount
  const outputDecimals = outputToken === "SOL" ? 9 : 6; // SOL=9, most SPL=6
  const outputAmount = parseInt(result.outputAmountResult) / 10 ** outputDecimals;

  return {
    signature: result.signature,
    inputAmount: amountUsdc,
    outputAmount,
    outputToken,
    priceImpact,
    route: order.routePlan.map((r) => r.swapInfo.label),
    requestId: order.requestId,
  };
}

/**
 * Get a quote without executing.
 * Useful for showing estimated output to users.
 */
export async function getSwapQuote(
  amountUsdc: number,
  outputToken: OutputToken
): Promise<{
  estimatedOutput: number;
  priceImpact: number;
  route: string[];
  slippageBps: number;
}> {
  if (outputToken === "USDC") {
    return {
      estimatedOutput: amountUsdc,
      priceImpact: 0,
      route: ["USDC"],
      slippageBps: 0,
    };
  }

  const inputMint = SOLANA_MINTS.USDC;
  const outputMint = SOLANA_MINTS[outputToken];
  if (!outputMint) throw new Error(`Unsupported output token: ${outputToken}`);

  const amountRaw = Math.floor(amountUsdc * 1e6).toString();
  const order = await getJupiterOrder(inputMint, outputMint, amountRaw);

  const outputDecimals = outputToken === "SOL" ? 9 : 6;
  const estimatedOutput = parseInt(order.outAmount) / 10 ** outputDecimals;

  return {
    estimatedOutput,
    priceImpact: parseFloat(order.priceImpactPct),
    route: order.routePlan.map((r) => r.swapInfo.label),
    slippageBps: order.slippageBps,
  };
}
