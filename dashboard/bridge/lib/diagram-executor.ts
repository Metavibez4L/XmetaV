/**
 * diagram-executor.ts — Bridge command handler for /diagram commands
 *
 * Parses diagram commands and delegates to diagram-generator.ts
 * Optionally opens results via mac-automate.sh
 */

import { execSync } from "child_process";
import path from "path";
import {
  generateDiagram,
  fleetArchitectureSpec,
  commandFlowSpec,
  type DiagramSpec,
  type DiagramNode,
  type DiagramEdge,
} from "./diagram-generator.js";

const MAC_AUTOMATE = path.resolve(
  import.meta.dirname ?? ".",
  "../../../scripts/mac-automate.sh"
);

// ── Command Detection ────────────────────────────────────────────

/** Patterns that MUST appear at the start of the message (slash-command style) */
const PREFIX_PATTERNS = [
  /^\/diagram\b/i,
  /^diagram:/i,
];

/**
 * Natural-language patterns that match diagram/excalidraw requests anywhere
 * in the message. We require at least one "action" word + one "artifact" word
 * to avoid false positives on casual mentions.
 */
const NL_ACTION = /\b(?:generate|create|make|build|draw|produce|render|use)\b/i;
const NL_ARTIFACT = /\b(?:diagram|excalidraw|flowchart|architecture\s*diagram|system\s*diagram|mindmap|timeline\s*diagram)\b/i;

export function isDiagramCommand(message: string): boolean {
  const trimmed = message.trim();

  // 1. Exact prefix commands always match
  if (PREFIX_PATTERNS.some((p) => p.test(trimmed))) return true;

  // 2. Natural-language: must contain both an action verb AND a diagram artifact
  const lower = trimmed.toLowerCase();
  if (NL_ACTION.test(lower) && NL_ARTIFACT.test(lower)) return true;

  return false;
}

// ── Command Parsing ──────────────────────────────────────────────

interface DiagramRequest {
  preset?: "fleet" | "command-flow";
  type?: DiagramSpec["type"];
  title?: string;
  customNodes?: DiagramNode[];
  customEdges?: DiagramEdge[];
  autoOpen?: boolean;
}

export function parseDiagramCommand(message: string): DiagramRequest {
  const trimmed = message.trim().replace(/^\/diagram\s*/i, "").replace(/^diagram:\s*/i, "");
  const lower = trimmed.toLowerCase();

  // Check for presets
  if (lower.includes("fleet") || lower.includes("architecture")) {
    return { preset: "fleet", autoOpen: !lower.includes("no-open") };
  }
  if (lower.includes("command") || lower.includes("flow") || lower.includes("pipeline")) {
    return { preset: "command-flow", autoOpen: !lower.includes("no-open") };
  }

  // Check for type keywords
  let type: DiagramSpec["type"] = "architecture";
  if (lower.includes("mindmap")) type = "mindmap";
  else if (lower.includes("timeline")) type = "timeline";
  else if (lower.includes("flow")) type = "flow";

  // Try to parse JSON spec if present
  const jsonMatch = trimmed.match(/\{[\s\S]+\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: parsed.type || type,
        title: parsed.title,
        customNodes: parsed.nodes,
        customEdges: parsed.edges,
        autoOpen: parsed.autoOpen !== false,
      };
    } catch {
      // Not valid JSON, continue with defaults
    }
  }

  return { type, title: trimmed || undefined, autoOpen: true };
}

// ── Command Execution ────────────────────────────────────────────

interface DiagramResult {
  success: boolean;
  title?: string;
  type?: string;
  excalidrawPath?: string;
  svgPath?: string;
  opened?: boolean;
  error?: string;
}

export async function executeDiagramCommand(
  message: string
): Promise<DiagramResult> {
  const request = parseDiagramCommand(message);

  let spec: DiagramSpec;

  if (request.preset === "fleet") {
    spec = fleetArchitectureSpec();
  } else if (request.preset === "command-flow") {
    spec = commandFlowSpec();
  } else if (request.customNodes && request.customNodes.length > 0) {
    spec = {
      title: request.title || "Custom Diagram",
      type: request.type || "architecture",
      nodes: request.customNodes,
      edges: request.customEdges || [],
    };
  } else {
    // Default to fleet architecture if no specific request
    spec = fleetArchitectureSpec();
    if (request.title) spec.title = request.title;
  }

  try {
    const result = await generateDiagram(spec);

    let opened = false;
    if (request.autoOpen && result.svgPath) {
      try {
        execSync(`bash "${MAC_AUTOMATE}" open-svg "${result.svgPath}"`, {
          timeout: 5000,
          stdio: "pipe",
        });
        opened = true;
      } catch {
        // Non-fatal — file still generated
        console.log("[diagram-executor] Auto-open failed (non-fatal)");
      }
    }

    return {
      success: true,
      title: spec.title,
      type: spec.type,
      excalidrawPath: result.excalidrawPath,
      svgPath: result.svgPath,
      opened,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg,
    };
  }
}
