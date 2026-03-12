// Skill Foundry — Monetization Assessor
// Evaluates x402 monetization potential for a skill

import type { SkillContract, MonetizationPath, MonetizationAssessment } from "./types";

/**
 * Assess monetization potential and recommend a path.
 */
export function assessMonetization(contract: SkillContract): MonetizationAssessment {
  const path = recommendPath(contract);
  return {
    path,
    rationale: buildRationale(contract, path),
    suggestedPrice: suggestPrice(contract, path),
    marketNotes: buildMarketNotes(contract, path),
  };
}

function recommendPath(contract: SkillContract): MonetizationPath {
  // High risk skills should not be monetized directly
  if (contract.risk === "high") {
    return "not-suitable";
  }

  // Internal-only categories
  if (contract.category === "memory") {
    return "internal-only";
  }

  // Orchestration is complex — internal unless explicitly designed for external use
  if (contract.category === "orchestration") {
    return "internal-only";
  }

  // Data and monitoring are prime x402 candidates
  if (contract.category === "data" || contract.category === "monitoring") {
    return "x402";
  }

  // Monetization skills are by definition x402
  if (contract.category === "monetization") {
    return "premium-x402";
  }

  // Media skills can be monetized if they produce unique content
  if (contract.category === "media") {
    return "x402";
  }

  // Execution skills — case by case, default to not-suitable
  if (contract.category === "execution") {
    return "not-suitable";
  }

  return "internal-only";
}

function suggestPrice(contract: SkillContract, path: MonetizationPath): string | undefined {
  if (path === "internal-only" || path === "not-suitable") {
    return undefined;
  }

  // Base prices in USDC atomic units (1000000 = $1.00)
  switch (contract.category) {
    case "data":
      return "$0.001 per request (1000 atomic units)";
    case "monitoring":
      return "$0.01 per health check (10000 atomic units)";
    case "media":
      return "$0.01–$0.10 per generation (10000–100000 atomic units)";
    case "monetization":
      return "$0.05–$0.50 per request (50000–500000 atomic units) — premium tier";
    default:
      return "$0.001 per request (1000 atomic units)";
  }
}

function buildRationale(contract: SkillContract, path: MonetizationPath): string {
  switch (path) {
    case "x402":
      return `${contract.name} is a good x402 candidate — ${contract.category} skills provide clear per-request value to external consumers.`;
    case "premium-x402":
      return `${contract.name} qualifies for premium x402 pricing — unique or high-value output justifies higher per-request cost.`;
    case "internal-only":
      return `${contract.name} is best kept internal — ${contract.category} skills typically serve the agent ecosystem directly and don't map well to per-request pricing.`;
    case "not-suitable":
      return `${contract.name} is not suitable for monetization — ${contract.risk} risk level or ${contract.category} category makes external exposure inadvisable.`;
  }
}

function buildMarketNotes(contract: SkillContract, path: MonetizationPath): string | undefined {
  if (path === "internal-only" || path === "not-suitable") {
    return undefined;
  }

  const notes: string[] = [];

  if (contract.category === "data") {
    notes.push("Data skills are the most common x402 services on the bazaar.");
    notes.push("Differentiate by data quality, freshness, and unique sources.");
  }

  if (contract.category === "monitoring") {
    notes.push("Monitoring-as-a-service is growing — consider bundled health check packages.");
  }

  if (contract.category === "media") {
    notes.push("Content generation skills benefit from model quality — higher quality = higher price justified.");
  }

  notes.push("List on the x402 bazaar for discovery by other agents.");
  notes.push("Track usage metrics to optimize pricing.");

  return notes.join(" ");
}
