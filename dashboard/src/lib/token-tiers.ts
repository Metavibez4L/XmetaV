/**
 * $XMETAV token tier system.
 *
 * Holding XMETAV tokens grants tiered discounts on x402-gated endpoints
 * and increased daily spend limits.
 */

// ── Token contract details ──

export const XMETAV_TOKEN = {
  name: "XmetaV",
  symbol: "XMETAV",
  decimals: 18,
  address: process.env.XMETAV_TOKEN_ADDRESS ?? "0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54",
  network: "eip155:8453",
  chainId: 8453,
};

// ── Tier definitions ──

export interface TokenTier {
  name: string;
  minBalance: number;       // minimum XMETAV tokens (whole units)
  discount: number;         // 0.0 – 1.0 (e.g. 0.1 = 10 % off)
  dailyLimit: number;       // max daily spend in USD
  color: string;            // hex color for UI
}

export const TIERS: TokenTier[] = [
  { name: "None",    minBalance: 0,         discount: 0,    dailyLimit: 5,    color: "#4a6a8a" },
  { name: "Bronze",  minBalance: 1_000,     discount: 0.10, dailyLimit: 25,   color: "#cd7f32" },
  { name: "Silver",  minBalance: 10_000,    discount: 0.20, dailyLimit: 100,  color: "#c0c0c0" },
  { name: "Gold",    minBalance: 100_000,   discount: 0.35, dailyLimit: 500,  color: "#ffd700" },
  { name: "Diamond", minBalance: 1_000_000, discount: 0.50, dailyLimit: 2000, color: "#b9f2ff" },
];

// ── Helpers ──

/**
 * Get the tier for a given token balance (in whole XMETAV units, not wei).
 */
export function getTier(balance: number): TokenTier {
  // Walk from highest to lowest so the first match is the best tier
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (balance >= TIERS[i].minBalance) {
      return TIERS[i];
    }
  }
  return TIERS[0]; // fallback: no tier
}

/**
 * Convert a raw wei-style bigint balance (18 decimals) to whole token units.
 */
export function formatTokenBalance(rawBalance: bigint): number {
  return Number(rawBalance / BigInt(10 ** XMETAV_TOKEN.decimals));
}

/**
 * Apply a tier discount to a USD price string like "$0.10".
 * Returns the discounted price string.
 */
export function applyDiscount(priceStr: string, tier: TokenTier): string {
  const match = priceStr.match(/\$?([\d.]+)/);
  if (!match) return priceStr;
  const original = parseFloat(match[1]);
  const discounted = original * (1 - tier.discount);
  return `$${discounted.toFixed(4)}`;
}

// Minimal ERC-20 ABI for balanceOf / totalSupply reads
export const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
