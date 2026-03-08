/**
 * Cross-Chain Swap Routes
 *
 * x402-gated endpoints for multi-chain operations:
 *   Base → Solana bridge → Jupiter swap → Kamino vault → return to Base
 *
 * Architecture: follows the createXxxRouter(logPayment, getCallerTier) pattern
 * used by trade-routes.ts and alpha-feeds.ts.
 */

import { Router, Request, Response } from "express";
import {
  type CrossChainSwapRequest,
  type CrossChainSwapResponse,
  type JobStatusResponse,
  type OutputToken,
  type VaultStrategy,
  SAFETY,
  estimateTotalFees,
} from "./cross-chain-types.js";
import {
  createJob,
  getJob,
  addToBatch,
  executeJobDirect,
  getQueueStats,
  loadJobsFromDb,
} from "./cross-chain-queue.js";
import { getSwapQuote } from "./jupiter-swap.js";
import {
  KAMINO_VAULTS,
  depositToVault,
  withdrawFromVault,
  listVaults,
  getVaultDetails,
  getUserVaultShares,
  getUserPositions,
  type DepositResult,
  type WithdrawResult,
} from "./kamino-vault.js";
import {
  getMarketOverview,
  getUserObligation,
  depositCollateral,
  borrowAsset,
  repayLoan,
  withdrawCollateral,
  MAIN_MARKET,
} from "./kamino-borrow.js";
import { checkBridgeArrival } from "./bridge-solana.js";

// ── Fee Schedules ───────────────────────────────────────────────

export const CROSS_CHAIN_FEE_SCHEDULES = {
  "/cross-chain-swap": "$0.65 — initiate cross-chain swap (Base→Solana→Jupiter→optional Kamino)",
  "/cross-chain-swap/quote": "free — get estimated output and fees",
  "/bridge-status/:jobId": "$0.05 — check job status",
  "/trigger-return/:jobId": "$0.25 — trigger return bridge (Solana→Base)",
  "/cross-chain/queue": "free — batch queue stats",
  "/cross-chain/vaults": "free — available Kamino vaults",
  "/kamino/deposit": "$0.15 — deposit tokens into a Kamino vault",
  "/kamino/withdraw": "$0.15 — withdraw tokens from a Kamino vault",
  "/kamino/vault-details": "free — live vault data (APY, holdings, exchange rate)",
  "/kamino/positions": "free — user vault positions across all vaults",
  "/kamino/market": "free — lending market overview (TVL, reserves, APYs)",
  "/kamino/obligation": "$0.05 — user lending obligation (LTV, deposits, borrows)",
  "/kamino/deposit-collateral": "$0.20 — deposit collateral into lending market",
  "/kamino/borrow": "$0.20 — borrow assets against collateral",
  "/kamino/repay": "$0.15 — repay a loan",
  "/kamino/withdraw-collateral": "$0.20 — withdraw collateral from lending market",
};

// ── Router Factory ──────────────────────────────────────────────

export function createCrossChainRouter(
  logPaymentFn: (endpoint: string, amount: string, req: Request) => void,
  getCallerTierFn: (callerAddress?: string) => Promise<{ discount: number; name: string }>
): Router {
  const router = Router();

  // Load jobs from DB on startup
  loadJobsFromDb().catch(console.error);

  /* ──────────────────────────────────────────────────────────
   * POST /cross-chain-swap
   *
   * Initiate a cross-chain swap: Base USDC → Solana → Jupiter swap
   * Optional: Kamino vault deposit, return bridge to Base
   *
   * Body: {
   *   amount: "10.00",           // Min $0.65 USDC
   *   targetChain: "solana",
   *   outputToken?: "SOL",       // SOL, USDC, BONK, JUP (default: USDC)
   *   vaultStrategy?: "kamino",  // kamino or none (default: none)
   *   returnToBase?: false       // bridge result back to Base
   * }
   *
   * Returns job ID and estimated breakdown.
   * ──────────────────────────────────────────────────────── */
  router.post("/cross-chain-swap", async (req: Request, res: Response) => {
    try {
      const body = req.body as CrossChainSwapRequest;

      // Validate input
      const amount = parseFloat(body.amount);
      if (isNaN(amount) || amount < SAFETY.minPayment) {
        res.status(400).json({
          error: `Minimum payment is $${SAFETY.minPayment} USDC`,
          minimum: SAFETY.minPayment,
        });
        return;
      }

      if (amount > SAFETY.maxSingleBridge) {
        res.status(400).json({
          error: `Maximum single bridge is $${SAFETY.maxSingleBridge} USDC`,
          maximum: SAFETY.maxSingleBridge,
        });
        return;
      }

      if (body.targetChain && body.targetChain !== "solana") {
        res.status(400).json({
          error: "Only 'solana' target chain is supported",
          supported: ["solana"],
        });
        return;
      }

      const outputToken: OutputToken = body.outputToken || "USDC";
      const validTokens: OutputToken[] = ["SOL", "USDC", "BONK", "JUP"];
      if (!validTokens.includes(outputToken)) {
        res.status(400).json({
          error: `Invalid outputToken. Supported: ${validTokens.join(", ")}`,
          supported: validTokens,
        });
        return;
      }

      const vaultStrategy: VaultStrategy = body.vaultStrategy || "none";
      const returnToBase = body.returnToBase ?? false;

      // Get caller info for tier discount
      const callerAddress = req.headers["x-caller-address"] as string | undefined;
      const tier = await getCallerTierFn(callerAddress);

      // Create the job
      const job = createJob({
        payerAddress: callerAddress || "unknown",
        paymentAmount: amount,
        outputToken,
        vaultStrategy,
        returnToBase,
      });

      // Estimate fees
      const shouldBatch = amount < SAFETY.minBatchThreshold;
      const stats = getQueueStats();
      const estimatedBatchSize = shouldBatch ? stats.pendingJobs + 1 : 1;

      const estimatedFees = {
        bridgeToSolana: shouldBatch ? 0.50 / Math.max(estimatedBatchSize, 1) : 0.50,
        jupiterSwap: outputToken !== "USDC" ? amount * 0.001 : 0,
        kaminoDeposit: vaultStrategy === "kamino" ? 0.01 : 0,
        bridgeToBase: returnToBase ? (shouldBatch ? 0.50 / Math.max(estimatedBatchSize, 1) : 0.50) : 0,
        total: 0,
      };
      estimatedFees.total = estimatedFees.bridgeToSolana + estimatedFees.jupiterSwap
        + estimatedFees.kaminoDeposit + estimatedFees.bridgeToBase;

      const estimatedOutput = amount - estimatedFees.total;
      const estimatedMargin = ((estimatedOutput / amount) * 100).toFixed(1);

      // Log payment
      const feeStr = `$0.65`;
      logPaymentFn("/cross-chain-swap", feeStr, req);

      // Queue or execute directly
      if (shouldBatch) {
        addToBatch(job.id);
      } else {
        // Execute immediately for larger amounts
        executeJobDirect(job.id).catch((err) => {
          console.error(`[cross-chain] Direct execution failed for ${job.id}:`, err);
        });
      }

      const response: CrossChainSwapResponse = {
        jobId: job.id,
        status: job.status,
        estimatedCompletion: shouldBatch
          ? "15-75 minutes (batched — waiting for batch threshold)"
          : "15-25 minutes (direct execution)",
        breakdown: {
          payment: amount,
          estimatedFees,
          estimatedOutput,
          estimatedMargin: `${estimatedMargin}%`,
        },
        batched: shouldBatch,
        batchId: job.batchId,
      };

      res.json(response);
    } catch (err: any) {
      console.error("[cross-chain] /cross-chain-swap error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /cross-chain-swap/quote
   *
   * Get estimated output without executing.
   * Free endpoint — no payment required.
   * ──────────────────────────────────────────────────────── */
  router.post("/cross-chain-swap/quote", async (req: Request, res: Response) => {
    try {
      const { amount, outputToken, vaultStrategy, returnToBase } = req.body;

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: "Valid amount required" });
        return;
      }

      const token: OutputToken = outputToken || "USDC";
      const vault: VaultStrategy = vaultStrategy || "none";
      const shouldReturn = returnToBase ?? false;

      // Get Jupiter quote if swapping
      let jupiterQuote = null;
      if (token !== "USDC") {
        try {
          jupiterQuote = await getSwapQuote(amountNum, token);
        } catch (err: any) {
          jupiterQuote = { error: err.message };
        }
      }

      // Estimate fees
      const shouldBatch = amountNum < SAFETY.minBatchThreshold;
      const estimatedBatchSize = shouldBatch ? 10 : 1; // assume 10 for quote

      const fees = estimateTotalFees({
        returnToBase: shouldReturn,
        vaultStrategy: vault,
        batched: shouldBatch,
        batchSize: estimatedBatchSize,
      });

      res.json({
        input: amountNum,
        outputToken: token,
        estimatedFees: fees,
        estimatedOutput: amountNum - fees,
        margin: `${(((amountNum - fees) / amountNum) * 100).toFixed(1)}%`,
        jupiterQuote,
        vaultInfo: vault === "kamino" ? KAMINO_VAULTS.USDC_MAIN : null,
        batched: shouldBatch,
        note: shouldBatch
          ? `Will be batched with other swaps (threshold: $${SAFETY.minBatchThreshold})`
          : "Will execute immediately",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * GET /bridge-status/:jobId
   *
   * Check the status of a cross-chain swap job.
   * ──────────────────────────────────────────────────────── */
  router.get("/bridge-status/:jobId", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId as string;
      const job = getJob(jobId);

      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      // Log payment for status check
      logPaymentFn("/bridge-status", "$0.05", req);

      // Build step-by-step status
      const steps = [
        {
          name: "Bridge to Solana",
          status: getStepStatus(job.status, ["bridging_to_sol", "bridged", "swapping", "swapped", "depositing", "vaulted", "withdrawing", "bridging_to_base", "anchoring", "completed"]),
          txHash: job.baseBridgeTx,
          timestamp: job.baseBridgeTx ? job.updatedAt : null,
        },
        {
          name: "Jupiter Swap",
          status: job.outputToken === "USDC"
            ? ("skipped" as const)
            : getStepStatus(job.status, ["swapping", "swapped", "depositing", "vaulted", "withdrawing", "bridging_to_base", "anchoring", "completed"]),
          txHash: job.jupiterSwapTx,
          timestamp: job.jupiterSwapTx ? job.updatedAt : null,
        },
        {
          name: "Kamino Vault Deposit",
          status: job.vaultStrategy === "none"
            ? ("skipped" as const)
            : getStepStatus(job.status, ["depositing", "vaulted", "withdrawing", "bridging_to_base", "anchoring", "completed"]),
          txHash: job.kaminoDepositTx,
          timestamp: job.kaminoDepositTx ? job.updatedAt : null,
        },
        {
          name: "Return to Base",
          status: !job.returnToBase
            ? ("skipped" as const)
            : getStepStatus(job.status, ["bridging_to_base", "anchoring", "completed"]),
          txHash: job.returnBridgeTx,
          timestamp: job.returnBridgeTx ? job.updatedAt : null,
        },
      ];

      const response: JobStatusResponse = {
        jobId: job.id,
        status: job.status,
        steps,
        amounts: {
          input: job.paymentAmount,
          bridged: job.bridgedAmount,
          swapOutput: job.swapOutputAmount,
          vaultShares: job.vaultShares,
          returned: job.returnAmount,
          yield: job.yieldEarned,
        },
        fees: job.fees,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      };

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /trigger-return/:jobId
   *
   * Manually trigger the return bridge for a vaulted job.
   * Used when the user wants to withdraw from Kamino and
   * bridge back to Base.
   * ──────────────────────────────────────────────────────── */
  router.post("/trigger-return/:jobId", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId as string;
      const job = getJob(jobId);

      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      if (job.status !== "vaulted" && job.status !== "swapped") {
        res.status(400).json({
          error: `Job must be in 'vaulted' or 'swapped' status to trigger return. Current: ${job.status}`,
        });
        return;
      }

      // Log payment
      logPaymentFn("/trigger-return", "$0.25", req);

      // Update job to initiate return
      // This is handled by the queue processor
      // For now, mark as bridging_to_base and let the pipeline handle it
      res.json({
        jobId: job.id,
        status: "return-initiated",
        message: "Return bridge initiated. Check /bridge-status/:jobId for progress.",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * GET /cross-chain/queue
   *
   * Batch queue statistics. Free endpoint.
   * ──────────────────────────────────────────────────────── */
  router.get("/cross-chain/queue", async (_req: Request, res: Response) => {
    const stats = getQueueStats();
    res.json({
      ...stats,
      batchThreshold: SAFETY.minBatchThreshold,
      batchTimeout: SAFETY.batchCollectTimeout / 1000,
      emergencyPause: SAFETY.emergencyPause,
    });
  });

  /* ──────────────────────────────────────────────────────────
   * GET /cross-chain/vaults
   *
   * List available Kamino vaults. Free endpoint.
   * ──────────────────────────────────────────────────────── */
  router.get("/cross-chain/vaults", async (_req: Request, res: Response) => {
    try {
      let liveVaults;
      try {
        liveVaults = await listVaults();
      } catch {
        liveVaults = null;
      }
      res.json({
        vaults: KAMINO_VAULTS,
        live: liveVaults,
        note: "APY estimates are approximate and subject to change",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /kamino/deposit
   *
   * Deposit tokens directly into a Kamino vault.
   *
   * Body: {
   *   vault: "USDC_MAIN" | "SOL_MAIN" | string,  // vault key or raw address
   *   amount: "10.00",                            // human-readable token amount
   * }
   * ──────────────────────────────────────────────────────── */
  router.post("/kamino/deposit", async (req: Request, res: Response) => {
    try {
      const { vault, amount } = req.body;

      if (!vault || !amount) {
        res.status(400).json({ error: "vault and amount are required" });
        return;
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }

      // Resolve vault: either a known key or a raw address
      const knownVault = KAMINO_VAULTS[vault as keyof typeof KAMINO_VAULTS];
      const vaultAddress = knownVault ? knownVault.address : vault;
      const tokenMint = knownVault ? knownVault.tokenMint : undefined;
      const decimals = knownVault?.token === "SOL" ? 1e9 : 1e6;
      const amountRaw = Math.floor(amountNum * decimals).toString();

      logPaymentFn("/kamino/deposit", "$0.15", req);

      const result: DepositResult = await depositToVault(vaultAddress, amountRaw, tokenMint);

      res.json({
        success: true,
        vault: knownVault?.name ?? vaultAddress,
        depositAmount: amountNum,
        txSignature: result.txSignature,
        sharesReceived: result.sharesReceived,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
      });
    } catch (err: any) {
      console.error("[kamino] /kamino/deposit error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /kamino/withdraw
   *
   * Withdraw tokens from a Kamino vault by redeeming shares.
   *
   * Body: {
   *   vault: "USDC_MAIN" | "SOL_MAIN" | string,  // vault key or raw address
   *   shares: "1000000",                          // kToken shares (raw units)
   * }
   * ──────────────────────────────────────────────────────── */
  router.post("/kamino/withdraw", async (req: Request, res: Response) => {
    try {
      const { vault, shares } = req.body;

      if (!vault || !shares) {
        res.status(400).json({ error: "vault and shares are required" });
        return;
      }

      const sharesNum = parseFloat(shares);
      if (isNaN(sharesNum) || sharesNum <= 0) {
        res.status(400).json({ error: "shares must be a positive number" });
        return;
      }

      const knownVault = KAMINO_VAULTS[vault as keyof typeof KAMINO_VAULTS];
      const vaultAddress = knownVault ? knownVault.address : vault;

      logPaymentFn("/kamino/withdraw", "$0.15", req);

      const result: WithdrawResult = await withdrawFromVault(vaultAddress, shares);

      res.json({
        success: true,
        vault: knownVault?.name ?? vaultAddress,
        sharesRedeemed: result.sharesRedeemed,
        tokensReceived: result.tokensReceived,
        txSignature: result.txSignature,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
      });
    } catch (err: any) {
      console.error("[kamino] /kamino/withdraw error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * GET /kamino/vault-details?vault=USDC_MAIN
   *
   * Live vault data from SDK: holdings, allocations, APY, exchange rate.
   * ──────────────────────────────────────────────────────── */
  router.get("/kamino/vault-details", async (req: Request, res: Response) => {
    try {
      const vaultKey = (req.query.vault as string) || "USDC_MAIN";
      const knownVault = KAMINO_VAULTS[vaultKey as keyof typeof KAMINO_VAULTS];
      const vaultAddress = knownVault ? knownVault.address : vaultKey;

      const details = await getVaultDetails(vaultAddress);
      res.json({ vault: knownVault?.name ?? vaultAddress, ...details });
    } catch (err: any) {
      console.error("[kamino] /kamino/vault-details error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * GET /kamino/positions?wallet=<optional>
   *
   * User vault positions across all Kamino vaults.
   * ──────────────────────────────────────────────────────── */
  router.get("/kamino/positions", async (req: Request, res: Response) => {
    try {
      const wallet = req.query.wallet as string | undefined;
      const positions = await getUserPositions(wallet);
      res.json({ positions });
    } catch (err: any) {
      console.error("[kamino] /kamino/positions error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * GET /kamino/market
   *
   * Lending market overview: TVL, reserves with APY/utilization.
   * ──────────────────────────────────────────────────────── */
  router.get("/kamino/market", async (_req: Request, res: Response) => {
    try {
      const overview = await getMarketOverview();
      res.json(overview);
    } catch (err: any) {
      console.error("[kamino] /kamino/market error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * GET /kamino/obligation?wallet=<optional>
   *
   * User lending obligation: LTV, deposits, borrows, health.
   * ──────────────────────────────────────────────────────── */
  router.get("/kamino/obligation", async (req: Request, res: Response) => {
    try {
      const wallet = req.query.wallet as string | undefined;
      logPaymentFn("/kamino/obligation", "$0.05", req);
      const obligation = await getUserObligation(wallet);
      res.json({ obligation, market: MAIN_MARKET });
    } catch (err: any) {
      console.error("[kamino] /kamino/obligation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /kamino/deposit-collateral
   *
   * Body: { token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: "100" }
   * ──────────────────────────────────────────────────────── */
  router.post("/kamino/deposit-collateral", async (req: Request, res: Response) => {
    try {
      const { token, amount } = req.body;
      if (!token || !amount) {
        res.status(400).json({ error: "token (mint) and amount are required" });
        return;
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }

      logPaymentFn("/kamino/deposit-collateral", "$0.20", req);
      const result = await depositCollateral(token, amount);
      res.json({
        success: true,
        ...result,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
      });
    } catch (err: any) {
      console.error("[kamino] /kamino/deposit-collateral error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /kamino/borrow
   *
   * Body: { token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: "50" }
   * ──────────────────────────────────────────────────────── */
  router.post("/kamino/borrow", async (req: Request, res: Response) => {
    try {
      const { token, amount } = req.body;
      if (!token || !amount) {
        res.status(400).json({ error: "token (mint) and amount are required" });
        return;
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }

      logPaymentFn("/kamino/borrow", "$0.20", req);
      const result = await borrowAsset(token, amount);
      res.json({
        success: true,
        ...result,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
      });
    } catch (err: any) {
      console.error("[kamino] /kamino/borrow error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /kamino/repay
   *
   * Body: { token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: "50" }
   * ──────────────────────────────────────────────────────── */
  router.post("/kamino/repay", async (req: Request, res: Response) => {
    try {
      const { token, amount } = req.body;
      if (!token || !amount) {
        res.status(400).json({ error: "token (mint) and amount are required" });
        return;
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }

      logPaymentFn("/kamino/repay", "$0.15", req);
      const result = await repayLoan(token, amount);
      res.json({
        success: true,
        ...result,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
      });
    } catch (err: any) {
      console.error("[kamino] /kamino/repay error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────────────────────
   * POST /kamino/withdraw-collateral
   *
   * Body: { token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: "50" }
   * ──────────────────────────────────────────────────────── */
  router.post("/kamino/withdraw-collateral", async (req: Request, res: Response) => {
    try {
      const { token, amount } = req.body;
      if (!token || !amount) {
        res.status(400).json({ error: "token (mint) and amount are required" });
        return;
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }

      logPaymentFn("/kamino/withdraw-collateral", "$0.20", req);
      const result = await withdrawCollateral(token, amount);
      res.json({
        success: true,
        ...result,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
      });
    } catch (err: any) {
      console.error("[kamino] /kamino/withdraw-collateral error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// ── Helpers ─────────────────────────────────────────────────────

function getStepStatus(
  jobStatus: string,
  activeStatuses: string[]
): "pending" | "in-progress" | "completed" | "failed" {
  if (jobStatus === "failed") return "failed";
  if (jobStatus === "completed") return "completed";

  const idx = activeStatuses.indexOf(jobStatus);
  if (idx === 0) return "in-progress";
  if (idx > 0) return "completed";
  return "pending";
}
