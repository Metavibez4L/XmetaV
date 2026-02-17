#!/usr/bin/env tsx
/**
 * XmetaV x402 Debug Test — verbose single-endpoint test
 */
import "dotenv/config";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const X402_BASE = "http://localhost:4021";
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) { console.error("No EVM_PRIVATE_KEY"); process.exit(1); }

const signer = privateKeyToAccount(PRIVATE_KEY);
console.log(`Wallet: ${signer.address}`);

const client = new x402Client();
registerExactEvmScheme(client, { signer });

// Wrap fetch with verbose logging
const originalFetch = globalThis.fetch;
let fetchCount = 0;
const debugFetch: typeof fetch = async (input, init) => {
  const n = ++fetchCount;
  const req = new Request(input, init);
  console.log(`\n[fetch #${n}] ${req.method} ${req.url}`);
  console.log(`[fetch #${n}] Headers:`, Object.fromEntries(req.headers.entries()));
  
  const res = await originalFetch(input, init);
  console.log(`[fetch #${n}] Response: ${res.status} ${res.statusText}`);
  console.log(`[fetch #${n}] Response headers:`, Object.fromEntries(res.headers.entries()));
  return res;
};

const x402Fetch = wrapFetchWithPayment(debugFetch, client);

async function main() {
  console.log("\n=== Testing GET /fleet-status ($0.01) ===\n");
  
  try {
    const res = await x402Fetch(`${X402_BASE}/fleet-status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    
    console.log(`\n=== Final Response: ${res.status} ===`);
    const text = await res.text();
    console.log("Body:", text.slice(0, 500));
  } catch (err: any) {
    console.error("\n=== ERROR ===");
    console.error(err.message);
    console.error(err.stack);
  }
}

main();
