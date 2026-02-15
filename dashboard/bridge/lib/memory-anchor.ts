/**
 * Memory Anchor Client — writes memory hashes on-chain to the
 * AgentMemoryAnchor contract on Base Mainnet.
 *
 * Flow:
 *   1. Full memory blob → Pinata IPFS (ipfs-pinata.ts)
 *   2. keccak256(ipfsCid) → on-chain anchor (this file)
 *   3. ~$0.0001 per anchor on Base
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toHex,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { pinJSON, isPinataConfigured, ipfsGatewayURL } from "./ipfs-pinata.js";

/** Shared public client for reads */
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org", {
    timeout: 10_000,
  }),
});

// Contract ABI (only the functions we call)
const ANCHOR_ABI = [
  {
    type: "function",
    name: "anchor",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "contentHash", type: "bytes32" },
      { name: "category", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getLatest",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "contentHash", type: "bytes32" },
          { name: "previousAnchor", type: "bytes32" },
          { name: "category", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "anchorCount",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAnchors",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "from", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "contentHash", type: "bytes32" },
          { name: "previousAnchor", type: "bytes32" },
          { name: "category", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

// Memory categories matching the contract
export const MemoryCategory = {
  MILESTONE: 0,
  DECISION: 1,
  INCIDENT: 2,
} as const;

export type MemoryCategoryType = (typeof MemoryCategory)[keyof typeof MemoryCategory];

const ANCHOR_ADDRESS = process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}` | undefined;
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

/**
 * Check if on-chain anchoring is fully configured.
 */
export function isAnchoringEnabled(): boolean {
  return !!ANCHOR_ADDRESS && !!PRIVATE_KEY && isPinataConfigured();
}

/**
 * Anchor a memory to IPFS + Base on-chain.
 *
 * 1. Pins the full memory blob to IPFS via Pinata
 * 2. Writes keccak256(ipfsCid) to the AgentMemoryAnchor contract
 *
 * Returns the IPFS CID and transaction hash.
 */
export async function anchorMemory(
  agentId: number,
  category: MemoryCategoryType,
  memory: {
    content: string;
    kind: string;
    source?: string;
    task?: string;
    timestamp?: string;
  }
): Promise<{ ipfsCid: string; txHash: string; gatewayUrl: string } | null> {
  if (!isAnchoringEnabled()) {
    console.log("[anchor] Skipped — not fully configured (need ANCHOR_CONTRACT_ADDRESS, EVM_PRIVATE_KEY, PINATA_JWT)");
    return null;
  }

  try {
    // 1. Pin to IPFS
    const blob = {
      agentId,
      category,
      ...memory,
      anchoredAt: new Date().toISOString(),
    };

    const pinName = `agent-${agentId}-${memory.kind}-${Date.now()}`;
    const pinResult = await pinJSON(blob, pinName);
    console.log(`[anchor] Pinned to IPFS: ${pinResult.ipfsHash} (${pinResult.pinSize} bytes)`);

    // 2. Write on-chain
    const contentHash = keccak256(toHex(pinResult.ipfsHash));

    const account = privateKeyToAccount(`0x${PRIVATE_KEY!.replace(/^0x/, "")}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(RPC_URL),
    });

    const txHash = await walletClient.writeContract({
      address: ANCHOR_ADDRESS!,
      abi: ANCHOR_ABI,
      functionName: "anchor",
      args: [BigInt(agentId), contentHash, category],
    });

    console.log(`[anchor] On-chain tx submitted: ${txHash}`);

    // 3. Wait for transaction confirmation (max 60s)
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
        timeout: 60_000,
      });

      if (receipt.status === "reverted") {
        console.error(`[anchor] TX reverted on-chain: ${txHash}`);
        return null;
      }

      console.log(
        `[anchor] ✓ Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`
      );
    } catch (waitErr) {
      console.warn(
        `[anchor] TX confirmation timeout — recording anyway: ${(waitErr as Error).message}`
      );
      // Still return the hash — the tx may confirm later
    }

    return {
      ipfsCid: pinResult.ipfsHash,
      txHash,
      gatewayUrl: ipfsGatewayURL(pinResult.ipfsHash),
    };
  } catch (err) {
    console.error(`[anchor] Failed to anchor memory:`, (err as Error).message);
    return null;
  }
}

/**
 * Read the latest anchor for an agent from the chain.
 */
export async function getLatestAnchor(agentId: number) {
  if (!ANCHOR_ADDRESS) return null;

  try {
    const count = await publicClient.readContract({
      address: ANCHOR_ADDRESS,
      abi: ANCHOR_ABI,
      functionName: "anchorCount",
      args: [BigInt(agentId)],
    });

    if (count === BigInt(0)) return null;

    const anchor = await publicClient.readContract({
      address: ANCHOR_ADDRESS,
      abi: ANCHOR_ABI,
      functionName: "getLatest",
      args: [BigInt(agentId)],
    });

    return {
      timestamp: Number(anchor.timestamp),
      contentHash: anchor.contentHash,
      previousAnchor: anchor.previousAnchor,
      category: anchor.category,
      totalAnchors: Number(count),
    };
  } catch {
    return null;
  }
}

/**
 * Read just the on-chain anchor count for an agent. Fast single-read.
 */
export async function getAnchorCount(agentId: number): Promise<number> {
  if (!ANCHOR_ADDRESS) return 0;

  try {
    const count = await publicClient.readContract({
      address: ANCHOR_ADDRESS,
      abi: ANCHOR_ABI,
      functionName: "anchorCount",
      args: [BigInt(agentId)],
    });
    return Number(count);
  } catch {
    return 0;
  }
}

/**
 * Read anchors from the chain (paginated).
 * Returns an array of on-chain anchor structs.
 */
export async function getOnChainAnchors(
  agentId: number,
  from = 0,
  count = 50
): Promise<
  Array<{
    timestamp: number;
    contentHash: string;
    previousAnchor: string;
    category: number;
    index: number;
  }>
> {
  if (!ANCHOR_ADDRESS) return [];

  try {
    const total = await publicClient.readContract({
      address: ANCHOR_ADDRESS,
      abi: ANCHOR_ABI,
      functionName: "anchorCount",
      args: [BigInt(agentId)],
    });

    if (total === BigInt(0)) return [];

    const readCount = Math.min(count, Number(total) - from);
    if (readCount <= 0) return [];

    const anchors = await publicClient.readContract({
      address: ANCHOR_ADDRESS,
      abi: ANCHOR_ABI,
      functionName: "getAnchors",
      args: [BigInt(agentId), BigInt(from), BigInt(readCount)],
    });

    return (anchors as Array<{
      timestamp: bigint;
      contentHash: string;
      previousAnchor: string;
      category: number;
    }>).map((a, i) => ({
      timestamp: Number(a.timestamp),
      contentHash: a.contentHash,
      previousAnchor: a.previousAnchor,
      category: a.category,
      index: from + i,
    }));
  } catch {
    return [];
  }
}
