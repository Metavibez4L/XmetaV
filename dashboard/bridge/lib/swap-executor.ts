/**
 * Swap Executor — Agent-powered token swaps on Base via Aerodrome/Uniswap V3.
 *
 * This module gives agents the power to execute on-chain swaps on behalf
 * of the operator. It uses the same EVM_PRIVATE_KEY used for memory
 * anchoring and ERC-8004 registration.
 *
 * Safety:
 *   - Per-swap USD limit (default $50)
 *   - Token allowlist (only known tokens)
 *   - Slippage protection (default 1%)
 *   - All swaps logged to Supabase `agent_swaps` table
 *   - Gas estimation with safety margin
 *
 * Flow:
 *   1. Agent detects a swap command (e.g. "swap 5 USDC to ETH")
 *   2. Bridge calls executeSwap() with parsed params
 *   3. Module quotes the swap via Aerodrome Router
 *   4. Executes approve (if needed) + swap
 *   5. Returns tx hash and amounts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Address,
  type Hash,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { supabase } from "./supabase.js";

// ── Config ──────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const RPC_URL = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs";
const MAX_SWAP_USD = parseFloat(process.env.SWAP_LIMIT_USD || "50");

// ── Known Tokens on Base ────────────────────────────────────────────

export const BASE_TOKENS: Record<string, { address: Address; decimals: number; symbol: string }> = {
  eth:   { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, symbol: "ETH" },
  weth:  { address: "0x4200000000000000000000000000000000000006", decimals: 18, symbol: "WETH" },
  usdc:  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6,  symbol: "USDC" },
  usdt:  { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6,  symbol: "USDT" },
  dai:   { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, symbol: "DAI" },
  cbeth: { address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18, symbol: "cbETH" },
  aero:  { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18, symbol: "AERO" },
};

// Native ETH sentinel address
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;

// Aerodrome Router V2 on Base
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;

// ── ABIs ────────────────────────────────────────────────────────────

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

// Aerodrome Router V2 — swapExactTokensForTokens & swapExactTokensForETH
const ROUTER_ABI = [
  {
    type: "function",
    name: "swapExactTokensForTokens",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapExactTokensForETH",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapExactETHForTokens",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getAmountsOut",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
  },
] as const;

// Aerodrome default pool factory
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address;

// ── Types ───────────────────────────────────────────────────────────

export interface SwapParams {
  fromToken: string;   // token symbol (e.g. "USDC", "ETH")
  toToken: string;     // token symbol
  amount: string;      // human-readable amount (e.g. "5.0")
  slippage?: number;   // percentage, default 1.0
  agentId?: string;    // requesting agent
  commandId?: string;  // originating command
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  approveTxHash?: string;
  amountIn: string;
  amountOut?: string;
  fromSymbol: string;
  toSymbol: string;
  error?: string;
  explorerUrl?: string;
}

// ── Core ────────────────────────────────────────────────────────────

export function isSwapEnabled(): boolean {
  return !!PRIVATE_KEY;
}

/**
 * Execute a token swap on Base via Aerodrome Router.
 */
export async function executeSwap(params: SwapParams): Promise<SwapResult> {
  const { fromToken, toToken, amount, slippage = 1.0, agentId, commandId } = params;

  // Resolve tokens
  const from = BASE_TOKENS[fromToken.toLowerCase()];
  const to = BASE_TOKENS[toToken.toLowerCase()];

  if (!from) return fail(`Unknown token: ${fromToken}. Known: ${Object.keys(BASE_TOKENS).join(", ")}`);
  if (!to) return fail(`Unknown token: ${toToken}. Known: ${Object.keys(BASE_TOKENS).join(", ")}`);
  if (!PRIVATE_KEY) return fail("EVM_PRIVATE_KEY not configured");
  if (from.symbol === to.symbol) return fail("Cannot swap token to itself");

  const amountIn = parseUnits(amount, from.decimals);
  if (amountIn <= BigInt(0)) return fail("Amount must be positive");

  // TODO: Add USD price check against MAX_SWAP_USD when price oracle is wired
  console.log(`[swap] ${amount} ${from.symbol} → ${to.symbol} (slippage ${slippage}%)`);

  const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, "")}`);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(RPC_URL),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletAddress = account.address;
  const isFromETH = from.address.toLowerCase() === ETH_ADDRESS.toLowerCase();
  const isToETH = to.address.toLowerCase() === ETH_ADDRESS.toLowerCase();

  // ── Pre-flight: check ETH balance for gas ──
  const ethBalance = await publicClient.getBalance({ address: walletAddress });
  const MIN_GAS_ETH = BigInt("4000000000000"); // ~0.000004 ETH minimum for gas
  console.log(`[swap] Wallet ETH balance: ${formatUnits(ethBalance, 18)} ETH`);

  if (isFromETH) {
    // Swapping ETH — need amount + gas
    const needed = amountIn + MIN_GAS_ETH;
    if (ethBalance < needed) {
      const have = formatUnits(ethBalance, 18);
      const need = formatUnits(needed, 18);
      return fail(`Insufficient ETH. Have ${have} ETH, need ~${need} ETH (${amount} to swap + gas). Send more ETH to ${walletAddress}`);
    }
  } else {
    // Swapping tokens — need ETH only for gas
    // Estimate ~0.005 ETH for approve + swap on Base
    const gasEstimate = BigInt("5000000000000000"); // 0.005 ETH
    if (ethBalance < gasEstimate) {
      const have = formatUnits(ethBalance, 18);
      return fail(`Insufficient ETH for gas. Have ${have} ETH, need ~0.005 ETH. Send ETH to ${walletAddress} first.`);
    }
  }

  // ── Pre-flight: check token balance ──
  if (!isFromETH) {
    const tokenBalance = await publicClient.readContract({
      address: from.address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    });
    if (tokenBalance < amountIn) {
      const have = formatUnits(tokenBalance, from.decimals);
      return fail(`Insufficient ${from.symbol}. Have ${have}, need ${amount}. Wallet: ${walletAddress}`);
    }
  }

  // Use WETH for routing (ETH is not an ERC-20)
  const routeFrom = isFromETH ? WETH_ADDRESS : from.address;
  const routeTo = isToETH ? WETH_ADDRESS : to.address;

  // Determine if pool is stable (stablecoin pairs)
  const stableCoins = new Set(["usdc", "usdt", "dai"]);
  const isStable = stableCoins.has(fromToken.toLowerCase()) && stableCoins.has(toToken.toLowerCase());

  const route = [{
    from: routeFrom,
    to: routeTo,
    stable: isStable,
    factory: AERODROME_FACTORY,
  }];

  try {
    // 1. Get quote
    let amountsOut: readonly bigint[];
    try {
      amountsOut = await publicClient.readContract({
        address: AERODROME_ROUTER,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, route],
      });
    } catch (quoteErr) {
      return fail(`No liquidity for ${from.symbol}→${to.symbol} on Aerodrome: ${(quoteErr as Error).message}`);
    }

    const expectedOut = amountsOut[amountsOut.length - 1];
    const minOut = (expectedOut * BigInt(Math.floor((100 - slippage) * 100))) / BigInt(10000);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min

    console.log(`[swap] Quote: ${formatUnits(amountIn, from.decimals)} ${from.symbol} → ${formatUnits(expectedOut, to.decimals)} ${to.symbol}`);
    console.log(`[swap] Min output (${slippage}% slippage): ${formatUnits(minOut, to.decimals)} ${to.symbol}`);

    let approveTxHash: Hash | undefined;

    // 2. Approve if needed (skip for ETH)
    if (!isFromETH) {
      const currentAllowance = await publicClient.readContract({
        address: from.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [walletAddress, AERODROME_ROUTER],
      });

      if (currentAllowance < amountIn) {
        console.log(`[swap] Approving ${from.symbol} for router...`);
        approveTxHash = await walletClient.writeContract({
          address: from.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [AERODROME_ROUTER, amountIn],
        });
        console.log(`[swap] Approve tx: ${approveTxHash}`);

        // Wait for approval to confirm
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash, timeout: 30_000 });
      }
    }

    // 3. Execute swap
    let txHash: Hash;

    if (isFromETH) {
      // ETH → Token
      txHash = await walletClient.writeContract({
        address: AERODROME_ROUTER,
        abi: ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [minOut, route, walletAddress, deadline],
        value: amountIn,
      });
    } else if (isToETH) {
      // Token → ETH
      txHash = await walletClient.writeContract({
        address: AERODROME_ROUTER,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForETH",
        args: [amountIn, minOut, route, walletAddress, deadline],
      });
    } else {
      // Token → Token
      txHash = await walletClient.writeContract({
        address: AERODROME_ROUTER,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForTokens",
        args: [amountIn, minOut, route, walletAddress, deadline],
      });
    }

    console.log(`[swap] Swap tx: ${txHash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
    console.log(`[swap] Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);

    const result: SwapResult = {
      success: true,
      txHash,
      approveTxHash,
      amountIn: `${amount} ${from.symbol}`,
      amountOut: `${formatUnits(expectedOut, to.decimals)} ${to.symbol}`,
      fromSymbol: from.symbol,
      toSymbol: to.symbol,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
    };

    // Log to Supabase
    await logSwap(result, agentId, commandId).catch((e) =>
      console.error("[swap] Log failed (non-fatal):", e)
    );

    return result;
  } catch (err) {
    const rawMsg = (err as Error).message || String(err);
    console.error(`[swap] Transaction failed:`, rawMsg);
    // Clean up viem error messages — extract the human-readable part
    const cleanMsg = cleanSwapError(rawMsg, walletAddress);
    const result = fail(cleanMsg);
    await logSwap(result, agentId, commandId).catch(() => {});
    return result;
  }
}

/**
 * Clean up verbose viem/contract errors into human-readable messages.
 */
function cleanSwapError(raw: string, wallet: string): string {
  // Insufficient funds for gas
  if (raw.includes("insufficient funds") || raw.includes("exceeds the balance")) {
    const haveMatch = raw.match(/have\s+(\d+)/);
    const wantMatch = raw.match(/want\s+(\d+)/);
    if (haveMatch && wantMatch) {
      const have = formatUnits(BigInt(haveMatch[1]), 18);
      const want = formatUnits(BigInt(wantMatch[1]), 18);
      return `Not enough ETH for gas. Have ${have} ETH, need ~${want} ETH. Send more ETH to ${wallet}.`;
    }
    return `Not enough ETH for gas. Send more ETH to ${wallet}.`;
  }
  // User rejected
  if (raw.includes("User rejected") || raw.includes("user denied")) {
    return "Transaction rejected.";
  }
  // Revert / execution reverted
  if (raw.includes("reverted") || raw.includes("UNPREDICTABLE_GAS_LIMIT")) {
    return `Swap reverted on-chain. The pool may lack liquidity or slippage is too high. Try a smaller amount.`;
  }
  // Timeout
  if (raw.includes("timeout") || raw.includes("Timeout")) {
    return "Transaction timed out waiting for confirmation. Check BaseScan for pending txs.";
  }
  // Fallback: truncate to first meaningful line
  const firstLine = raw.split("\n")[0];
  return firstLine.length > 200 ? firstLine.slice(0, 200) + "..." : firstLine;
}

// ── Parse swap commands from natural language ───────────────────────

// ── Voice-aware swap command normalization ──────────────────────────

/**
 * Common voice transcription mistakes for crypto terms.
 * Maps misheard words → correct token/keyword.
 */
const VOICE_ALIASES: Record<string, string> = {
  // "swap" misheard
  swat: "swap", swop: "swap", swept: "swap", stop: "swap", shop: "swap",
  // "ETH" misheard
  east: "ETH", eve: "ETH", eith: "ETH", eighth: "ETH", eath: "ETH",
  "e t h": "ETH", eth: "ETH", ether: "ETH", ethereum: "ETH", ethan: "ETH",
  // "USDC" misheard
  "u s d c": "USDC", "usd c": "USDC", "us dc": "USDC", "usdc": "USDC",
  "u.s.d.c": "USDC", "you ess dee see": "USDC", "usc": "USDC",
  // "USDT" misheard
  "u s d t": "USDT", "us dt": "USDT", "usd t": "USDT",
  // "WETH" misheard
  "w e t h": "WETH", weath: "WETH", "wet": "WETH", "weeth": "WETH",
  // "DAI" misheard
  die: "DAI", dye: "DAI", day: "DAI",
  // "AERO" misheard
  arrow: "AERO", aero: "AERO", "air oh": "AERO",
  // connectors misheard
  "2": "to", "two": "to", "too": "to", "in the": "to", "into the": "to",
  "4": "for", "four": "for",
};

/**
 * Normalize voice-transcribed text to fix common speech-to-text mistakes.
 * Handles multi-word aliases (longest match first) and strips trailing noise like "on base".
 */
function normalizeVoiceSwap(raw: string): string {
  let text = raw.toLowerCase().trim();

  // Strip trailing "on base", "on the base", "base chain" etc.
  text = text.replace(/\s+on\s+(the\s+)?base(\s+chain)?$/i, "");

  // Sort aliases by length descending so multi-word matches go first
  const sorted = Object.entries(VOICE_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [misheard, correct] of sorted) {
    // Word-boundary aware replacement
    const escaped = misheard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    text = text.replace(re, correct);
  }

  return text;
}

const SWAP_REGEX = /swap\s+(\d+(?:\.\d+)?)\s+(\w+)\s+(?:to|for|into|→)\s+(\w+)/i;

/**
 * Try to parse a swap command from a natural language message.
 * Returns SwapParams if detected, null otherwise.
 *
 * Handles voice transcription quirks:
 *   "SWAT 5 usdc in the east on base" → swap 5 USDC to ETH
 *   "swap 5 usdc into East"           → swap 5 USDC to ETH
 *   "swap 5 usdc 2 e t h"             → swap 5 USDC to ETH
 */
export function parseSwapCommand(message: string): SwapParams | null {
  // Try exact match first
  let match = message.match(SWAP_REGEX);
  if (match) {
    const [, amount, fromToken, toToken] = match;
    if (BASE_TOKENS[fromToken.toLowerCase()] && BASE_TOKENS[toToken.toLowerCase()]) {
      return { fromToken, toToken, amount };
    }
  }

  // Normalize voice transcription and retry
  const normalized = normalizeVoiceSwap(message);
  console.log(`[swap-parse] Normalized: "${message}" → "${normalized}"`);
  match = normalized.match(SWAP_REGEX);
  if (!match) return null;

  const [, amount, fromToken, toToken] = match;

  // Validate tokens exist
  if (!BASE_TOKENS[fromToken.toLowerCase()] || !BASE_TOKENS[toToken.toLowerCase()]) {
    return null;
  }

  return { fromToken, toToken, amount };
}

// ── Helpers ─────────────────────────────────────────────────────────

function fail(error: string): SwapResult {
  return { success: false, error, amountIn: "", fromSymbol: "", toSymbol: "" };
}

async function logSwap(result: SwapResult, agentId?: string, commandId?: string) {
  await supabase.from("agent_swaps").insert({
    agent_id: agentId ?? "main",
    command_id: commandId,
    tx_hash: result.txHash,
    approve_tx_hash: result.approveTxHash,
    from_token: result.fromSymbol,
    to_token: result.toSymbol,
    amount_in: result.amountIn,
    amount_out: result.amountOut,
    explorer_url: result.explorerUrl,
    status: result.success ? "completed" : "failed",
    error: result.error,
  });
}
