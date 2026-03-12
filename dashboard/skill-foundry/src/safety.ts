// Skill Foundry — Safety Assessor
// Produces safety notes and guardrails for a skill contract

import type { SkillContract, SafetyNotes, RiskLevel } from "./types";

/** Rate limit recommendations by risk */
const RATE_LIMITS: Record<RiskLevel, string> = {
  low: "100 req/min — standard throttle",
  medium: "20 req/min — moderate throttle with burst allowance",
  high: "5 req/min — strict throttle, require approval for burst",
};

/**
 * Generate safety notes for a skill contract.
 */
export function assessSafety(contract: SkillContract): SafetyNotes {
  const notes: string[] = [];
  const allowlist: string[] = [];
  let approvalGate = false;
  let sensitiveData = false;

  // Risk-based defaults
  if (contract.risk === "high") {
    approvalGate = true;
    notes.push("HIGH RISK: Requires human approval before execution.");
    notes.push("Consider a dry-run mode that previews the action without executing.");
    notes.push("Log all inputs and outputs for audit trail.");
  }

  if (contract.risk === "medium") {
    notes.push("MEDIUM RISK: Log all operations. Consider approval gate for production.");
  }

  // Category-specific safety
  switch (contract.category) {
    case "execution":
      notes.push("Never execute wallet operations without explicit user confirmation.");
      notes.push("Validate all addresses against a known-format check (0x + 40 hex chars).");
      notes.push("Set transaction value caps — reject amounts above threshold.");
      allowlist.push("Approved contract addresses only");
      sensitiveData = true;
      approvalGate = true;
      break;

    case "data":
      notes.push("Validate API responses before passing to downstream consumers.");
      notes.push("Never expose raw API keys in skill output.");
      if (contract.dependencies.some((d) => d.toLowerCase().includes("api"))) {
        notes.push("Store API credentials in environment variables, never in skill code.");
        sensitiveData = true;
      }
      break;

    case "monitoring":
      notes.push("Avoid alert fatigue — deduplicate repeated alerts within a window.");
      notes.push("Include cooldown period between identical alerts.");
      break;

    case "memory":
      notes.push("Scope all storage keys to the agent/skill namespace to prevent collisions.");
      notes.push("Never store secrets, passwords, or private keys in memory.");
      sensitiveData = true;
      break;

    case "orchestration":
      notes.push("Limit pipeline depth to prevent runaway recursion.");
      notes.push("Set overall timeout for the full pipeline, not just individual steps.");
      notes.push("Ensure no circular dependencies between sub-skills.");
      break;

    case "media":
      notes.push("Rate-limit publishing to prevent spam.");
      notes.push("Validate content length and format before publishing.");
      break;

    case "monetization":
      notes.push("Validate x402 payment before serving response.");
      notes.push("Log all payment verifications for audit.");
      notes.push("Set price in USDC atomic units (1000000 = $1.00).");
      sensitiveData = true;
      break;
  }

  // Input validation notes
  for (const input of contract.inputs) {
    if (input.type === "string" && input.required) {
      notes.push(`Validate '${input.name}' — reject empty or excessively long values.`);
    }
  }

  return {
    rateLimit: RATE_LIMITS[contract.risk],
    allowlist,
    approvalGate,
    sensitiveData,
    notes,
  };
}
