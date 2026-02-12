import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { supabase } from "./supabase.js";

// ============================================================
// x402 Client for Bridge Daemon
// Wraps fetch with automatic payment handling for x402 endpoints
// ============================================================

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const BUDGET_LIMIT = parseFloat(process.env.X402_BUDGET_LIMIT || "1.00");

let _fetchWithPayment: typeof fetch | null = null;
let _walletAddress: string | null = null;

/**
 * Initialize the x402 client. Call once at startup.
 * Returns false if EVM_PRIVATE_KEY is not configured.
 */
export function initX402Client(): boolean {
  if (!EVM_PRIVATE_KEY) {
    console.log("[x402] EVM_PRIVATE_KEY not set — x402 payments disabled");
    return false;
  }

  try {
    const signer = privateKeyToAccount(EVM_PRIVATE_KEY);
    _walletAddress = signer.address;

    const client = new x402Client();
    registerExactEvmScheme(client, { signer });

    _fetchWithPayment = wrapFetchWithPayment(fetch, client);

    console.log(`[x402] Client initialized — wallet: ${_walletAddress}`);
    console.log(`[x402] Budget limit: $${BUDGET_LIMIT} per request`);
    return true;
  } catch (err) {
    console.error("[x402] Failed to initialize client:", err);
    return false;
  }
}

/**
 * Whether x402 payments are available.
 */
export function isX402Available(): boolean {
  return _fetchWithPayment !== null;
}

/**
 * Get the wallet address (or null if not configured).
 */
export function getWalletAddress(): string | null {
  return _walletAddress;
}

/**
 * Make a fetch request with automatic x402 payment handling.
 * Falls back to regular fetch if x402 is not configured.
 *
 * @param url - The URL to fetch
 * @param init - Standard RequestInit options
 * @param context - Optional context for payment logging
 */
export async function x402Fetch(
  url: string | URL,
  init?: RequestInit,
  context?: {
    commandId?: string;
    sessionId?: string;
    agentId?: string;
  }
): Promise<Response> {
  const urlStr = url.toString();

  // If x402 is not configured, use regular fetch
  if (!_fetchWithPayment) {
    return fetch(url, init);
  }

  // Log the attempt
  const paymentRecord = context
    ? await logPaymentAttempt(urlStr, context)
    : null;

  try {
    const response = await _fetchWithPayment(url, init);

    // If a payment was made (response is OK after a 402 flow),
    // update the payment record
    if (paymentRecord && response.ok) {
      await updatePaymentStatus(paymentRecord, "completed");
    }

    return response;
  } catch (err) {
    if (paymentRecord) {
      await updatePaymentStatus(paymentRecord, "failed");
    }
    throw err;
  }
}

// ---- Payment Logging ----

async function logPaymentAttempt(
  endpoint: string,
  context: { commandId?: string; sessionId?: string; agentId?: string }
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("x402_payments")
      .insert({
        endpoint,
        amount: "0", // Updated after settlement
        agent_id: context.agentId || "main",
        command_id: context.commandId || null,
        session_id: context.sessionId || null,
        payer_address: _walletAddress,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[x402] Failed to log payment:", error.message);
      return null;
    }
    return data?.id || null;
  } catch {
    return null;
  }
}

async function updatePaymentStatus(
  paymentId: string,
  status: "completed" | "failed"
): Promise<void> {
  try {
    await supabase
      .from("x402_payments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", paymentId);
  } catch {
    console.error("[x402] Failed to update payment status");
  }
}
