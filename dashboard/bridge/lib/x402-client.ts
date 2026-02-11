// ============================================================
// x402 Payment Client
// Wraps fetch with automatic 402 payment handling
// ============================================================

import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { getAgentAccount, hasAgentWallet } from "./x402-wallet.js";
import {
  loadSpendConfig,
  checkSpendLimits,
  recordPayment,
  getSpendStats,
  type X402SpendConfig,
} from "./x402-spend.js";

// ── Module State ────────────────────────────────────────────

let _x402Fetch: typeof globalThis.fetch | null = null;
let _spendConfig: X402SpendConfig | null = null;
let _initialized = false;

// ── Configuration ───────────────────────────────────────────

/**
 * Get the x402 network identifier from env.
 * Default: base-sepolia (testnet). Set X402_NETWORK=base for mainnet.
 */
function getNetwork(): `${string}:${string}` {
  const net = process.env.X402_NETWORK || "base-sepolia";
  // Map friendly names to CAIP-2 identifiers
  const networkMap: Record<string, `${string}:${string}`> = {
    base: "eip155:8453",
    "base-mainnet": "eip155:8453",
    "base-sepolia": "eip155:84532",
  };
  return networkMap[net] || (net as `${string}:${string}`);
}

// ── Initialization ──────────────────────────────────────────

/**
 * Initialize the x402 payment client.
 * Must be called after environment is loaded.
 * Safe to call multiple times (idempotent).
 */
export function initializeX402Client(): boolean {
  if (_initialized) return true;

  if (!hasAgentWallet()) {
    console.log(
      "[x402-client] No wallet configured (AGENT_WALLET_PRIVATE_KEY not set). x402 auto-pay disabled."
    );
    return false;
  }

  try {
    const account = getAgentAccount();
    _spendConfig = loadSpendConfig();

    const network = getNetwork();
    console.log(`[x402-client] Configuring for network: ${network}`);

    // Create x402 client with EVM exact scheme
    const client = new x402Client();
    registerExactEvmScheme(client, {
      signer: account,
      networks: [network],
    });

    // Register spend limit policy
    client.registerPolicy((_version, reqs) => {
      // Filter out any requirements that exceed our per-request limit
      const config = _spendConfig!;
      return reqs.filter((r) => {
        const amountUsdc = parseFloat(r.amount) / 1_000_000; // USDC has 6 decimals
        return amountUsdc <= config.maxPerRequest;
      });
    });

    // Register hooks for spend tracking
    client.onBeforePaymentCreation(async (ctx) => {
      const config = _spendConfig!;
      const amountUsdc = (
        parseFloat(ctx.selectedRequirements.amount) / 1_000_000
      ).toFixed(6);
      const resource = ctx.paymentRequired.resource?.url || "unknown";

      console.log(
        `[x402-client] Payment requested: ${amountUsdc} USDC for ${resource}`
      );

      // Check spend limits
      const refusal = checkSpendLimits(amountUsdc, resource, config);
      if (refusal) {
        console.log(`[x402-client] Payment REFUSED: ${refusal}`);
        return { abort: true, reason: refusal };
      }

      console.log(`[x402-client] Payment approved: ${amountUsdc} USDC`);
    });

    client.onAfterPaymentCreation(async (ctx) => {
      const amountUsdc = (
        parseFloat(ctx.selectedRequirements.amount) / 1_000_000
      ).toFixed(6);
      const resource = ctx.paymentRequired.resource?.url || "unknown";
      const network = ctx.selectedRequirements.network;

      await recordPayment(amountUsdc, resource, network);
    });

    client.onPaymentCreationFailure(async (ctx) => {
      console.error(
        `[x402-client] Payment creation FAILED: ${ctx.error.message}`
      );
    });

    // Wrap fetch with payment handling
    _x402Fetch = wrapFetchWithPayment(globalThis.fetch, client);
    _initialized = true;

    console.log(
      `[x402-client] ✓ Initialized — wallet=${account.address}, network=${network}`
    );
    console.log(
      `[x402-client]   limits: per-req=$${_spendConfig.maxPerRequest}, hourly=$${_spendConfig.maxPerHour}, daily=$${_spendConfig.maxPerDay}`
    );

    if (_spendConfig.allowedDomains.length > 0) {
      console.log(
        `[x402-client]   allowed domains: ${_spendConfig.allowedDomains.join(", ")}`
      );
    } else {
      console.log(
        `[x402-client]   allowed domains: ALL (set X402_ALLOWED_DOMAINS to restrict)`
      );
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[x402-client] Failed to initialize: ${msg}`);
    _initialized = false;
    return false;
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Get the x402-wrapped fetch function.
 * Returns null if x402 is not configured/initialized.
 */
export function getX402Fetch(): typeof globalThis.fetch | null {
  if (!_initialized) {
    initializeX402Client();
  }
  return _x402Fetch;
}

/**
 * Check if x402 auto-pay is active.
 */
export function isX402Active(): boolean {
  return _initialized && _x402Fetch !== null;
}

/**
 * Get x402 spend statistics.
 */
export function getX402Stats() {
  return {
    active: isX402Active(),
    wallet: hasAgentWallet()
      ? getAgentAccount().address
      : null,
    network: getNetwork(),
    config: _spendConfig,
    spend: getSpendStats(),
  };
}
