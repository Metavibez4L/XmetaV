/**
 * Slack webhook notifier for agent memory events.
 *
 * Set SLACK_WEBHOOK_URL in bridge .env to enable.
 * Posts formatted memory updates to a Slack channel.
 */

import type { MemoryKind } from "./agent-memory.js";

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

/** Whether Slack notifications are enabled */
export function isSlackEnabled(): boolean {
  return WEBHOOK_URL.startsWith("https://hooks.slack.com/");
}

/** Emoji mapping for memory kinds */
const KIND_EMOJI: Record<MemoryKind, string> = {
  outcome: ":white_check_mark:",
  error: ":rotating_light:",
  fact: ":brain:",
  observation: ":eyes:",
  goal: ":dart:",
  note: ":memo:",
};

/**
 * Post a memory event to Slack via incoming webhook.
 * Non-blocking — failures are logged but never throw.
 */
export async function notifySlack(
  agentId: string,
  kind: MemoryKind,
  content: string,
  source?: string
): Promise<void> {
  if (!isSlackEnabled()) return;

  const emoji = KIND_EMOJI[kind] ?? ":robot_face:";
  const truncated = content.length > 300 ? content.slice(0, 297) + "..." : content;

  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${agentId}* — _${kind}_\n${truncated}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Source: ${source ?? "bridge"} | ${new Date().toISOString().slice(0, 19)}`,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[slack] Webhook returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`[slack] Failed to notify:`, (err as Error).message);
  }
}
