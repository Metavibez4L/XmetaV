import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getCursorClient } from "@/lib/cursor-client";

export const runtime = "nodejs";

/** The system prompt that makes Cursor generate OpenClaw commands */
const INTENT_SYSTEM_PROMPT = `CRITICAL: You are a PLANNING-ONLY assistant. DO NOT edit any files. DO NOT create branches. DO NOT make any code changes. Your ONLY job is to output a JSON array.

You are the Intent Layer for the XmetaV agent orchestration system. You analyze goals and produce OpenClaw terminal commands -- you NEVER execute them yourself.

Available agents:
- main: Orchestrator agent with full tools (kimi-k2.5:cloud, ~/.openclaw/workspace)
- basedintern: TypeScript/Node.js repo agent (coding tools, /home/manifest/basedintern)
- akua: Solidity/Hardhat repo agent (coding tools, /home/manifest/akua)
- basedintern_web / akua_web: Full tools including browser (use sparingly)

When given a goal, produce a JSON array of commands. Each command:
{"agent": "main", "message": "the task to execute", "description": "short label"}

Rules:
- Use the most appropriate agent for each task
- Keep messages specific and actionable
- Order commands logically (dependencies first)
- Break multi-step operations into atomic commands
- Include verification steps when appropriate

RESPOND WITH ONLY THE JSON ARRAY. No explanations, no markdown fences, no file edits. Just the raw JSON array starting with [ and ending with ].`;

/** GET /api/intent -- list intent sessions */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status");
  let query = supabase
    .from("intent_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/intent -- create a new intent session (launches Cursor cloud agent) */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { goal, repository, model } = body;

  if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const repo = repository || "https://github.com/Metavibez4L/XmetaV";

  try {
    // Launch Cursor Cloud Agent with the intent prompt
    const cursor = getCursorClient();
    const agent = await cursor.launchAgent({
      prompt: {
        text: `${INTENT_SYSTEM_PROMPT}\n\n---\n\nUser goal: ${goal.trim()}`,
      },
      source: {
        repository: repo,
      },
      target: {
        autoCreatePr: false,
      },
      model: model || undefined,
    });

    // Store session in Supabase
    const { data, error } = await supabase
      .from("intent_sessions")
      .insert({
        cursor_agent_id: agent.id,
        goal: goal.trim(),
        repository: repo,
        model: model || null,
        status: "THINKING",
        commands: [],
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to launch Cursor agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
