// Skill Foundry — Contract Builder
// Takes a classification and builds a formal skill contract

import type {
  SkillClassification,
  SkillContract,
  SkillParam,
  FailureMode,
  SkillCategory,
} from "./types";

/** Default failure modes by category */
const CATEGORY_FAILURES: Record<SkillCategory, FailureMode[]> = {
  data: [
    { condition: "API endpoint unreachable", behavior: "Return cached data or error message", severity: "warn" },
    { condition: "Malformed response", behavior: "Log raw response, return structured error", severity: "error" },
    { condition: "Rate limit exceeded", behavior: "Back off and retry with exponential delay", severity: "warn" },
  ],
  execution: [
    { condition: "Transaction rejected", behavior: "Log rejection reason, notify operator", severity: "error" },
    { condition: "Insufficient funds", behavior: "Abort with clear balance error", severity: "fatal" },
    { condition: "Timeout", behavior: "Mark as pending, schedule retry check", severity: "error" },
  ],
  monitoring: [
    { condition: "Target service unreachable", behavior: "Record downtime event, send alert", severity: "warn" },
    { condition: "Alert delivery failure", behavior: "Queue alert for retry, log failure", severity: "error" },
  ],
  memory: [
    { condition: "Storage write failure", behavior: "Retry once, then log and continue", severity: "error" },
    { condition: "Data not found", behavior: "Return empty result with 404 status", severity: "info" },
  ],
  orchestration: [
    { condition: "Sub-step failure", behavior: "Halt pipeline, report partial progress", severity: "error" },
    { condition: "Deadlock or circular dependency", behavior: "Timeout and abort with diagnostic", severity: "fatal" },
  ],
  media: [
    { condition: "Publishing platform unreachable", behavior: "Queue content for retry", severity: "warn" },
    { condition: "Content too long", behavior: "Truncate with notice, log full content", severity: "info" },
  ],
  monetization: [
    { condition: "Payment verification failure", behavior: "Reject request, return 402", severity: "error" },
    { condition: "Price feed unavailable", behavior: "Use last known price with staleness warning", severity: "warn" },
  ],
};

/**
 * Build a formal skill contract from a classification.
 */
export function buildContract(
  classification: SkillClassification,
  description: string,
): SkillContract {
  const { name, category, risk } = classification;

  return {
    name,
    description,
    category,
    risk,
    inputs: inferInputs(category, description),
    outputs: inferOutputs(category),
    dependencies: inferDependencies(category),
    failureModes: CATEGORY_FAILURES[category] || [],
  };
}

/** Infer likely inputs based on category and description */
function inferInputs(category: SkillCategory, description: string): SkillParam[] {
  const base: SkillParam[] = [];
  const text = description.toLowerCase();

  // Common patterns
  if (text.includes("address") || text.includes("wallet")) {
    base.push({ name: "address", type: "string", required: true, description: "Ethereum address (0x...)" });
  }
  if (text.includes("token") || text.includes("symbol")) {
    base.push({ name: "token", type: "string", required: true, description: "Token symbol (e.g. USDC, ETH)" });
  }
  if (text.includes("url") || text.includes("endpoint")) {
    base.push({ name: "url", type: "string", required: true, description: "Target URL or endpoint" });
  }
  if (text.includes("message") || text.includes("content") || text.includes("text")) {
    base.push({ name: "content", type: "string", required: true, description: "Content/message body" });
  }
  if (text.includes("channel") || text.includes("slack") || text.includes("discord")) {
    base.push({ name: "channel", type: "string", required: true, description: "Target channel ID" });
  }

  // Category-specific defaults
  switch (category) {
    case "data":
      if (base.length === 0) {
        base.push({ name: "query", type: "string", required: true, description: "Query or search term" });
      }
      break;
    case "monitoring":
      if (!base.some((p) => p.name === "url")) {
        base.push({ name: "target", type: "string", required: true, description: "Service or endpoint to monitor" });
      }
      base.push({ name: "interval", type: "number", required: false, description: "Check interval in seconds (default: 60)" });
      break;
    case "memory":
      base.push({ name: "key", type: "string", required: true, description: "Memory key / identifier" });
      base.push({ name: "value", type: "string", required: false, description: "Value to store (for write operations)" });
      break;
    default:
      if (base.length === 0) {
        base.push({ name: "input", type: "string", required: true, description: "Primary input for this skill" });
      }
  }

  return base;
}

/** Infer outputs based on category */
function inferOutputs(category: SkillCategory): SkillParam[] {
  switch (category) {
    case "data":
      return [
        { name: "data", type: "object", required: true, description: "Fetched/processed data" },
        { name: "source", type: "string", required: true, description: "Data source identifier" },
        { name: "timestamp", type: "string", required: true, description: "ISO 8601 fetch timestamp" },
      ];
    case "execution":
      return [
        { name: "txHash", type: "string", required: false, description: "Transaction hash (if applicable)" },
        { name: "status", type: "string", required: true, description: "Execution result status" },
        { name: "details", type: "object", required: false, description: "Execution details" },
      ];
    case "monitoring":
      return [
        { name: "status", type: "string", required: true, description: "Current status (up/down/degraded)" },
        { name: "latency", type: "number", required: false, description: "Response time in ms" },
        { name: "lastChecked", type: "string", required: true, description: "ISO 8601 check timestamp" },
      ];
    case "memory":
      return [
        { name: "stored", type: "boolean", required: true, description: "Whether the operation succeeded" },
        { name: "key", type: "string", required: true, description: "Memory key" },
      ];
    case "orchestration":
      return [
        { name: "steps", type: "object[]", required: true, description: "Completed pipeline steps" },
        { name: "status", type: "string", required: true, description: "Overall pipeline status" },
      ];
    case "media":
      return [
        { name: "published", type: "boolean", required: true, description: "Whether content was published" },
        { name: "url", type: "string", required: false, description: "Published content URL" },
      ];
    case "monetization":
      return [
        { name: "paymentVerified", type: "boolean", required: true, description: "Whether payment was verified" },
        { name: "data", type: "object", required: true, description: "Response data" },
      ];
  }
}

/** Infer dependencies based on category */
function inferDependencies(category: SkillCategory): string[] {
  const deps: string[] = [];

  switch (category) {
    case "data":
      deps.push("External API endpoint or data source");
      break;
    case "execution":
      deps.push("Wallet / signing capability", "Network RPC endpoint");
      break;
    case "monitoring":
      deps.push("Alerting channel (Slack, webhook, etc.)");
      break;
    case "memory":
      deps.push("Storage backend (Supabase, filesystem)");
      break;
    case "orchestration":
      deps.push("OpenClaw agent framework", "Sub-skills referenced in pipeline");
      break;
    case "media":
      deps.push("Publishing platform API credentials");
      break;
    case "monetization":
      deps.push("x402 payment verification", "awal CLI");
      break;
  }

  return deps;
}
