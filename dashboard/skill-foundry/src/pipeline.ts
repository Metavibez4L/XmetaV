// Skill Foundry — Main Pipeline
// 9-stage pipeline: Interpret → Classify → Risk → Contract → Implementation → Safety → Tests → Docs → Monetization
//
// Usage:
//   import { forgeSkill } from "./pipeline";
//   const pkg = forgeSkill({ description: "Build a bridge status skill" });

import type { SkillRequest, SkillPackage } from "./types";
import { classifyRequest } from "./classifier";
import { buildContract } from "./contract";
import { assessSafety } from "./safety";
import { generateScaffold } from "./scaffold";
import { generateTests } from "./tests";
import { generateDocs } from "./docs";
import { assessMonetization } from "./monetization";
import { renderPackage } from "./formatter";

const VERSION = "0.1.0";

/**
 * Run the full Skill Foundry pipeline on a capability request.
 * Returns a complete SkillPackage with all 7 sections.
 */
export function forgeSkill(request: SkillRequest): SkillPackage {
  // Stage 1-3: Interpret + Classify + Risk
  const classification = classifyRequest(request);

  // Stage 4: Contract
  const contract = buildContract(classification, request.description);

  // Stage 5: Implementation scaffold
  const safety = assessSafety(contract);
  const implementation = generateScaffold(contract, safety);

  // Stage 6: Safety (already computed above, reused)

  // Stage 7: Tests
  const tests = generateTests(contract);

  // Stage 8: Monetization
  const monetization = assessMonetization(contract);

  // Stage 9: Documentation
  const docs = generateDocs(contract, safety, monetization);

  return {
    classification,
    contract,
    implementation,
    safety,
    tests,
    docs,
    monetization,
    generatedAt: new Date().toISOString(),
    version: VERSION,
  };
}

/**
 * Forge a skill and render it as a markdown report.
 */
export function forgeAndRender(request: SkillRequest): string {
  const pkg = forgeSkill(request);
  return renderPackage(pkg);
}

// CLI entry point — run directly with: npx tsx src/pipeline.ts "Build a bridge status skill"
if (typeof process !== "undefined" && process.argv[1]?.endsWith("pipeline.ts")) {
  const description = process.argv.slice(2).join(" ");
  if (!description) {
    console.error("Usage: npx tsx src/pipeline.ts <skill description>");
    console.error('Example: npx tsx src/pipeline.ts "Build a bridge status skill"');
    process.exit(1);
  }

  const report = forgeAndRender({ description });
  console.log(report);
}
