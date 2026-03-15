/**
 * Slack Socket Mode listener for XmetaV Bridge.
 *
 * Uses WebSocket connection to Slack — no public URL required.
 * Handles slash commands (/xmetav) and app_mention events locally.
 *
 * Required env vars:
 *   SLACK_APP_TOKEN   — xapp-... (App-level token, Socket Mode)
 *   SLACK_BOT_TOKEN   — xoxb-... (Bot token, for posting replies)
 *   SLACK_SIGNING_SECRET — for completeness (not needed in socket mode)
 */

import { App, LogLevel } from "@slack/bolt";
import { createClient } from "@supabase/supabase-js";
import { postToSlackThread } from "../lib/slack-notify.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FLEET_AGENTS = [
  "main","soul","sentinel","oracle","scholar","midas",
  "alchemist","web3dev","vox","briefing","akua","basedintern","skill-foundry",
];

function parseAgentFromText(text: string): string {
  const cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const match = cleaned.match(
    /\b@?(main|soul|sentinel|oracle|scholar|midas|alchemist|web3dev|vox|briefing|akua|basedintern|skill-foundry)\b/i
  );
  return match ? match[1].toLowerCase() : "main";
}

function cleanMentions(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim() || "help";
}

/** Insert a command into agent_commands with Slack metadata prefix */
async function dispatchToAgent(
  agentId: string,
  message: string,
  slackMeta: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const metaPrefix = `__SLACK__${JSON.stringify(slackMeta)}__\n`;
  const { error } = await supabase.from("agent_commands").insert({
    agent_id: agentId,
    message: metaPrefix + message,
    status: "pending",
    created_by: null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Query fleet status from Supabase */
async function getFleetStatus() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [sessions, payments, anchors] = await Promise.all([
    supabase.from("agent_sessions").select("agent_id, status, last_heartbeat").order("agent_id"),
    supabase
      .from("x402_payments")
      .select("amount_usd")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from("agent_memory").select("id", { count: "exact", head: true }).eq("source", "anchor"),
  ]);

  const online = (sessions.data ?? []).filter((s) => s.status !== "offline").length;
  const busy = (sessions.data ?? []).filter((s) => s.status === "busy").length;
  const revenue = (payments.data ?? [])
    .reduce((sum, p) => sum + Number(p.amount_usd ?? 0), 0)
    .toFixed(2);
  const anchorCount = anchors.count ?? 0;

  return { sessions: sessions.data ?? [], online, busy, revenue, anchorCount };
}

/** Search agent memory */
async function searchMemory(term: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await supabase
    .from("agent_memory")
    .select("agent_id, kind, content, created_at")
    .ilike("content", `%${term}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  return data ?? [];
}

export function startSlackSocket(): void {
  const appToken = process.env.SLACK_APP_TOKEN;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!appToken?.startsWith("xapp-") || !botToken?.startsWith("xoxb-")) {
    console.log("[slack:socket] Skipping — SLACK_APP_TOKEN or SLACK_BOT_TOKEN not configured");
    return;
  }

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });

  // ── /xmetav slash command ─────────────────────────────────────

  app.command("/xmetav", async ({ command, ack, respond }) => {
    await ack();

    const [subcommand, ...rest] = (command.text ?? "").trim().split(/\s+/);
    const args = rest.join(" ");

    switch (subcommand.toLowerCase()) {
      case "":
      case "help": {
        await respond({
          response_type: "ephemeral",
          text: [
            ":robot_face: *XmetaV Agent Fleet — Slash Commands*",
            "",
            "`/xmetav status` — Fleet health, uptime, revenue",
            "`/xmetav agents` — List all active agents",
            "`/xmetav ask <message>` — Ask the main agent",
            "`/xmetav ask @agent <message>` — Ask a specific agent",
            "`/xmetav memory <term>` — Search agent memory",
            "`/xmetav dream` — Trigger manual dream cycle",
            "`/xmetav help` — This message",
          ].join("\n"),
        });
        break;
      }

      case "status": {
        const { online, busy, revenue, anchorCount, sessions } = await getFleetStatus();
        await respond({
          response_type: "in_channel",
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: ":zap: *XmetaV Fleet Status*" },
            },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Agents Online*\n${online} / ${sessions.length}` },
                { type: "mrkdwn", text: `*Busy*\n${busy} agent(s)` },
                { type: "mrkdwn", text: `*Revenue (7d)*\n$${revenue} USDC` },
                { type: "mrkdwn", text: `*Memories Anchored*\n${anchorCount} on-chain` },
              ],
            },
          ],
        });
        break;
      }

      case "agents": {
        const { sessions } = await getFleetStatus();
        const statusEmoji: Record<string, string> = {
          online: ":white_circle:", idle: ":white_circle:",
          busy: ":large_yellow_circle:", offline: ":red_circle:",
        };
        const lines = sessions.map((s) => {
          const emoji = statusEmoji[s.status] ?? ":white_circle:";
          const ago = s.last_heartbeat
            ? Math.round((Date.now() - new Date(s.last_heartbeat).getTime()) / 1000)
            : null;
          return `${emoji} *${s.agent_id}* — ${s.status}${ago != null ? ` _(${ago}s ago)_` : ""}`;
        });
        await respond({
          response_type: "ephemeral",
          text: `:busts_in_silhouette: *Agents (${sessions.length})*\n\n${lines.join("\n")}`,
        });
        break;
      }

      case "memory": {
        if (!args.trim()) {
          await respond({ response_type: "ephemeral", text: "Usage: `/xmetav memory <search term>`" });
          break;
        }
        const results = await searchMemory(args);
        if (results.length === 0) {
          await respond({ response_type: "ephemeral", text: `No memories found matching _${args}_` });
          break;
        }
        const lines = results.map((m) => {
          const date = new Date(m.created_at).toISOString().slice(0, 10);
          const snippet = m.content.length > 120 ? m.content.slice(0, 120) + "..." : m.content;
          return `*${m.agent_id}* [${m.kind}] _${date}_\n> ${snippet}`;
        });
        await respond({
          response_type: "ephemeral",
          text: `:brain: *Memory: "${args}"* (${results.length} results)\n\n${lines.join("\n\n")}`,
        });
        break;
      }

      case "ask": {
        const agentMatch = args.match(
          /^@?(main|soul|sentinel|oracle|scholar|midas|alchemist|web3dev|vox|briefing|akua|basedintern|skill-foundry)\s+(.+)/i
        );
        const agentId = agentMatch ? agentMatch[1].toLowerCase() : "main";
        const message = agentMatch ? agentMatch[2].trim() : args.trim();

        if (!message) {
          await respond({ response_type: "ephemeral", text: "Usage: `/xmetav ask <message>` or `/xmetav ask @agent <message>`" });
          break;
        }

        const result = await dispatchToAgent(agentId, message, {
          channel: command.channel_id,
          response_url: command.response_url,
          user_id: command.user_id,
          source: "slash_command",
        });

        if (!result.ok) {
          await respond({ response_type: "ephemeral", text: `:rotating_light: Failed to dispatch: ${result.error}` });
          break;
        }

        await respond({
          response_type: "in_channel",
          text: `:hourglass_flowing_sand: Dispatching to *${agentId}*...\n> ${message.length > 100 ? message.slice(0, 100) + "..." : message}\n\nI'll post the response here when done.`,
        });
        break;
      }

      case "dream": {
        await dispatchToAgent("soul", "trigger-dream manual", {
          channel: command.channel_id,
          response_url: command.response_url,
          source: "slash_command",
        });
        await respond({
          response_type: "in_channel",
          text: ":crescent_moon: *Dream cycle triggered.* Soul agent will scan memory, detect patterns, and post results here when complete.",
        });
        break;
      }

      default: {
        await respond({
          response_type: "ephemeral",
          text: `:thinking_face: Unknown command: \`${subcommand}\`. Try \`/xmetav help\`.`,
        });
      }
    }
  });

  // ── app_mention events ────────────────────────────────────────

  app.event("app_mention", async ({ event, say }) => {
    const text = (event as { text?: string }).text ?? "";
    const channel = event.channel;
    const threadTs = (event as { thread_ts?: string; ts: string }).thread_ts ?? (event as { ts: string }).ts;

    const agentId = parseAgentFromText(text);
    const message = cleanMentions(text);

    await say({
      text: `:hourglass_flowing_sand: Dispatching to *${agentId}*... I'll reply here when done.`,
      thread_ts: threadTs,
    });

    const result = await dispatchToAgent(agentId, message, {
      channel,
      thread_ts: threadTs,
      source: "app_mention",
    });

    if (!result.ok) {
      await say({
        text: `:rotating_light: Failed to dispatch to *${agentId}*: ${result.error}`,
        thread_ts: threadTs,
      });
    }
  });

  // ── Direct messages (im) ──────────────────────────────────────

  app.message(async ({ message, say }) => {
    const msg = message as { channel_type?: string; text?: string; ts: string; user?: string; bot_id?: string };

    // Only handle DMs, ignore bot messages
    if (msg.channel_type !== "im" || msg.bot_id) return;

    const text = msg.text ?? "";
    const channel = (message as { channel: string }).channel;
    const threadTs = msg.ts;

    const agentId = parseAgentFromText(text);
    const cleanedMessage = cleanMentions(text);

    await say(`:hourglass_flowing_sand: Dispatching to *${agentId}*... I'll reply here when done.`);

    const result = await dispatchToAgent(agentId, cleanedMessage, {
      channel,
      thread_ts: threadTs,
      user_id: msg.user ?? "",
      source: "dm",
    });

    if (!result.ok) {
      await say(`:rotating_light: Failed to dispatch: ${result.error}`);
    }
  });

  // Start the socket connection
  app.start().then(() => {
    console.log("[slack:socket] Socket Mode connected — /xmetav and @mentions active");
  }).catch((err) => {
    console.error("[slack:socket] Failed to start:", err.message);
  });
}

export function stopSlackSocket(): void {
  // Bolt handles cleanup on process exit
}
