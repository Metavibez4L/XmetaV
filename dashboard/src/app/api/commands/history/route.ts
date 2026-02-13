import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * GET /api/commands/history?agent_id=main&limit=50
 *
 * Fetches the current user's past commands with their final (assembled)
 * response text. Returns newest-first so the UI can group by date.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") || "50", 10),
    200
  );

  // Fetch recent commands for this user
  let query = supabase
    .from("agent_commands")
    .select("id, agent_id, message, status, created_at")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data: commands, error: cmdError } = await query;

  if (cmdError) {
    return NextResponse.json({ error: cmdError.message }, { status: 500 });
  }

  if (!commands || commands.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  // Fetch all responses for these commands in one query
  const commandIds = commands.map((c) => c.id);
  const { data: responses, error: respError } = await supabase
    .from("agent_responses")
    .select("command_id, content, is_final, created_at")
    .in("command_id", commandIds)
    .order("created_at", { ascending: true });

  if (respError) {
    return NextResponse.json({ error: respError.message }, { status: 500 });
  }

  // Group responses by command_id and concatenate content
  const responseMap = new Map<string, string>();
  for (const r of responses || []) {
    const existing = responseMap.get(r.command_id) || "";
    responseMap.set(r.command_id, existing + r.content);
  }

  // Build conversation entries
  const conversations = commands.map((cmd) => ({
    id: cmd.id,
    agentId: cmd.agent_id,
    message: cmd.message,
    response: responseMap.get(cmd.id) || null,
    status: cmd.status,
    createdAt: cmd.created_at,
  }));

  return NextResponse.json({ conversations });
}
