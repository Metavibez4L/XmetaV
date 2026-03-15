/**
 * Shared output filter for agent responses.
 *
 * Strips verbose chain-of-thought reasoning, system logs, tool call XML,
 * progress chatter, and other noise from raw LLM output before it reaches
 * the database, dashboard, or Slack.
 */

// ── System / framework log prefixes ────────────────────────────
const LOG_PREFIX = /^\[(?:agent|tools|mcp|skill|context|memory|dispatch|bridge|openclaw|session|model|runtime|thinking|streaming|diagnostic|heartbeat|swarm|intent-tracker|plugins|lossless-claw|no-think|voice|sentinel|scholar|soul|health|executor|streamer)\b/i;

// ── Exit / error / stack trace markers ─────────────────────────
const EXIT_NOISE = [
  /^\[exit code/,
  /^Command exited with code/,
  /^command@/,
  /^ENTER send/,
  /^\s*at\s+\S/,                       // stack trace lines
  /^Error:\s/,
  /^node:\S/,
  /^.*session file locked/,
];

// ── Chain-of-thought / internal reasoning ──────────────────────
const COT_NOISE = [
  /^Let me\s+(search|fetch|get|try|check|now|look|find|see|use|run|start|attempt|verify|query)/i,
  /^I\s+(need to|should|found|will|can|got|see|have|just|want|think)\b/i,
  /^I('m|'ll|'ve)\s+(finding|getting|going|trying|checking|looking|fetching|running|searching|starting|using|now)/i,
  /^(The search results?|The user\b|The fetch|The web search|The response|The output|The result)/i,
  /^(Good|Great|Excellent|Perfect|Nice|Alright|OK|Okay|Sure|Right|Understood|Got it)[!.]?\s*$/i,
  /^(Good results|Good search|Good data|This is excellent)\b/i,
  /^(Now |So |First,? |Next,? |Then |After that |Finally,? |However,? |Also,? |Additionally,? )(I |let me |we |the )/i,
  /^(Looking at|Based on|According to|It (seems|looks|appears)|That (means|indicates|suggests))\b/i,
  /^(Here'?s? (what|the|my|a)|What I (found|see|got|can|need))\b/i,
  /^(Hmm|Hm+|Well|Alright|Anyway)\b/i,
  /^(Since |Because |As (we|I) (can see|mentioned|noted))\b/i,
];

// ── Progress / status chatter ──────────────────────────────────
const PROGRESS_NOISE = [
  /^(Checking|Fetching|Loading|Processing|Analyzing|Searching|Scanning|Querying|Waiting|Connecting)\.\.\./i,
  /^(Done|Finished|Complete|Ready)[.!]?\s*$/i,
  /^(Working on|Attempting to|About to|Going to|Preparing to)\b/i,
  /^<tool_call>/,
  /^<function=/,
  /^<parameter=/,
  /^<\/tool_call>/,
  /^<\/function>/,
  /^<\/parameter>/,
];

// ── Exec / approval loop chatter (the specific Slack problem) ──
const EXEC_LOOP_NOISE = [
  /^.*exec.*(denied|blocked|timeout|approval)/i,
  /^.*approval.*(required|timeout|waiting|pending)/i,
  /Exec denied.*gateway.*approval-timeout/i,
  /^The exec (tool|command)\b/i,
  /^.*tool is (blocked|restricted|unavailable)\b/i,
  /^.*curl\s+.*localhost/i,
  /^I('ve| have) (exhausted|confirmed|tried|attempted)\b/i,
  /^Since I can(not|'t) (verify|execute|check|run)\b/i,
  /^This is a (tooling|platform|capability|channel) limitation\b/i,
  /^.*every exec command\b/i,
  /^.*approval.*(mechanism|layer|restriction|requirement)\b/i,
];

// ── Plugin / registration noise ────────────────────────────────
const PLUGIN_NOISE = [
  /^\[plugins\]/,
  /^\[lossless-claw\]/,
  /^\[no-think\]/,
];

/** All noise patterns combined */
const ALL_NOISE: RegExp[] = [
  LOG_PREFIX,
  ...EXIT_NOISE,
  ...COT_NOISE,
  ...PROGRESS_NOISE,
  ...EXEC_LOOP_NOISE,
  ...PLUGIN_NOISE,
];

/** Test whether a single trimmed line is noise */
export function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  return ALL_NOISE.some((p) => p.test(t));
}

/** Strip ANSI escape codes */
export function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

/** Remove multi-line <tool_call>...</tool_call> XML blocks */
export function stripToolCallBlocks(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "");
}

/**
 * Filter a raw output string — remove noise lines, ANSI, tool call blocks.
 * Returns only meaningful content lines joined by newlines.
 */
export function filterOutput(raw: string): string {
  const clean = stripToolCallBlocks(stripAnsi(raw));
  return clean
    .split("\n")
    .filter((l) => !isNoiseLine(l))
    .join("\n");
}

/**
 * Extract the last N meaningful lines from raw output (for summaries).
 * Caps at ~500 chars.
 */
export function extractCleanSummary(raw: string, maxLines = 5): string {
  if (!raw) return "";
  const clean = stripToolCallBlocks(stripAnsi(raw));
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !isNoiseLine(l));

  const summary = lines.slice(-maxLines).join("\n");
  return summary.length > 500 ? summary.slice(-500) : summary;
}
