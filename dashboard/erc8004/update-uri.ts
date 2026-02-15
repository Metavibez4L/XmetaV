import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  IDENTITY_REGISTRY_ABI,
  IDENTITY_REGISTRY_ADDRESS,
} from "./abis/IdentityRegistry.js";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// ERC-8004 — Set / Update Agent URI  (tokenURI)
// Calls setAgentURI(agentId, uri) on Base Mainnet
// ============================================================

const BRIDGE_ENV_PATH = path.resolve(import.meta.dirname, "../bridge/.env");
const AGENT_CONFIG_PATH = path.resolve(import.meta.dirname, "agent-config.json");

// ---------- env ----------
if (!process.env.EVM_PRIVATE_KEY) {
  const bridgeEnv = fs.readFileSync(BRIDGE_ENV_PATH, "utf8");
  const match = bridgeEnv.match(/^EVM_PRIVATE_KEY=(.+)$/m);
  if (match) process.env.EVM_PRIVATE_KEY = match[1].trim();
}

const privateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) {
  console.error("EVM_PRIVATE_KEY not found in environment or bridge/.env");
  process.exit(1);
}

const formattedKey = privateKey.startsWith("0x")
  ? privateKey
  : (`0x${privateKey}` as `0x${string}`);

const account = privateKeyToAccount(formattedKey);

// Use a custom RPC if set, otherwise fall back to default Base public RPC
const rpcUrl = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs";

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(rpcUrl),
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(rpcUrl),
});

// ---------- load config ----------
const config = JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, "utf8"));
const agentId = BigInt(config.agentId);

// ---------- resolve URI ----------
// Pass as CLI arg, AGENT_URI env var, or fall back to the raw-GitHub-hosted metadata.json
const uri =
  process.argv[2] ||
  process.env.AGENT_URI ||
  "https://raw.githubusercontent.com/Metavibez4L/XmetaV/dev/dashboard/erc8004/metadata.json";

async function main() {
  console.log("\n  ERC-8004 — Update Agent URI");
  console.log("  ────────────────────────────");
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Owner:    ${account.address}`);
  console.log(`  New URI:  ${uri}`);

  // Verify ownership
  const owner = (await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "ownerOf",
    args: [agentId],
  })) as string;

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`\n  ERROR: Wallet ${account.address} does not own agent #${agentId}`);
    console.error(`  Owner is: ${owner}`);
    process.exit(1);
  }

  // Check current URI
  const currentURI = (await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "tokenURI",
    args: [agentId],
  })) as string;

  console.log(`  Current:  ${currentURI || "(empty)"}`);

  if (currentURI === uri) {
    console.log("\n  URI is already set — nothing to do.");
    return;
  }

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  const ethBalance = Number(balance) / 1e18;
  console.log(`  Balance:  ${ethBalance.toFixed(6)} ETH`);

  if (balance === BigInt(0)) {
    console.error("\n  ERROR: Wallet has no ETH on Base. Fund it first.");
    process.exit(1);
  }

  console.log("\n  Sending setAgentURI tx...");

  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "setAgentURI",
    args: [agentId, uri],
  });

  console.log(`  Tx hash:  ${hash}`);
  console.log("  Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  Block:    ${receipt.blockNumber}`);
  console.log(`  Status:   ${receipt.status}`);

  if (receipt.status !== "success") {
    console.error("\n  ERROR: Transaction failed!");
    process.exit(1);
  }

  console.log(`\n  Agent #${agentId} URI updated!`);
  console.log(`  BaseScan: https://basescan.org/tx/${hash}`);

  // Verify
  const newURI = (await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "tokenURI",
    args: [agentId],
  })) as string;

  console.log(`  Verified: ${newURI}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
