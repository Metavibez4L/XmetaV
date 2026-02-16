import { hostname } from "os";
import { supabase } from "../lib/supabase.js";
import { maybeStartDream } from "../lib/soul/index.js";
import { expireOldProposals } from "../lib/soul/dream-proposals.js";
import { running } from "./executor.js";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
let expireCheckCounter = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** All fleet agents whose sessions the bridge keeps alive */
const FLEET_AGENTS = [
  "main", "soul", "oracle", "sentinel", "briefing",
  "alchemist", "web3dev", "akua", "basedintern", "midas",
];

async function sendHeartbeat() {
  const now = new Date().toISOString();
  const host = hostname();

  // Bridge heartbeat
  const { error } = await supabase
    .from("agent_sessions")
    .upsert(
      {
        agent_id: "bridge",
        status: "online",
        hostname: host,
        last_heartbeat: now,
      },
      { onConflict: "agent_id" }
    );

  if (error) {
    console.error(`[heartbeat] Failed:`, error.message);
  }

  // Keep all fleet agents alive — idle unless actively running a command
  const rows = FLEET_AGENTS.map((id) => ({
    agent_id: id,
    status: running.has(id) ? "busy" : "idle",
    hostname: host,
    last_heartbeat: now,
  }));

  const { error: fleetErr } = await supabase
    .from("agent_sessions")
    .upsert(rows, { onConflict: "agent_id" });

  if (fleetErr) {
    console.error(`[heartbeat] Fleet session update failed:`, fleetErr.message);
  }

  // Check if Soul should enter dream mode (idle consolidation + lucid proposals)
  maybeStartDream().catch(() => {});

  // Expire old proposals every ~30 minutes (60 heartbeats × 30s)
  expireCheckCounter++;
  if (expireCheckCounter >= 60) {
    expireCheckCounter = 0;
    expireOldProposals().catch(() => {});
  }
}

export function startHeartbeat() {
  console.log("[heartbeat] Starting (every 30s)");
  sendHeartbeat(); // immediate first beat
  timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
