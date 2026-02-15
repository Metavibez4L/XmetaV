import "dotenv/config";
import { createServer } from "http";
import { supabase } from "../lib/supabase.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { executeCommand } from "./executor.js";
import { subscribeToSwarms } from "./swarm-executor.js";
import { startIntentTracker } from "./intent-tracker.js";
import * as fs from "fs";
import * as path from "path";

const HEALTH_PORT = Number(process.env.BRIDGE_PORT || 3001);
const PID_FILE = path.resolve(import.meta.dirname, "../.bridge.pid");

console.log("╔══════════════════════════════════════╗");
console.log("║    XmetaV Bridge Daemon v1.4.0       ║");
console.log("║    + Soul Agent (Memory Orchestrator) ║");
console.log("╚══════════════════════════════════════╝");
console.log("");

// Write PID file so the dashboard bridge-manager can detect us
fs.writeFileSync(PID_FILE, String(process.pid), "utf-8");

// Lightweight HTTP health endpoint (:3001/health)
const startedAt = new Date().toISOString();
const healthServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      version: "1.4.0",
      pid: process.pid,
      uptime: process.uptime(),
      startedAt,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[health] Listening on http://localhost:${HEALTH_PORT}/health`);
});

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
      await executeCommand(cmd);
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
  healthServer.close();
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
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

process.on("SIGTERM", async () => {
  console.log("\n[bridge] SIGTERM received, shutting down...");
  stopHeartbeat();
  healthServer.close();
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  supabase.removeChannel(channel);
  supabase.removeChannel(swarmChannel);
  supabase.removeChannel(intentChannel);
  await supabase
    .from("agent_sessions")
    .upsert(
      { agent_id: "bridge", status: "offline", last_heartbeat: new Date().toISOString() },
      { onConflict: "agent_id" }
    );
  process.exit(0);
});
