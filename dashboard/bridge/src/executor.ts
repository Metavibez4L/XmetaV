import { supabase } from "../lib/supabase.js";
import { runAgentWithFallback } from "../lib/openclaw.js";
import { createStreamer } from "./streamer.js";
import { captureCommandOutcome } from "../lib/agent-memory.js";
import { buildSoulContext } from "../lib/soul/index.js";
import { parseSwapCommand, executeSwap, isSwapEnabled } from "../lib/swap-executor.js";
import type { ChildProcess } from "child_process";

/** Track running processes per agent (one at a time per agent) */
export const running = new Map<string, ChildProcess>();

async function isAgentEnabled(agentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("agent_controls")
      .select("enabled")
      .eq("agent_id", agentId)
      .single();

    // If table doesn't exist or row doesn't exist, default to enabled.
    if (error) {
      return true;
    }
    return data?.enabled !== false;
  } catch {
    return true;
  }
}

export async function executeCommand(command: {
  id: string;
  agent_id: string;
  message: string;
}) {
  const { id, agent_id, message } = command;

  // Check if this agent already has a running command
  if (running.has(agent_id)) {
    console.log(`[executor] Agent "${agent_id}" is busy, queueing command ${id}`);
    // Leave as pending -- will be picked up when current finishes
    return;
  }

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

  try {
    const child = runAgentWithFallback({
      agentId: agent_id,
      message: enrichedMessage,
      onChunk: (text) => {
        rawOutput += text;
        streamer.write(text);
      },
      onExit: async (code) => {
        running.delete(agent_id);

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
