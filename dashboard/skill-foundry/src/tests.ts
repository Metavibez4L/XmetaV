// Skill Foundry — Test Scaffold Generator
// Produces test case outlines for a skill contract

import type { SkillContract, TestScaffold, TestCase } from "./types";

/**
 * Generate test scaffolds for a skill contract.
 */
export function generateTests(contract: SkillContract): TestScaffold {
  return {
    happyPath: generateHappyPath(contract),
    invalidInput: generateInvalidInput(contract),
    providerFailure: generateProviderFailure(contract),
    timeout: generateTimeout(contract),
  };
}

function generateHappyPath(contract: SkillContract): TestCase[] {
  const cases: TestCase[] = [
    {
      name: `${contract.name} — basic success`,
      input: buildSampleInput(contract, "valid"),
      expectedBehavior: `Returns successful result with all required output fields: ${contract.outputs.filter((o) => o.required).map((o) => o.name).join(", ")}`,
    },
  ];

  // Add category-specific happy path
  switch (contract.category) {
    case "data":
      cases.push({
        name: `${contract.name} — returns fresh data`,
        input: buildSampleInput(contract, "valid"),
        expectedBehavior: "Response includes timestamp within last 60 seconds",
      });
      break;
    case "monitoring":
      cases.push({
        name: `${contract.name} — healthy target`,
        input: buildSampleInput(contract, "valid"),
        expectedBehavior: "Returns status: 'up' with latency measurement",
      });
      break;
    case "memory":
      cases.push({
        name: `${contract.name} — store and retrieve`,
        input: buildSampleInput(contract, "valid"),
        expectedBehavior: "Stored value can be retrieved with same key",
      });
      break;
  }

  return cases;
}

function generateInvalidInput(contract: SkillContract): TestCase[] {
  const cases: TestCase[] = [];

  for (const input of contract.inputs) {
    if (input.required) {
      cases.push({
        name: `${contract.name} — missing ${input.name}`,
        input: `Omit '${input.name}' from input`,
        expectedBehavior: `Returns validation error: '${input.name}' is required`,
      });
    }

    if (input.type === "string") {
      cases.push({
        name: `${contract.name} — empty ${input.name}`,
        input: `Pass empty string for '${input.name}'`,
        expectedBehavior: "Returns validation error or handles gracefully",
      });
    }

    if (input.name === "address") {
      cases.push({
        name: `${contract.name} — malformed address`,
        input: `Pass "not-an-address" for '${input.name}'`,
        expectedBehavior: "Returns validation error: invalid Ethereum address format",
      });
    }
  }

  return cases;
}

function generateProviderFailure(contract: SkillContract): TestCase[] {
  const cases: TestCase[] = [];

  for (const dep of contract.dependencies) {
    cases.push({
      name: `${contract.name} — ${dep} unavailable`,
      input: buildSampleInput(contract, "valid"),
      expectedBehavior: `Handles gracefully when ${dep} is unreachable — returns error or fallback`,
    });
  }

  if (cases.length === 0) {
    cases.push({
      name: `${contract.name} — external failure`,
      input: buildSampleInput(contract, "valid"),
      expectedBehavior: "Returns structured error when external dependency fails",
    });
  }

  return cases;
}

function generateTimeout(contract: SkillContract): TestCase[] {
  return [
    {
      name: `${contract.name} — response timeout`,
      input: buildSampleInput(contract, "valid"),
      expectedBehavior: "Aborts after configured timeout (default: 30s), returns timeout error",
    },
    {
      name: `${contract.name} — slow response`,
      input: buildSampleInput(contract, "valid"),
      expectedBehavior: "Completes successfully if response arrives before timeout",
    },
  ];
}

function buildSampleInput(contract: SkillContract, variant: "valid" | "edge"): string {
  const parts: string[] = [];
  for (const input of contract.inputs) {
    if (variant === "valid") {
      parts.push(`${input.name}: <valid ${input.type} value>`);
    } else {
      parts.push(`${input.name}: <edge-case ${input.type} value>`);
    }
  }
  return `{ ${parts.join(", ")} }`;
}
