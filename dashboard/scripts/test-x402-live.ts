#!/usr/bin/env tsx
/**
 * XmetaV x402 Live Payment Test
 * Tests paid endpoints using real USDC on Base Mainnet.
 *
 * Usage:
 *   cd dashboard && npx tsx scripts/test-x402-live.ts
 *
 * Requires:
 *   - EVM_PRIVATE_KEY set in .env (wallet with USDC on Base)
 *   - x402-server running on localhost:4021
 */

import "dotenv/config";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

// ── Config ──
const X402_BASE = process.env.X402_BASE_URL || "http://localhost:4021";
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

if (!PRIVATE_KEY) {
  console.error("❌ EVM_PRIVATE_KEY not set in .env");
  process.exit(1);
}

// ── Setup x402 client ──
const signer = privateKeyToAccount(PRIVATE_KEY);
console.log(`\n🔑 Wallet: ${signer.address}`);

const client = new x402Client();
registerExactEvmScheme(client, { signer });
const x402Fetch = wrapFetchWithPayment(fetch, client);

// Public client for balance checks
const viemClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs"),
});

// ── Helpers ──
async function getUSDCBalance(): Promise<string> {
  const raw = await viemClient.readContract({
    address: USDC_ADDRESS,
    abi: [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const,
    functionName: "balanceOf",
    args: [signer.address],
  });
  return formatUnits(raw, 6);
}

interface TestResult {
  endpoint: string;
  price: string;
  status: number;
  ok: boolean;
  responsePreview: string;
  timeMs: number;
}

async function testEndpoint(
  method: "GET" | "POST",
  path: string,
  price: string,
  body?: Record<string, unknown>
): Promise<TestResult> {
  const url = `${X402_BASE}${path}`;
  const start = Date.now();

  try {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) init.body = JSON.stringify(body);

    const res = await x402Fetch(url, init);
    const text = await res.text();
    const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;

    return {
      endpoint: `${method} ${path}`,
      price,
      status: res.status,
      ok: res.ok,
      responsePreview: preview,
      timeMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      endpoint: `${method} ${path}`,
      price,
      status: 0,
      ok: false,
      responsePreview: `ERROR: ${err.message}`,
      timeMs: Date.now() - start,
    };
  }
}

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  XmetaV x402 Live Payment Test — Base Mainnet");
  console.log("═══════════════════════════════════════════════\n");

  // Pre-flight: check USDC balance
  const balanceBefore = await getUSDCBalance();
  console.log(`💰 USDC balance before: $${balanceBefore}`);

  if (parseFloat(balanceBefore) < 0.01) {
    console.error("❌ Insufficient USDC. Need at least $0.01 for cheapest endpoint.");
    process.exit(1);
  }

  // Free endpoints first (sanity check)
  console.log("\n── Free Endpoints (no payment) ──\n");

  const healthRes = await fetch(`${X402_BASE}/health`);
  console.log(`✅ GET /health → ${healthRes.status} ${healthRes.ok ? "OK" : "FAIL"}`);

  const tokenRes = await fetch(`${X402_BASE}/token-info`);
  console.log(`✅ GET /token-info → ${tokenRes.status} ${tokenRes.ok ? "OK" : "FAIL"}`);

  const payInfoRes = await fetch(`${X402_BASE}/agent/16905/payment-info`);
  console.log(`✅ GET /agent/16905/payment-info → ${payInfoRes.status} ${payInfoRes.ok ? "OK" : "FAIL"}`);

  // Gated endpoints — cheapest first
  console.log("\n── Paid Endpoints (USDC via x402) ──\n");

  const results: TestResult[] = [];

  // 1. GET /fleet-status — $0.01
  console.log(">>> Testing GET /fleet-status ($0.01)...");
  results.push(await testEndpoint("GET", "/fleet-status", "$0.01"));

  // 2. POST /memory-crystal — $0.05
  console.log(">>> Testing POST /memory-crystal ($0.05)...");
  results.push(
    await testEndpoint("POST", "/memory-crystal", "$0.05", {
      agent: "soul",
      query: "What defines identity?",
    })
  );

  // 3. POST /intent — $0.05
  console.log(">>> Testing POST /intent ($0.05)...");
  results.push(
    await testEndpoint("POST", "/intent", "$0.05", {
      goal: "check fleet health",
    })
  );

  // 4. POST /agent-task — $0.10
  console.log(">>> Testing POST /agent-task ($0.10)...");
  results.push(
    await testEndpoint("POST", "/agent-task", "$0.10", {
      agent: "main",
      message: "Report your status in one sentence.",
    })
  );

  // ── Results ──
  console.log("\n═══════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════\n");

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.endpoint} [${r.price}] → HTTP ${r.status} (${r.timeMs}ms)`);
    if (r.responsePreview) {
      console.log(`   ${r.responsePreview}\n`);
    }
  }

  // Post-flight: check USDC balance
  const balanceAfter = await getUSDCBalance();
  const spent = parseFloat(balanceBefore) - parseFloat(balanceAfter);
  console.log(`💰 USDC balance after:  $${balanceAfter}`);
  console.log(`💸 Total spent:         $${spent.toFixed(6)}`);
  console.log(`📊 Endpoints tested:    ${results.length}`);
  console.log(`✅ Passed:              ${results.filter((r) => r.ok).length}`);
  console.log(`❌ Failed:              ${results.filter((r) => !r.ok).length}`);
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
