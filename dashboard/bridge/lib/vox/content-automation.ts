/**
 * Vox Marketing Automation
 *
 * Auto-generates marketing content from high-scoring scholar findings.
 * Runs inside the bridge daemon alongside scholar.
 *
 *   1. Content Calendar — tracks scheduled posts per domain
 *   2. Auto-Thread Generator — converts findings into tweet-sized threads
 *   3. Campaign Feed — queues content for Vox agent to review/publish
 *
 * Vox reads from the `vox_content_queue` in Supabase.
 * Bridge writes to it when scholar discovers high-value findings.
 */

import { supabase } from "../supabase.js";
import { writeMemory, writeSharedMemory } from "../agent-memory.js";
import type { ResearchFinding } from "../scholar/types.js";

// ---- Content Calendar ----

interface ScheduledPost {
  id: string;
  domain: string;
  title: string;
  content: string;
  threadParts: string[];
  scheduledFor: string; // ISO timestamp
  status: "queued" | "reviewed" | "published" | "rejected";
  findingScore: number;
  createdAt: string;
}

/** In-memory calendar (synced to Supabase) */
const contentCalendar: ScheduledPost[] = [];

/** Max posts per day to avoid spam */
const MAX_DAILY_POSTS = 3;

/** Minimum score for auto-content generation */
const AUTO_THREAD_MIN_SCORE = 0.6;

// ---- Thread Generator ----

/**
 * Convert a research finding into a tweet-thread (array of ≤280-char segments).
 */
function generateThread(finding: ResearchFinding): string[] {
  const parts: string[] = [];
  const domainLabel = finding.domain.replace("-", " ").toUpperCase();

  // Hook tweet  
  const hook = `🔬 ${domainLabel} Intel\n\n${finding.title}\n\nRelevance: ${(finding.relevanceScore * 100).toFixed(0)}% | Keywords: ${finding.matchedKeywords.slice(0, 3).join(", ")}`;
  parts.push(truncate(hook, 280));

  // Content body — split into 280-char chunks
  const body = finding.content;
  const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);

  let chunk = "";
  for (const sentence of sentences) {
    if ((chunk + " " + sentence).length > 260) {
      if (chunk) parts.push(truncate(chunk.trim(), 280));
      chunk = sentence;
    } else {
      chunk = chunk ? chunk + " " + sentence : sentence;
    }
  }
  if (chunk) parts.push(truncate(chunk.trim(), 280));

  // CTA tweet
  const cta = `💡 Discovered by XmetaV Scholar Agent\n\n🔗 Powered by ERC-8004 on Base\n⚡ x402 pay-per-call API: xmetav.com`;
  parts.push(truncate(cta, 280));

  return parts;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

// ---- Scheduling ----

/**
 * Compute optimal post time based on domain and calendar.
 * Spaces posts at least 4 hours apart, prefers US business hours (14–22 UTC).
 */
function computeScheduleTime(): string {
  const now = new Date();
  const todayPosts = contentCalendar.filter(
    (p) =>
      p.status === "queued" &&
      new Date(p.scheduledFor).toDateString() === now.toDateString()
  );

  if (todayPosts.length >= MAX_DAILY_POSTS) {
    // Push to next day, 15:00 UTC
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(15, 0, 0, 0);
    return tomorrow.toISOString();
  }

  // Find next available slot (4hrs apart, bias toward 15-21 UTC)
  const lastScheduled = todayPosts.length > 0
    ? new Date(
        Math.max(...todayPosts.map((p) => new Date(p.scheduledFor).getTime()))
      )
    : null;

  let slot: Date;
  if (lastScheduled && lastScheduled.getTime() > now.getTime()) {
    slot = new Date(lastScheduled.getTime() + 4 * 60 * 60 * 1000);
  } else {
    // Next whole hour in 15–21 UTC range
    slot = new Date(now);
    const utcHour = slot.getUTCHours();
    if (utcHour < 15) slot.setUTCHours(15, 0, 0, 0);
    else if (utcHour >= 21) {
      slot.setUTCDate(slot.getUTCDate() + 1);
      slot.setUTCHours(15, 0, 0, 0);
    } else {
      slot.setUTCHours(utcHour + 1, 0, 0, 0);
    }
  }

  return slot.toISOString();
}

// ---- Public API ----

/**
 * Queue a scholar finding for Vox marketing content.
 * Called from the research loop when a finding scores above threshold.
 */
export async function queueVoxContent(finding: ResearchFinding): Promise<void> {
  if (finding.relevanceScore < AUTO_THREAD_MIN_SCORE) return;

  const thread = generateThread(finding);
  const scheduledFor = computeScheduleTime();

  const post: ScheduledPost = {
    id: `vox_${Date.now()}_${finding.domain}`,
    domain: finding.domain,
    title: finding.title,
    content: finding.content,
    threadParts: thread,
    scheduledFor,
    status: "queued",
    findingScore: finding.relevanceScore,
    createdAt: new Date().toISOString(),
  };

  contentCalendar.push(post);

  // Persist to Supabase for Vox agent to pick up
  try {
    await supabase.from("vox_content_queue").insert({
      post_id: post.id,
      domain: post.domain,
      title: post.title,
      content: post.content,
      thread_parts: post.threadParts,
      scheduled_for: post.scheduledFor,
      status: post.status,
      finding_score: post.findingScore,
    });

    // Notify Vox via shared memory
    await writeSharedMemory(
      `[vox/content-queue] New thread queued: "${post.title}" (${post.domain}, score: ${post.findingScore}). ` +
      `Scheduled for ${post.scheduledFor}. ${thread.length} parts. Review and publish.`,
      "observation",
      "vox-automation"
    );

    console.log(
      `[vox] Content queued: "${post.title}" → ${thread.length} parts, scheduled ${post.scheduledFor}`
    );
  } catch (err) {
    // Table may not exist yet — just log
    console.log(`[vox] Content queue write skipped (table may not exist): ${(err as Error).message}`);

    // Still write to memory so Vox sees it
    await writeMemory({
      agent_id: "vox",
      kind: "observation",
      content: `[auto-thread] ${post.title}\n\nThread (${thread.length} parts):\n${thread.map((t, i) => `${i + 1}/ ${t}`).join("\n\n")}`,
      source: "vox-automation",
      ttl_hours: 168, // 7 days
    });
  }
}

/**
 * Get the content calendar stats.
 */
export function getVoxCalendarStats() {
  const now = new Date();
  const todayPosts = contentCalendar.filter(
    (p) => new Date(p.scheduledFor).toDateString() === now.toDateString()
  );

  return {
    totalQueued: contentCalendar.filter((p) => p.status === "queued").length,
    todayPosts: todayPosts.length,
    maxDailyPosts: MAX_DAILY_POSTS,
    recentPosts: contentCalendar.slice(-5).map((p) => ({
      id: p.id,
      domain: p.domain,
      title: p.title,
      threadParts: p.threadParts.length,
      scheduledFor: p.scheduledFor,
      status: p.status,
      score: p.findingScore,
    })),
  };
}

// ---- Supabase Table Setup (idempotent) ----

export const VOX_CONTENT_QUEUE_SQL = `
CREATE TABLE IF NOT EXISTS vox_content_queue (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id      TEXT UNIQUE NOT NULL,
  domain       TEXT NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  thread_parts JSONB NOT NULL DEFAULT '[]',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',
  finding_score FLOAT NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vox_queue_status ON vox_content_queue(status);
CREATE INDEX IF NOT EXISTS idx_vox_queue_scheduled ON vox_content_queue(scheduled_for);
`;
