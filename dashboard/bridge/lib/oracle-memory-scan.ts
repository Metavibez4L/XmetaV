// ============================================================
// Oracle Memory-Scan — Bridge-Side Command Handler
// Intercepts "scan for memory agents" commands dispatched to oracle
// and calls the dashboard API's scan_memory endpoint.
// ============================================================

const DASHBOARD_BASE =
  process.env.DASHBOARD_URL || "http://localhost:3000";

/** Keywords that indicate a memory-similarity scan command */
const SCAN_TRIGGERS = [
  "scan",
  "scout",
  "find",
  "discover",
  "search",
  "look for",
  "locate",
];

const TOPIC_MARKERS = [
  "memory",
  "consciousness",
  "erc8004",
  "erc-8004",
  "anchor",
  "persistence",
  "metadata",
  "similar",
  "agents",
  "identity",
];

/**
 * Detect whether a command message is asking the oracle to scan
 * for memory-similar ERC-8004 agents.
 */
export function isMemoryScanCommand(message: string): boolean {
  const lower = message.toLowerCase();

  // Needs at least one scan trigger AND at least two topic markers
  const hasTrigger = SCAN_TRIGGERS.some((t) => lower.includes(t));
  const topicHits = TOPIC_MARKERS.filter((m) => lower.includes(m)).length;

  return hasTrigger && topicHits >= 2;
}

/** Options extracted from the natural-language command */
export interface ScanParams {
  fromId?: number;
  toId?: number;
  fromBlock?: number;
  minScore?: number;
  maxAgents?: number;
}

/**
 * Try to extract numeric parameters from the command text.
 * Examples: "scan agents 1-20000", "from block 12000000", "top 50"
 */
export function extractScanParams(message: string): ScanParams {
  const params: ScanParams = {};

  // Agent ID range — e.g. "agents 1-20000" or "range 1 to 20000"
  const rangeMatch = message.match(
    /(?:agents?|range|ids?)\s+(\d+)\s*[-–to]+\s*(\d+)/i
  );
  if (rangeMatch) {
    params.fromId = parseInt(rangeMatch[1], 10);
    params.toId = parseInt(rangeMatch[2], 10);
  }

  // From block — e.g. "from block 12000000" or "since block 12000000"
  const blockMatch = message.match(
    /(?:from|since)\s+block\s+(\d+)/i
  );
  if (blockMatch) {
    params.fromBlock = parseInt(blockMatch[1], 10);
  }

  // Top N — e.g. "top 50" or "max 100"
  const topMatch = message.match(/(?:top|max|limit)\s+(\d+)/i);
  if (topMatch) {
    params.maxAgents = parseInt(topMatch[1], 10);
  }

  // Min score — e.g. "min score 0.1" or "threshold 0.2"
  const scoreMatch = message.match(
    /(?:min(?:imum)?\s+score|threshold)\s+([\d.]+)/i
  );
  if (scoreMatch) {
    params.minScore = parseFloat(scoreMatch[1]);
  }

  return params;
}

/**
 * Execute a memory-similarity scan via the dashboard API.
 * Returns formatted markdown string for streamer output.
 */
export async function executeMemoryScan(
  message: string
): Promise<{
  success: boolean;
  markdown: string;
  matchCount: number;
  totalScanned: number;
}> {
  const params = extractScanParams(message);

  // Default: scan first 500 agents by ID range if no specific range given
  const body: Record<string, unknown> = {
    action: "scan_memory",
    autoTag: true,
  };

  if (params.fromBlock) {
    body.fromBlock = params.fromBlock;
  } else {
    body.fromId = params.fromId ?? 1;
    body.toId = params.toId ?? 500;
  }
  if (params.minScore !== undefined) body.minScore = params.minScore;
  if (params.maxAgents !== undefined) body.maxAgents = params.maxAgents;

  try {
    const res = await fetch(`${DASHBOARD_BASE}/api/oracle/discovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        markdown: `❌ **Memory scan API error** (${res.status})\n\n${text}\n`,
        matchCount: 0,
        totalScanned: 0,
      };
    }

    const data = await res.json();

    // Build markdown report
    const lines: string[] = [];
    lines.push(`# 🧠 Oracle Memory-Similarity Scan Report\n`);
    lines.push(`**Scanned:** ${data.totalScanned} agents`);
    lines.push(`**With metadata:** ${data.totalWithMetadata}`);
    lines.push(`**Matches:** ${data.totalMatched}`);
    lines.push(`**Duration:** ${data.durationMs}ms\n`);

    if (data.idRange) {
      lines.push(
        `**Range:** Agent #${data.idRange.from} – #${data.idRange.to}\n`
      );
    }
    if (data.blockRange) {
      lines.push(
        `**Block range:** ${data.blockRange.from} – ${data.blockRange.to}\n`
      );
    }

    if (data.matches && data.matches.length > 0) {
      lines.push(`\n## Matching Agents\n`);

      for (const m of data.matches) {
        const pct = (m.similarityScore * 100).toFixed(1);
        lines.push(`### ${m.agentName || `Agent #${m.agentId}`} — ${pct}% match`);
        lines.push(`- **ID:** ${m.agentId}`);
        lines.push(`- **Type:** ${m.agentType || "unknown"}`);
        lines.push(`- **Owner:** \`${m.owner}\``);
        if (m.agentWallet) lines.push(`- **Wallet:** \`${m.agentWallet}\``);
        lines.push(`- **Score:** ${m.similarityScore}`);

        // Category breakdown
        const cats = Object.entries(m.breakdown || {})
          .filter(([, v]) => (v as number) > 0)
          .map(([k, v]) => `${k}: ${((v as number) * 100).toFixed(0)}%`)
          .join(", ");
        if (cats) lines.push(`- **Categories:** ${cats}`);

        if (m.matchedKeywords?.length) {
          lines.push(`- **Keywords:** ${m.matchedKeywords.join(", ")}`);
        }
        if (m.autoTags?.length) {
          lines.push(`- **Auto-tags:** ${m.autoTags.join(", ")}`);
        }
        if (m.capabilities?.length) {
          lines.push(`- **Capabilities:** ${m.capabilities.join(", ")}`);
        }
        lines.push(``);
      }
    } else {
      lines.push(`\n_No agents found with memory-system similarity in the scanned range._\n`);
      lines.push(`Try expanding the range or lowering the minimum score threshold.\n`);
    }

    lines.push(`\n---\n_Scan completed at ${new Date().toISOString()}_\n`);

    return {
      success: true,
      markdown: lines.join("\n"),
      matchCount: data.totalMatched || 0,
      totalScanned: data.totalScanned || 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `❌ **Memory scan failed**\n\n${msg}\n\nMake sure the dashboard is running on ${DASHBOARD_BASE}\n`,
      matchCount: 0,
      totalScanned: 0,
    };
  }
}
