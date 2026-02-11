// ============================================================
// x402 Wallet Management
// Manages the agent's Base wallet for x402 payments
// ============================================================

import { privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem/accounts";

let _cachedAccount: PrivateKeyAccount | null = null;

/**
 * Get the agent's EVM account for signing x402 payments.
 * Uses AGENT_WALLET_PRIVATE_KEY env var.
 *
 * @returns viem PrivateKeyAccount (implements ClientEvmSigner interface)
 * @throws Error if AGENT_WALLET_PRIVATE_KEY is not set
 */
export function getAgentAccount(): PrivateKeyAccount {
  if (_cachedAccount) return _cachedAccount;

  const key = process.env.AGENT_WALLET_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "AGENT_WALLET_PRIVATE_KEY not set. " +
        "Set this env var to enable x402 auto-pay. " +
        "Use a Base wallet private key (0x-prefixed hex)."
    );
  }

  // Normalize: ensure 0x prefix
  const normalizedKey = key.startsWith("0x") ? key : `0x${key}`;
  _cachedAccount = privateKeyToAccount(normalizedKey as `0x${string}`);

  console.log(`[x402-wallet] Agent wallet loaded: ${_cachedAccount.address}`);
  return _cachedAccount;
}

/**
 * Check if an agent wallet is configured (without throwing).
 */
export function hasAgentWallet(): boolean {
  return !!process.env.AGENT_WALLET_PRIVATE_KEY;
}

/**
 * Get the agent wallet address (or null if not configured).
 */
export function getAgentAddress(): string | null {
  if (!hasAgentWallet()) return null;
  try {
    return getAgentAccount().address;
  } catch {
    return null;
  }
}
