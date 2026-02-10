import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { KNOWN_AGENTS } from "@/lib/types";

export const runtime = "nodejs";

const KNOWN_IDS = new Set(KNOWN_AGENTS.map((a) => a.id));

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agent_controls")
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const agent_id = body.agent_id;
  const enabled = body.enabled;

  if (typeof agent_id !== "string" || agent_id.length === 0) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }
  if (!KNOWN_IDS.has(agent_id)) {
    return NextResponse.json({ error: `Unknown agent_id: ${agent_id}` }, { status: 400 });
  }
  if (agent_id === "main" && enabled === false) {
    return NextResponse.json({ error: "main cannot be disabled" }, { status: 400 });
  }

  // Upsert control row
  const { data, error } = await supabase
    .from("agent_controls")
    .upsert(
      { agent_id, enabled, updated_by: user.id },
      { onConflict: "agent_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also notify main agent (audit / orchestration)
  await supabase.from("agent_commands").insert({
    agent_id: "main",
    message: `Fleet toggle: set agent \"${agent_id}\" enabled=${enabled}. Acknowledge and ensure any required local services/processes are in the correct state.`,
    status: "pending",
    created_by: user.id,
  });

  return NextResponse.json(data);
}

