/**
 * POST /api/slack/events
 *
 * Slack Events API handler — receives app_mention and message events,
 * verifies the request signature, and dispatches commands to the agent fleet
 * via the agent_commands table.
 *
 * Required env vars:
 *   SLACK_SIGNING_SECRET  — from Slack App > Basic Information
 *   SLACK_BOT_TOKEN       — xoxb-... from Slack App > OAuth & Permissions
 *
 * Slack requires a 200 response within 3 seconds. We ack immediately and
 * process async. The bridge executor detects the __SLACK__ metadata prefix
 * and posts the agent's response back to the originating thread.
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
  // Reject requests older than 5 minutes (replay attack prevention)
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

// ── Agent routing ─────────────────────────────────────────────

/** Parse @agent mentions from text like "ask @scholar to research X" */
function parseAgentFromText(text: string): string {
  // Remove the bot mention itself first
  const cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const match = cleaned.match(/\b@?(main|soul|sentinel|oracle|scholar|midas|alchemist|web3dev|vox|briefing|akua|basedintern|skill-foundry)\b/i);
  return match ? match[1].toLowerCase() : "main";
}

/** Clean message text — strip bot mention and leading whitespace */
function cleanMessageText(text: string, botUserId?: string): string {
  let cleaned = text;
  if (botUserId) {
    cleaned = cleaned.replace(new RegExp(`<@${botUserId}>`, "g"), "");
  }
  // Strip any remaining user/channel mentions for display
  cleaned = cleaned.replace(/<@[A-Z0-9]+>/g, "").trim();
  return cleaned || "help";
}

// ── Slack Bot API ─────────────────────────────────────────────

async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const payload: Record<string, unknown> = { channel, text };
  if (threadTs) payload.thread_ts = threadTs;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
}

// ── Main handler ──────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!signingSecret) {
    return NextResponse.json(
      { error: "SLACK_SIGNING_SECRET not configured" },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── URL verification challenge (one-time during Slack App setup)
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // ── Event callback
  if (payload.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event as Record<string, unknown>;

  // Ignore bot messages (prevent loops)
  if (event.bot_id || event.subtype === "bot_message") {
    return NextResponse.json({ ok: true });
  }

  // Only handle app_mention and direct message events
  if (event.type !== "app_mention" && event.channel_type !== "im") {
    return NextResponse.json({ ok: true });
  }

  // Ack immediately — Slack requires < 3s response
  // Process async
  const channel = event.channel as string;
  const threadTs = (event.thread_ts ?? event.ts) as string;
  const userId = event.user as string;
  const text = (event.text as string) ?? "";
  const botUserId = (payload.authorizations as Array<Record<string, string>>)?.[0]?.user_id;

  // Process in background
  setImmediate(async () => {
    try {
      const cleanedText = cleanMessageText(text, botUserId);
      const agentId = parseAgentFromText(text);

      const supabase = createAdminClient();

      // Encode Slack context as a metadata prefix the bridge executor will detect
      const slackMeta = JSON.stringify({ channel, thread_ts: threadTs, user_id: userId });
      const messageWithMeta = `__SLACK__${slackMeta}__\n${cleanedText}`;

      const { error } = await supabase.from("agent_commands").insert({
        agent_id: agentId,
        message: messageWithMeta,
        status: "pending",
        created_by: null,
      });

      if (error) {
        console.error("[slack/events] Failed to insert command:", error.message);
        if (botToken) {
          await postSlackMessage(
            botToken,
            channel,
            `:rotating_light: Failed to dispatch to *${agentId}*: ${error.message}`,
            threadTs
          );
        }
        return;
      }

      // Post acknowledgement to thread
      if (botToken) {
        await postSlackMessage(
          botToken,
          channel,
          `:hourglass_flowing_sand: Dispatching to *${agentId}*... I'll reply here when done.`,
          threadTs
        );
      }
    } catch (err) {
      console.error("[slack/events] Processing error:", err);
    }
  });

  return NextResponse.json({ ok: true });
}
