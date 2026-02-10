import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getCursorClient } from "@/lib/cursor-client";

export const runtime = "nodejs";

/** POST /api/intent/[id]/followup -- send follow-up to refine commands */
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

  const body = await request.json().catch(() => ({}));
  const { message } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Fetch session
  const { data: session, error } = await supabase
    .from("intent_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!session.cursor_agent_id) {
    return NextResponse.json({ error: "No Cursor agent associated" }, { status: 400 });
  }

  try {
    const cursor = getCursorClient();

    // Send follow-up to Cursor agent
    await cursor.addFollowup(session.cursor_agent_id, {
      text: `${message.trim()}\n\nRemember: output ONLY the updated JSON command array, no other text.`,
    });

    // Set status back to THINKING while Cursor processes
    await supabase
      .from("intent_sessions")
      .update({ status: "THINKING" })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send follow-up";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
