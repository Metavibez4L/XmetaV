import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
  IDENTITY_REGISTRY_ABI,
  IDENTITY_REGISTRY_ADDRESS,
} from "../abis/IdentityRegistry.js";
import {
  REPUTATION_REGISTRY_ABI,
  REPUTATION_REGISTRY_ADDRESS,
} from "../abis/ReputationRegistry.js";

// ============================================================
// ERC-8004 Read Client
// Public (read-only) viem client for querying Base mainnet
// ============================================================

export const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// ---- Identity Registry ----

export interface AgentIdentity {
  agentId: bigint;
  owner: string;
  agentWallet: string;
  tokenURI: string;
  exists: boolean;
}

/**
 * Read a registered agent's identity from the on-chain registry.
 */
export async function getAgentIdentity(agentId: bigint): Promise<AgentIdentity> {
  try {
    const [owner, agentWallet, tokenURI] = await Promise.all([
      publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "ownerOf",
        args: [agentId],
      }),
      publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "getAgentWallet",
        args: [agentId],
      }),
      publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "tokenURI",
        args: [agentId],
      }),
    ]);

    return {
      agentId,
      owner: owner as string,
      agentWallet: agentWallet as string,
      tokenURI: tokenURI as string,
      exists: true,
    };
  } catch {
    return {
      agentId,
      owner: "",
      agentWallet: "",
      tokenURI: "",
      exists: false,
    };
  }
}

/**
 * Read on-chain metadata for an agent.
 */
export async function getAgentMetadata(
  agentId: bigint,
  key: string
): Promise<string> {
  const data = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getMetadata",
    args: [agentId, key],
  });
  return data as string;
}

/**
 * Get the registry contract version.
 */
export async function getRegistryVersion(): Promise<string> {
  const version = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getVersion",
  });
  return version as string;
}

// ---- Reputation Registry ----

export interface ReputationSummary {
  count: bigint;
  summaryValue: bigint;
  summaryValueDecimals: number;
  displayScore: string;
}

/**
 * Get aggregated reputation for an agent from specific client addresses.
 * Note: ERC-8004 requires non-empty clientAddresses to reduce Sybil risk.
 */
export async function getAgentReputation(
  agentId: bigint,
  clientAddresses: `0x${string}`[],
  tag1 = "",
  tag2 = ""
): Promise<ReputationSummary> {
  try {
    const [count, summaryValue, summaryValueDecimals] = (await publicClient.readContract({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, clientAddresses, tag1, tag2],
    })) as [bigint, bigint, number];

    const divisor = 10 ** summaryValueDecimals;
    const displayScore =
      divisor > 0
        ? (Number(summaryValue) / divisor).toFixed(summaryValueDecimals)
        : summaryValue.toString();

    return { count, summaryValue, summaryValueDecimals, displayScore };
  } catch {
    return {
      count: BigInt(0),
      summaryValue: BigInt(0),
      summaryValueDecimals: 0,
      displayScore: "0",
    };
  }
}

// ---- Constants ----

export const CONTRACTS = {
  identityRegistry: IDENTITY_REGISTRY_ADDRESS,
  reputationRegistry: REPUTATION_REGISTRY_ADDRESS,
  network: "eip155:8453",
  chainId: 8453,
  explorer: "https://basescan.org",
} as const;
