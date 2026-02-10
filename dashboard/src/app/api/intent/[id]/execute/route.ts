import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { IntentCommand } from "@/lib/types";

export const runtime = "nodejs";

/** POST /api/intent/[id]/execute -- execute approved commands via OpenClaw bridge */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optionally accept a modified commands array from the client
  const body = await request.json().catch(() => ({}));
  const overrideCommands = body.commands as IntentCommand[] | undefined;

  // Fetch session
  const { data: session, error } = await supabase
    .from("intent_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status !== "READY") {
    return NextResponse.json(
      { error: `Cannot execute session in status ${session.status}` },
      { status: 400 }
    );
  }

  const commands: IntentCommand[] = overrideCommands || session.commands || [];
  if (commands.length === 0) {
    return NextResponse.json({ error: "No commands to execute" }, { status: 400 });
  }

  try {
    // Insert each command into agent_commands table
    const commandIds: string[] = [];

    for (const cmd of commands) {
      const { data, error: insertErr } = await supabase
        .from("agent_commands")
        .insert({
          agent_id: cmd.agent || "main",
          message: cmd.message,
          status: "pending",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error(`[intent/execute] Failed to insert command:`, insertErr.message);
        continue;
      }
      if (data) commandIds.push(data.id);
    }

    // Update session status and store command IDs
    await supabase
      .from("intent_sessions")
      .update({
        status: "EXECUTING",
        commands: overrideCommands || session.commands,
        executed_command_ids: commandIds,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      command_count: commandIds.length,
      command_ids: commandIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Execution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
