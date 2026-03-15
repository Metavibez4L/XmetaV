/**
 * POST /api/slack/commands
 *
 * Slash command handler for /xmetav
 *
 * Commands:
 *   /xmetav help                     — list available commands
 *   /xmetav status                   — fleet health + revenue summary
 *   /xmetav agents                   — list active agents
 *   /xmetav ask [@agent] <message>   — dispatch to an agent (async, replies in thread)
 *   /xmetav memory <search term>     — search agent memory
 *   /xmetav dream                    — trigger manual dream cycle
 *
 * Required env vars:
 *   SLACK_SIGNING_SECRET
 *   SLACK_BOT_TOKEN
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// ── Signature verification ────────────────────────────────────

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const requestAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (requestAge > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(sigBasestring)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

// ── Parse slash command body (application/x-www-form-urlencoded) ──

function parseSlackForm(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of body.split("&")) {
    const [key, value] = pair.split("=").map(decodeURIComponent);
    if (key) params[key] = value ?? "";
  }
  return params;
}

// ── Slack response helpers ────────────────────────────────────

function slackText(text: string, responseType: "ephemeral" | "in_channel" = "ephemeral") {
  return NextResponse.json({ response_type: responseType, text });
}

function slackBlocks(
  blocks: unknown[],
  responseType: "ephemeral" | "in_channel" = "ephemeral"
) {
  return NextResponse.json({ response_type: responseType, blocks });
}

async function postDelayed(responseUrl: string, payload: Record<string, unknown>) {
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("[slack/commands] Delayed response failed:", err);
  }
}

// ── Command handlers ──────────────────────────────────────────

async function handleHelp() {
  return slackBlocks([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":robot_face: *XmetaV Agent Fleet — Slash Commands*",
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "`/xmetav status` — Fleet health, uptime, revenue",
          "`/xmetav agents` — List all active agents",
          "`/xmetav ask <message>` — Ask the main agent",
          "`/xmetav ask @scholar <message>` — Ask a specific agent",
          "`/xmetav memory <term>` — Search agent memory",
          "`/xmetav dream` — Trigger manual dream/consolidation cycle",
          "`/xmetav help` — This message",
        ].join("\n"),
      },
    },
  ]);
}

async function handleStatus() {
  const supabase = createAdminClient();

  const [sessionsResult, paymentsResult, anchorsResult] = await Promise.all([
    supabase
      .from("agent_sessions")
      .select("agent_id, status, last_heartbeat")
      .order("agent_id"),
    supabase
      .from("x402_payments")
      .select("amount_usd")
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      ),
    supabase
      .from("agent_memory")
      .select("id", { count: "exact", head: true })
      .eq("source", "anchor"),
  ]);

  const sessions = sessionsResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const anchorCount = anchorsResult.count ?? 0;

  const online = sessions.filter((s) => s.status !== "offline").length;
  const busy = sessions.filter((s) => s.status === "busy").length;
  const revenue7d = payments
    .reduce((sum, p) => sum + Number(p.amount_usd ?? 0), 0)
    .toFixed(2);

  return slackBlocks(
    [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:zap: *XmetaV Fleet Status*`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Agents Online*\n${online} / ${sessions.length}`,
          },
          { type: "mrkdwn", text: `*Busy*\n${busy} agent(s)` },
          {
            type: "mrkdwn",
            text: `*Revenue (7d)*\n$${revenue7d} USDC`,
          },
          {
            type: "mrkdwn",
            text: `*Memories Anchored*\n${anchorCount} on-chain`,
          },
        ],
      },
    ],
    "in_channel"
  );
}

async function handleAgents() {
  const supabase = createAdminClient();
  const { data: sessions } = await supabase
    .from("agent_sessions")
    .select("agent_id, status, last_heartbeat")
    .order("agent_id");

  const statusEmoji: Record<string, string> = {
    online: ":white_circle:",
    idle: ":white_circle:",
    busy: ":large_yellow_circle:",
    offline: ":red_circle:",
  };

  const lines = (sessions ?? []).map((s) => {
    const emoji = statusEmoji[s.status] ?? ":white_circle:";
    const ago = s.last_heartbeat
      ? Math.round((Date.now() - new Date(s.last_heartbeat).getTime()) / 1000)
      : null;
    const agoStr = ago != null ? ` _(${ago}s ago)_` : "";
    return `${emoji} *${s.agent_id}* — ${s.status}${agoStr}`;
  });

  return slackBlocks([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:busts_in_silhouette: *Active Agents (${sessions?.length ?? 0})*\n\n${lines.join("\n")}`,
      },
    },
  ]);
}

async function handleMemory(term: string) {
  if (!term.trim()) {
    return slackText("Usage: `/xmetav memory <search term>`");
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("agent_memory")
    .select("agent_id, kind, content, created_at")
    .ilike("content", `%${term}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) {
    return slackText(`No memories found matching _${term}_`);
  }

  const lines = data.map((m) => {
    const date = new Date(m.created_at).toISOString().slice(0, 10);
    const snippet =
      m.content.length > 120 ? m.content.slice(0, 120) + "..." : m.content;
    return `*${m.agent_id}* [${m.kind}] _${date}_\n> ${snippet}`;
  });

  return slackBlocks([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:brain: *Memory search: "${term}"* (${data.length} results)\n\n${lines.join("\n\n")}`,
      },
    },
  ]);
}

async function handleAsk(
  args: string,
  channelId: string,
  userId: string,
  responseUrl: string
) {
  // Parse optional @agent prefix: "ask @scholar research ERC-7683"
  const agentMatch = args.match(
    /^@?(main|soul|sentinel|oracle|scholar|midas|alchemist|web3dev|vox|briefing|akua|basedintern|skill-foundry)\s+(.+)/i
  );

  const agentId = agentMatch ? agentMatch[1].toLowerCase() : "main";
  const message = agentMatch ? agentMatch[2].trim() : args.trim();

  if (!message) {
    return slackText(
      "Usage: `/xmetav ask <message>` or `/xmetav ask @agent <message>`"
    );
  }

  const supabase = createAdminClient();

  // Encode Slack context for bridge executor
  const slackMeta = JSON.stringify({
    channel: channelId,
    response_url: responseUrl,
    user_id: userId,
    source: "slash_command",
  });
  const messageWithMeta = `__SLACK__${slackMeta}__\n${message}`;

  const { error } = await supabase.from("agent_commands").insert({
    agent_id: agentId,
    message: messageWithMeta,
    status: "pending",
    created_by: null,
  });

  if (error) {
    return slackText(`:rotating_light: Failed to dispatch: ${error.message}`);
  }

  return slackBlocks(
    [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:hourglass_flowing_sand: Dispatching to *${agentId}*...\n> ${message.length > 100 ? message.slice(0, 100) + "..." : message}\n\nI'll post the response here when done.`,
        },
      },
    ],
    "in_channel"
  );
}

async function handleDream(channelId: string, responseUrl: string) {
  const supabase = createAdminClient();

  const slackMeta = JSON.stringify({
    channel: channelId,
    response_url: responseUrl,
    source: "slash_command",
  });
  const messageWithMeta = `__SLACK__${slackMeta}__\ntrigger-dream manual`;

  await supabase.from("agent_commands").insert({
    agent_id: "soul",
    message: messageWithMeta,
    status: "pending",
    created_by: null,
  });

  return slackBlocks(
    [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:crescent_moon: *Dream cycle triggered.* Soul agent will scan memory, detect patterns, and generate proposals. Results posted here when complete.`,
        },
      },
    ],
    "in_channel"
  );
}

// ── Main handler ──────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    return slackText(":rotating_light: SLACK_SIGNING_SECRET not configured");
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = parseSlackForm(rawBody);
  const commandText = (params.text ?? "").trim();
  const channelId = params.channel_id ?? "";
  const userId = params.user_id ?? "";
  const responseUrl = params.response_url ?? "";

  const [subcommand, ...rest] = commandText.split(/\s+/);
  const args = rest.join(" ");

  switch (subcommand.toLowerCase()) {
    case "":
    case "help":
      return handleHelp();

    case "status":
      return handleStatus();

    case "agents":
      return handleAgents();

    case "memory":
      return handleMemory(args);

    case "ask":
      return handleAsk(args, channelId, userId, responseUrl);

    case "dream":
      return handleDream(channelId, responseUrl);

    default:
      return slackText(
        `:thinking_face: Unknown command: \`${subcommand}\`. Try \`/xmetav help\`.`
      );
  }
}
