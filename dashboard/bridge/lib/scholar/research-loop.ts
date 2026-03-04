/**
 * Scholar Research Engine — Research Loop
 *
 * The continuous research daemon that:
 *   1. Picks the next research domain based on schedule
 *   2. Dispatches a research task to the scholar agent via OpenClaw
 *   3. Scores the findings for relevance
 *   4. Stores to memory (private + shared if high-value)
 *   5. Anchors on-chain if score ≥ 0.7
 *   6. Builds associations via Soul
 *
 * Runs in a non-blocking loop inside the bridge daemon.
 */

import { supabase } from "../supabase.js";
import { writeMemory, writeSharedMemory } from "../agent-memory.js";
import { anchorMemory, isAnchoringEnabled } from "../memory-anchor.js";
import { MemoryCategory } from "../memory-anchor.js";
import { processNewMemory } from "../soul/index.js";
import { scoreRelevance, isDuplicate } from "./scorer.js";
import {
  RESEARCH_DOMAINS,
  DEFAULT_SCHOLAR_CONFIG,
  type DomainConfig,
  type ResearchFinding,
  type ScholarConfig,
} from "./types.js";

const config: ScholarConfig = DEFAULT_SCHOLAR_CONFIG;

/** Track last research time per domain */
const lastResearchTime = new Map<string, number>();

/** Track total findings for stats */
let totalFindings = 0;
let totalAnchored = 0;
let totalShared = 0;
let cycleCount = 0;

/** Whether the research loop is running */
let isRunning = false;
let loopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Pick the next domain to research based on:
 *   - Time since last research (must exceed domain interval)
 *   - Round-robin through eligible domains
 */
function pickNextDomain(): DomainConfig | null {
  const now = Date.now();

  for (const domain of RESEARCH_DOMAINS) {
    const lastTime = lastResearchTime.get(domain.id) || 0;
    const elapsedMs = now - lastTime;
    const intervalMs = domain.intervalMinutes * 60 * 1000;

    if (elapsedMs >= intervalMs) {
      return domain;
    }
  }

  return null; // All domains recently researched, wait
}

/**
 * Generate the research prompt for a given domain.
 * Each cycle gets a unique angle to avoid repetitive queries.
 */
function buildResearchPrompt(domain: DomainConfig): string {
  const angles: Record<string, string[]> = {
    erc8004: [
      "Find the latest ERC-8004 agent registrations on Base. What new agents have been registered? What metadata patterns are emerging? Report any new standards proposals related to on-chain agent identity.",
      "Analyze the current state of ERC-8004 adoption. How many agents are registered? What are the most common capability types? Are there competing standards?",
      "Research any new developments in on-chain agent identity. Focus on reputation systems, agent wallets, and cross-chain agent portability.",
    ],
    x402: [
      "Research the latest developments in x402/HTTP 402 payment protocols. What new implementations exist? How are APIs using micropayments? Report on USDC-based pay-per-call patterns.",
      "Analyze x402 payment adoption. What industries are using machine-to-machine payments? What pricing models work best? Report on small business integration patterns.",
      "Find new x402 endpoints, SDKs, or frameworks. What tools make it easier to implement HTTP 402 payments? Report on any payment gateway innovations.",
    ],
    layer2: [
      "Report on Base L2 network performance: current TPS, fee levels, and blob costs. Compare with Optimism and Arbitrum. Note any upcoming protocol upgrades.",
      "Research new L2 rollup launches and developments. Focus on OP Stack chains, ZK rollups, and Superchain ecosystem growth.",
      "Analyze L2 fee market dynamics. What's happening with blob fees after EIP-4844? How are sequencer economics evolving? Report on new scaling solutions.",
    ],
    stablecoins: [
      "Report on stablecoin market dynamics. USDC vs USDT market share, new stablecoin launches, and regulatory developments. Focus on Base chain stablecoin flows.",
      "Research stablecoin adoption in DeFi and payments. What new use cases are emerging? How are stablecoins being used for B2B payments?",
      "Analyze the regulatory landscape for stablecoins. New legislation, Circle/Tether developments, and CBDC progress. What does this mean for crypto payments?",
    ],
    "smb-adoption": [
      "Research small business crypto adoption trends. What payment solutions are merchants using? Report on POS integrations, payment processors, and success stories.",
      "Find case studies of small businesses accepting crypto payments. What challenges do they face? What solutions are working? Focus on USDC/stablecoin acceptance.",
      "Analyze the small business crypto payment landscape. What's the adoption rate? What tools make it easiest? Report on any grants or incentive programs.",
    ],
  };

  const domainAngles = angles[domain.id] || angles.erc8004;
  const angleIndex = cycleCount % domainAngles.length;
  const basePrompt = domainAngles[angleIndex];

  return `You are a research specialist. ${basePrompt}\n\nBe specific and factual. Include dates, numbers, and names where possible. Keep the response under 500 words. Focus on NEW information that would be valuable for an AI agent fleet operating on Base Mainnet.`;
}

/**
 * Execute a single research cycle for a domain.
 * Returns findings with relevance scores.
 */
export async function researchDomain(domain: DomainConfig): Promise<ResearchFinding[]> {
  const prompt = buildResearchPrompt(domain);

  console.log(`[scholar] Researching ${domain.label}...`);

  // Mark scholar as busy
  await supabase
    .from("agent_sessions")
    .upsert(
      { agent_id: "scholar", status: "busy", last_heartbeat: new Date().toISOString() },
      { onConflict: "agent_id" }
    );

  let rawOutput = "";

  try {
    // Use the bridge executor pattern to run the scholar agent
    const { spawn } = await import("child_process");
    const child = spawn("openclaw", [
      "agent",
      "--agent", "scholar",
      "--local",
      "--thinking", "off",
      "--session-id", `scholar_research_${Date.now()}`,
      "--message", prompt,
    ], {
      timeout: 120_000,
      env: { ...process.env },
    });

    rawOutput = await new Promise<string>((resolve, reject) => {
      let out = "";
      child.stdout?.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      child.on("close", (code) => {
        if (code === 0 || out.length > 50) resolve(out);
        else reject(new Error(`Scholar process exited with code ${code}`));
      });
      child.on("error", reject);
    });
  } catch (err) {
    console.error(`[scholar] Research failed for ${domain.label}:`, err);
    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id: "scholar", status: "idle", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );
    return [];
  }

  // Clean the output (remove openclaw banners)
  const cleanOutput = rawOutput
    .split("\n")
    .filter((line) => !line.includes("OpenClaw") && !line.includes("[tools]") && line.trim())
    .join("\n")
    .trim();

  if (cleanOutput.length < 50) {
    console.log(`[scholar] No meaningful output for ${domain.label}`);
    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id: "scholar", status: "idle", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );
    return [];
  }

  // Split into findings (paragraphs or numbered items)
  const chunks = splitIntoFindings(cleanOutput, domain);
  const findings: ResearchFinding[] = [];

  for (const chunk of chunks.slice(0, config.maxFindingsPerCycle)) {
    // Dedup check
    if (await isDuplicate(chunk, config.deduplicationWindowHours)) {
      console.log(`[scholar] Skipping duplicate finding in ${domain.label}`);
      continue;
    }

    // Score relevance
    const { score, novelty, impact, actionability, recency, matchedKeywords } =
      await scoreRelevance(chunk, domain.id, domain);

    if (score < config.minMemoryScore) continue; // Too low to store

    const finding: ResearchFinding = {
      domain: domain.id,
      title: chunk.slice(0, 80).replace(/\n/g, " "),
      content: chunk,
      relevanceScore: score,
      scoring: { novelty, impact, actionability, recency },
      matchedKeywords,
      source: `scholar/${domain.id}`,
      anchored: false,
      discoveredAt: new Date().toISOString(),
    };

    // ---- Store in memory ----
    const memoryId = await writeMemory({
      agent_id: "scholar",
      kind: score >= 0.6 ? "fact" : "observation",
      content: `[${domain.label}] (relevance: ${score}) ${chunk}`,
      source: `scholar/${domain.id}`,
      ttl_hours: score >= 0.5 ? null : 168, // High-value = permanent, else 7 days
    });

    // ---- Share with fleet if high-value ----
    if (score >= config.minShareScore) {
      await writeSharedMemory(
        `[scholar/${domain.label}] ${chunk}`,
        "fact",
        `scholar/${domain.id}`
      );
      totalShared++;
    }

    // ---- Build associations via Soul ----
    if (memoryId) {
      processNewMemory(memoryId, "scholar", chunk).catch(() => {});
    }

    // ---- Anchor on-chain if significant ----
    if (score >= config.minAnchorScore && isAnchoringEnabled()) {
      try {
        const agentTokenId = Number(process.env.ERC8004_AGENT_ID || "16905");
        const result = await anchorMemory(agentTokenId, MemoryCategory.MILESTONE, {
          content: `[${domain.id}] (score: ${score.toFixed(2)}) ${chunk}`,
          kind: "milestone",
          source: "scholar",
          task: `scholar/${domain.id}`,
          timestamp: finding.discoveredAt,
        });

        if (result) {
          finding.anchored = true;
          totalAnchored++;
          console.log(`[scholar] ⚓ Anchored finding (score ${score}): ${result.ipfsCid}`);

          // Record the anchor in memory
          await writeMemory({
            agent_id: "scholar",
            kind: "fact",
            content: `Research anchored on-chain: [${domain.label}] score=${score} ipfs://${result.ipfsCid} tx: ${result.txHash}`,
            source: "anchor",
            ttl_hours: null, // permanent
          });
        }
      } catch (err) {
        console.error(`[scholar] Anchor failed (non-fatal):`, err);
      }
    }

    findings.push(finding);
    totalFindings++;
  }

  // Mark scholar as idle
  await supabase
    .from("agent_sessions")
    .upsert(
      { agent_id: "scholar", status: "idle", last_heartbeat: new Date().toISOString() },
      { onConflict: "agent_id" }
    );

  lastResearchTime.set(domain.id, Date.now());

  console.log(
    `[scholar] ${domain.label}: ${findings.length} findings ` +
    `(${findings.filter((f) => f.anchored).length} anchored, ` +
    `${findings.filter((f) => f.relevanceScore >= config.minShareScore).length} shared)`
  );

  return findings;
}

/**
 * Split raw research output into individual findings.
 */
function splitIntoFindings(output: string, domain: DomainConfig): string[] {
  // Try numbered list first (1. xxxx 2. xxxx)
  const numbered = output.split(/\n\d+\.\s+/).filter((s) => s.trim().length > 30);
  if (numbered.length >= 2) return numbered;

  // Try paragraph split
  const paragraphs = output.split(/\n\n+/).filter((s) => s.trim().length > 30);
  if (paragraphs.length >= 2) return paragraphs;

  // Treat entire output as one finding
  return output.length > 30 ? [output] : [];
}

// ---- Main Loop ----

/**
 * Start the scholar research loop.
 * Runs continuously, checking for the next domain to research every 60s.
 */
export function startScholar(): void {
  if (isRunning) return;
  isRunning = true;
  console.log("[scholar] Research daemon starting...");
  scheduleNext();
}

/**
 * Stop the scholar research loop.
 */
export function stopScholar(): void {
  isRunning = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  console.log("[scholar] Research daemon stopped.");
}

/**
 * Schedule the next research cycle.
 */
function scheduleNext(): void {
  if (!isRunning) return;

  loopTimer = setTimeout(async () => {
    try {
      const domain = pickNextDomain();
      if (domain) {
        cycleCount++;
        await researchDomain(domain);
      } else {
        // All domains recently covered, wait
      }
    } catch (err) {
      console.error("[scholar] Research cycle error:", err);
    }

    // Schedule next check in 60 seconds
    scheduleNext();
  }, 60_000);
}

/**
 * Get scholar stats for the API.
 */
export function getScholarStats() {
  return {
    running: isRunning,
    cycleCount,
    totalFindings,
    totalAnchored,
    totalShared,
    lastResearchTimes: Object.fromEntries(lastResearchTime),
    domains: RESEARCH_DOMAINS.map((d) => ({
      id: d.id,
      label: d.label,
      intervalMinutes: d.intervalMinutes,
      lastResearched: lastResearchTime.get(d.id)
        ? new Date(lastResearchTime.get(d.id)!).toISOString()
        : null,
    })),
  };
}
