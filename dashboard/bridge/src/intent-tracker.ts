import { supabase } from "../lib/supabase.js";

// ============================================================
// Intent Session Tracker
// Monitors agent_commands that belong to intent sessions
// and marks sessions as COMPLETED when all commands finish.
// ============================================================

/**
 * Subscribe to agent_commands changes and update intent_sessions
 * when all executed commands for a session are done.
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
        const cmd = payload.new as { id: string; status: string };
        if (cmd.status !== "completed" && cmd.status !== "failed" && cmd.status !== "cancelled") {
          return;
        }

        // Check if this command belongs to an intent session
        await checkIntentSessionCompletion(cmd.id);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[intent-tracker] Listening for command completions...");
      }
    });

  return channel;
}

async function checkIntentSessionCompletion(commandId: string) {
  try {
    // Find intent sessions in EXECUTING status that reference this command
    const { data: sessions, error } = await supabase
      .from("intent_sessions")
      .select("id, executed_command_ids")
      .eq("status", "EXECUTING");

    if (error || !sessions) return;

    for (const session of sessions) {
      const cmdIds = session.executed_command_ids as string[] | null;
      if (!cmdIds || !cmdIds.includes(commandId)) continue;

      // Check if all commands for this session are done
      const { data: commands, error: cmdError } = await supabase
        .from("agent_commands")
        .select("id, status")
        .in("id", cmdIds);

      if (cmdError || !commands) continue;

      const allDone = commands.every(
        (c: { status: string }) =>
          c.status === "completed" || c.status === "failed" || c.status === "cancelled"
      );

      if (allDone) {
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
    }
  } catch (err) {
    console.error("[intent-tracker] Error:", err);
  }
}
