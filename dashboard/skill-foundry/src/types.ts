// Skill Foundry — Type Definitions
// Core types for the skill generation pipeline

/** Skill category classification */
export type SkillCategory =
  | "data"
  | "execution"
  | "monitoring"
  | "memory"
  | "orchestration"
  | "media"
  | "monetization";

/** Risk level assessment */
export type RiskLevel = "low" | "medium" | "high";

/** Monetization recommendation */
export type MonetizationPath =
  | "internal-only"
  | "x402"
  | "premium-x402"
  | "not-suitable";

/** Incoming capability request from the user or agent */
export interface SkillRequest {
  /** Free-form description of the desired capability */
  description: string;
  /** Optional hints about the category */
  categoryHint?: SkillCategory;
  /** Optional constraints or requirements */
  constraints?: string[];
}

/** Classification result from the classifier stage */
export interface SkillClassification {
  name: string;
  category: SkillCategory;
  risk: RiskLevel;
  scope: string;
  rationale: string;
}

/** Skill contract — the formal specification */
export interface SkillContract {
  name: string;
  description: string;
  category: SkillCategory;
  risk: RiskLevel;
  inputs: SkillParam[];
  outputs: SkillParam[];
  dependencies: string[];
  failureModes: FailureMode[];
}

export interface SkillParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface FailureMode {
  condition: string;
  behavior: string;
  severity: "info" | "warn" | "error" | "fatal";
}

/** Implementation scaffold output */
export interface SkillImplementation {
  /** YAML frontmatter for the SKILL.md */
  frontmatter: SkillFrontmatter;
  /** Markdown body of the SKILL.md */
  body: string;
  /** Handler code (TypeScript/bash) */
  handler: string;
  /** Validation logic */
  validation: string;
  /** Config/env requirements */
  config: string[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  "user-invocable": boolean;
  "disable-model-invocation": boolean;
  "allowed-tools": string[];
}

/** Safety layer assessment */
export interface SafetyNotes {
  rateLimit: string;
  allowlist: string[];
  approvalGate: boolean;
  sensitiveData: boolean;
  notes: string[];
}

/** Test scaffold */
export interface TestScaffold {
  happyPath: TestCase[];
  invalidInput: TestCase[];
  providerFailure: TestCase[];
  timeout: TestCase[];
}

export interface TestCase {
  name: string;
  input: string;
  expectedBehavior: string;
}

/** Documentation scaffold */
export interface DocScaffold {
  purpose: string;
  usage: string;
  wiring: string;
  devNotes: string[];
}

/** Monetization assessment */
export interface MonetizationAssessment {
  path: MonetizationPath;
  rationale: string;
  suggestedPrice?: string;
  marketNotes?: string;
}

/** Complete pipeline output — the full skill package */
export interface SkillPackage {
  classification: SkillClassification;
  contract: SkillContract;
  implementation: SkillImplementation;
  safety: SafetyNotes;
  tests: TestScaffold;
  docs: DocScaffold;
  monetization: MonetizationAssessment;
  generatedAt: string;
  version: string;
}
