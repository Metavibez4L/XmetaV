// Skill Foundry — Output Formatter
// Assembles all pipeline stages into a final SkillPackage and renders it

import type { SkillPackage, SkillImplementation } from "./types";

/**
 * Render a complete SkillPackage to a human-readable markdown report.
 */
export function renderPackage(pkg: SkillPackage): string {
  const sections: string[] = [];

  // Header
  sections.push("# Skill Foundry Output");
  sections.push("");
  sections.push(`**Generated:** ${pkg.generatedAt}  `);
  sections.push(`**Version:** ${pkg.version}`);
  sections.push("");
  sections.push("---");
  sections.push("");

  // 1. Classification
  sections.push("## 1. Classification");
  sections.push("");
  sections.push(`- **Name:** ${pkg.classification.name}`);
  sections.push(`- **Category:** ${pkg.classification.category}`);
  sections.push(`- **Risk:** ${pkg.classification.risk}`);
  sections.push(`- **Scope:** ${pkg.classification.scope}`);
  sections.push(`- **Rationale:** ${pkg.classification.rationale}`);
  sections.push("");

  // 2. Contract
  sections.push("## 2. Contract");
  sections.push("");
  sections.push(`**${pkg.contract.name}** — ${pkg.contract.description}`);
  sections.push("");
  sections.push("### Inputs");
  sections.push("");
  for (const p of pkg.contract.inputs) {
    sections.push(`- \`${p.name}\` (${p.type}${p.required ? ", required" : ""}) — ${p.description}`);
  }
  sections.push("");
  sections.push("### Outputs");
  sections.push("");
  for (const p of pkg.contract.outputs) {
    sections.push(`- \`${p.name}\` (${p.type}${p.required ? ", required" : ""}) — ${p.description}`);
  }
  sections.push("");
  sections.push("### Dependencies");
  sections.push("");
  for (const dep of pkg.contract.dependencies) {
    sections.push(`- ${dep}`);
  }
  sections.push("");
  sections.push("### Failure Modes");
  sections.push("");
  for (const fm of pkg.contract.failureModes) {
    sections.push(`- **${fm.condition}** [${fm.severity}]: ${fm.behavior}`);
  }
  sections.push("");

  // 3. Implementation (SKILL.md)
  sections.push("## 3. Implementation — SKILL.md");
  sections.push("");
  sections.push(renderSkillMd(pkg.implementation));
  sections.push("");

  // 4. Handler
  sections.push("## 4. Handler Stub");
  sections.push("");
  sections.push("```typescript");
  sections.push(pkg.implementation.handler);
  sections.push("```");
  sections.push("");

  // 5. Validation
  sections.push("## 5. Validation");
  sections.push("");
  sections.push("```typescript");
  sections.push(pkg.implementation.validation);
  sections.push("```");
  sections.push("");

  // 6. Safety Notes
  sections.push("## 6. Safety Notes");
  sections.push("");
  sections.push(`- **Rate limit:** ${pkg.safety.rateLimit}`);
  sections.push(`- **Approval gate:** ${pkg.safety.approvalGate ? "YES" : "no"}`);
  sections.push(`- **Sensitive data:** ${pkg.safety.sensitiveData ? "YES" : "no"}`);
  if (pkg.safety.allowlist.length > 0) {
    sections.push(`- **Allowlist:** ${pkg.safety.allowlist.join(", ")}`);
  }
  sections.push("");
  for (const note of pkg.safety.notes) {
    sections.push(`- ${note}`);
  }
  sections.push("");

  // 7. Tests
  sections.push("## 7. Test Scaffold");
  sections.push("");
  for (const [group, cases] of Object.entries(pkg.tests)) {
    sections.push(`### ${formatGroupName(group)}`);
    sections.push("");
    for (const tc of cases as Array<{ name: string; input: string; expectedBehavior: string }>) {
      sections.push(`- **${tc.name}**`);
      sections.push(`  - Input: \`${tc.input}\``);
      sections.push(`  - Expected: ${tc.expectedBehavior}`);
    }
    sections.push("");
  }

  // 8. Documentation
  sections.push("## 8. Documentation");
  sections.push("");
  sections.push(pkg.docs.purpose);
  sections.push("");
  sections.push(pkg.docs.usage);
  sections.push("");
  sections.push(pkg.docs.wiring);
  sections.push("");
  if (pkg.docs.devNotes.length > 0) {
    sections.push("### Dev Notes");
    sections.push("");
    for (const note of pkg.docs.devNotes) {
      sections.push(`- ${note}`);
    }
    sections.push("");
  }

  // 9. Monetization
  sections.push("## 9. Monetization");
  sections.push("");
  sections.push(`- **Path:** ${pkg.monetization.path}`);
  sections.push(`- **Rationale:** ${pkg.monetization.rationale}`);
  if (pkg.monetization.suggestedPrice) {
    sections.push(`- **Suggested price:** ${pkg.monetization.suggestedPrice}`);
  }
  if (pkg.monetization.marketNotes) {
    sections.push(`- **Market notes:** ${pkg.monetization.marketNotes}`);
  }
  sections.push("");

  // Config
  if (pkg.implementation.config.length > 0) {
    sections.push("## Environment Config");
    sections.push("");
    sections.push("```env");
    sections.push(pkg.implementation.config.join("\n"));
    sections.push("```");
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Render just the SKILL.md file content (YAML frontmatter + markdown body).
 */
export function renderSkillMd(impl: SkillImplementation): string {
  const fm = impl.frontmatter;
  const yaml = [
    "```yaml",
    "---",
    `name: ${fm.name}`,
    `description: ${fm.description}`,
    `user-invocable: ${fm["user-invocable"]}`,
    `disable-model-invocation: ${fm["disable-model-invocation"]}`,
    `allowed-tools: ${JSON.stringify(fm["allowed-tools"])}`,
    "---",
    "```",
  ].join("\n");

  return `${yaml}\n\n${impl.body}`;
}

function formatGroupName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
