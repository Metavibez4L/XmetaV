import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getCursorClient } from "@/lib/cursor-client";

export const runtime = "nodejs";

/** The system prompt that makes Cursor generate OpenClaw commands */
const INTENT_SYSTEM_PROMPT = `You are the Intent Layer for the XmetaV agent orchestration system.

Available agents: main, basedintern, akua (+ _web variants for browser tasks).
- main: Orchestrator agent with full tools (kimi-k2.5:cloud, ~/.openclaw/workspace). Delegates work, manages fleet, coordinates swarms.
- basedintern: TypeScript/Node.js repo agent (coding tools, /home/manifest/basedintern). Builds apps, XMTP agents, x402 client integrations.
- akua: Solidity/Hardhat/Base repo agent (coding tools, /home/manifest/akua). Smart contracts, x402 server-side (payment middleware), on-chain settlement.
- basedintern_web / akua_web: Full tools including browser (use sparingly)

x402 Payment Protocol (Coinbase):
- Enables autonomous USDC micro-payments over HTTP on Base network
- Server-side: akua deploys @coinbase/x402-middleware to gate API endpoints
- Client-side: basedintern builds XMTP chat agents with @coinbase/x402-sdk
- Flow: GET -> 402 (payment details) -> pay USDC on-chain -> retry with X-PAYMENT header -> 200 OK
- For x402 tasks, use akua for server/contract work and basedintern for client/agent work

When the user gives you a high-level goal, analyze it and produce a JSON array of OpenClaw commands to achieve it. Each command object:
{
  "agent": "basedintern",
  "message": "Run npm test and report failures",
  "description": "Health check basedintern repo"
}

Rules:
- Use the most appropriate agent for each task
- Keep messages specific and actionable
- Order commands logically (dependencies first)
- For multi-step operations, break into atomic commands
- Include verification steps when appropriate
- Use main for coordination, research, and system tasks
- Use basedintern for TypeScript/Node.js work
- Use akua for Solidity/Hardhat/Go work
- Use _web variants ONLY for browser automation
- For x402/payment tasks: akua handles server-side + contracts, basedintern handles client-side + XMTP agents

Output ONLY the JSON command array, no other text. No markdown code fences.`;

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
