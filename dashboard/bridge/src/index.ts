import "dotenv/config";
import { createServer } from "http";
import { supabase } from "../lib/supabase.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { executeCommand } from "./executor.js";
import { subscribeToSwarms } from "./swarm-executor.js";
import { startIntentTracker } from "./intent-tracker.js";
import { Sentinel } from "../lib/sentinel/index.js";
import { startScholar, stopScholar, getScholarStats } from "../lib/scholar/index.js";
import { flushPendingAnchors } from "../lib/memory-anchor.js";
import { invalidateOnPayment } from "../lib/soul/session-buffer.js";
import * as fs from "fs";
import * as path from "path";

const HEALTH_PORT = Number(process.env.BRIDGE_PORT || 3001);
const PID_FILE = path.resolve(import.meta.dirname, "../.bridge.pid");

console.log("╔══════════════════════════════════════╗");
console.log("║    XmetaV Bridge Daemon v1.6.0       ║");
console.log("║    + Soul Agent (Memory Orchestrator) ║");
console.log("║    + Sentinel Monitoring Engine       ║");
console.log("║    + Scholar Research Daemon          ║");
console.log("╚══════════════════════════════════════╝");
console.log("");

// Write PID file so the dashboard bridge-manager can detect us
fs.writeFileSync(PID_FILE, String(process.pid), "utf-8");

// Start Sentinel monitoring engine
const sentinel = Sentinel.getInstance();
sentinel.start();

// Lightweight HTTP health endpoint (:3001/health)
const startedAt = new Date().toISOString();
const healthServer = createServer(async (req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      version: "1.6.0",
      pid: process.pid,
      uptime: process.uptime(),
      startedAt,
    }));
  } else if (req.url === "/sentinel" || req.url === "/sentinel/report") {
    try {
      const report = await sentinel.generateReport();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  } else if (req.url === "/scholar" || req.url === "/scholar/stats") {
    try {
      const stats = getScholarStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
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

// Start Scholar research daemon (24/7 continuous research)
startScholar();

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
  // ── Stale command reaper ─────────────────────────────────────
  // Commands stuck in "running" from a previous bridge session are zombies —
  // the process that was executing them is gone. Mark them as failed so the
  // agent queue is unblocked and the dashboard shows the correct state.
  const { data: stale, error: staleErr } = await supabase
    .from("agent_commands")
    .select("id, agent_id, created_at")
    .eq("status", "running");

  if (!staleErr && stale && stale.length > 0) {
    console.log(`[bridge] Found ${stale.length} stale "running" command(s) from previous session — marking as failed`);
    const staleIds = stale.map((c: { id: string }) => c.id);
    await supabase
      .from("agent_commands")
      .update({ status: "failed" })
      .in("id", staleIds);

    // Reset any sessions stuck as "busy" from those agents
    const staleAgents = [...new Set(stale.map((c: { agent_id: string }) => c.agent_id))];
    await supabase
      .from("agent_sessions")
      .update({ status: "idle", last_heartbeat: new Date().toISOString() })
      .in("agent_id", staleAgents)
      .eq("status", "busy");
  }

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

// Subscribe to x402 payments — invalidate soul caches on revenue events
const paymentChannel = supabase
  .channel("bridge-payments")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "x402_payments",
    },
    () => {
      invalidateOnPayment();
    }
  )
  .subscribe();

// Start intent session tracker
const intentChannel = startIntentTracker();

console.log("[bridge] Listening for commands, swarm runs, intent sessions & scholar research...");
console.log("[bridge] Press Ctrl+C to stop");

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[bridge] Shutting down...");
  sentinel.stop();
  stopScholar();
  stopHeartbeat();
  healthServer.close();
  await flushPendingAnchors();
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  supabase.removeChannel(channel);
  supabase.removeChannel(swarmChannel);
  supabase.removeChannel(paymentChannel);
  supabase.removeChannel(intentChannel);

  // Mark bridge + all fleet agents as offline
  const now = new Date().toISOString();
  const offlineRows = [
    "bridge", "main", "soul", "oracle", "sentinel", "briefing",
    "alchemist", "web3dev", "akua", "basedintern", "midas", "vox", "scholar",
  ].map((id) => ({ agent_id: id, status: "offline", last_heartbeat: now }));

  await supabase
    .from("agent_sessions")
    .upsert(offlineRows, { onConflict: "agent_id" });

  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[bridge] SIGTERM received, shutting down...");
  sentinel.stop();
  stopScholar();
  stopHeartbeat();
  healthServer.close();
  await flushPendingAnchors();
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  supabase.removeChannel(channel);
  supabase.removeChannel(swarmChannel);
  supabase.removeChannel(paymentChannel);
  supabase.removeChannel(intentChannel);

  const now = new Date().toISOString();
  const offlineRows = [
    "bridge", "main", "soul", "oracle", "sentinel", "briefing",
    "alchemist", "web3dev", "akua", "basedintern", "midas", "vox", "scholar",
  ].map((id) => ({ agent_id: id, status: "offline", last_heartbeat: now }));

  await supabase
    .from("agent_sessions")
    .upsert(offlineRows, { onConflict: "agent_id" });

  process.exit(0);
});
