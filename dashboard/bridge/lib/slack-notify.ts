/**
 * Slack webhook notifier for XmetaV Bridge events.
 *
 * Set SLACK_WEBHOOK_URL in bridge .env to enable.
 *
 * Features:
 *  - Rate-limited queue (max 1 msg/sec to respect Slack limits)
 *  - Single retry with backoff on failure
 *  - Typed helpers for memory, anchor, sentinel, and system events
 */

import type { MemoryKind } from "./agent-memory.js";

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

/** Whether Slack notifications are enabled */
export function isSlackEnabled(): boolean {
  return WEBHOOK_URL.startsWith("https://hooks.slack.com/");
}

// ── Rate-limited send queue ──────────────────────────────────

const MIN_INTERVAL_MS = 1100; // ~1 msg/sec (Slack rate limit)
const MAX_QUEUE = 50; // drop oldest if queue backs up
let lastSendTime = 0;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
const queue: Array<Record<string, unknown>> = [];

/** Internal: send one payload with 1 retry on failure. */
async function sendPayload(payload: Record<string, unknown>): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return;
      if (res.status === 429) {
        // Slack told us to slow down — wait and retry
        const retryAfter = Number(res.headers.get("Retry-After") || "3");
        console.warn(`[slack] Rate-limited, retrying in ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      console.warn(`[slack] Webhook returned ${res.status} (attempt ${attempt + 1})`);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.warn(`[slack] Send failed (attempt ${attempt + 1}):`, (err as Error).message);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Drain one item off the queue, schedule next. */
function drain(): void {
  drainTimer = null;
  if (queue.length === 0) return;
  const payload = queue.shift()!;
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastSendTime));

  const run = () => {
    lastSendTime = Date.now();
    sendPayload(payload).finally(() => {
      if (queue.length > 0) drainTimer = setTimeout(drain, MIN_INTERVAL_MS);
    });
  };

  if (wait > 0) {
    drainTimer = setTimeout(run, wait);
  } else {
    run();
  }
}

/** Enqueue a Slack payload (non-blocking). */
function enqueue(payload: Record<string, unknown>): void {
  if (!isSlackEnabled()) return;
  if (queue.length >= MAX_QUEUE) queue.shift(); // drop oldest
  queue.push(payload);
  if (!drainTimer) drain();
}

// ── Helpers ──────────────────────────────────────────────────

function truncate(s: string, max = 300): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function ts(): string {
  return new Date().toISOString().slice(0, 19);
}

// ── Memory notifications ─────────────────────────────────────

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
 * Post a memory event to Slack.
 * Non-blocking — failures are logged but never throw.
 */
export async function notifySlack(
  agentId: string,
  kind: MemoryKind,
  content: string,
  source?: string
): Promise<void> {
  const emoji = KIND_EMOJI[kind] ?? ":robot_face:";
  enqueue({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${agentId}* — _${kind}_\n${truncate(content)}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Source: ${source ?? "bridge"} | ${ts()}` },
        ],
      },
    ],
  });
}

// ── Anchor notifications ─────────────────────────────────────

export function notifySlackAnchor(
  agentId: string,
  ipfsCid: string,
  txHash: string,
  score?: number
): void {
  const scoreStr = score != null ? ` (score ${score.toFixed(2)})` : "";
  enqueue({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:anchor: *${agentId}* — Memory anchored on-chain${scoreStr}\n\`ipfs://${ipfsCid}\`\n<https://basescan.org/tx/${txHash}|View TX>`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `${ts()}` }],
      },
    ],
  });
}

// ── Sentinel alert notifications ─────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ":fire:",
  warning: ":warning:",
  info: ":information_source:",
};

export function notifySlackAlert(
  service: string,
  severity: string,
  message: string
): void {
  // Only surface warnings and criticals to Slack (skip info noise)
  if (severity !== "critical" && severity !== "warning") return;
  const emoji = SEVERITY_EMOJI[severity] ?? ":bell:";
  enqueue({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *Sentinel Alert* — _${severity}_\n*${service}*: ${truncate(message, 250)}`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `${ts()}` }],
      },
    ],
  });
}

// ── System / lifecycle notifications ─────────────────────────

export function notifySlackSystem(message: string, emoji = ":gear:"): void {
  enqueue({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *Bridge* — ${truncate(message, 400)}`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `${ts()}` }],
      },
    ],
  });
}
