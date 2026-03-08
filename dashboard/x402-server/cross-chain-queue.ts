/**
 * Cross-Chain Batch Queue & Job Manager
 *
 * Manages cross-chain job lifecycle:
 *   Pending → Batched → BridgedToSol → Swapped → Vaulted → BridgedToBase → Completed
 *
 * Batching: Aggregates small payments ($0.65 each) until $6.50+ threshold,
 * then bridges as a single transaction to amortize bridge fees.
 */

import { randomUUID } from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  type CrossChainJob,
  type CrossChainJobStatus,
  type BatchGroup,
  type VaultStrategy,
  type OutputToken,
  SAFETY,
  estimateTotalFees,
} from "./cross-chain-types.js";
import { bridgeToSolana, waitForBridgeArrival, bridgeToBase, waitForBaseArrival } from "./bridge-solana.js";
import { swapOnJupiter } from "./jupiter-swap.js";
import { depositUsdcToKamino, withdrawUsdcFromKamino } from "./kamino-vault.js";

// ── Supabase ────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// ── In-Memory State ─────────────────────────────────────────────

const jobs = new Map<string, CrossChainJob>();
const batches = new Map<string, BatchGroup>();
let pendingBatchJobs: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

// ── Job CRUD ────────────────────────────────────────────────────

export function createJob(params: {
  payerAddress: string;
  paymentAmount: number;
  outputToken?: OutputToken;
  vaultStrategy?: VaultStrategy;
  returnToBase?: boolean;
}): CrossChainJob {
  const now = new Date().toISOString();
  const job: CrossChainJob = {
    id: randomUUID(),
    payerAddress: params.payerAddress,
    paymentAmount: params.paymentAmount,
    targetChain: "solana",
    outputToken: params.outputToken || "USDC",
    vaultStrategy: params.vaultStrategy || "none",
    returnToBase: params.returnToBase ?? false,
    status: "pending",
    batchId: null,
    baseBridgeTx: null,
    solanaBridgeTx: null,
    jupiterSwapTx: null,
    kaminoDepositTx: null,
    kaminoWithdrawTx: null,
    returnBridgeTx: null,
    anchorTx: null,
    bridgedAmount: null,
    swapOutputAmount: null,
    vaultShares: null,
    returnAmount: null,
    yieldEarned: null,
    fees: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    error: null,
  };

  jobs.set(job.id, job);
  persistJob(job);
  return job;
}

export function getJob(jobId: string): CrossChainJob | undefined {
  return jobs.get(jobId);
}

function updateJob(jobId: string, updates: Partial<CrossChainJob>): CrossChainJob {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  jobs.set(jobId, job);
  persistJob(job);
  return job;
}

async function persistJob(job: CrossChainJob): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("cross_chain_jobs").upsert({
      id: job.id,
      payer_address: job.payerAddress,
      payment_amount: job.paymentAmount,
      target_chain: job.targetChain,
      output_token: job.outputToken,
      vault_strategy: job.vaultStrategy,
      return_to_base: job.returnToBase,
      status: job.status,
      batch_id: job.batchId,
      base_bridge_tx: job.baseBridgeTx,
      solana_bridge_tx: job.solanaBridgeTx,
      jupiter_swap_tx: job.jupiterSwapTx,
      kamino_deposit_tx: job.kaminoDepositTx,
      kamino_withdraw_tx: job.kaminoWithdrawTx,
      return_bridge_tx: job.returnBridgeTx,
      anchor_tx: job.anchorTx,
      bridged_amount: job.bridgedAmount,
      swap_output_amount: job.swapOutputAmount,
      vault_shares: job.vaultShares,
      return_amount: job.returnAmount,
      yield_earned: job.yieldEarned,
      fees: job.fees,
      error: job.error,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      completed_at: job.completedAt,
    });
  } catch (err) {
    console.error("[cross-chain] Failed to persist job:", err);
  }
}

// ── Batch Management ────────────────────────────────────────────

/**
 * Add a job to the pending batch queue.
 * When the batch reaches the threshold, execute it.
 */
export function addToBatch(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  pendingBatchJobs.push(jobId);
  updateJob(jobId, { status: "pending" });

  const totalPending = pendingBatchJobs.reduce((sum, id) => {
    const j = jobs.get(id);
    return sum + (j?.paymentAmount || 0);
  }, 0);

  console.log(`[cross-chain] Batch queue: $${totalPending.toFixed(2)} / $${SAFETY.minBatchThreshold} (${pendingBatchJobs.length} jobs)`);

  if (totalPending >= SAFETY.minBatchThreshold) {
    executeBatch();
  } else if (!batchTimer) {
    // Set a timer to execute even if threshold isn't reached
    batchTimer = setTimeout(() => {
      if (pendingBatchJobs.length > 0) {
        console.log("[cross-chain] Batch timer expired, executing partial batch");
        executeBatch();
      }
      batchTimer = null;
    }, SAFETY.batchCollectTimeout);
  }
}

/**
 * Execute all pending batch jobs as a single bridge transaction.
 */
async function executeBatch(): Promise<void> {
  if (pendingBatchJobs.length === 0) return;

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  const batchJobIds = [...pendingBatchJobs];
  pendingBatchJobs = [];

  const batchId = randomUUID();
  const totalAmount = batchJobIds.reduce((sum, id) => {
    const j = jobs.get(id);
    return sum + (j?.paymentAmount || 0);
  }, 0);

  const batch: BatchGroup = {
    id: batchId,
    jobIds: batchJobIds,
    totalAmount,
    status: "executing",
    bridgeTx: null,
    createdAt: new Date().toISOString(),
  };

  batches.set(batchId, batch);

  // Mark all jobs as batched
  for (const id of batchJobIds) {
    updateJob(id, { status: "batched", batchId });
  }

  console.log(`[cross-chain] Executing batch ${batchId}: $${totalAmount.toFixed(2)} across ${batchJobIds.length} jobs`);

  // Execute the batch asynchronously
  processBatch(batch).catch((err) => {
    console.error(`[cross-chain] Batch ${batchId} failed:`, err);
    batch.status = "failed";
    for (const id of batchJobIds) {
      updateJob(id, { status: "failed", error: err.message });
    }
  });
}

// ── Job Processing Pipeline ─────────────────────────────────────

/**
 * Process a batch of jobs through the full pipeline.
 */
async function processBatch(batch: BatchGroup): Promise<void> {
  const { jobIds, totalAmount, id: batchId } = batch;

  // === Step 1: Bridge USDC to Solana ===
  console.log(`[cross-chain] [${batchId}] Step 1: Bridging $${totalAmount.toFixed(2)} USDC to Solana`);
  for (const id of jobIds) updateJob(id, { status: "bridging_to_sol" });

  const bridgeResult = await bridgeToSolana(totalAmount);
  batch.bridgeTx = bridgeResult.txHash;

  for (const id of jobIds) {
    updateJob(id, { baseBridgeTx: bridgeResult.txHash });
  }

  // Wait for USDC to arrive on Solana
  console.log(`[cross-chain] [${batchId}] Waiting for bridge arrival...`);
  await waitForBridgeArrival(totalAmount);

  for (const id of jobIds) {
    updateJob(id, { status: "bridged", bridgedAmount: totalAmount / jobIds.length });
  }

  // === Step 2: Process individual jobs ===
  // After bridging, each job gets its own swap/vault/return flow
  for (const jobId of jobIds) {
    processJob(jobId).catch((err) => {
      console.error(`[cross-chain] Job ${jobId} failed:`, err);
      updateJob(jobId, { status: "failed", error: err.message });
    });
  }

  batch.status = "completed";
}

/**
 * Process a single job through swap → vault → return pipeline.
 * Called after USDC has arrived on Solana.
 */
async function processJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const bridgedAmount = job.bridgedAmount || job.paymentAmount;

  // Estimate fees for this job
  const batchSize = job.batchId
    ? batches.get(job.batchId)?.jobIds.length || 1
    : 1;

  const fees = {
    bridgeToSolana: 0.50 / batchSize,
    jupiterSwap: 0,
    kaminoDeposit: 0,
    bridgeToBase: 0,
    total: 0,
  };

  // === Step 2: Jupiter Swap ===
  if (job.outputToken !== "USDC") {
    console.log(`[cross-chain] [${jobId}] Step 2: Swapping USDC → ${job.outputToken} on Jupiter`);
    updateJob(jobId, { status: "swapping" });

    const swapResult = await swapOnJupiter(bridgedAmount, job.outputToken);
    fees.jupiterSwap = bridgedAmount * 0.001; // ~0.1% Jupiter fee estimate

    updateJob(jobId, {
      status: "swapped",
      jupiterSwapTx: swapResult.signature,
      swapOutputAmount: swapResult.outputAmount,
    });

    console.log(`[cross-chain] [${jobId}] Swapped: ${bridgedAmount} USDC → ${swapResult.outputAmount} ${job.outputToken}`);
  } else {
    updateJob(jobId, { status: "swapped", swapOutputAmount: bridgedAmount });
  }

  // === Step 3: Kamino Vault Deposit ===
  if (job.vaultStrategy === "kamino") {
    console.log(`[cross-chain] [${jobId}] Step 3: Depositing into Kamino vault`);
    updateJob(jobId, { status: "depositing" });

    // For now, only USDC vault is supported
    const depositResult = await depositUsdcToKamino(bridgedAmount);
    fees.kaminoDeposit = 0.01;

    updateJob(jobId, {
      status: "vaulted",
      kaminoDepositTx: depositResult.txSignature,
      vaultShares: depositResult.sharesReceived,
    });

    console.log(`[cross-chain] [${jobId}] Deposited into Kamino vault: ${depositResult.txSignature}`);
  }

  // === Step 4: Return Bridge to Base ===
  if (job.returnToBase) {
    // If vaulted, need to withdraw first
    if (job.vaultStrategy === "kamino" && job.vaultShares) {
      console.log(`[cross-chain] [${jobId}] Step 4a: Withdrawing from Kamino vault`);
      updateJob(jobId, { status: "withdrawing" });

      const withdrawResult = await withdrawUsdcFromKamino(job.vaultShares.toString());
      updateJob(jobId, {
        kaminoWithdrawTx: withdrawResult.txSignature,
      });
    }

    console.log(`[cross-chain] [${jobId}] Step 4b: Bridging back to Base`);
    updateJob(jobId, { status: "bridging_to_base" });

    const returnAmount = job.swapOutputAmount || bridgedAmount;
    const returnResult = await bridgeToBase(returnAmount, job.payerAddress);
    fees.bridgeToBase = 0.50 / batchSize;

    updateJob(jobId, {
      returnBridgeTx: returnResult.txSignature,
    });

    // Wait for arrival on Base
    await waitForBaseArrival(returnAmount * 0.95); // 5% tolerance for fees

    updateJob(jobId, {
      returnAmount,
    });
  }

  // === Final: Calculate total fees and mark completed ===
  fees.total = fees.bridgeToSolana + fees.jupiterSwap + fees.kaminoDeposit + fees.bridgeToBase;

  updateJob(jobId, {
    status: "completed",
    fees,
    completedAt: new Date().toISOString(),
  });

  console.log(`[cross-chain] [${jobId}] ✅ Completed! Fees: $${fees.total.toFixed(4)}`);
}

// ── Direct Execution (Skip Batching) ────────────────────────────

/**
 * Execute a job immediately without batching.
 * Used for larger amounts that don't need batch aggregation.
 */
export async function executeJobDirect(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  console.log(`[cross-chain] Direct execution for job ${jobId}: $${job.paymentAmount}`);

  // Bridge directly
  updateJob(jobId, { status: "bridging_to_sol" });
  const bridgeResult = await bridgeToSolana(job.paymentAmount);
  updateJob(jobId, {
    baseBridgeTx: bridgeResult.txHash,
  });

  // Wait for arrival
  await waitForBridgeArrival(job.paymentAmount);
  updateJob(jobId, {
    status: "bridged",
    bridgedAmount: job.paymentAmount,
  });

  // Continue with swap/vault/return
  await processJob(jobId);
}

// ── Stats ───────────────────────────────────────────────────────

export function getQueueStats(): {
  pendingJobs: number;
  pendingAmount: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalBatches: number;
} {
  let activeJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;

  for (const job of jobs.values()) {
    if (job.status === "completed") completedJobs++;
    else if (job.status === "failed") failedJobs++;
    else if (job.status !== "pending" && job.status !== "batched") activeJobs++;
  }

  const pendingAmount = pendingBatchJobs.reduce((sum, id) => {
    const j = jobs.get(id);
    return sum + (j?.paymentAmount || 0);
  }, 0);

  return {
    pendingJobs: pendingBatchJobs.length,
    pendingAmount,
    activeJobs,
    completedJobs,
    failedJobs,
    totalBatches: batches.size,
  };
}

/**
 * Load jobs from Supabase on startup.
 */
export async function loadJobsFromDb(): Promise<void> {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from("cross_chain_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data) return;

    for (const row of data) {
      const job: CrossChainJob = {
        id: row.id,
        payerAddress: row.payer_address,
        paymentAmount: row.payment_amount,
        targetChain: row.target_chain,
        outputToken: row.output_token,
        vaultStrategy: row.vault_strategy,
        returnToBase: row.return_to_base,
        status: row.status,
        batchId: row.batch_id,
        baseBridgeTx: row.base_bridge_tx,
        solanaBridgeTx: row.solana_bridge_tx,
        jupiterSwapTx: row.jupiter_swap_tx,
        kaminoDepositTx: row.kamino_deposit_tx,
        kaminoWithdrawTx: row.kamino_withdraw_tx,
        returnBridgeTx: row.return_bridge_tx,
        anchorTx: row.anchor_tx,
        bridgedAmount: row.bridged_amount,
        swapOutputAmount: row.swap_output_amount,
        vaultShares: row.vault_shares,
        returnAmount: row.return_amount,
        yieldEarned: row.yield_earned,
        fees: row.fees,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        error: row.error,
      };
      jobs.set(job.id, job);
    }

    console.log(`[cross-chain] Loaded ${data.length} jobs from DB`);
  } catch (err) {
    console.error("[cross-chain] Failed to load jobs from DB:", err);
  }
}
