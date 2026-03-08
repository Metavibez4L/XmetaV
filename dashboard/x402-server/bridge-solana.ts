/**
 * Base ↔ Solana Bridge Module
 *
 * Handles USDC bridging between Base and Solana using
 * the native Base-Solana bridge (not CCTP).
 *
 * Base→Solana: burn ERC20 SOL on Base → finalization → Merkle proof → execute on Solana
 * Solana→Base: lock SOL/SPL → validators approve → mint on Base
 */

import { createPublicClient, createWalletClient, http, parseAbi, type Hash, type Hex } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import {
  BASE_CONTRACTS,
  SOLANA_CONTRACTS,
  SAFETY,
  type CrossChainJob,
} from "./cross-chain-types.js";

// ── ABIs ────────────────────────────────────────────────────────

const BRIDGE_ABI = parseAbi([
  "function bridgeToken(address token, uint256 amount, address to, uint256 destChainId, bytes[] hooks) external",
  "function bridgeETH(uint256 destChainId, address to, bytes[] hooks) external payable",
  "event BridgeInitiated(address indexed token, address indexed from, address to, uint256 amount, uint256 destChainId, bytes32 bridgeId)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// ── Client Setup ────────────────────────────────────────────────

// Use `any` for viem client types to avoid version-specific generic mismatches
let publicClient: any = null;
let walletClient: any = null;
let solanaConnection: Connection | null = null;
let solanaKeypair: Keypair | null = null;

function getBaseClients() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });
  }
  if (!walletClient) {
    const pk = process.env.EVM_PRIVATE_KEY;
    if (!pk) throw new Error("EVM_PRIVATE_KEY required for bridge operations");
    const account = privateKeyToAccount(pk as `0x${string}`);
    walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });
  }
  return { publicClient, walletClient };
}

function getSolanaConnection(): Connection {
  if (!solanaConnection) {
    const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    solanaConnection = new Connection(rpc, "confirmed");
  }
  return solanaConnection;
}

function getSolanaKeypair(): Keypair {
  if (!solanaKeypair) {
    const key = process.env.SOLANA_PRIVATE_KEY;
    if (!key) throw new Error("SOLANA_PRIVATE_KEY required for Solana operations");
    solanaKeypair = Keypair.fromSecretKey(bs58.decode(key));
  }
  return solanaKeypair;
}

// ── Bridge: Base → Solana ───────────────────────────────────────

export interface BridgeToSolanaResult {
  txHash: Hash;
  bridgeId: string | null;
  amount: bigint;
  estimatedArrival: number; // ms
}

/**
 * Bridge USDC from Base to Solana.
 *
 * 1. Approve Bridge contract to spend USDC
 * 2. Call bridgeToken() to burn USDC on Base
 * 3. Wait for finalization (~15 min on Base)
 * 4. Token arrives on Solana via bridge validators
 */
export async function bridgeToSolana(
  amountUsdc: number,
  destinationSolanaAddress?: string
): Promise<BridgeToSolanaResult> {
  if (amountUsdc > SAFETY.maxSingleBridge) {
    throw new Error(`Amount $${amountUsdc} exceeds max single bridge of $${SAFETY.maxSingleBridge}`);
  }
  if (amountUsdc < SAFETY.minPayment) {
    throw new Error(`Amount $${amountUsdc} below minimum of $${SAFETY.minPayment}`);
  }

  const { publicClient: pc, walletClient: wc } = getBaseClients();
  if (!pc || !wc) throw new Error("Base clients not initialized");

  const usdcAddress = BASE_CONTRACTS.USDC;
  const bridgeAddress = BASE_CONTRACTS.BRIDGE;
  const amount = BigInt(Math.floor(amountUsdc * 1e6)); // USDC has 6 decimals

  // Destination: either specified Solana address or our own wallet
  const solDest = destinationSolanaAddress || getSolanaKeypair().publicKey.toBase58();

  // 1. Check allowance and approve if needed
  const account = wc.account;
  if (!account) throw new Error("Wallet account not available");

  const currentAllowance = await pc.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, bridgeAddress],
  });

  if (currentAllowance < amount) {
    const approveTx = await wc.writeContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [bridgeAddress, amount],
      chain: base,
    });
    await pc.waitForTransactionReceipt({ hash: approveTx });
  }

  // 2. Bridge USDC to Solana
  // The bridge uses individual args: (token, amount, to, destChainId)
  // destChainId for Solana = 501 (Wormhole chain ID convention)

  const bridgeTx = await wc.writeContract({
    address: bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: "bridgeToken",
    args: [usdcAddress, amount, solDest as `0x${string}`, BigInt(501), []],
    chain: base,
  });

  const receipt = await pc.waitForTransactionReceipt({ hash: bridgeTx });

  // 3. Extract bridgeId from event logs
  let bridgeId: string | null = null;
  for (const log of receipt.logs) {
    try {
      // Look for BridgeInitiated event
      if (log.topics[0] === "0x" + "BridgeInitiated".slice(0, 10)) {
        bridgeId = log.data;
        break;
      }
    } catch {
      // skip unparseable logs
    }
  }

  return {
    txHash: bridgeTx,
    bridgeId,
    amount,
    estimatedArrival: 15 * 60 * 1000, // ~15 min for Base finalization
  };
}

// ── Bridge Status Polling ───────────────────────────────────────

export interface BridgeStatus {
  confirmed: boolean;
  solanaBalance: number;
  txSignature: string | null;
}

/**
 * Check if USDC has arrived on Solana after bridging from Base.
 * Polls the Solana USDC balance for the destination wallet.
 */
export async function checkBridgeArrival(
  expectedAmountUsdc: number,
  walletAddress?: string
): Promise<BridgeStatus> {
  const conn = getSolanaConnection();
  const wallet = walletAddress
    ? new PublicKey(walletAddress)
    : getSolanaKeypair().publicKey;

  const usdcMint = new PublicKey(SOLANA_CONTRACTS.USDC_MINT);
  const ata = await getAssociatedTokenAddress(usdcMint, wallet);

  try {
    const balance = await conn.getTokenAccountBalance(ata);
    const uiAmount = balance.value.uiAmount || 0;

    return {
      confirmed: uiAmount >= expectedAmountUsdc * 0.99, // 1% tolerance for bridge fees
      solanaBalance: uiAmount,
      txSignature: null, // would need to scan recent txs to find exact signature
    };
  } catch {
    // Token account may not exist yet
    return {
      confirmed: false,
      solanaBalance: 0,
      txSignature: null,
    };
  }
}

/**
 * Wait for bridge arrival with polling.
 * Polls every 30s up to the bridge timeout.
 */
export async function waitForBridgeArrival(
  expectedAmountUsdc: number,
  walletAddress?: string,
  timeoutMs?: number
): Promise<BridgeStatus> {
  const timeout = timeoutMs || SAFETY.bridgeTimeout;
  const pollInterval = 30_000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const status = await checkBridgeArrival(expectedAmountUsdc, walletAddress);
    if (status.confirmed) return status;
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`Bridge timeout: USDC not received on Solana after ${timeout / 1000}s`);
}

// ── Bridge: Solana → Base ───────────────────────────────────────

export interface BridgeToBaseResult {
  txSignature: string;
  amount: number;
  estimatedArrival: number; // ms
}

/**
 * Bridge USDC from Solana back to Base.
 *
 * Uses the Solana bridge program to lock USDC and trigger
 * mint on Base via bridge validators.
 */
export async function bridgeToBase(
  amountUsdc: number,
  destinationBaseAddress?: string
): Promise<BridgeToBaseResult> {
  if (amountUsdc > SAFETY.maxSingleBridge) {
    throw new Error(`Amount $${amountUsdc} exceeds max single bridge of $${SAFETY.maxSingleBridge}`);
  }

  const conn = getSolanaConnection();
  const keypair = getSolanaKeypair();
  const baseDest = destinationBaseAddress || getBaseClients().walletClient?.account?.address;
  if (!baseDest) throw new Error("No Base destination address");

  const usdcMint = new PublicKey(SOLANA_CONTRACTS.USDC_MINT);
  const bridgeProgram = new PublicKey(SOLANA_CONTRACTS.BRIDGE_PROGRAM);

  // Get the user's USDC token account
  const userAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
  const amountRaw = BigInt(Math.floor(amountUsdc * 1e6));

  // Build the bridge instruction
  // The bridge program locks tokens and emits a message for validators
  // Instruction data: [bridge_instruction_discriminator, amount, dest_chain, dest_address]
  const instructionData = Buffer.alloc(73);
  // Discriminator for bridge_to_evm (first 8 bytes)
  instructionData.writeUInt8(1, 0); // instruction index
  instructionData.writeBigUInt64LE(amountRaw, 1);
  instructionData.writeUInt32LE(8453, 9); // Base chain ID
  // Write destination EVM address (20 bytes) starting at offset 13
  const destBytes = Buffer.from(baseDest.slice(2), "hex");
  destBytes.copy(instructionData, 13);

  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: keypair.publicKey,
  });

  tx.add({
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: bridgeProgram, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: bridgeProgram,
    data: instructionData,
  });

  const signature = await sendAndConfirmTransaction(conn, tx, [keypair]);

  return {
    txSignature: signature,
    amount: amountUsdc,
    estimatedArrival: 20 * 60 * 1000, // ~20 min for Solana→Base finalization
  };
}

/**
 * Check Base balance after Solana→Base bridge.
 */
export async function checkBaseArrival(
  expectedAmountUsdc: number,
  walletAddress?: string
): Promise<{ confirmed: boolean; balance: number }> {
  const { publicClient: pc } = getBaseClients();
  if (!pc) throw new Error("Base client not initialized");

  const wallet = (walletAddress || getBaseClients().walletClient?.account?.address) as `0x${string}`;
  if (!wallet) throw new Error("No wallet address");

  const balance = await pc.readContract({
    address: BASE_CONTRACTS.USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [wallet],
  });

  const uiBalance = Number(balance) / 1e6;

  return {
    confirmed: uiBalance >= expectedAmountUsdc * 0.99,
    balance: uiBalance,
  };
}

/**
 * Wait for Solana→Base bridge arrival.
 */
export async function waitForBaseArrival(
  expectedAmountUsdc: number,
  walletAddress?: string,
  timeoutMs?: number
): Promise<{ confirmed: boolean; balance: number }> {
  const timeout = timeoutMs || SAFETY.bridgeTimeout;
  const pollInterval = 30_000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const status = await checkBaseArrival(expectedAmountUsdc, walletAddress);
    if (status.confirmed) return status;
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`Return bridge timeout: USDC not received on Base after ${timeout / 1000}s`);
}
