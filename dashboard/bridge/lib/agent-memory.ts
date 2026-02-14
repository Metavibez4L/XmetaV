import { supabase } from "./supabase.js";

// ============================================================
// Agent Memory — Persistent context across spawns
//
// Each agent gets a rolling memory window. The bridge:
//  1. Reads recent memories before dispatch → injects as context
//  2. After completion → writes an outcome summary back
//
// Memory kinds:
//  - observation: something noticed during execution
//  - outcome: result summary of a completed task
//  - fact: a persistent fact (e.g., "USDC balance is 0.42")
//  - error: a failure worth remembering
//  - goal: an ongoing objective
//  - note: freeform note from orchestrator
// ============================================================

export type MemoryKind = "observation" | "outcome" | "fact" | "error" | "goal" | "note";

export interface MemoryEntry {
  id?: string;
  agent_id: string;
  kind: MemoryKind;
  content: string;
  source?: string;
  ttl_hours?: number | null;
  created_at?: string;
}

/** Maximum characters of memory context to inject into a dispatch message */
const MAX_CONTEXT_CHARS = 2000;

/** How many recent entries to fetch per agent */
const RECENT_LIMIT = 15;

// ---- Read ----

/**
 * Fetch recent memory entries for an agent (most recent first).
 * Also includes `_shared` entries visible to all agents.
 */
export async function getAgentMemory(
  agentId: string,
  limit = RECENT_LIMIT
): Promise<MemoryEntry[]> {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("*")
    .in("agent_id", [agentId, "_shared"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[memory] Failed to read memory for ${agentId}:`, error.message);
    return [];
  }

  return (data ?? []) as MemoryEntry[];
}

/**
 * Build a concise memory preamble string to prepend to dispatch messages.
 * Returns empty string if no memories exist.
 */
export async function buildMemoryContext(agentId: string): Promise<string> {
  const entries = await getAgentMemory(agentId);
  if (entries.length === 0) return "";

  // Reverse so oldest first (chronological reading order)
  const chronological = entries.reverse();

  const lines: string[] = [];
  let chars = 0;

  for (const entry of chronological) {
    const prefix = entry.agent_id === "_shared" ? "[shared]" : `[${entry.kind}]`;
    const ts = entry.created_at
      ? new Date(entry.created_at).toISOString().slice(0, 16).replace("T", " ")
      : "";
    const line = `${prefix} ${ts}: ${entry.content}`;

    if (chars + line.length > MAX_CONTEXT_CHARS) break;
    lines.push(line);
    chars += line.length + 1;
  }

  if (lines.length === 0) return "";

  return [
    "--- MEMORY (from previous sessions) ---",
    ...lines,
    "--- END MEMORY ---",
    "",
  ].join("\n");
}

// ---- Write ----

/**
 * Write a memory entry for an agent.
 */
export async function writeMemory(entry: MemoryEntry): Promise<void> {
  const { error } = await supabase.from("agent_memory").insert({
    agent_id: entry.agent_id,
    kind: entry.kind,
    content: entry.content,
    source: entry.source ?? "bridge",
    ttl_hours: entry.ttl_hours ?? null,
  });

  if (error) {
    console.error(`[memory] Failed to write memory for ${entry.agent_id}:`, error.message);
  }
}

/**
 * Write a shared memory entry visible to all agents.
 */
export async function writeSharedMemory(
  content: string,
  kind: MemoryKind = "fact",
  source = "orchestrator"
): Promise<void> {
  await writeMemory({
    agent_id: "_shared",
    kind,
    content,
    source,
  });
}

// ---- Capture ----

/**
 * Extract the last meaningful lines from agent output as an outcome summary.
 * Strips noise, takes last N non-empty lines.
 */
export function extractOutcomeSummary(rawOutput: string, maxLines = 5): string {
  if (!rawOutput) return "";

  const NOISE = [
    /^\[agent\//,
    /^\[tools\]/,
    /^\[mcp\]/,
    /^\[skill\]/,
    /^\[exit code/,
    /^\[context\]/,
    /^\[memory\]/,
    /^\[dispatch\]/,
    /^\[Bridge\]/,
    /^\[openclaw\]/,
    /^\[session\]/,
    /^\[model\]/,
    /^\[runtime\]/,
    /^\[thinking\]/,
    /^\[streaming\]/,
    /^\[diagnostic\]/,
    /^\[heartbeat\]/,
    /^\[bridge\]/,
    /^\[swarm\]/,
    /^\[intent-tracker\]/,
    /^\[voice\//,
    /^Command exited with code/,
    /^command@/,
    /^ENTER send/,
    /^\s*at\s+\S/,
    /^Error:\s/,
    /^node:\S/,
    /^.*session file locked/,
  ];

  // Strip ANSI
  const clean = rawOutput.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !NOISE.some((pat) => pat.test(l)));

  // Take last N lines as the outcome
  const summary = lines.slice(-maxLines).join("\n");

  // Cap at ~500 chars
  return summary.length > 500 ? summary.slice(-500) : summary;
}

/**
 * After a command completes, capture a summary into agent memory.
 */
export async function captureCommandOutcome(
  agentId: string,
  message: string,
  rawOutput: string,
  exitCode: number | null
): Promise<void> {
  const summary = extractOutcomeSummary(rawOutput);
  if (!summary) return;

  const kind: MemoryKind = exitCode === 0 ? "outcome" : "error";
  const taskSnippet = message.length > 80 ? message.slice(0, 80) + "..." : message;

  await writeMemory({
    agent_id: agentId,
    kind,
    content: `Task: "${taskSnippet}" → ${kind === "outcome" ? "completed" : "failed (exit " + exitCode + ")"}. Output: ${summary}`,
    source: "bridge",
    ttl_hours: 72, // Auto-expire after 3 days
  });
}
