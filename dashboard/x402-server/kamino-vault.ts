/**
 * Kamino Earn Vault Module (SDK-based)
 *
 * Uses @kamino-finance/klend-sdk for vault data, APY, holdings, user positions.
 * SDK-first for reads; API-first for deposit/withdraw transactions.
 *
 * Note: klend-sdk uses @solana/kit types internally. We cast @solana/web3.js
 * Connection/PublicKey at SDK boundaries with `as any` for compatibility.
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
  sendAndConfirmTransaction,
  Transaction,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import { KaminoVault } from "@kamino-finance/klend-sdk";
import Decimal from "decimal.js";
import { APIS, SOLANA_CONTRACTS } from "./cross-chain-types.js";

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
    if (!key) throw new Error("SOLANA_PRIVATE_KEY required for Kamino operations");
    keypair = Keypair.fromSecretKey(bs58.decode(key));
  }
  return keypair;
}

// ── Known Kamino Vaults ─────────────────────────────────────────

export const KAMINO_VAULTS: Record<string, {
  address: string;
  name: string;
  token: string;
  tokenMint: string;
  estimatedApy: number;
}> = {
  USDC_MAIN: {
    address: "HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E",
    name: "Kamino USDC Main Vault",
    token: "USDC",
    tokenMint: SOLANA_CONTRACTS.USDC_MINT,
    estimatedApy: 8.5,
  },
  SOL_MAIN: {
    address: "ByYiZxp8QrdN9qbdtaAiePN8AAr3qvTPppNJDpf5DVJ5",
    name: "Kamino SOL Main Vault",
    token: "SOL",
    tokenMint: SOLANA_CONTRACTS.SOL_MINT,
    estimatedApy: 7.2,
  },
};

// ── SDK Vault Cache ─────────────────────────────────────────────

const vaultCache = new Map<string, { vault: KaminoVault; loadedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

async function getKaminoVault(vaultAddress: string): Promise<KaminoVault> {
  const cached = vaultCache.get(vaultAddress);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.vault;
  }
  const conn = getConnection();
  // klend-sdk expects @solana/kit Rpc, but works at runtime with web3.js Connection
  const vault = new KaminoVault(conn as any, new PublicKey(vaultAddress) as any);
  await vault.getState();
  vaultCache.set(vaultAddress, { vault, loadedAt: Date.now() });
  return vault;
}

// ── Vault Data (SDK) ────────────────────────────────────────────

export interface VaultInfo {
  address: string;
  name: string;
  token: string;
  tokenMint: string;
  tvl: number;
  apy: number;
  sharesMint: string;
}

export interface VaultDetails {
  address: string;
  holdings: any;
  allocations: any;
  apy: any;
  exchangeRate: any;
  hasFarm: boolean;
}

/**
 * Get live vault details via SDK: holdings, allocations, APY, exchange rate.
 */
export async function getVaultDetails(vaultAddress: string): Promise<VaultDetails> {
  const vault = await getKaminoVault(vaultAddress);
  const [holdings, allocations, apy, exchangeRate] = await Promise.all([
    vault.getVaultHoldings(),
    vault.getVaultAllocations(),
    vault.getAPYs(),
    vault.getExchangeRate(),
  ]);

  return {
    address: vaultAddress,
    holdings,
    allocations,
    apy,
    exchangeRate,
    hasFarm: await vault.hasFarm(),
  };
}

/**
 * Get user's share balance in a vault via SDK.
 */
export async function getUserVaultShares(
  vaultAddress: string,
  walletAddress?: string
): Promise<any> {
  const vault = await getKaminoVault(vaultAddress);
  const wallet = walletAddress
    ? new PublicKey(walletAddress)
    : getKeypair().publicKey;
  return vault.getUserShares(wallet as any);
}

/**
 * Fetch available Kamino vaults from the API (list endpoint).
 */
export async function listVaults(): Promise<VaultInfo[]> {
  const res = await fetch(APIS.KAMINO_VAULTS);
  if (!res.ok) {
    throw new Error(`Kamino vaults list failed (${res.status}): ${await res.text()}`);
  }
  const data: VaultInfo[] = await res.json();
  return data;
}

/**
 * Get user positions across all known vaults.
 * Queries each vault in KAMINO_VAULTS for user shares.
 */
export async function getUserPositions(walletAddress?: string): Promise<any> {
  const wallet = walletAddress
    ? new PublicKey(walletAddress)
    : getKeypair().publicKey;
  const results: Record<string, any> = {};
  for (const [key, info] of Object.entries(KAMINO_VAULTS)) {
    try {
      const vault = await getKaminoVault(info.address);
      results[key] = await vault.getUserShares(wallet as any);
    } catch {
      results[key] = null;
    }
  }
  return { wallet: wallet.toBase58(), positions: results };
}

// ── Deposit into Vault (SDK-first, API fallback) ────────────────

export interface DepositResult {
  txSignature: string;
  vaultAddress: string;
  depositAmount: number;
  sharesReceived: number | null;
  method: "sdk" | "api";
}

/**
 * Deposit tokens into a Kamino vault using SDK instruction building.
 * Falls back to REST API if SDK method fails.
 */
export async function depositToVault(
  vaultAddress: string,
  amount: string,
  tokenMint?: string
): Promise<DepositResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // Try SDK-based deposit first
  try {
    const vault = await getKaminoVault(vaultAddress);
    const depositAmount = new Decimal(amount);
    const ixResult: any = await vault.depositIxs(kp.publicKey as any, depositAmount);

    // DepositIxs may be an object with instruction arrays or a flat array
    const ixs: any[] = Array.isArray(ixResult)
      ? ixResult
      : [...(ixResult.setupIxs || []), ...(ixResult.depositIxs || []), ...(ixResult.cleanupIxs || [])];

    const { blockhash } = await conn.getLatestBlockhash("finalized");
    const messageV0 = new TransactionMessage({
      payerKey: kp.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();

    const vtx = new VersionedTransaction(messageV0);
    vtx.sign([kp]);

    const signature = await conn.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(signature, "confirmed");

    return {
      txSignature: signature,
      vaultAddress,
      depositAmount: parseFloat(amount),
      sharesReceived: null,
      method: "sdk",
    };
  } catch (sdkErr: any) {
    console.warn("[kamino] SDK deposit failed, falling back to API:", sdkErr.message);
  }

  // Fallback: REST API deposit
  const res = await fetch(APIS.KAMINO_DEPOSIT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: kp.publicKey.toBase58(),
      kvault: vaultAddress,
      amount,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kamino deposit failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const txBase64: string = data.transaction;
  const txBytes = Buffer.from(txBase64, "base64");
  let signature: string;

  try {
    const vtx = VersionedTransaction.deserialize(txBytes);
    vtx.sign([kp]);
    signature = await conn.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(signature, "confirmed");
  } catch {
    const tx = Transaction.from(txBytes);
    tx.sign(kp);
    signature = await sendAndConfirmTransaction(conn, tx, [kp]);
  }

  return {
    txSignature: signature,
    vaultAddress,
    depositAmount: parseFloat(amount),
    sharesReceived: null,
    method: "api",
  };
}

// ── Withdraw from Vault (SDK-first, API fallback) ───────────────

export interface WithdrawResult {
  txSignature: string;
  vaultAddress: string;
  sharesRedeemed: number;
  tokensReceived: number | null;
  method: "sdk" | "api";
}

/**
 * Withdraw tokens from a Kamino vault using SDK instruction building.
 * Falls back to REST API if SDK method fails.
 */
export async function withdrawFromVault(
  vaultAddress: string,
  shares: string
): Promise<WithdrawResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // Try SDK-based withdraw first
  try {
    const vault = await getKaminoVault(vaultAddress);
    const shareAmount = new Decimal(shares);
    const ixResult: any = await vault.withdrawIxs(kp.publicKey as any, shareAmount);

    // WithdrawIxs may be an object with instruction arrays or a flat array
    const ixs: any[] = Array.isArray(ixResult)
      ? ixResult
      : [...(ixResult.setupIxs || []), ...(ixResult.withdrawIxs || []), ...(ixResult.cleanupIxs || [])];

    const { blockhash } = await conn.getLatestBlockhash("finalized");
    const messageV0 = new TransactionMessage({
      payerKey: kp.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();

    const vtx = new VersionedTransaction(messageV0);
    vtx.sign([kp]);

    const signature = await conn.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(signature, "confirmed");

    return {
      txSignature: signature,
      vaultAddress,
      sharesRedeemed: parseFloat(shares),
      tokensReceived: null,
      method: "sdk",
    };
  } catch (sdkErr: any) {
    console.warn("[kamino] SDK withdraw failed, falling back to API:", sdkErr.message);
  }

  // Fallback: REST API withdraw
  const res = await fetch(APIS.KAMINO_WITHDRAW, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: kp.publicKey.toBase58(),
      kvault: vaultAddress,
      shares,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kamino withdraw failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const txBase64: string = data.transaction;
  const txBytes = Buffer.from(txBase64, "base64");
  let signature: string;

  try {
    const vtx = VersionedTransaction.deserialize(txBytes);
    vtx.sign([kp]);
    signature = await conn.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(signature, "confirmed");
  } catch {
    const tx = Transaction.from(txBytes);
    tx.sign(kp);
    signature = await sendAndConfirmTransaction(conn, tx, [kp]);
  }

  return {
    txSignature: signature,
    vaultAddress,
    sharesRedeemed: parseFloat(shares),
    tokensReceived: null,
    method: "api",
  };
}

// ── High-Level Helpers ──────────────────────────────────────────

export async function depositUsdcToKamino(amountUsdc: number): Promise<DepositResult> {
  const vault = KAMINO_VAULTS.USDC_MAIN;
  const amountRaw = Math.floor(amountUsdc * 1e6).toString();
  return depositToVault(vault.address, amountRaw, vault.tokenMint);
}

export async function withdrawUsdcFromKamino(shares: string): Promise<WithdrawResult> {
  const vault = KAMINO_VAULTS.USDC_MAIN;
  return withdrawFromVault(vault.address, shares);
}
