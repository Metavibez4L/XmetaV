/**
 * Kamino Earn Vault Module
 *
 * Deposit and withdraw from Kamino vaults on Solana for yield.
 * Uses Kamino REST API for transaction building, we sign locally.
 *
 * Flow: POST /ktx/kvault/deposit → sign returned tx → submit
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
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

// ── Vault Listing ───────────────────────────────────────────────

export interface VaultInfo {
  address: string;
  name: string;
  token: string;
  tokenMint: string;
  tvl: number;
  apy: number;
  sharesMint: string;
}

/**
 * Fetch available Kamino vaults from the API.
 */
export async function listVaults(): Promise<VaultInfo[]> {
  const res = await fetch(APIS.KAMINO_VAULTS);
  if (!res.ok) {
    throw new Error(`Kamino vaults list failed (${res.status}): ${await res.text()}`);
  }
  const data: VaultInfo[] = await res.json();
  return data;
}

// ── Deposit into Vault ──────────────────────────────────────────

export interface DepositResult {
  txSignature: string;
  vaultAddress: string;
  depositAmount: number;
  sharesReceived: number | null;
}

/**
 * Deposit tokens into a Kamino vault.
 *
 * 1. POST to Kamino API to build the deposit transaction
 * 2. Deserialize and sign the transaction
 * 3. Submit to Solana
 *
 * @param vaultAddress - Kamino vault address
 * @param amount - Token amount in smallest units (lamports / raw)
 * @param tokenMint - The token being deposited
 */
export async function depositToVault(
  vaultAddress: string,
  amount: string,
  tokenMint?: string
): Promise<DepositResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // 1. Request deposit transaction from Kamino API
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

  // 2. Deserialize and sign
  const txBytes = Buffer.from(txBase64, "base64");
  let signature: string;

  try {
    // Try VersionedTransaction first (Kamino usually returns v0)
    const vtx = VersionedTransaction.deserialize(txBytes);
    vtx.sign([kp]);
    const rawTx = vtx.serialize();
    signature = await conn.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(signature, "confirmed");
  } catch {
    // Fall back to legacy Transaction
    const tx = Transaction.from(txBytes);
    tx.sign(kp);
    signature = await sendAndConfirmTransaction(conn, tx, [kp]);
  }

  return {
    txSignature: signature,
    vaultAddress,
    depositAmount: parseFloat(amount),
    sharesReceived: null, // would need to parse tx events to get kToken amount
  };
}

// ── Withdraw from Vault ─────────────────────────────────────────

export interface WithdrawResult {
  txSignature: string;
  vaultAddress: string;
  sharesRedeemed: number;
  tokensReceived: number | null;
}

/**
 * Withdraw tokens from a Kamino vault.
 *
 * @param vaultAddress - Kamino vault address
 * @param shares - kToken shares to redeem (in smallest units)
 */
export async function withdrawFromVault(
  vaultAddress: string,
  shares: string
): Promise<WithdrawResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // 1. Request withdraw transaction from Kamino API
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

  // 2. Deserialize and sign
  const txBytes = Buffer.from(txBase64, "base64");
  let signature: string;

  try {
    const vtx = VersionedTransaction.deserialize(txBytes);
    vtx.sign([kp]);
    const rawTx = vtx.serialize();
    signature = await conn.sendRawTransaction(rawTx, {
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
  };
}

// ── High-Level: Deposit USDC into best USDC vault ──────────────

/**
 * Deposit USDC into the default Kamino USDC vault.
 *
 * @param amountUsdc - Human-readable USDC amount (e.g. 10.5)
 */
export async function depositUsdcToKamino(
  amountUsdc: number
): Promise<DepositResult> {
  const vault = KAMINO_VAULTS.USDC_MAIN;
  const amountRaw = Math.floor(amountUsdc * 1e6).toString();

  return depositToVault(vault.address, amountRaw, vault.tokenMint);
}

/**
 * Withdraw all USDC from the default Kamino USDC vault.
 *
 * @param shares - kToken shares to redeem (raw)
 */
export async function withdrawUsdcFromKamino(
  shares: string
): Promise<WithdrawResult> {
  const vault = KAMINO_VAULTS.USDC_MAIN;
  return withdrawFromVault(vault.address, shares);
}
