import { hostname } from "os";
import { supabase } from "../lib/supabase.js";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

let timer: ReturnType<typeof setInterval> | null = null;

async function sendHeartbeat() {
  const { error } = await supabase
    .from("agent_sessions")
    .upsert(
      {
        agent_id: "bridge",
        status: "online",
        hostname: hostname(),
        last_heartbeat: new Date().toISOString(),
      },
      { onConflict: "agent_id" }
    );

  if (error) {
    console.error(`[heartbeat] Failed:`, error.message);
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
