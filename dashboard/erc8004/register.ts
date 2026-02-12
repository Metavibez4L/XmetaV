import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseEventLogs } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { IDENTITY_REGISTRY_ABI, IDENTITY_REGISTRY_ADDRESS } from "./abis/IdentityRegistry.js";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// ERC-8004 Agent Registration Script (one-time)
// Mints an Agent Identity NFT on Base Mainnet
// ============================================================

const BRIDGE_ENV_PATH = path.resolve(import.meta.dirname, "../bridge/.env");
const CONFIG_PATH = path.resolve(import.meta.dirname, "agent-config.json");
const REGISTRATION_PATH = path.resolve(import.meta.dirname, "registration.json");

// Load EVM_PRIVATE_KEY from bridge .env if not already set
if (!process.env.EVM_PRIVATE_KEY) {
  const bridgeEnv = fs.readFileSync(BRIDGE_ENV_PATH, "utf8");
  const match = bridgeEnv.match(/^EVM_PRIVATE_KEY=(.+)$/m);
  if (match) {
    process.env.EVM_PRIVATE_KEY = match[1].trim();
  }
}

const privateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) {
  console.error("EVM_PRIVATE_KEY not found in environment or bridge/.env");
  process.exit(1);
}

// Ensure key has 0x prefix
const formattedKey = privateKey.startsWith("0x")
  ? privateKey
  : (`0x${privateKey}` as `0x${string}`);

const account = privateKeyToAccount(formattedKey);

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Agent registration URI — this should point to a hosted registration.json
// For now, use a placeholder that can be updated post-registration via setAgentURI
const AGENT_URI = process.env.AGENT_URI || "";

async function main() {
  console.log("\n  ERC-8004 Agent Registration");
  console.log("  ──────────────────────────");
  console.log(`  Network:  Base Mainnet (${base.id})`);
  console.log(`  Registry: ${IDENTITY_REGISTRY_ADDRESS}`);
  console.log(`  Wallet:   ${account.address}`);
  console.log(`  URI:      ${AGENT_URI || "(empty — set later with setAgentURI)"}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  const ethBalance = Number(balance) / 1e18;
  console.log(`  Balance:  ${ethBalance.toFixed(6)} ETH`);

  if (balance === 0n) {
    console.error("\n  ERROR: Wallet has no ETH on Base. Fund it first.");
    console.error("  Send a small amount of ETH on Base mainnet to:", account.address);
    process.exit(1);
  }

  // Check registry version
  const version = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getVersion",
  });
  console.log(`  Registry: v${version}`);

  console.log("\n  Registering agent...");

  // Call register(string agentURI) to mint the agent NFT
  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [AGENT_URI],
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

  // Parse the Registered event to get the agentId
  const logs = parseEventLogs({
    abi: IDENTITY_REGISTRY_ABI,
    logs: receipt.logs,
    eventName: "Registered",
  });

  if (logs.length === 0) {
    console.error("\n  WARNING: No Registered event found in logs.");
    console.error("  Check the transaction on BaseScan:", `https://basescan.org/tx/${hash}`);
    process.exit(1);
  }

  const agentId = logs[0].args.agentId;
  console.log(`\n  Agent registered!`);
  console.log(`  ─────────────────`);
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Owner:    ${account.address}`);
  console.log(`  BaseScan: https://basescan.org/tx/${hash}`);
  console.log(`  NFT:      https://basescan.org/token/${IDENTITY_REGISTRY_ADDRESS}?a=${agentId}`);

  // Save config
  const config = {
    agentId: agentId.toString(),
    owner: account.address,
    network: "eip155:8453",
    identityRegistry: IDENTITY_REGISTRY_ADDRESS,
    reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    txHash: hash,
    registeredAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  console.log(`\n  Config saved to: ${CONFIG_PATH}`);

  // Update registration.json with the on-chain reference
  try {
    const registration = JSON.parse(fs.readFileSync(REGISTRATION_PATH, "utf8"));
    registration.registrations = [
      {
        agentRegistry: `eip155:8453:${IDENTITY_REGISTRY_ADDRESS}`,
        agentId: agentId.toString(),
      },
    ];
    fs.writeFileSync(REGISTRATION_PATH, JSON.stringify(registration, null, 2) + "\n");
    console.log("  Updated registration.json with agentId");
  } catch {
    console.log("  (registration.json not updated — file not found or invalid)");
  }

  console.log("\n  Next steps:");
  console.log("  1. Host registration.json (IPFS or HTTPS)");
  console.log("  2. Run: npx tsx update-uri.ts <hosted-url>");
  console.log(`  3. Add ERC8004_AGENT_ID=${agentId} to bridge/.env`);
  console.log();
}

main().catch((err) => {
  console.error("\n  Registration failed:", err.message || err);
  process.exit(1);
});
