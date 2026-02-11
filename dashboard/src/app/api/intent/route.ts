import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getCursorClient } from "@/lib/cursor-client";
import type { IntentCommand } from "@/lib/types";

export const runtime = "nodejs";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

/** The system prompt for intent resolution (shared by both local and cloud) */
const INTENT_SYSTEM_PROMPT = `You are the Intent Layer for the XmetaV agent orchestration system. You analyze goals and produce OpenClaw terminal commands -- you NEVER execute them yourself.

Available agents:
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

When given a goal, produce a JSON array of commands. Each command:
{"agent": "main", "message": "the task to execute", "description": "short label"}

Rules:
- Use the most appropriate agent for each task
- Keep messages specific and actionable
- Order commands logically (dependencies first)
- Break multi-step operations into atomic commands
- Include verification steps when appropriate
- For x402/payment tasks: akua handles server-side + contracts, basedintern handles client-side + XMTP agents

RESPOND WITH ONLY THE JSON ARRAY. No explanations, no markdown fences, no file edits. Just the raw JSON array starting with [ and ending with ].`;

/** Cursor-specific prefix to prevent file editing */
const CURSOR_PREFIX = `CRITICAL: You are a PLANNING-ONLY assistant. DO NOT edit any files. DO NOT create branches. DO NOT make any code changes. Your ONLY job is to output a JSON array.\n\n`;

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

/** POST /api/intent -- create a new intent session */
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

  const isLocal = typeof model === "string" && model.startsWith("local:");

  if (isLocal) {
    return handleLocalIntent(supabase, user.id, goal.trim(), model);
  } else {
    return handleCursorIntent(supabase, user.id, goal.trim(), repository, model);
  }
}

// ============================================================
// Local Ollama path -- fast, synchronous, no polling needed
// ============================================================

async function handleLocalIntent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: string,
  model: string
) {
  const ollamaModel = model.replace("local:", "");

  try {
    // Call Ollama chat API directly
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: goal },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 2048,
        },
      }),
      signal: AbortSignal.timeout(60_000), // 60s max
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Ollama error (${res.status}): ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content: string = data.message?.content || "";

    // Parse commands from the response
    const commands = extractLocalCommands(content);
    const status = commands.length > 0 ? "READY" : "FAILED";

    // Insert session directly as READY (no polling needed)
    const { data: session, error } = await supabase
      .from("intent_sessions")
      .insert({
        cursor_agent_id: `ollama:${ollamaModel}`,
        goal,
        repository: "",
        model: `local:${ollamaModel}`,
        status,
        commands,
        conversation: [
          { id: "sys", type: "user_message", text: goal },
          { id: "res", type: "assistant_message", text: content },
        ],
        created_by: userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ollama request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function extractLocalCommands(text: string): IntentCommand[] {
  // Try to parse the whole response as JSON
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return validateCommands(parsed);
  } catch { /* not pure JSON */ }

  // Try to extract JSON array from markdown code fences or mixed text
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return validateCommands(parsed);
    } catch { /* not valid JSON */ }
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
      description: typeof item.description === "string" ? item.description : "",
    }));
}

// ============================================================
// Cursor Cloud path -- deep repo analysis, async with polling
// ============================================================

async function handleCursorIntent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: string,
  repository: string | undefined,
  model: string | undefined
) {
  const repo = repository || "https://github.com/Metavibez4L/XmetaV";

  try {
    const cursor = getCursorClient();
    const agent = await cursor.launchAgent({
      prompt: {
        text: `${CURSOR_PREFIX}${INTENT_SYSTEM_PROMPT}\n\n---\n\nUser goal: ${goal}`,
      },
      source: { repository: repo },
      target: { autoCreatePr: false },
      model: model || undefined,
    });

    const { data, error } = await supabase
      .from("intent_sessions")
      .insert({
        cursor_agent_id: agent.id,
        goal,
        repository: repo,
        model: model || null,
        status: "THINKING",
        commands: [],
        created_by: userId,
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
