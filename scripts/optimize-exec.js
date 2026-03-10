#!/usr/bin/env node
// Optimize OpenClaw exec tool configuration per https://docs.openclaw.ai/tools/exec
// Run: node scripts/optimize-exec.js

const fs = require("fs");
const os = require("os");
const path = require("path");

const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

// ── 1. Agent-level exec defaults ─────────────────────────────────────────────
// pathPrepend replaces the manual PATH construction in bridge/lib/openclaw.ts
// safeBins: stdin-only stream filters that can run without allowlist entries
// safeBinTrustedDirs: directories trusted for safeBin resolution
cfg.agents.defaults.tools = cfg.agents.defaults.tools || {};
cfg.agents.defaults.tools.exec = {
  pathPrepend: ["/opt/homebrew/bin", "/usr/local/bin"],
  timeout: 300,
  notifyOnExit: true,
  safeBins: [
    "cat", "head", "tail", "grep", "awk", "sed", "sort", "uniq", "wc",
    "tr", "cut", "tee", "diff", "jq", "less", "find", "ls", "file",
    "date", "echo", "printf", "test", "true", "false", "mktemp"
  ],
  safeBinTrustedDirs: ["/bin", "/usr/bin", "/opt/homebrew/bin"]
};

// ── 2. Per-agent exec config ─────────────────────────────────────────────────
for (const agent of cfg.agents.list) {
  const id = agent.id;
  const profile = agent.tools?.profile;

  if (profile === "coding") {
    if (id === "scholar" || id === "vox") {
      // Research/content agents: sandbox isolation + allowlist
      agent.tools.exec = {
        host: "sandbox",
        security: "allowlist",
        ask: "on-miss",
        timeout: 600
      };
    } else if (id === "sentinel") {
      // Monitoring agent: short timeout, allowlist
      agent.tools.exec = {
        host: "gateway",
        security: "allowlist",
        ask: "on-miss",
        timeout: 120
      };
    } else if (id === "briefing") {
      // Research agent: longer timeout for deep research
      agent.tools.exec = {
        host: "gateway",
        security: "allowlist",
        ask: "on-miss",
        timeout: 600
      };
    } else {
      // All other coding agents: gateway + allowlist (was: security=full)
      agent.tools.exec = {
        host: "gateway",
        security: "allowlist",
        ask: "on-miss",
        timeout: 300
      };
    }
  } else if (profile === "full") {
    // Full-profile agents (main, *_web): keep elevated, add timeout
    agent.tools.exec = agent.tools.exec || {};
    agent.tools.exec.host = "gateway";
    agent.tools.exec.security = "full";
    agent.tools.exec.timeout = 300;
  }
}

fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");

console.log("✅ OpenClaw exec config optimized");
console.log("");
console.log("Changes applied:");
console.log("  • pathPrepend: [/opt/homebrew/bin, /usr/local/bin] (all agents)");
console.log("  • safeBins: 24 stdin-only filters whitelisted (all agents)");
console.log("  • safeBinTrustedDirs: /bin, /usr/bin, /opt/homebrew/bin");
console.log("  • notifyOnExit: true (background job completion events)");
console.log("");
console.log("Per-agent exec settings:");
for (const agent of cfg.agents.list) {
  const e = agent.tools?.exec || {};
  console.log(`  ${agent.id.padEnd(18)} host=${(e.host || "default").padEnd(8)} security=${(e.security || "default").padEnd(10)} timeout=${e.timeout || "default"}s`);
}
