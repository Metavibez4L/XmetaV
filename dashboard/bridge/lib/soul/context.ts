/**
 * Soul Agent — Context Orchestrator
 *
 * The main entry point for Psyche's intelligence.
 * Replaces the simple buildMemoryContext() with a relevance-aware
 * context builder that draws from:
 *   1. Keyword-scored recent memories
 *   2. Associated memories from the association graph
 *   3. Dream insights (patterns, corrections)
 *   4. On-chain anchor count (identity context)
 *
 * Also handles post-task processing: building associations
 * after command completion.
 */

import { retrieveRelevantMemories, extractKeywords, logQuery } from "./retrieval.js";
import { getRelevantInsights } from "./dream.js";
import { buildAssociations } from "./associations.js";
import { getLatestAnchor, isAnchoringEnabled } from "../memory-anchor.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { ContextPacket } from "./types.js";

/**
 * Build an intelligent context preamble for dispatch.
 * This replaces the old buildMemoryContext() with Soul-powered retrieval.
 */
export async function buildSoulContext(
  agentId: string,
  taskMessage: string
): Promise<string> {
  const keywords = extractKeywords(taskMessage);

  // Fetch relevant memories (scored by keyword match + associations)
  const memories = await retrieveRelevantMemories(agentId, taskMessage);

  // Fetch dream insights that match the task
  const insights = await getRelevantInsights(keywords);

  // Get on-chain anchor count for identity context
  let anchorInfo = "";
  if (isAnchoringEnabled()) {
    try {
      const agentTokenId = Number(process.env.ERC8004_AGENT_ID || "16905");
      const latest = await getLatestAnchor(agentTokenId);
      if (latest) {
        anchorInfo = `[identity] ${latest.totalAnchors} memories anchored on-chain. Last anchor: category ${latest.category}, block time ${new Date(latest.timestamp * 1000).toISOString().slice(0, 16)}.`;
      }
    } catch {
      // Non-fatal
    }
  }

  // Build the context string
  if (memories.length === 0 && insights.length === 0 && !anchorInfo) {
    return "";
  }

  const lines: string[] = [];
  let chars = 0;
  const maxChars = DEFAULT_CONFIG.maxContextChars;

  lines.push("--- CONTEXT (curated by Soul) ---");

  // Identity line
  if (anchorInfo) {
    lines.push(anchorInfo);
    chars += anchorInfo.length;
  }

  // Dream insights (high-value, brief)
  if (insights.length > 0) {
    for (const insight of insights) {
      const line = `[insight] ${insight.insight}`;
      if (chars + line.length > maxChars) break;
      lines.push(line);
      chars += line.length;
    }
  }

  // Memories (chronological, most relevant first already filtered)
  if (memories.length > 0) {
    // Re-sort chronologically for reading order
    const chronological = [...memories].sort(
      (a, b) =>
        new Date(a.created_at || 0).getTime() -
        new Date(b.created_at || 0).getTime()
    );

    for (const mem of chronological) {
      const ts = mem.created_at
        ? new Date(mem.created_at).toISOString().slice(0, 16).replace("T", " ")
        : "";
      const prefix = mem.agent_id === "_shared" ? "[shared]" : `[${mem.kind}]`;
      const relevanceTag = mem.relevance >= 0.5 ? " ★" : "";
      const line = `${prefix} ${ts}: ${mem.content}${relevanceTag}`;

      if (chars + line.length > maxChars) break;
      lines.push(line);
      chars += line.length + 1;
    }
  }

  lines.push("--- END CONTEXT ---");
  lines.push("");

  // Log the query for learning (non-blocking)
  logQuery(
    agentId,
    keywords,
    memories.map((m) => m.id!).filter(Boolean),
    memories.map((m) => m.relevance)
  ).catch(() => {});

  return lines.join("\n");
}

/**
 * Post-task processing: build associations from a new memory.
 * Called after captureCommandOutcome writes the memory entry.
 */
export async function processNewMemory(
  memoryId: string,
  agentId: string,
  content: string
): Promise<void> {
  const count = await buildAssociations(memoryId, agentId, content);
  if (count > 0) {
    console.log(`[soul] Built ${count} association(s) for new memory.`);
  }
}

/**
 * Build a full context packet (structured, for API consumers).
 */
export async function buildContextPacket(
  agentId: string,
  taskMessage: string
): Promise<ContextPacket> {
  const memories = await retrieveRelevantMemories(agentId, taskMessage);
  const insights = await getRelevantInsights(extractKeywords(taskMessage));

  let totalAnchors = 0;
  if (isAnchoringEnabled()) {
    try {
      const agentTokenId = Number(process.env.ERC8004_AGENT_ID || "16905");
      const latest = await getLatestAnchor(agentTokenId);
      if (latest) totalAnchors = latest.totalAnchors;
    } catch {}
  }

  return {
    memories: memories.map((m) => ({
      id: m.id!,
      content: m.content,
      kind: m.kind,
      relevance: Math.round(m.relevance * 100) / 100,
      age_hours: Math.round(
        (Date.now() - new Date(m.created_at || 0).getTime()) / (1000 * 60 * 60)
      ),
    })),
    insights: insights.map((i) => ({
      insight: i.insight,
      confidence: i.confidence,
    })),
    patterns: [],
    total_anchors: totalAnchors,
  };
}
