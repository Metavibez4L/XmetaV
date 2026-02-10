import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getCursorClient } from "@/lib/cursor-client";
import type { IntentCommand } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/intent/[id] -- get session details, refresh status from Cursor API */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch session from Supabase
  const { data: session, error } = await supabase
    .from("intent_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // If still THINKING, poll Cursor API for status update
  if (session.status === "THINKING" && session.cursor_agent_id) {
    try {
      const cursor = getCursorClient();
      const agentStatus = await cursor.getStatus(session.cursor_agent_id);

      if (agentStatus.status === "FINISHED") {
        // Fetch conversation and extract commands
        const convo = await cursor.getConversation(session.cursor_agent_id);
        const commands = extractCommands(convo.messages);

        // Update session
        await supabase
          .from("intent_sessions")
          .update({
            status: commands.length > 0 ? "READY" : "FAILED",
            commands,
            conversation: convo.messages,
          })
          .eq("id", id);

        session.status = commands.length > 0 ? "READY" : "FAILED";
        session.commands = commands;
        session.conversation = convo.messages;
      } else if (agentStatus.status === "STOPPED" || agentStatus.status === "FAILED") {
        // Try to get partial conversation
        let convo = null;
        try {
          convo = await cursor.getConversation(session.cursor_agent_id);
        } catch { /* agent may be deleted */ }

        await supabase
          .from("intent_sessions")
          .update({
            status: "FAILED",
            conversation: convo?.messages ?? null,
          })
          .eq("id", id);

        session.status = "FAILED";
        if (convo) session.conversation = convo.messages;
      }
      // If CREATING or RUNNING, leave as THINKING
    } catch {
      // Cursor API error -- leave status as is, client will retry
    }
  }

  return NextResponse.json(session);
}

/** Extract JSON command array from the last assistant message */
function extractCommands(
  messages: { type: string; text: string }[]
): IntentCommand[] {
  // Find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "assistant_message") {
      const text = messages[i].text.trim();
      try {
        // Try to parse the whole message as JSON
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return validateCommands(parsed);
      } catch {
        // Try to extract JSON array from the text (in case of surrounding text)
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed)) return validateCommands(parsed);
          } catch { /* not valid JSON */ }
        }
      }
    }
  }
  return [];
}

function validateCommands(arr: unknown[]): IntentCommand[] {
  return arr
    .filter(
      (item): item is IntentCommand =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).agent === "string" &&
        typeof (item as Record<string, unknown>).message === "string"
    )
    .map((item) => ({
      agent: item.agent,
      message: item.message,
      description:
        typeof item.description === "string" ? item.description : "",
    }));
}
