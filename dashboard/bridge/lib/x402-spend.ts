// ============================================================
// x402 Spend Tracker
// Tracks payments and enforces spend limits
// ============================================================

import { supabase } from "./supabase.js";

// ── In-memory spend tracking (fast, resets on restart) ──────

interface SpendRecord {
  amount: string;
  url: string;
  network: string;
  timestamp: number;
}

const spendLog: SpendRecord[] = [];

// ── Configuration ───────────────────────────────────────────

export interface X402SpendConfig {
  /** Max USDC per single payment (e.g., "0.10") */
  maxPerRequest: number;
  /** Max USDC per hour */
  maxPerHour: number;
  /** Max USDC per day (24h rolling window) */
  maxPerDay: number;
  /** Allowed domains — only pay these. Empty = allow all (dangerous). */
  allowedDomains: string[];
  /** Blocked domains — never pay these */
  blockedDomains: string[];
}

/**
 * Load spend config from environment variables.
 */
export function loadSpendConfig(): X402SpendConfig {
  return {
    maxPerRequest: parseFloat(process.env.X402_MAX_PER_REQUEST || "0.10"),
    maxPerHour: parseFloat(process.env.X402_MAX_PER_HOUR || "1.00"),
    maxPerDay: parseFloat(process.env.X402_MAX_DAILY || "10.00"),
    allowedDomains: (process.env.X402_ALLOWED_DOMAINS || "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
    blockedDomains: (process.env.X402_BLOCKED_DOMAINS || "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
  };
}

// ── Domain checks ───────────────────────────────────────────

export function isDomainAllowed(url: string, config: X402SpendConfig): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  // Check blocked list first (always enforced)
  if (config.blockedDomains.some((d) => hostname.endsWith(d))) {
    return false;
  }

  // If allowlist is empty, all non-blocked domains are allowed
  if (config.allowedDomains.length === 0) {
    return true;
  }

  // Check allowlist
  return config.allowedDomains.some((d) => hostname.endsWith(d));
}

// ── Spend limit checks ─────────────────────────────────────

function getSpendInWindow(windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return spendLog
    .filter((r) => r.timestamp >= cutoff)
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);
}

export function getHourlySpend(): number {
  return getSpendInWindow(60 * 60 * 1000);
}

export function getDailySpend(): number {
  return getSpendInWindow(24 * 60 * 60 * 1000);
}

/**
 * Check if a payment amount is within all spend limits.
 * Returns null if OK, or an error message string if refused.
 */
export function checkSpendLimits(
  amount: string,
  url: string,
  config: X402SpendConfig
): string | null {
  const amountNum = parseFloat(amount);

  // Per-request limit
  if (amountNum > config.maxPerRequest) {
    return `Payment of ${amount} USDC exceeds per-request limit of ${config.maxPerRequest}`;
  }

  // Domain check
  if (!isDomainAllowed(url, config)) {
    return `Domain not allowed for x402 payments: ${url}`;
  }

  // Hourly limit
  const hourlySpend = getHourlySpend();
  if (hourlySpend + amountNum > config.maxPerHour) {
    return `Payment would exceed hourly limit (${hourlySpend.toFixed(4)} + ${amount} > ${config.maxPerHour})`;
  }

  // Daily limit
  const dailySpend = getDailySpend();
  if (dailySpend + amountNum > config.maxPerDay) {
    return `Payment would exceed daily limit (${dailySpend.toFixed(4)} + ${amount} > ${config.maxPerDay})`;
  }

  return null;
}

// ── Record spend ────────────────────────────────────────────

/**
 * Record a successful payment (in-memory + optional Supabase persistence).
 */
export async function recordPayment(
  amount: string,
  url: string,
  network: string,
  txHash?: string,
  agentId?: string
): Promise<void> {
  // In-memory log (for limit checks)
  spendLog.push({
    amount,
    url,
    network,
    timestamp: Date.now(),
  });

  // Prune old records (keep 24h)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const firstValid = spendLog.findIndex((r) => r.timestamp >= cutoff);
  if (firstValid > 0) {
    spendLog.splice(0, firstValid);
  }

  console.log(
    `[x402-spend] Payment recorded: ${amount} USDC to ${url} (${network})` +
      (txHash ? ` tx=${txHash}` : "")
  );

  // Persist to Supabase (best-effort, don't block)
  try {
    await supabase.from("x402_transactions").insert({
      agent_id: agentId || "bridge",
      amount_usdc: amount,
      target_url: url,
      network,
      tx_hash: txHash || null,
      status: "completed",
    });
  } catch (err) {
    // Table might not exist yet — that's OK
    console.log("[x402-spend] Supabase persist skipped (table may not exist)");
  }
}

// ── Stats ───────────────────────────────────────────────────

export interface SpendStats {
  hourlySpend: number;
  dailySpend: number;
  totalTransactions: number;
  recentTransactions: SpendRecord[];
}

export function getSpendStats(): SpendStats {
  return {
    hourlySpend: getHourlySpend(),
    dailySpend: getDailySpend(),
    totalTransactions: spendLog.length,
    recentTransactions: spendLog.slice(-10),
  };
}
