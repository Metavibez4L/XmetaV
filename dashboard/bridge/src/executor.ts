import { supabase } from "../lib/supabase.js";
import { runAgentWithFallback } from "../lib/openclaw.js";
import { createStreamer } from "./streamer.js";
import { captureCommandOutcome } from "../lib/agent-memory.js";
import { buildSoulContext } from "../lib/soul/index.js";
import { parseSwapCommand, executeSwap, isSwapEnabled } from "../lib/swap-executor.js";
import { isMemoryScanCommand, executeMemoryScan } from "../lib/oracle-memory-scan.js";
import { isDiagramCommand, parseDiagramCommand, executeDiagramCommand } from "../lib/diagram-executor.js";
import { refreshSitrep } from "./heartbeat.js";
import { TTLCache } from "../lib/ttl-cache.js";
import type { ChildProcess } from "child_process";

/** Track running processes per agent (one at a time per agent) */
export const running = new Map<string, ChildProcess>();

/**
 * Track the last diagram context per agent.
 * When a diagram is generated, we store it here so follow-up messages
 * like "update it", "improve it", "retry" can be intercepted instead
 * of letting the LLM use browser tools and hang.
 */
interface DiagramContext {
  message: string;
  timestamp: number;
}
const lastDiagramContext = new Map<string, DiagramContext>();
const DIAGRAM_CONTEXT_TTL = 5 * 60 * 1000; // 5 minutes

/** Vague follow-up messages that should inherit the previous diagram context */
const DIAGRAM_FOLLOWUP_PATTERNS = [
  /^(update|improve|enhance|fix|refine|redo|retry|regenerate|redo)\b/i,
  /^(update|improve|make|do)\s+(it|that|this|the diagram|the excalidraw)\b/i,
  /^(make it|do it)\s+(better|nicer|bigger|more detailed|cleaner)/i,
  /^(it|that|this)\s+(needs?|should|could)\b/i,
  /^(keep going|continue|go ahead|do it)$/i,
  /^retry$/i,
];

function isDiagramFollowUp(agentId: string, message: string): boolean {
  const ctx = lastDiagramContext.get(agentId);
  if (!ctx) return false;
  if (Date.now() - ctx.timestamp > DIAGRAM_CONTEXT_TTL) {
    lastDiagramContext.delete(agentId);
    return false;
  }
  const trimmed = message.trim();
  return DIAGRAM_FOLLOWUP_PATTERNS.some((p) => p.test(trimmed));
}

/** Cache agent enabled status for 30s — avoids DB query on every command */
const agentEnabledCache = new TTLCache<boolean>(30_000);

async function isAgentEnabled(agentId: string): Promise<boolean> {
  return agentEnabledCache.getOrFetch(`enabled:${agentId}`, async () => {
    try {
      const { data, error } = await supabase
        .from("agent_controls")
        .select("enabled")
        .eq("agent_id", agentId)
        .single();

      if (error) return true;
      return data?.enabled !== false;
    } catch {
      return true;
    }
  });
}

export async function executeCommand(command: {
  id: string;
  agent_id: string;
  message: string;
}) {
  const { id, agent_id, message } = command;

  // CONCURRENCY: Allow up to 4 concurrent commands per agent (96GB RAM)
  const MAX_CONCURRENT = 4;
  const currentRuns = [...running.entries()].filter(([_, child]) => child.exitCode === null).length;
  const agentRuns = [...running.entries()].filter(([aid, child]) => aid === agent_id && child.exitCode === null).length;
  
  if (agentRuns >= MAX_CONCURRENT) {
    console.log(`[executor] Agent "${agent_id}" has ${agentRuns} running commands (max ${MAX_CONCURRENT}), queueing command ${id}`);
    return;
  }
  
  console.log(`[executor] Concurrent: ${currentRuns} total, ${agentRuns} for ${agent_id} (max ${MAX_CONCURRENT})`);

  // Check if agent is enabled
  const enabled = await isAgentEnabled(agent_id);
  if (!enabled) {
    console.log(`[executor] Agent "${agent_id}" is disabled. Cancelling command ${id}`);

    // Mark as cancelled
    await supabase
      .from("agent_commands")
      .update({ status: "cancelled" })
      .eq("id", id);

    // Write a final response explaining why
    await supabase.from("agent_responses").insert({
      command_id: id,
      content: `\n[Bridge] Agent \"${agent_id}\" is DISABLED by fleet control. Enable it on /fleet to run commands.\n`,
      is_final: true,
    });

    return;
  }

  console.log(`[executor] Executing command ${id} on agent "${agent_id}"`);

  // ── Swap command interception ──────────────────────────────────
  // If the message is a swap command (e.g. "swap 5 USDC to ETH"),
  // execute it directly instead of spawning an agent.
  const swapParams = parseSwapCommand(message);
  if (swapParams && isSwapEnabled()) {
    console.log(`[executor] Swap command detected: ${swapParams.amount} ${swapParams.fromToken} → ${swapParams.toToken}`);

    await supabase
      .from("agent_commands")
      .update({ status: "running" })
      .eq("id", id);

    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id, status: "busy", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );

    const streamer = createStreamer(id);
    streamer.start();

    streamer.write(`\n🔄 **Executing swap:** ${swapParams.amount} ${swapParams.fromToken} → ${swapParams.toToken}\n\n`);
    streamer.write(`⏳ Checking balances & getting quote from Aerodrome...\n\n`);

    try {
      const result = await executeSwap({
        ...swapParams,
        agentId: agent_id,
        commandId: id,
      });

      if (result.success) {
        streamer.write(`✅ **Swap executed successfully!**\n\n`);
        streamer.write(`📊 **${result.amountIn} → ${result.amountOut}**\n\n`);
        streamer.write(`🔗 [View on BaseScan](${result.explorerUrl})\n\n`);
        if (result.approveTxHash) {
          streamer.write(`🔐 Approval: [${result.approveTxHash.slice(0, 10)}...](https://basescan.org/tx/${result.approveTxHash})\n\n`);
        }
        streamer.write(`Transaction: \`${result.txHash}\`\n`);
      } else {
        streamer.write(`\n❌ **Swap failed**\n\n`);
        streamer.write(`${result.error}\n`);
      }

      await streamer.end(result.success ? 0 : 1);

      await supabase
        .from("agent_commands")
        .update({ status: result.success ? "completed" : "failed" })
        .eq("id", id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Clean error for display
      const cleanMsg = msg.length > 300 ? msg.slice(0, 300) + "..." : msg;
      streamer.write(`\n❌ **Swap error**\n\n${cleanMsg}\n`);
      await streamer.end(1);

      await supabase
        .from("agent_commands")
        .update({ status: "failed" })
        .eq("id", id);
    }

    // Reset session
    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id, status: "idle", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );

    running.delete(agent_id);
    pickNextCommand(agent_id);
    return;
  }

  // ── Oracle memory-scan interception ────────────────────────────
  // If oracle (or main delegating to oracle) sends a memory-scan
  // command, execute it directly via the dashboard API.
  if (
    (agent_id === "oracle" || agent_id === "main") &&
    isMemoryScanCommand(message)
  ) {
    console.log(`[executor] Memory-scan command detected for "${agent_id}"`);

    await supabase
      .from("agent_commands")
      .update({ status: "running" })
      .eq("id", id);

    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id, status: "busy", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );

    const streamer = createStreamer(id);
    streamer.start();

    streamer.write(`\n🔍 **Oracle ERC-8004 Memory-Similarity Scan starting...**\n\n`);
    streamer.write(`⏳ Scanning Base Mainnet for agents with memory/consciousness metadata...\n\n`);

    try {
      const result = await executeMemoryScan(message);

      streamer.write(result.markdown);
      await streamer.end(result.success ? 0 : 1);

      await supabase
        .from("agent_commands")
        .update({ status: result.success ? "completed" : "failed" })
        .eq("id", id);

      // Capture to memory
      captureCommandOutcome(
        agent_id,
        message,
        result.markdown,
        result.success ? 0 : 1
      ).catch((err) =>
        console.error(`[executor] Memory capture failed (non-fatal):`, err)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      streamer.write(`\n❌ **Memory scan error**\n\n${msg}\n`);
      await streamer.end(1);

      await supabase
        .from("agent_commands")
        .update({ status: "failed" })
        .eq("id", id);
    }

    // Reset session
    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id, status: "idle", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );

    running.delete(agent_id);
    pickNextCommand(agent_id);
    return;
  }

  // ── Diagram generation interception ────────────────────────────
  // If the message is a diagram command (e.g. "/diagram fleet architecture"),
  // generate the diagram directly and return file paths.
  // Also catches follow-up messages ("update it", "improve it") within 5 min
  // of the last diagram, preventing the LLM from using browser tools and hanging.
  const diagramFollowUp = isDiagramFollowUp(agent_id, message);
  if (isDiagramCommand(message) || diagramFollowUp) {
    const effectiveMessage = diagramFollowUp
      ? `${lastDiagramContext.get(agent_id)!.message} — ${message}`
      : message;
    console.log(`[executor] Diagram command detected for "${agent_id}"${diagramFollowUp ? " (follow-up)" : ""}`);

    await supabase
      .from("agent_commands")
      .update({ status: "running" })
      .eq("id", id);

    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id, status: "busy", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );

    const streamer = createStreamer(id);
    streamer.start();

    streamer.write(`\n📐 **Generating diagram...**\n\n`);
    if (diagramFollowUp) {
      streamer.write(`🔄 *Follow-up on previous diagram — regenerating with updates*\n\n`);
    }

    try {
      const result = await executeDiagramCommand(effectiveMessage);

      if (result.success) {
        streamer.write(`✅ **Diagram generated!**\n\n`);
        streamer.write(`📊 **${result.title}** (${result.type})\n\n`);
        streamer.write(`📁 **Files:**\n`);
        streamer.write(`- Excalidraw: \`${result.excalidrawPath}\`\n`);
        streamer.write(`- SVG: \`${result.svgPath}\`\n\n`);
        if (result.opened) {
          streamer.write(`🖥️ Opened in default app\n`);
        }
        streamer.write(`\n💡 Open SVG in browser or load .excalidraw in excalidraw.com to edit\n`);

        // Store diagram context so follow-up messages are intercepted
        lastDiagramContext.set(agent_id, {
          message: effectiveMessage,
          timestamp: Date.now(),
        });
      } else {
        streamer.write(`\n❌ **Diagram generation failed**\n\n`);
        streamer.write(`${result.error}\n`);
      }

      await streamer.end(result.success ? 0 : 1);

      await supabase
        .from("agent_commands")
        .update({ status: result.success ? "completed" : "failed" })
        .eq("id", id);

      captureCommandOutcome(
        agent_id,
        message,
        `Diagram: ${result.title || "unknown"} → ${result.svgPath || "failed"}`,
        result.success ? 0 : 1
      ).catch((err) =>
        console.error(`[executor] Memory capture failed (non-fatal):`, err)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      streamer.write(`\n❌ **Diagram error**\n\n${msg}\n`);
      await streamer.end(1);

      await supabase
        .from("agent_commands")
        .update({ status: "failed" })
        .eq("id", id);
    }

    await supabase
      .from("agent_sessions")
      .upsert(
        { agent_id, status: "idle", last_heartbeat: new Date().toISOString() },
        { onConflict: "agent_id" }
      );

    running.delete(agent_id);
    pickNextCommand(agent_id);
    return;
  }

  // Inject Soul-curated context into the dispatch message
  let enrichedMessage = message;
  try {
    const soulCtx = await buildSoulContext(agent_id, message);
    if (soulCtx) {
      enrichedMessage = soulCtx + message;
      console.log(`[executor] Soul injected context for "${agent_id}" (${soulCtx.length} chars)`);
    }
  } catch (err) {
    console.error(`[executor] Soul context failed (non-fatal):`, err);
  }

  // Mark as running
  await supabase
    .from("agent_commands")
    .update({ status: "running" })
    .eq("id", id);

  // Update agent session status to busy
  await supabase
    .from("agent_sessions")
    .upsert(
      { agent_id, status: "busy", last_heartbeat: new Date().toISOString() },
      { onConflict: "agent_id" }
    );

  const streamer = createStreamer(id);
  streamer.start();

  // Accumulate raw output for memory capture
  let rawOutput = "";

  // Token batching: collect small rapid-fire tokens before flushing to reduce
  // DB write pressure. Flushes after 3 tokens or 8ms — whichever comes first.
  // Optimized for 96GB RAM Mac Studio (low latency priority)
  let tokenBatch = "";
  let tokenCount = 0;
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const BATCH_TOKENS = 3;
  const BATCH_MS = 8;

  function flushTokenBatch() {
    if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
    if (tokenBatch.length > 0) {
      streamer.write(tokenBatch);
      tokenBatch = "";
      tokenCount = 0;
    }
  }

  try {
    const child = runAgentWithFallback({
      agentId: agent_id,
      message: enrichedMessage,
      onChunk: (text) => {
        rawOutput += text;
        tokenBatch += text;
        tokenCount++;
        if (tokenCount >= BATCH_TOKENS) {
          flushTokenBatch();
        } else if (!batchTimer) {
          batchTimer = setTimeout(flushTokenBatch, BATCH_MS);
        }
      },
      onExit: async (code) => {
        running.delete(agent_id);

        // Flush any remaining batched tokens before ending the stream
        flushTokenBatch();

        await streamer.end(code);

        const status = code === 0 ? "completed" : "failed";
        await supabase
          .from("agent_commands")
          .update({ status })
          .eq("id", id);

        // Capture outcome to agent memory (non-blocking)
        captureCommandOutcome(agent_id, message, rawOutput, code).catch((err) =>
          console.error(`[executor] Memory capture failed (non-fatal):`, err)
        );

        // Reset agent session to idle
        await supabase
          .from("agent_sessions")
          .upsert(
            { agent_id, status: "idle", last_heartbeat: new Date().toISOString() },
            { onConflict: "agent_id" }
          );

        console.log(`[executor] Command ${id} finished: ${status}`);

        // Refresh SITREP so main always has latest context
        refreshSitrep("post-command");

        // Check for queued commands for this agent
        pickNextCommand(agent_id);
      },
    });

    running.set(agent_id, child);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[executor] Failed to spawn agent:`, errorMsg);

    await streamer.write(`\n[Bridge Error] ${errorMsg}\n`);
    await streamer.end(1);

    await supabase
      .from("agent_commands")
      .update({ status: "failed" })
      .eq("id", id);

    running.delete(agent_id);
  }
}

/** Pick the next pending command for an agent */
async function pickNextCommand(agentId: string) {
  const { data } = await supabase
    .from("agent_commands")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (data) {
    executeCommand(data);
  }
}
