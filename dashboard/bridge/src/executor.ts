import { supabase } from "../lib/supabase.js";
import { runAgent } from "../lib/openclaw.js";
import { createStreamer } from "./streamer.js";
import type { ChildProcess } from "child_process";

/** Track running processes per agent (one at a time per agent) */
const running = new Map<string, ChildProcess>();

export async function executeCommand(command: {
  id: string;
  agent_id: string;
  message: string;
}) {
  const { id, agent_id, message } = command;

  // Check if this agent already has a running command
  if (running.has(agent_id)) {
    console.log(`[executor] Agent "${agent_id}" is busy, queueing command ${id}`);
    // Leave as pending -- will be picked up when current finishes
    return;
  }

  console.log(`[executor] Executing command ${id} on agent "${agent_id}"`);

  // Mark as running
  await supabase
    .from("agent_commands")
    .update({ status: "running" })
    .eq("id", id);

  // Update agent session status to busy
  await supabase
    .from("agent_sessions")
    .upsert(
      { agent_id, status: "busy", last_heartbeat: new Date().toISOString() },
      { onConflict: "agent_id" }
    );

  const streamer = createStreamer(id);
  streamer.start();

  try {
    const child = runAgent({
      agentId: agent_id,
      message,
      onChunk: (text) => streamer.write(text),
      onExit: async (code) => {
        running.delete(agent_id);

        await streamer.end(code);

        const status = code === 0 ? "completed" : "failed";
        await supabase
          .from("agent_commands")
          .update({ status })
          .eq("id", id);

        // Reset agent session to idle
        await supabase
          .from("agent_sessions")
          .upsert(
            { agent_id, status: "idle", last_heartbeat: new Date().toISOString() },
            { onConflict: "agent_id" }
          );

        console.log(`[executor] Command ${id} finished: ${status}`);

        // Check for queued commands for this agent
        pickNextCommand(agent_id);
      },
    });

    running.set(agent_id, child);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[executor] Failed to spawn agent:`, errorMsg);

    await streamer.write(`\n[Bridge Error] ${errorMsg}\n`);
    await streamer.end(1);

    await supabase
      .from("agent_commands")
      .update({ status: "failed" })
      .eq("id", id);

    running.delete(agent_id);
  }
}

/** Pick the next pending command for an agent */
async function pickNextCommand(agentId: string) {
  const { data } = await supabase
    .from("agent_commands")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (data) {
    executeCommand(data);
  }
}
