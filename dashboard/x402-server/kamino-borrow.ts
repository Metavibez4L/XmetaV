/**
 * Kamino Borrow Module (SDK-based)
 *
 * Supply collateral, borrow assets, repay loans, and withdraw collateral
 * using @kamino-finance/klend-sdk against Kamino's main lending market.
 *
 * Main Market: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
  PublicKey,
} from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import bs58 from "bs58";
import {
  KaminoMarket,
  KaminoAction,
  VanillaObligation,
  PROGRAM_ID,
} from "@kamino-finance/klend-sdk";
import Decimal from "decimal.js";
import { APIS } from "./cross-chain-types.js";

// ── Constants ───────────────────────────────────────────────────

export const MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const SLOT_DURATION_MS = 400;

// ── Connection (shared with kamino-vault) ───────────────────────

let connection: Connection | null = null;
let keypair: Keypair | null = null;
let solanaRpc: ReturnType<typeof createSolanaRpc> | null = null;

function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(getRpcUrl(), "confirmed");
  }
  return connection;
}

/** v2 Rpc for klend-sdk (uses @solana/kit RPC protocol) */
function getRpc() {
  if (!solanaRpc) {
    solanaRpc = createSolanaRpc(getRpcUrl());
  }
  return solanaRpc;
}

function getKeypair(): Keypair {
  if (!keypair) {
    const key = process.env.SOLANA_PRIVATE_KEY;
    if (!key) throw new Error("SOLANA_PRIVATE_KEY required for Kamino borrow operations");
    keypair = Keypair.fromSecretKey(bs58.decode(key));
  }
  return keypair;
}

// ── Market Cache ────────────────────────────────────────────────

let marketCache: { market: KaminoMarket; loadedAt: number } | null = null;
const MARKET_CACHE_TTL = 60_000; // 1 minute

async function getMarket(): Promise<KaminoMarket> {
  if (marketCache && Date.now() - marketCache.loadedAt < MARKET_CACHE_TTL) {
    return marketCache.market;
  }
  const rpc = getRpc();
  // klend-sdk 7.3.20+ expects @solana/kit v2 Rpc & Address types
  const market = await KaminoMarket.load(
    rpc as any,
    MAIN_MARKET as any,
    SLOT_DURATION_MS,
    PROGRAM_ID,
  );
  if (!market) throw new Error("Failed to load Kamino lending market");
  marketCache = { market, loadedAt: Date.now() };
  return market;
}

// ── Market Data ─────────────────────────────────────────────────

export interface MarketOverview {
  address: string;
  totalDepositTVL: number;
  totalBorrowTVL: number;
  reserves: ReserveInfo[];
}

export interface ReserveInfo {
  symbol: string;
  mint: string;
  depositTvl: number;
  borrowTvl: number;
  supplyApy: number;
  borrowApy: number;
  utilization: number;
}

export async function getMarketOverview(): Promise<MarketOverview> {
  const market = await getMarket();
  const slotNum = await getConnection().getSlot();
  const slot = BigInt(slotNum);
  const reserves = market.getReserves();

  const toNum = (v: any): number => {
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    if (v && typeof v.toNumber === "function") return v.toNumber();
    return Number(v) || 0;
  };
  const toStr = (v: any): string => {
    if (typeof v === "string") return v;
    if (v && typeof v.toBase58 === "function") return v.toBase58();
    return String(v);
  };

  const reserveInfos: ReserveInfo[] = reserves.map((r: any) => ({
    symbol: r.getTokenSymbol?.() ?? "UNKNOWN",
    mint: toStr(r.getLiquidityMint?.()),
    depositTvl: toNum(r.getDepositTvl?.()),
    borrowTvl: toNum(r.getBorrowTvl?.()),
    supplyApy: toNum(r.totalSupplyAPY?.(slot)),
    borrowApy: toNum(r.totalBorrowAPY?.(slot)),
    utilization: toNum(r.calculateUtilizationRatio?.()),
  }));

  return {
    address: MAIN_MARKET,
    totalDepositTVL: toNum(market.getTotalDepositTVL()),
    totalBorrowTVL: toNum(market.getTotalBorrowTVL()),
    reserves: reserveInfos,
  };
}

// ── User Obligation Data ────────────────────────────────────────

export interface UserObligation {
  address: string;
  loanToValue: number;
  deposits: any[];
  borrows: any[];
  refreshedStats: any;
}

export async function getUserObligation(walletAddress?: string): Promise<UserObligation | null> {
  const market = await getMarket();
  const walletAddr = walletAddress ?? getKeypair().publicKey.toBase58();

  const obligation = await market.getObligationByWallet(
    walletAddr as any,
    new VanillaObligation(PROGRAM_ID),
  );

  if (!obligation) return null;

  const toNum = (v: any): number => {
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    if (v && typeof v.toNumber === "function") return v.toNumber();
    return Number(v) || 0;
  };
  const toStr = (v: any): string => {
    if (typeof v === "string") return v;
    if (v && typeof v.toBase58 === "function") return v.toBase58();
    return String(v);
  };

  const deposits = obligation.deposits instanceof Map
    ? Array.from((obligation.deposits as Map<any, any>).entries()).map(([k, d]: [any, any]) => ({
        reserve: toStr(k),
        amount: toNum(d?.amount),
        marketValue: toNum(d?.marketValueRefreshed),
      }))
    : Array.isArray(obligation.deposits)
      ? (obligation.deposits as any[]).map((d: any) => ({
          reserve: toStr(d.mintAddress ?? d.reserve),
          amount: toNum(d.amount),
          marketValue: toNum(d.marketValueRefreshed),
        }))
      : [];

  const borrows = obligation.borrows instanceof Map
    ? Array.from((obligation.borrows as Map<any, any>).entries()).map(([k, b]: [any, any]) => ({
        reserve: toStr(k),
        amount: toNum(b?.amount),
        marketValue: toNum(b?.marketValueRefreshed),
      }))
    : Array.isArray(obligation.borrows)
      ? (obligation.borrows as any[]).map((b: any) => ({
          reserve: toStr(b.mintAddress ?? b.reserve),
          amount: toNum(b.amount),
          marketValue: toNum(b.marketValueRefreshed),
        }))
      : [];

  return {
    address: toStr((obligation as any).obligationAddress),
    loanToValue: toNum((obligation as any).loanToValue?.()),
    deposits,
    borrows,
    refreshedStats: {
      borrowUtilization: toNum((obligation as any).refreshedStats?.borrowUtilization),
      netAccountValue: toNum((obligation as any).refreshedStats?.netAccountValue),
    },
  };
}

// ── Transaction Helpers ─────────────────────────────────────────

async function buildAndSendTxns(ixs: any[]): Promise<string> {
  const kp = getKeypair();
  const conn = getConnection();

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
  return signature;
}

// ── Deposit Collateral (SDK) ────────────────────────────────────

export interface BorrowTxResult {
  txSignature: string;
  market: string;
  method: "sdk" | "api";
}

/**
 * Deposit collateral into the Kamino lending market.
 * Uses KaminoAction.buildDepositTxns via SDK.
 * Falls back to API POST /ktx/klend/deposit.
 */
export async function depositCollateral(
  tokenMint: string,
  amount: string
): Promise<BorrowTxResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // SDK attempt
  try {
    const market = await getMarket();
    const depositAction = await KaminoAction.buildDepositTxns(
      market as any,
      amount,
      tokenMint as any,
      { address: kp.publicKey.toBase58() } as any,
      new VanillaObligation(PROGRAM_ID),
      false, // useV2Ixs
      undefined, // scopeRefreshConfig
    );

    const allIxs = [
      ...depositAction.setupIxs,
      ...depositAction.lendingIxs,
      ...depositAction.cleanupIxs,
    ];
    const sig = await buildAndSendTxns(allIxs);
    return { txSignature: sig, market: MAIN_MARKET, method: "sdk" };
  } catch (sdkErr: any) {
    console.warn("[kamino-borrow] SDK depositCollateral failed, trying API:", sdkErr.message);
  }

  // API fallback
  const res = await fetch(`${APIS.KAMINO_API}/ktx/klend/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: kp.publicKey.toBase58(),
      market: MAIN_MARKET,
      token: tokenMint,
      amount,
    }),
  });

  if (!res.ok) throw new Error(`Kamino deposit-collateral API failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const sig = await signAndSubmitApiTx(data.transaction, conn, kp);
  return { txSignature: sig, market: MAIN_MARKET, method: "api" };
}

/**
 * Borrow assets from the Kamino lending market.
 */
export async function borrowAsset(
  tokenMint: string,
  amount: string
): Promise<BorrowTxResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // SDK attempt
  try {
    const market = await getMarket();
    const borrowAction = await KaminoAction.buildBorrowTxns(
      market as any,
      amount,
      tokenMint as any,
      { address: kp.publicKey.toBase58() } as any,
      new VanillaObligation(PROGRAM_ID),
      false, // useV2Ixs
      undefined, // scopeRefreshConfig
    );

    const allIxs = [
      ...borrowAction.setupIxs,
      ...borrowAction.lendingIxs,
      ...borrowAction.cleanupIxs,
    ];
    const sig = await buildAndSendTxns(allIxs);
    return { txSignature: sig, market: MAIN_MARKET, method: "sdk" };
  } catch (sdkErr: any) {
    console.warn("[kamino-borrow] SDK borrowAsset failed, trying API:", sdkErr.message);
  }

  // API fallback
  const res = await fetch(`${APIS.KAMINO_API}/ktx/klend/borrow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: kp.publicKey.toBase58(),
      market: MAIN_MARKET,
      token: tokenMint,
      amount,
    }),
  });

  if (!res.ok) throw new Error(`Kamino borrow API failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const sig = await signAndSubmitApiTx(data.transaction, conn, kp);
  return { txSignature: sig, market: MAIN_MARKET, method: "api" };
}

/**
 * Repay a loan on the Kamino lending market.
 */
export async function repayLoan(
  tokenMint: string,
  amount: string
): Promise<BorrowTxResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // API (repay is only available via API in the SDK via buildRepayAndWithdrawTxns composite)
  const res = await fetch(`${APIS.KAMINO_API}/ktx/klend/repay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: kp.publicKey.toBase58(),
      market: MAIN_MARKET,
      token: tokenMint,
      amount,
    }),
  });

  if (!res.ok) throw new Error(`Kamino repay API failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const sig = await signAndSubmitApiTx(data.transaction, conn, kp);
  return { txSignature: sig, market: MAIN_MARKET, method: "api" };
}

/**
 * Withdraw collateral from the Kamino lending market.
 */
export async function withdrawCollateral(
  tokenMint: string,
  amount: string
): Promise<BorrowTxResult> {
  const kp = getKeypair();
  const conn = getConnection();

  // SDK attempt
  try {
    const market = await getMarket();
    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      market as any,
      amount,
      tokenMint as any,
      { address: kp.publicKey.toBase58() } as any,
      new VanillaObligation(PROGRAM_ID),
      false, // useV2Ixs
      undefined, // scopeRefreshConfig
    );

    const allIxs = [
      ...withdrawAction.setupIxs,
      ...withdrawAction.lendingIxs,
      ...withdrawAction.cleanupIxs,
    ];
    const sig = await buildAndSendTxns(allIxs);
    return { txSignature: sig, market: MAIN_MARKET, method: "sdk" };
  } catch (sdkErr: any) {
    console.warn("[kamino-borrow] SDK withdrawCollateral failed, trying API:", sdkErr.message);
  }

  // API fallback
  const res = await fetch(`${APIS.KAMINO_API}/ktx/klend/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: kp.publicKey.toBase58(),
      market: MAIN_MARKET,
      token: tokenMint,
      amount,
    }),
  });

  if (!res.ok) throw new Error(`Kamino withdraw-collateral API failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const sig = await signAndSubmitApiTx(data.transaction, conn, kp);
  return { txSignature: sig, market: MAIN_MARKET, method: "api" };
}

// ── Sign API-returned transactions ──────────────────────────────

async function signAndSubmitApiTx(
  txBase64: string,
  conn: Connection,
  kp: Keypair
): Promise<string> {
  const txBytes = Buffer.from(txBase64, "base64");
  try {
    const vtx = VersionedTransaction.deserialize(txBytes);
    vtx.sign([kp]);
    const sig = await conn.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(sig, "confirmed");
    return sig;
  } catch {
    const { Transaction: LegacyTx } = await import("@solana/web3.js");
    const tx = LegacyTx.from(txBytes);
    tx.sign(kp);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    return sig;
  }
}
