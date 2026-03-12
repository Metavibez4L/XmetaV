// Skill Foundry — Pipeline Tests
// Validates the full pipeline with sample requests

import { forgeSkill, forgeAndRender } from "./pipeline";
import type { SkillPackage } from "./types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

function test(name: string, fn: () => void): void {
  console.log(`\n▸ ${name}`);
  fn();
}

// ─── Test 1: Bridge status skill (data category) ───
test("Bridge status skill classifies as data/low", () => {
  const pkg = forgeSkill({ description: "Build a bridge status skill that checks if the Base bridge is healthy" });

  assert(pkg.classification.category === "data", "category is data");
  assert(pkg.classification.risk === "low", "risk is low");
  assert(pkg.classification.name.length > 0, "name is generated");
  assert(pkg.contract.inputs.length > 0, "has inputs");
  assert(pkg.contract.outputs.length > 0, "has outputs");
  assert(pkg.contract.failureModes.length > 0, "has failure modes");
  assert(pkg.safety.approvalGate === false, "no approval gate for data");
  assert(pkg.monetization.path === "x402", "x402 monetization");
  assert(pkg.tests.happyPath.length > 0, "has happy path tests");
  assert(pkg.docs.purpose.length > 0, "has documentation");
});

// ─── Test 2: Token transfer skill (execution/high risk) ───
test("Token transfer skill classifies as execution/high", () => {
  const pkg = forgeSkill({ description: "Send USDC tokens to a wallet address" });

  assert(pkg.classification.category === "execution", "category is execution");
  assert(pkg.classification.risk === "high", "risk is high");
  assert(pkg.safety.approvalGate === true, "requires approval gate");
  assert(pkg.monetization.path === "not-suitable", "not suitable for monetization");
  assert(pkg.safety.notes.some((n) => n.includes("wallet")), "has wallet safety note");
});

// ─── Test 3: Health monitor skill (monitoring) ───
test("Health monitor classifies as monitoring/low", () => {
  const pkg = forgeSkill({ description: "Monitor the x402 server uptime and alert on failures" });

  assert(pkg.classification.category === "monitoring", "category is monitoring");
  assert(pkg.classification.risk === "low", "risk is low");
  assert(pkg.monetization.path === "x402", "x402 monetization");
  assert(pkg.contract.inputs.some((i) => i.name === "target" || i.name === "url"), "has target input");
});

// ─── Test 4: Agent memory skill (memory category) ───
test("Agent memory skill classifies as memory/low", () => {
  const pkg = forgeSkill({ description: "Store and retrieve agent context logs" });

  assert(pkg.classification.category === "memory", "category is memory");
  assert(pkg.classification.risk === "low", "risk is low");
  assert(pkg.monetization.path === "internal-only", "internal only monetization");
  assert(pkg.safety.notes.some((n) => n.includes("secrets") || n.includes("namespace")), "has memory safety note");
});

// ─── Test 5: Slack publisher skill (media) ───
test("Slack publisher classifies as media/medium", () => {
  const pkg = forgeSkill({ description: "Post formatted content updates to a Slack channel" });

  assert(pkg.classification.category === "media", "category is media");
  assert(pkg.classification.risk === "medium" || pkg.classification.risk === "low", "risk is low or medium");
  assert(pkg.contract.inputs.some((i) => i.name === "content" || i.name === "channel"), "has content or channel input");
});

// ─── Test 6: Category hint override ───
test("Category hint overrides classification", () => {
  const pkg = forgeSkill({
    description: "Get token prices from an API",
    categoryHint: "monetization",
  });

  assert(pkg.classification.category === "monetization", "hint overrides to monetization");
});

// ─── Test 7: Full render produces markdown ───
test("Full render produces valid markdown", () => {
  const report = forgeAndRender({ description: "Build an ETH gas tracker skill" });

  assert(report.includes("# Skill Foundry Output"), "has header");
  assert(report.includes("## 1. Classification"), "has classification section");
  assert(report.includes("## 2. Contract"), "has contract section");
  assert(report.includes("## 3. Implementation"), "has implementation section");
  assert(report.includes("## 6. Safety Notes"), "has safety section");
  assert(report.includes("## 7. Test Scaffold"), "has test section");
  assert(report.includes("## 9. Monetization"), "has monetization section");
  assert(report.length > 500, `report is substantial (${report.length} chars)`);
});

// ─── Test 8: Skill package structure ───
test("Skill package has all required fields", () => {
  const pkg = forgeSkill({ description: "Fetch current block number from Base" });

  assert(pkg.generatedAt.length > 0, "has generatedAt");
  assert(pkg.version === "0.1.0", "version is 0.1.0");
  assert(pkg.implementation.frontmatter.name.length > 0, "frontmatter has name");
  assert(pkg.implementation.body.length > 0, "body is non-empty");
  assert(pkg.implementation.handler.includes("export async function handle"), "handler has handle()");
  assert(pkg.implementation.validation.includes("validate"), "validation has validate()");
  assert(pkg.implementation.config.length > 0, "has config entries");
});

// ─── Test 9: Unknown input defaults to data ───
test("Vague input defaults to data/low", () => {
  const pkg = forgeSkill({ description: "do something useful" });

  assert(pkg.classification.category === "data", "defaults to data");
  assert(pkg.classification.risk === "low", "defaults to low risk");
});

// ─── Summary ───
console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("═".repeat(40));

if (failed > 0) {
  process.exit(1);
}
