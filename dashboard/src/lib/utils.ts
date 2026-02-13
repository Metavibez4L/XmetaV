import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ────────────────────────────────────────────────────
// Agent output cleaning — strip verbose debug lines
// ────────────────────────────────────────────────────

/**
 * Regex patterns matching OpenClaw/bridge internal debug lines.
 * These are informational and should not be shown to the user.
 */
const NOISE_PATTERNS: RegExp[] = [
  // ── OpenClaw internal prefixes ──
  /^\[agent\/[^\]]*\]/,           // [agent/embedded] ..., [agent/tool] ...
  /^\[tools\]/,                    // [tools] read failed: ..., [tools] exec failed: ...
  /^\[mcp\]/,                      // [mcp] ...
  /^\[skill\]/,                    // [skill] ...
  /^\[exit code: .+\]$/,           // [exit code: 0]
  /^\[context\]/,                  // [context] ...
  /^\[memory\]/,                   // [memory] ...
  /^\[dispatch\]/,                 // [dispatch] ...
  /^\[Bridge\]/,                   // [Bridge] First attempt failed ...
  /^\[openclaw\]/,                 // [openclaw] debug output
  /^\[session\]/,                  // [session] ...
  /^\[model\]/,                    // [model] ...
  /^\[runtime\]/,                  // [runtime] ...
  /^\[thinking\]/,                 // [thinking] ...
  /^\[streaming\]/,                // [streaming] ...
  // ── Command exit / error noise ──
  /^Command exited with code/,    // Command exited with code 1
  /^command@/,                     // command@main:~$ prompt lines
  /^ENTER send/,                   // ENTER send | SHIFT+ENTER ...
  // ── Node.js / shell stack traces ──
  /^\s*at\s+\S/,                   // at Function._resolveFilename (node:...)
  /^\s*throw\s+/,                  // throw err;
  /^Error:\s/,                     // Error: Cannot find module ...
  /^Require stack/,                // Require stack:
  /^node:\S/,                      // node:internal/modules/...
  /^\s*\^$/,                       // lone caret from error pointer
  /^\/bin\/\w+:\s/,                // /bin/bash: line 1: ... not found
  /^\s*\}$/,                       // trailing } from error object
];

/**
 * Strip verbose debug lines from agent output, keeping only the actual response.
 * Safe to call on any string — returns input unchanged if no noise is found.
 */
export function cleanAgentOutput(raw: string): string {
  if (!raw) return raw;
  const lines = raw.split("\n");
  const cleaned = lines.filter(
    (line) => !NOISE_PATTERNS.some((pat) => pat.test(line.trim()))
  );
  // Collapse leading/trailing blank lines left by filtering
  const result = cleaned.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
  return result;
}
