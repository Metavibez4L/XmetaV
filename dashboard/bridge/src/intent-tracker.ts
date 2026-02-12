import { supabase } from "../lib/supabase.js";
import { running } from "./executor.js";
import { CursorClient } from "../lib/cursor-client.js";

// ============================================================
// Intent Session Tracker
// - Monitors agent_commands that belong to intent sessions
// - Marks sessions as COMPLETED when all commands finish
// - Timeout fallback: kills hung commands after timeout_seconds,
//   then asks Cursor to regenerate alternative commands
// ============================================================

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

/** Track active timeout timers per command ID so we can cancel them */
const timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Track which command IDs we've already timed out (prevent double-fire) */
const timedOutCommands = new Set<string>();

/**
 * Subscribe to agent_commands changes and:
 * 1. Start timeout timers when commands go to "running"
 * 2. Clear timers and check session completion when commands finish
 * 3. Handle timeout -> retry flow
 */
export function startIntentTracker() {
  const channel = supabase
    .channel("intent-tracker")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "agent_commands",
      },
      async (payload) => {
        const cmd = payload.new as { id: string; agent_id: string; status: string };

        if (cmd.status === "running") {
          // Start a timeout timer for this command if it belongs to an intent session
          await maybeStartTimeout(cmd.id, cmd.agent_id);
          return;
        }

        if (
          cmd.status === "completed" ||
          cmd.status === "failed" ||
          cmd.status === "cancelled" ||
          cmd.status === "timeout"
        ) {
          // Clear any timeout timer
          clearCommandTimeout(cmd.id);

          // Check if this completes (or times out) an intent session
          if (cmd.status === "timeout") {
            await handleCommandTimeout(cmd.id);
          } else {
            await checkIntentSessionCompletion(cmd.id);
          }
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[intent-tracker] Listening for command completions + timeouts...");
      }
    });

  return channel;
}

// ---- Timeout Management ----

async function maybeStartTimeout(commandId: string, agentId: string) {
  // Check if this command belongs to an EXECUTING intent session
  const session = await findSessionForCommand(commandId);
  if (!session) return;

  const timeoutMs = (session.timeout_seconds || 120) * 1000;

  // Don't start a timer if we already have one or already timed out
  if (timeoutTimers.has(commandId) || timedOutCommands.has(commandId)) return;

  console.log(
    `[intent-tracker] Starting ${timeoutMs / 1000}s timeout for command ${commandId} (agent: ${agentId})`
  );

  const timer = setTimeout(async () => {
    timeoutTimers.delete(commandId);

    if (timedOutCommands.has(commandId)) return;
    timedOutCommands.add(commandId);

    console.log(`[intent-tracker] Command ${commandId} TIMED OUT after ${timeoutMs / 1000}s`);

    // Kill the child process
    const child = running.get(agentId);
    if (child) {
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* already dead */ }
        }, 5000);
      } catch { /* already dead */ }
      running.delete(agentId);
    }

    // Mark command as timeout
    await supabase
      .from("agent_commands")
      .update({ status: "timeout" })
      .eq("id", commandId);

    // Write a response explaining the timeout
    await supabase.from("agent_responses").insert({
      command_id: commandId,
      content: `\n[Bridge] Command timed out after ${timeoutMs / 1000}s. Falling back to Cursor for alternative commands.\n`,
      is_final: true,
    });

    // Reset agent session to idle
    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id: agentId, status: "idle", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );
  }, timeoutMs);

  timeoutTimers.set(commandId, timer);
}

function clearCommandTimeout(commandId: string) {
  const timer = timeoutTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    timeoutTimers.delete(commandId);
  }
}

// ---- Timeout -> Retry Flow ----

async function handleCommandTimeout(commandId: string) {
  try {
    const session = await findSessionForCommand(commandId);
    if (!session) return;

    // Check if ALL commands for this session are done (some may still be running)
    const cmdIds = session.executed_command_ids as string[] | null;
    if (!cmdIds) return;

    const { data: commands } = await supabase
      .from("agent_commands")
      .select("id, agent_id, message, status")
      .in("id", cmdIds);

    if (!commands) return;

    // If some commands are still running, wait for them to finish/timeout too
    const stillRunning = commands.some(
      (c: { status: string }) => c.status === "running" || c.status === "pending"
    );
    if (stillRunning) return;

    // All commands are done -- check if any timed out
    const anyTimeout = commands.some((c: { status: string }) => c.status === "timeout");

    if (!anyTimeout) {
      // No timeouts -- just check normal completion
      await checkIntentSessionCompletion(commandId);
      return;
    }

    // We have timeouts -- attempt retry
    const retryCount = session.retry_count ?? 0;
    const maxRetries = session.max_retries ?? 2;

    if (retryCount >= maxRetries) {
      console.log(
        `[intent-tracker] Session ${session.id} exhausted retries (${retryCount}/${maxRetries}). Marking FAILED.`
      );
      await supabase
        .from("intent_sessions")
        .update({ status: "FAILED" })
        .eq("id", session.id);
      return;
    }

    // Build context about what failed
    const timedOutCmds = commands.filter((c: { status: string }) => c.status === "timeout");
    const completedCmds = commands.filter((c: { status: string }) => c.status === "completed");

    // Get partial output from timed-out commands
    let failureContext = `The following commands timed out after ${session.timeout_seconds || 120}s:\n`;
    for (const cmd of timedOutCmds) {
      const { data: responses } = await supabase
        .from("agent_responses")
        .select("content")
        .eq("command_id", cmd.id)
        .order("created_at", { ascending: true });

      const partialOutput = responses?.map((r: { content: string }) => r.content).join("") || "(no output)";
      failureContext += `\n- Agent "${cmd.agent_id}": "${cmd.message}"\n  Partial output: ${partialOutput.slice(0, 500)}\n`;
    }

    if (completedCmds.length > 0) {
      failureContext += `\nCommands that succeeded: ${completedCmds.map((c: { agent_id: string; message: string }) => `[${c.agent_id}] ${c.message}`).join(", ")}`;
    }

    failureContext += `\n\nPlease regenerate alternative commands to achieve the original goal a DIFFERENT way. Avoid the approaches that timed out. Output ONLY the JSON command array.`;

    console.log(
      `[intent-tracker] Session ${session.id} retrying (${retryCount + 1}/${maxRetries})...`
    );

    // Send follow-up to Cursor agent
    try {
      const apiKey = process.env.CURSOR_API_KEY;
      if (!apiKey) {
        console.error("[intent-tracker] CURSOR_API_KEY not set, cannot retry");
        await supabase.from("intent_sessions").update({ status: "FAILED" }).eq("id", session.id);
        return;
      }

      const cursor = new CursorClient(apiKey);
      await cursor.addFollowup(session.cursor_agent_id, { text: failureContext });

      // Update session: increment retry, go back to THINKING
      await supabase
        .from("intent_sessions")
        .update({
          status: "THINKING",
          retry_count: retryCount + 1,
          executed_command_ids: null, // Clear old command IDs
        })
        .eq("id", session.id);

      console.log(
        `[intent-tracker] Session ${session.id} -> THINKING (retry ${retryCount + 1}/${maxRetries})`
      );
    } catch (err) {
      console.error("[intent-tracker] Failed to send retry follow-up:", err);
      await supabase
        .from("intent_sessions")
        .update({ status: "FAILED" })
        .eq("id", session.id);
    }
  } catch (err) {
    console.error("[intent-tracker] handleCommandTimeout error:", err);
  }
}

// ---- Session Completion Check ----

async function checkIntentSessionCompletion(commandId: string) {
  try {
    const { data: sessions, error } = await supabase
      .from("intent_sessions")
      .select("id, executed_command_ids, retry_count, max_retries, timeout_seconds, cursor_agent_id")
      .eq("status", "EXECUTING");

    if (error || !sessions) return;

    for (const session of sessions) {
      const cmdIds = session.executed_command_ids as string[] | null;
      if (!cmdIds || !cmdIds.includes(commandId)) continue;

      const { data: commands, error: cmdError } = await supabase
        .from("agent_commands")
        .select("id, agent_id, message, status")
        .in("id", cmdIds);

      if (cmdError || !commands) continue;

      const allDone = commands.every(
        (c: { status: string }) =>
          c.status === "completed" ||
          c.status === "failed" ||
          c.status === "cancelled" ||
          c.status === "timeout"
      );

      if (!allDone) continue;

      // Check for timeouts -- delegate to retry handler
      const anyTimeout = commands.some((c: { status: string }) => c.status === "timeout");
      if (anyTimeout) {
        await handleCommandTimeout(commandId);
        return;
      }

      const anyFailed = commands.some(
        (c: { status: string }) => c.status === "failed"
      );

      await supabase
        .from("intent_sessions")
        .update({ status: anyFailed ? "FAILED" : "COMPLETED" })
        .eq("id", session.id);

      console.log(
        `[intent-tracker] Session ${session.id} -> ${anyFailed ? "FAILED" : "COMPLETED"}`
      );
    }
  } catch (err) {
    console.error("[intent-tracker] Error:", err);
  }
}

// ---- Helpers ----

interface IntentSessionRow {
  id: string;
  cursor_agent_id: string;
  executed_command_ids: string[] | null;
  retry_count: number;
  max_retries: number;
  timeout_seconds: number;
}

async function findSessionForCommand(commandId: string): Promise<IntentSessionRow | null> {
  const { data: sessions } = await supabase
    .from("intent_sessions")
    .select("id, cursor_agent_id, executed_command_ids, retry_count, max_retries, timeout_seconds")
    .eq("status", "EXECUTING");

  if (!sessions) return null;

  for (const session of sessions) {
    const cmdIds = session.executed_command_ids as string[] | null;
    if (cmdIds && cmdIds.includes(commandId)) {
      return session as IntentSessionRow;
    }
  }
  return null;
}
