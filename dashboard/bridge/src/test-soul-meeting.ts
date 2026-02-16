import { buildSoulContext, processNewMemory, buildContextPacket, maybeStartDream } from "../lib/soul/index.js";
import { supabase } from "../lib/supabase.js";

/**
 * SOUL AGENT INTERACTION TEST
 * 
 * Direct interaction with Soul (the Memory Orchestrator)
 * to demonstrate the Main ↔ Soul collaboration protocol.
 */

async function main() {
  console.log("🔮 SOUL AGENT MEETING\n");
  console.log("=" .repeat(60));
  
  // 1. TEST CONTEXT RETRIEVAL
  console.log("\n1. Testing Context Retrieval...");
  console.log("   Query: 'Deploy contract to Base'");
  
  const context1 = await buildSoulContext("main", "Deploy contract to Base");
  console.log("   Result:");
  console.log(context1 || "   (No context returned)");
  
  // 2. TEST DIFFERENT QUERY
  console.log("\n2. Testing Different Query...");
  console.log("   Query: 'What is the weather today?'");
  
  const context2 = await buildSoulContext("main", "What is the weather today?");
  console.log("   Result:");
  console.log(context2 || "   (No context returned)");
  
  // 3. GET FULL CONTEXT PACKET
  console.log("\n3. Getting Structured Context Packet...");
  const packet = await buildContextPacket("main", "Test payment flow with x402");
  console.log("   Memories:", packet.memories.length);
  console.log("   Insights:", packet.insights.length);
  console.log("   Total Anchors:", packet.total_anchors);
  
  // 4. CHECK ASSOCIATION TABLES
  console.log("\n4. Checking Soul Database Tables...");
  const tables = ["memory_associations", "memory_queries", "dream_insights"];
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .limit(1);
    
    if (error) {
      console.log(`   ${table}: ⚠️  ${error.message}`);
    } else {
      const { count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      console.log(`   ${table}: ✅ ${count || 0} rows`);
    }
  }
  
  // 5. TEST DREAM STATUS
  console.log("\n5. Dream Mode Status...");
  console.log("   (Dream mode triggers after 6hr idle)");
  console.log("   Would trigger: maybeStartDream()");
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ SOUL AGENT MEETING COMPLETE");
  console.log("\nMain (Orchestrator) and Soul (Memory Orchestrator)");
  console.log("are now in full collaboration.");
}

main().catch(console.error);
