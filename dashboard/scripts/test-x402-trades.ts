#!/usr/bin/env tsx
/**
 * XmetaV Trade Execution Endpoints — Live Test
 * Tests new trade endpoints with real USDC on Base Mainnet.
 *
 * Usage:
 *   cd dashboard && npx tsx scripts/test-x402-trades.ts
 */

import "dotenv/config";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

const X402_BASE = process.env.X402_BASE_URL || "http://localhost:4021";
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

if (!PRIVATE_KEY) {
  console.error("❌ EVM_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const signer = privateKeyToAccount(PRIVATE_KEY);
console.log(`\n🔑 Wallet: ${signer.address}`);

const client = new x402Client();
registerExactEvmScheme(client, { signer });
const x402Fetch = wrapFetchWithPayment(fetch, client);

const viemClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs"),
});

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
    const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
    if (body) init.body = JSON.stringify(body);
    const res = await x402Fetch(url, init);
    const text = await res.text();
    const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
    return { endpoint: `${method} ${path}`, price, status: res.status, ok: res.ok, responsePreview: preview, timeMs: Date.now() - start };
  } catch (err: any) {
    return { endpoint: `${method} ${path}`, price, status: 0, ok: false, responsePreview: `ERROR: ${err.message}`, timeMs: Date.now() - start };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  XmetaV Trade Execution — Live Payment Test");
  console.log("═══════════════════════════════════════════════\n");

  // Pre-flight
  const balanceBefore = await getUSDCBalance();
  console.log(`💰 USDC balance before: $${balanceBefore}`);

  if (parseFloat(balanceBefore) < 1.00) {
    console.error("❌ Need at least $1.00 USDC for trade endpoint tests.");
    process.exit(1);
  }

  // Free endpoint first
  console.log("\n── Free Endpoint ──\n");
  const feesRes = await fetch(`${X402_BASE}/trade-fees`);
  console.log(`✅ GET /trade-fees → ${feesRes.status} ${feesRes.ok ? "OK" : "FAIL"}`);

  // Paid trade endpoints (cheapest first)
  console.log("\n── Paid Trade Endpoints (USDC via x402) ──\n");
  const results: TestResult[] = [];

  // 1. GET /arb-opportunity — $0.25
  console.log(">>> Testing GET /arb-opportunity ($0.25)...");
  results.push(await testEndpoint("GET", "/arb-opportunity?tokenA=USDC&tokenB=WETH&minProfitBps=5", "$0.25"));

  // 2. GET /yield-optimize — $0.50
  console.log(">>> Testing GET /yield-optimize ($0.50)...");
  results.push(await testEndpoint("GET", "/yield-optimize?token=USDC&amount=10000&riskTolerance=medium", "$0.50"));

  // 3. POST /execute-trade — $0.50 min
  console.log(">>> Testing POST /execute-trade ($0.50 min)...");
  results.push(await testEndpoint("POST", "/execute-trade", "$0.50", {
    tokenIn: "USDC",
    tokenOut: "WETH",
    amountIn: "100",
    slippageBps: 50,
  }));

  // Results
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

  const balanceAfter = await getUSDCBalance();
  const spent = parseFloat(balanceBefore) - parseFloat(balanceAfter);
  console.log(`💰 USDC balance after:  $${balanceAfter}`);
  console.log(`💸 Total spent:         $${spent.toFixed(6)}`);
  console.log(`📊 Endpoints tested:    ${results.length}`);
  console.log(`✅ Passed:              ${results.filter(r => r.ok).length}`);
  console.log(`❌ Failed:              ${results.filter(r => !r.ok).length}`);
  console.log();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
