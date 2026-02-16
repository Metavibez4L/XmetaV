import { hostname } from "os";
import { execFile } from "child_process";
import { supabase } from "../lib/supabase.js";
import { maybeStartDream } from "../lib/soul/index.js";
import { expireOldProposals } from "../lib/soul/dream-proposals.js";
import { running } from "./executor.js";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
let expireCheckCounter = 0;
let sitrepCounter = 0;
let sitrepRunning = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** All fleet agents whose sessions the bridge keeps alive */
const FLEET_AGENTS = [
  "main", "soul", "oracle", "sentinel", "briefing",
  "alchemist", "web3dev", "akua", "basedintern", "midas",
];

/** Path to the briefing skill (pure bash — no LLM tokens) */
const BRIEFING_SCRIPT = `${process.env.HOME}/.openclaw/workspace/skills/briefing/briefing.sh`;

/**
 * Refresh SITREP.md via the briefing skill.
 * Safe to call frequently — guards against concurrent runs.
 */
export function refreshSitrep(reason = "scheduled"): void {
  if (sitrepRunning) return;
  sitrepRunning = true;
  console.log(`[heartbeat] Refreshing SITREP (${reason})...`);

  execFile("bash", [BRIEFING_SCRIPT, "sitrep"], {
    cwd: process.env.HOME,
    timeout: 30_000,
    env: { ...process.env },
  }, (err) => {
    sitrepRunning = false;
    if (err) {
      console.error(`[heartbeat] SITREP refresh failed:`, err.message);
    } else {
      console.log(`[heartbeat] SITREP.md refreshed (${reason})`);
    }
  });
}

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

  // Refresh SITREP every ~2 hours (240 heartbeats × 30s)
  sitrepCounter++;
  if (sitrepCounter >= 240) {
    sitrepCounter = 0;
    refreshSitrep("2h-cycle");
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
