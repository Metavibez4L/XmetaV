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
import { filterOutput } from "./output-filter.js";

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
  _source?: string
): Promise<void> {
  const emoji = KIND_EMOJI[kind] ?? ":robot_face:";
  enqueue({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${agentId}*\n${truncate(content)}`,
        },
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

// ── Slack Bot API — thread replies ────────────────────────────

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? "";

/** Whether Bot token is configured (required for thread replies) */
export function isSlackBotEnabled(): boolean {
  return BOT_TOKEN.startsWith("xoxb-");
}

/**
 * Post a message back to a Slack thread via Bot API.
 * Non-blocking — failures are logged but never throw.
 */
export async function postToSlackThread(
  channel: string,
  threadTs: string | undefined,
  text: string
): Promise<string | undefined> {
  if (!isSlackBotEnabled()) return;

  const payload: Record<string, unknown> = { channel, text };
  if (threadTs) payload.thread_ts = threadTs;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[slack] postToSlackThread failed: HTTP ${res.status}`);
      return;
    }
    const body = await res.json() as { ok?: boolean; ts?: string };
    return body.ok ? body.ts : undefined;
  } catch (err) {
    console.warn(`[slack] postToSlackThread error:`, (err as Error).message);
  }
}

/**
 * Update an existing Slack message via chat.update.
 * Used by SlackStreamer to progressively edit response messages.
 */
async function updateSlackMessage(
  channel: string,
  messageTs: string,
  text: string
): Promise<boolean> {
  if (!isSlackBotEnabled()) return false;
  try {
    const res = await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel, ts: messageTs, text }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn(`[slack] updateSlackMessage failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[slack] updateSlackMessage error:`, (err as Error).message);
    return false;
  }
}

// ── Slack Streamer — progressive response updates ─────────────

const STREAM_UPDATE_MS = 1500;  // Update Slack every 1.5s (within rate limits)
const STREAM_MIN_CHARS = 60;    // Minimum new chars before updating

/**
 * Streams agent output to Slack by posting an initial message and then
 * editing it as more content arrives. Respects Slack rate limits.
 */
export class SlackStreamer {
  private channel: string;
  private threadTs: string | undefined;
  private messageTs: string | undefined;
  private buffer = "";
  private lastPushed = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done = false;

  constructor(channel: string, threadTs?: string) {
    this.channel = channel;
    this.threadTs = threadTs;
  }

  /** Post the initial placeholder message. Call once before feeding chunks. */
  async start(agentId: string): Promise<void> {
    const ts = await postToSlackThread(
      this.channel,
      this.threadTs,
      `:hourglass_flowing_sand: *${agentId}* is thinking...`
    );
    this.messageTs = ts;
    this.scheduleUpdate();
  }

  /** Feed new output text. Safe to call at any frequency. */
  push(text: string): void {
    if (this.done) return;
    this.buffer += text;
  }

  /** Finalize — send the cleaned-up final response. */
  async finish(agentId: string, rawOutput: string, success: boolean): Promise<void> {
    this.done = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.messageTs) return;

    // Import dynamically to avoid circular deps
    const { extractOutcomeSummary } = await import("../lib/agent-memory.js");
    const summary = extractOutcomeSummary(rawOutput, 8) || "(no output)";
    const status = success ? ":white_check_mark:" : ":x:";
    const final = `${status} *${agentId}*\n${summary}`;
    await updateSlackMessage(this.channel, this.messageTs, final);
  }

  private scheduleUpdate(): void {
    if (this.done) return;
    this.timer = setTimeout(() => this.flushUpdate(), STREAM_UPDATE_MS);
  }

  private async flushUpdate(): Promise<void> {
    if (this.done || !this.messageTs) return;
    const newContent = this.buffer;
    if (newContent.length - this.lastPushed.length >= STREAM_MIN_CHARS) {
      // Strip ANSI + tool call XML blocks
      const stripped = newContent
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "");
      // Filter noisy lines (chain-of-thought, log prefixes, tool calls)
      const filtered = filterOutput(stripped);
      // Truncate to last 2800 chars for Slack limit
      const display = filtered.length > 2800
        ? "..." + filtered.slice(-2800)
        : filtered;
      if (display.trim().length > 0) {
        await updateSlackMessage(this.channel, this.messageTs, display);
      }
      this.lastPushed = newContent;
    }
    this.scheduleUpdate();
  }
}

/**
 * Post to a slash command response_url (works for up to 30 min after command).
 * Used for async slash command responses.
 */
export async function postToResponseUrl(
  responseUrl: string,
  text: string
): Promise<void> {
  if (!responseUrl.startsWith("https://hooks.slack.com/")) return;

  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "in_channel", text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[slack] postToResponseUrl failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[slack] postToResponseUrl error:`, (err as Error).message);
  }
}
