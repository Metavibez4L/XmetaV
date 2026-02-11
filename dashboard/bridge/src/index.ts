import "dotenv/config";
import { supabase } from "../lib/supabase.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { executeCommand } from "./executor.js";
import { subscribeToSwarms } from "./swarm-executor.js";
import { startIntentTracker } from "./intent-tracker.js";
import { initializeX402Client, isX402Active } from "../lib/x402-client.js";

console.log("╔══════════════════════════════════════╗");
console.log("║    XmetaV Bridge Daemon v1.3.0       ║");
console.log("║    + Intent Layer (Cursor API)       ║");
console.log("║    + x402 Payment Protocol           ║");
console.log("╚══════════════════════════════════════╝");
console.log("");

// Initialize x402 payment client (non-blocking — works without wallet configured)
initializeX402Client();
console.log(`[bridge] x402 auto-pay: ${isX402Active() ? "ACTIVE" : "DISABLED (no wallet configured)"}`);

// Start heartbeat
startHeartbeat();

// Subscribe to new pending commands via Realtime
const channel = supabase
  .channel("bridge-commands")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "agent_commands",
      filter: "status=eq.pending",
    },
    (payload) => {
      console.log(`[bridge] New command received: ${payload.new.id}`);
      executeCommand(payload.new as { id: string; agent_id: string; message: string });
    }
  )
  .subscribe((status) => {
    console.log(`[bridge] Realtime subscription: ${status}`);
  });

// Also pick up any pending commands that were created while bridge was offline
async function processPendingCommands() {
  const { data } = await supabase
    .from("agent_commands")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (data && data.length > 0) {
    console.log(`[bridge] Found ${data.length} pending command(s) to process`);
    for (const cmd of data) {
      executeCommand(cmd);
    }
  } else {
    console.log("[bridge] No pending commands");
  }
}

processPendingCommands();

// Subscribe to swarm runs
const swarmChannel = subscribeToSwarms();

// Start intent session tracker
const intentChannel = startIntentTracker();

console.log("[bridge] Listening for commands, swarm runs & intent sessions...");
console.log("[bridge] Press Ctrl+C to stop");

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[bridge] Shutting down...");
  stopHeartbeat();
  supabase.removeChannel(channel);
  supabase.removeChannel(swarmChannel);
  supabase.removeChannel(intentChannel);

  // Mark bridge as offline
  await supabase
    .from("agent_sessions")
    .upsert(
      { agent_id: "bridge", status: "offline", last_heartbeat: new Date().toISOString() },
      { onConflict: "agent_id" }
    );

  process.exit(0);
});

process.on("SIGTERM", () => process.emit("SIGINT" as any));
