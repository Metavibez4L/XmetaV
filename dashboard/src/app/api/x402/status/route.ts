import { NextResponse } from "next/server";

/**
 * GET /api/x402/status
 *
 * Returns the x402 payment configuration status.
 * This endpoint is public — it shows what x402 capabilities are available
 * without revealing sensitive configuration (no private keys, etc.).
 */
export async function GET() {
  const hasPayeeAddress = !!process.env.X402_PAYEE_ADDRESS;
  const network = process.env.X402_NETWORK || "base-sepolia";

  return NextResponse.json({
    x402: {
      version: 2,
      protocol: "x402",
      description: "XmetaV agent orchestration with x402 autonomous USDC payments",
    },
    capabilities: {
      client: {
        enabled: !!process.env.AGENT_WALLET_PRIVATE_KEY,
        description: "Auto-pay for 402-gated APIs",
        network,
      },
      gateway: {
        enabled: hasPayeeAddress,
        description: "Pay-per-request API gateway (USDC)",
        payeeAddress: hasPayeeAddress ? process.env.X402_PAYEE_ADDRESS : null,
        network,
      },
    },
    endpoints: {
      "/api/commands": {
        gated: false,
        description: "Agent command dispatch (auth required)",
      },
      "/api/intent": {
        gated: false,
        description: "Intent layer — AI planning (auth required)",
      },
      "/api/swarms": {
        gated: false,
        description: "Multi-agent swarm orchestration (auth required)",
      },
    },
    docs: "https://github.com/coinbase/x402",
  });
}
