// ============================================================
// ERC-8004 Registry Scout — On-Chain Query Layer
// Oracle's eyes on the Base agent ecosystem
// ============================================================

import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { base } from "viem/chains";
import type {
  OnChainAgent,
  AgentReputation,
  AgentMetadata,
} from "./types/erc8004";

// ── Contract Addresses ──────────────────────────────────────
export const IDENTITY_REGISTRY_ADDRESS =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const REPUTATION_REGISTRY_ADDRESS =
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

// ── Minimal ABIs (only the functions the scout needs) ───────
const IDENTITY_ABI = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getAgentWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const REPUTATION_ABI = [
  {
    name: "getSummary",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

// ---- Shared viem client ----

const RPC_URL = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs";

export const scoutClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL, { timeout: 15_000 }),
});

// ---- Identity reads ----

/**
 * Read a single agent's identity from the IdentityRegistry.
 * Returns exists: false if the agent ID has not been minted.
 */
export async function getAgentIdentity(
  agentId: bigint
): Promise<OnChainAgent> {
  try {
    const [owner, agentWallet, tokenURI] = await Promise.all([
      scoutClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_ABI,
        functionName: "ownerOf",
        args: [agentId],
      }),
      scoutClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_ABI,
        functionName: "getAgentWallet",
        args: [agentId],
      }),
      scoutClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_ABI,
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
    return { agentId, owner: "", agentWallet: "", tokenURI: "", exists: false };
  }
}

/**
 * Batch-scan a range of agent IDs.
 * Uses concurrent reads with a concurrency limiter.
 */
export async function scanAgentRange(
  from: number,
  to: number,
  concurrency = 5
): Promise<OnChainAgent[]> {
  const ids: bigint[] = [];
  for (let i = from; i <= to; i++) ids.push(BigInt(i));

  const results: OnChainAgent[] = [];

  // Process in batches to avoid overwhelming the RPC
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((id) => getAgentIdentity(id))
    );
    results.push(...batchResults);
  }

  return results;
}

// ---- Event scanning ----

const REGISTERED_EVENT = parseAbiItem(
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"
);

/**
 * Scan for Registered events within a block range.
 * Useful for discovering new agents since the last scan.
 */
export async function scanRegisteredEvents(
  fromBlock: bigint,
  toBlock?: bigint
): Promise<
  Array<{
    agentId: bigint;
    agentURI: string;
    owner: string;
    blockNumber: bigint;
    txHash: string;
  }>
> {
  const logs: Log[] = await scoutClient.getLogs({
    address: IDENTITY_REGISTRY_ADDRESS,
    event: REGISTERED_EVENT,
    fromBlock,
    toBlock: toBlock || "latest",
  });

  return logs.map((log) => {
    const args = (log as unknown as { args: { agentId: bigint; agentURI: string; owner: string } }).args;
    return {
      agentId: args.agentId,
      agentURI: args.agentURI,
      owner: args.owner,
      blockNumber: log.blockNumber ?? BigInt(0),
      txHash: log.transactionHash ?? "",
    };
  });
}

/**
 * Get the latest block number on Base.
 */
export async function getLatestBlock(): Promise<bigint> {
  return scoutClient.getBlockNumber();
}

// ---- Reputation reads ----

/**
 * Read an agent's reputation summary.
 * Pass empty clientAddresses to get global summary (if the contract allows).
 */
export async function getAgentReputation(
  agentId: bigint,
  clientAddresses: `0x${string}`[] = []
): Promise<AgentReputation> {
  try {
    const [count, summaryValue, summaryValueDecimals] =
      (await scoutClient.readContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_ABI,
        functionName: "getSummary",
        args: [agentId, clientAddresses, "", ""],
      })) as [bigint, bigint, number];

    const divisor = 10 ** summaryValueDecimals;
    const score = divisor > 0 ? Number(summaryValue) / divisor : 0;

    return {
      count: Number(count),
      score,
      decimals: summaryValueDecimals,
      displayScore: score.toFixed(summaryValueDecimals),
    };
  } catch {
    return { count: 0, score: 0, decimals: 0, displayScore: "0" };
  }
}

// ---- Metadata fetching ----

/**
 * Fetch and parse agent metadata from a tokenURI.
 * Supports IPFS (gateway) and HTTP URIs.
 */
export async function fetchAgentMetadata(
  tokenURI: string
): Promise<AgentMetadata | null> {
  if (!tokenURI) return null;

  let url = tokenURI;
  // Resolve IPFS URIs through public gateway
  if (url.startsWith("ipfs://")) {
    url = `https://gateway.pinata.cloud/ipfs/${url.slice(7)}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    return {
      name: data.name || data.agent_name || undefined,
      type: data.type || data.agent_type || undefined,
      description: data.description || undefined,
      capabilities: extractCapabilities(data),
      fleet: data.fleet || data.fleet_members || undefined,
      contracts: data.contracts || undefined,
      wallet: data.wallet?.address || data.wallet || undefined,
      ...data,
    };
  } catch {
    return null;
  }
}

/**
 * Extract capability tags from arbitrary metadata shapes.
 */
function extractCapabilities(data: Record<string, unknown>): string[] {
  // Direct capabilities array
  if (Array.isArray(data.capabilities)) return data.capabilities as string[];

  // Nested in skills
  if (Array.isArray(data.skills)) {
    return (data.skills as Array<{ id?: string; name?: string }>).map(
      (s) => s.id || s.name || String(s)
    );
  }

  // From fleet member roles
  if (Array.isArray(data.fleet)) {
    return (data.fleet as Array<{ role?: string }>)
      .map((f) => f.role)
      .filter(Boolean) as string[];
  }

  return [];
}

// ---- Utilities ----

/**
 * Check if an agent ID exists on the registry (fast single read).
 */
export async function agentExists(agentId: bigint): Promise<boolean> {
  try {
    await scoutClient.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the BaseScan URL for an agent's registration transaction.
 */
export function basescanAgentUrl(agentId: number): string {
  return `https://basescan.org/token/${IDENTITY_REGISTRY_ADDRESS}?a=${agentId}`;
}

/**
 * Get the BaseScan URL for a wallet address.
 */
export function basescanWalletUrl(address: string): string {
  return `https://basescan.org/address/${address}`;
}
