import "dotenv/config";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { pinJSON, ipfsGatewayURL, isPinataConfigured } from "../lib/ipfs-pinata.js";
import { anchorMemory, isAnchoringEnabled, getLatestAnchor, MemoryCategory } from "../lib/memory-anchor.js";

async function main() {
  console.log("=== Memory Anchoring Test ===\n");

  // 1. Check config
  console.log("1. Config check:");
  console.log("   Pinata configured:", isPinataConfigured());
  console.log("   Anchoring enabled:", isAnchoringEnabled());

  if (!isPinataConfigured()) {
    console.error("   FAIL: PINATA_JWT not set");
    process.exit(1);
  }
  if (!isAnchoringEnabled()) {
    console.error("   FAIL: Anchoring not fully configured");
    process.exit(1);
  }
  console.log("   PASS\n");

  // 2. Test IPFS pin
  console.log("2. Pinning test memory to IPFS...");
  const testBlob = {
    agentId: 16905,
    category: 0,
    kind: "milestone",
    content: "AgentMemoryAnchor contract deployed to Base Mainnet at 0x0D1F695ea1ca6b5Ba22E3bAf6190d8553D9c4D98",
    task: "Deploy AgentMemoryAnchor smart contract",
    source: "test",
    timestamp: new Date().toISOString(),
  };

  const pinResult = await pinJSON(testBlob, "test-memory-anchor");
  console.log("   IPFS Hash:", pinResult.ipfsHash);
  console.log("   Size:", pinResult.pinSize, "bytes");
  console.log("   Gateway:", ipfsGatewayURL(pinResult.ipfsHash));
  console.log("   PASS\n");

  // 3. Test on-chain anchor
  console.log("3. Writing anchor on-chain (Base Mainnet)...");
  const result = await anchorMemory(16905, MemoryCategory.MILESTONE, {
    content: "AgentMemoryAnchor contract deployed to Base Mainnet at 0x0D1F695ea1ca6b5Ba22E3bAf6190d8553D9c4D98",
    kind: "milestone",
    source: "test",
    task: "Deploy AgentMemoryAnchor smart contract",
    timestamp: new Date().toISOString(),
  });

  if (!result) {
    console.error("   FAIL: anchorMemory returned null");
    process.exit(1);
  }

  console.log("   IPFS CID:", result.ipfsCid);
  console.log("   TX Hash:", result.txHash);
  console.log("   Gateway:", result.gatewayUrl);
  console.log("   PASS\n");

  // 4. Wait for tx confirmation then read back from chain
  console.log("4. Waiting for tx confirmation...");
  const publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash as `0x${string}` });
  console.log("   Confirmed in block:", receipt.blockNumber.toString());
  console.log("   Status:", receipt.status);

  console.log("\n5. Reading latest anchor from chain...");
  const latest = await getLatestAnchor(16905);
  if (!latest) {
    console.error("   FAIL: no anchor found on-chain");
    process.exit(1);
  }

  console.log("   Content Hash:", latest.contentHash);
  console.log("   Category:", latest.category, "(0=milestone)");
  console.log("   Total Anchors:", latest.totalAnchors);
  console.log("   Timestamp:", new Date(latest.timestamp * 1000).toISOString());
  console.log("   PASS\n");

  console.log("=== All tests passed ===");
  console.log(`\nView on Basescan: https://basescan.org/tx/${result.txHash}`);
  console.log(`View on IPFS: ${result.gatewayUrl}`);
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
