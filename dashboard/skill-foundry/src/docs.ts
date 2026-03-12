// Skill Foundry — Documentation Generator
// Produces documentation scaffolds for skills

import type { SkillContract, SafetyNotes, DocScaffold, MonetizationAssessment } from "./types";

/**
 * Generate a documentation scaffold for a skill.
 */
export function generateDocs(
  contract: SkillContract,
  safety: SafetyNotes,
  monetization: MonetizationAssessment,
): DocScaffold {
  return {
    purpose: buildPurpose(contract),
    usage: buildUsage(contract),
    wiring: buildWiring(contract, monetization),
    devNotes: buildDevNotes(contract, safety),
  };
}

function buildPurpose(contract: SkillContract): string {
  return [
    `# ${contract.name}`,
    "",
    `**Category:** ${contract.category}  `,
    `**Risk:** ${contract.risk}  `,
    "",
    contract.description,
    "",
    "## Inputs",
    "",
    ...contract.inputs.map(
      (p) => `- \`${p.name}\` (${p.type}${p.required ? ", required" : ""}) — ${p.description}`,
    ),
    "",
    "## Outputs",
    "",
    ...contract.outputs.map(
      (p) => `- \`${p.name}\` (${p.type}${p.required ? ", required" : ""}) — ${p.description}`,
    ),
  ].join("\n");
}

function buildUsage(contract: SkillContract): string {
  const inputExample = contract.inputs
    .map((p) => `  "${p.name}": "<${p.type}>"`)
    .join(",\n");

  return [
    "## Usage",
    "",
    "### As OpenClaw Skill",
    "",
    `Invoke via agent with the \`${contract.name}\` skill:`,
    "",
    "```",
    `openclaw agent --skill ${contract.name} --input '{`,
    inputExample,
    "}'",
    "```",
    "",
    "### Programmatic",
    "",
    "```typescript",
    `import { handle } from "./${contract.name}/handler";`,
    "",
    "const result = await handle({",
    ...contract.inputs.map((p) => `  ${p.name}: /* ${p.type} */,`),
    "});",
    "```",
  ].join("\n");
}

function buildWiring(contract: SkillContract, monetization: MonetizationAssessment): string {
  const sections = [
    "## Wiring & Integration",
    "",
    "### Dependencies",
    "",
    ...contract.dependencies.map((d) => `- ${d}`),
    "",
    "### OpenClaw Registration",
    "",
    "Add to agent skills array in `~/.openclaw/openclaw.json`:",
    "",
    "```json",
    `"skills": ["${contract.name}"]`,
    "```",
    "",
    `Place skill file at: \`~/.openclaw/skills/${contract.name}/SKILL.md\``,
  ];

  if (monetization.path !== "internal-only" && monetization.path !== "not-suitable") {
    sections.push(
      "",
      "### x402 Monetization",
      "",
      `Path: ${monetization.path}`,
      monetization.suggestedPrice ? `Suggested price: ${monetization.suggestedPrice}` : "",
      monetization.rationale,
    );
  }

  return sections.filter(Boolean).join("\n");
}

function buildDevNotes(contract: SkillContract, safety: SafetyNotes): string[] {
  const notes: string[] = [];

  notes.push(`Risk level: ${contract.risk} — ${safety.rateLimit}`);

  if (safety.approvalGate) {
    notes.push("Requires human approval gate before production deployment.");
  }

  if (safety.sensitiveData) {
    notes.push("Handles sensitive data — ensure credentials are in env vars, not code.");
  }

  for (const fm of contract.failureModes) {
    if (fm.severity === "fatal" || fm.severity === "error") {
      notes.push(`Critical failure mode: ${fm.condition} → ${fm.behavior}`);
    }
  }

  notes.push(
    "TODO: Implement handler logic",
    "TODO: Add integration tests with real/mock providers",
    "TODO: Wire into OpenClaw agent config",
  );

  return notes;
}
