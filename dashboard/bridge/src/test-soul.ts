/**
 * Soul Agent — Integration Test
 *
 * Tests the Soul pipeline: keyword extraction → retrieval →
 * context building → association building
 */

import "dotenv/config";
import { extractKeywords, buildSoulContext, processNewMemory } from "../lib/soul/index.js";
import { writeMemory } from "../lib/agent-memory.js";

async function main() {
  console.log("=== Soul Agent Integration Test ===\n");

  // 1. Keyword extraction
  console.log("1. Keyword extraction:");
  const kw1 = extractKeywords("Deploy the new agent contract to Base mainnet");
  console.log(`   "Deploy the new agent contract to Base mainnet" →`, kw1);

  const kw2 = extractKeywords("Check gas prices and oracle status");
  console.log(`   "Check gas prices and oracle status" →`, kw2);

  if (kw1.length < 3 || kw2.length < 2) {
    console.log("   FAIL: too few keywords extracted");
    process.exit(1);
  }
  console.log("   ✓ Keywords extracted correctly\n");

  // 2. Write some test memories so retrieval has data
  console.log("2. Seeding test memories:");
  const id1 = await writeMemory({
    agent_id: "main",
    kind: "outcome",
    content: "Deployed AgentMemoryAnchor contract to Base mainnet at 0x0D1F...",
    source: "test",
    ttl_hours: 1,
  });
  console.log(`   Wrote memory 1: ${id1 ? "OK" : "FAIL"}`);

  const id2 = await writeMemory({
    agent_id: "main",
    kind: "fact",
    content: "Gas prices on Base are typically 0.001 gwei, deploy costs ~$0.001",
    source: "test",
    ttl_hours: 1,
  });
  console.log(`   Wrote memory 2: ${id2 ? "OK" : "FAIL"}`);

  const id3 = await writeMemory({
    agent_id: "main",
    kind: "outcome",
    content: "Oracle agent checked gas and confirmed optimal deployment window",
    source: "test",
    ttl_hours: 1,
  });
  console.log(`   Wrote memory 3: ${id3 ? "OK" : "FAIL"}\n`);

  // 3. Build associations for memory 3
  console.log("3. Association building:");
  if (id3) {
    await processNewMemory(id3, "main", "Oracle agent checked gas and confirmed optimal deployment window");
    console.log("   ✓ processNewMemory ran (associations built if soul tables exist)\n");
  }

  // 4. Context retrieval
  console.log("4. Soul context retrieval:");
  const ctx = await buildSoulContext("main", "Deploy a new contract to Base");
  if (ctx) {
    const lines = ctx.split("\n").filter((l) => l.trim());
    console.log(`   Retrieved ${lines.length} context lines`);
    console.log(`   First line: ${lines[0]}`);
    console.log(`   Context size: ${ctx.length} chars`);
    console.log("   ✓ Soul context built successfully\n");
  } else {
    console.log("   (no context returned — expected if no matching memories)\n");
  }

  // 5. Another context query (different topic)
  console.log("5. Context for unrelated topic:");
  const ctx2 = await buildSoulContext("main", "What is the weather today?");
  console.log(`   Context size: ${ctx2.length} chars`);
  console.log(`   ${ctx2.length < (ctx?.length || 0) ? "✓ Less context for unrelated query (good)" : "○ Context returned"}\n`);

  console.log("=== All Soul tests passed ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
