import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getCursorClient } from "@/lib/cursor-client";

export const runtime = "nodejs";

/** POST /api/intent/[id]/stop -- cancel an intent session */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch session
  const { data: session, error } = await supabase
    .from("intent_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Stop Cursor agent if still active
  if (
    session.cursor_agent_id &&
    (session.status === "THINKING")
  ) {
    try {
      const cursor = getCursorClient();
      await cursor.stopAgent(session.cursor_agent_id);
    } catch {
      // Agent might already be stopped/finished -- ignore
    }
  }

  // Update session status
  await supabase
    .from("intent_sessions")
    .update({ status: "CANCELLED" })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
