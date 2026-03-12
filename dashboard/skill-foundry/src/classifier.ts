// Skill Foundry — Classifier
// Interprets a capability request and classifies it into category + risk

import type {
  SkillRequest,
  SkillClassification,
  SkillCategory,
  RiskLevel,
} from "./types";

/** Keywords that signal each category */
const CATEGORY_SIGNALS: Record<SkillCategory, string[]> = {
  data: [
    "fetch", "read", "get", "query", "lookup", "api", "price", "balance",
    "status", "list", "search", "check",
  ],
  execution: [
    "send", "transfer", "swap", "trade", "execute", "write", "deploy",
    "mint", "burn", "approve", "sign",
  ],
  monitoring: [
    "monitor", "watch", "alert", "health", "uptime", "poll", "ping",
    "heartbeat", "dashboard",
  ],
  memory: [
    "log", "store", "save", "remember", "journal", "history", "context",
    "retrieve", "recall",
  ],
  orchestration: [
    "pipeline", "workflow", "chain", "coordinate", "schedule", "trigger",
    "compose", "multi-step", "swarm",
  ],
  media: [
    "publish", "post", "tweet", "announce", "format", "render", "markdown",
    "image", "content", "newsletter",
  ],
  monetization: [
    "x402", "charge", "paywall", "monetize", "price", "earnings",
    "revenue", "paid",
  ],
};

/** Risk escalation keywords */
const HIGH_RISK_SIGNALS = [
  "wallet", "send", "transfer", "deploy", "mint", "burn", "approve",
  "sign", "private key", "seed phrase", "delete", "drop", "rm -rf",
];
const MEDIUM_RISK_SIGNALS = [
  "write", "update", "modify", "post", "execute", "swap", "trade",
  "external api", "webhook",
];

/**
 * Classify a skill request into category and risk level.
 * Uses keyword matching against the description text.
 */
export function classifyRequest(request: SkillRequest): SkillClassification {
  const text = request.description.toLowerCase();
  const words = text.split(/\s+/);

  // Score each category
  const scores: Record<string, number> = {};
  for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS)) {
    scores[cat] = signals.reduce((score, signal) => {
      return score + (text.includes(signal) ? 1 : 0);
    }, 0);
  }

  // Use hint if provided, otherwise pick highest scorer
  let category: SkillCategory;
  if (request.categoryHint) {
    category = request.categoryHint;
  } else {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    category = (sorted[0]?.[1] ?? 0) > 0
      ? (sorted[0][0] as SkillCategory)
      : "data"; // default to safest category
  }

  // Assess risk
  const risk = assessRisk(text);

  // Generate name from description
  const name = generateName(request.description);

  return {
    name,
    category,
    risk,
    scope: deriveScopeDescription(category, text),
    rationale: buildRationale(category, risk, scores),
  };
}

/** Assess risk level based on keywords */
function assessRisk(text: string): RiskLevel {
  for (const signal of HIGH_RISK_SIGNALS) {
    if (text.includes(signal)) return "high";
  }
  for (const signal of MEDIUM_RISK_SIGNALS) {
    if (text.includes(signal)) return "medium";
  }
  return "low";
}

/** Generate a kebab-case skill name from the description */
function generateName(description: string): string {
  const stopWords = new Set([
    "a", "an", "the", "is", "to", "for", "and", "or", "of", "in", "on",
    "that", "this", "it", "with", "from", "build", "create", "make",
    "i", "want", "need", "would", "like", "please",
  ]);

  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => !stopWords.has(w) && w.length > 1)
    .slice(0, 4)
    .join("-") || "unnamed-skill";
}

function deriveScopeDescription(category: SkillCategory, _text: string): string {
  const scopes: Record<SkillCategory, string> = {
    data: "Read-only data access — no state changes",
    execution: "State-changing operation — requires approval controls",
    monitoring: "Passive observation and alerting — no side effects",
    memory: "Internal data storage and retrieval — workspace-scoped",
    orchestration: "Multi-step coordination — may invoke other agents/skills",
    media: "Content generation and distribution — external-facing",
    monetization: "Payment-gated endpoint — x402 integration required",
  };
  return scopes[category];
}

function buildRationale(
  category: SkillCategory,
  risk: RiskLevel,
  scores: Record<string, number>,
): string {
  const topSignals = Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}(${v})`)
    .join(", ");

  return `Classified as ${category} (risk: ${risk}). Signal scores: ${topSignals || "none — defaulted to data"}.`;
}
