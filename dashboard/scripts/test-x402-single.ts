#!/usr/bin/env tsx
import "dotenv/config";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const x402Fetch = wrapFetchWithPayment(fetch, client);

async function main() {
  console.log(">>> POST /agent-task ($0.10) — agent=main");
  const res = await x402Fetch("http://localhost:4021/agent-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "main", message: "Report your status in one sentence." }),
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text.slice(0, 800));
}
main();
