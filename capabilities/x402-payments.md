# x402 Autonomous Payment Protocol

Reference for integrating **x402** — Coinbase's open payment protocol — with the XmetaV agent system.

> Source: https://github.com/coinbase/x402

## What is x402?

x402 enables instant, automatic **stablecoin payments over HTTP**. Instead of API keys or subscriptions, agents pay for exactly what they use via on-chain USDC settlement on Base.

### Why it matters for XmetaV

- Agents (`main`, `akua`, `basedintern`) can **autonomously transact** without human intervention
- Pay-as-you-go monetization for premium agent services
- Integrates with XMTP for chat-based commerce agents
- Instant on-chain settlement on Base network

## Protocol Flow

```
Client ──GET──▶ Server
                 │
              402 Payment Required
              (PAYMENT-REQUIRED header)
                 │
Client ◀────────┘
  │
  ├── Sign payment (USDC on Base via EVM)
  │
Client ──GET──▶ Server (PAYMENT-SIGNATURE header)
                 │
              200 OK + PAYMENT-RESPONSE header
```

1. **Request** — Client hits a protected endpoint
2. **402 Response** — Server returns payment requirements via `PAYMENT-REQUIRED` header
3. **Pay** — Client selects a payment scheme/network and signs payment on-chain
4. **Retry** — Client retries with `PAYMENT-SIGNATURE` header containing the payment payload
5. **Verify & Settle** — Server verifies via facilitator, settles on-chain, returns content

## Dependencies

```bash
# Server (Express)
npm i @x402/express @x402/core @x402/evm express

# Client (Fetch wrapper)
npm i @x402/fetch @x402/core @x402/evm viem
```

## Environment Variables

```bash
# Client (agent wallet)
EVM_PRIVATE_KEY=0x...         # Private key for the agent wallet (Base)
X402_BUDGET_LIMIT=1.00        # Max payment per request in USD

# Server (payment recipient)
EVM_ADDRESS=0x...              # Address receiving payments
FACILITATOR_URL=https://x402.org/facilitator  # Coinbase facilitator
```

## Server-Side Setup (Payment Gating)

Apply x402 middleware to protect endpoints with micro-payments:

```typescript
import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

const app = express();
const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL!,
});

// Gate endpoints with USDC pricing on Base Sepolia
app.use(paymentMiddleware(
  {
    "GET /weather": {
      accepts: [{
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",   // Base Sepolia
        payTo: evmAddress,
      }],
      description: "Weather data",
      mimeType: "application/json",
    },
    "GET /nft-floor/:collection": {
      accepts: [{
        scheme: "exact",
        price: "$0.01",
        network: "eip155:84532",
        payTo: evmAddress,
      }],
      description: "NFT floor price data",
      mimeType: "application/json",
    },
  },
  new x402ResourceServer(facilitatorClient)
    .register("eip155:84532", new ExactEvmScheme()),
));

app.get('/nft-floor/:collection', (req, res) => {
  res.json({
    collection: req.params.collection,
    floorPrice: "2.450",
    currency: 'ETH',
    timestamp: new Date().toISOString()
  });
});

app.listen(4021, () => console.log('x402 server on :4021'));
```

## Client-Side Setup (Paying for Services)

Use `@x402/fetch` to wrap fetch calls with automatic payment handling:

```typescript
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// This automatically handles 402 -> sign -> retry
const response = await fetchWithPayment('http://localhost:4021/weather');
const data = await response.json();
```

### XMTP Chat Agent with x402

```typescript
import { Agent } from '@xmtp/agent-sdk';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const agent = await Agent.createFromEnv({ env: 'production' });

agent.on('text', async (ctx) => {
  const content = ctx.message.content.toLowerCase();

  if (content.includes('floor price')) {
    const collection = extractCollection(content);
    if (!collection) {
      await ctx.sendText("Please specify an NFT collection.");
      return;
    }
    try {
      const res = await fetchWithPayment(`http://localhost:4021/nft-floor/${collection}`);
      const data = await res.json();
      await ctx.sendText(`Result: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      await ctx.sendText(`Payment error: ${error.message}`);
    }
  } else {
    await ctx.sendText("I can help with NFT floor prices. Just ask!");
  }
});

await agent.start();
```

## Error Handling Best Practices

| Scenario | Response |
|----------|----------|
| Payment timeout (>30s) | Retry or notify user |
| Insufficient funds | Prompt to fund wallet |
| High amount (>$1.00) | Safety check, skip by default |
| Invalid payment details | Reject and log |
| Service unavailable after payment | Refund or retry |

## Security Checklist

- Never expose private keys in code — use env vars only
- Set maximum payment thresholds per request
- Rate-limit payment attempts
- Log all payment activities for audit
- Verify on-chain settlement before delivering premium content

## Integration with XmetaV Agents

### Which agents can use x402

| Agent | Role | x402 Use Case |
|-------|------|---------------|
| `main` | Orchestrator | Delegates x402 tasks, manages payment budgets |
| `akua` | Solidity/Base agent | Implements x402 server-side (payment gating), deploys contracts |
| `akua_web` | Full-tools variant | Interacts with x402-gated APIs via browser/web |
| `basedintern` | TypeScript agent | Builds x402 client integrations, XMTP agents |
| `basedintern_web` | Full-tools variant | Tests x402 flows in browser |

### Swarm pattern: x402 service deployment

```bash
# Pipeline: akua deploys the payment-gated service, basedintern builds the client
./scripts/swarm.sh --pipeline \
  akua "Deploy the x402 payment middleware on the NFT floor price API" \
  basedintern "Build an XMTP chat agent that uses the x402-gated API"
```

### Intent Layer example

When using the Intent page, describe your goal and the system will generate commands:

> Goal: "Set up an x402 payment-gated API for NFT data and build a chat agent that can pay for it"

The Intent Layer will generate commands targeting `akua` (server-side) and `basedintern` (client-side).

## Networks

| Network | Chain ID (CAIP-2) | Use |
|---------|-------------------|-----|
| Base Sepolia | `eip155:84532` | Testnet (development) |
| Base Mainnet | `eip155:8453` | Production |

## Resources

| Resource | URL |
|----------|-----|
| x402 Protocol Docs | https://docs.cdp.coinbase.com/x402/welcome |
| x402.org | https://www.x402.org |
| x402 GitHub | https://github.com/coinbase/x402 |
| XMTP Documentation | https://docs.xmtp.org |
| Base Docs | https://docs.base.org |
| Server SDK | `npm i @x402/express @x402/core @x402/evm` |
| Client SDK | `npm i @x402/fetch @x402/core @x402/evm` |
| EVM Wallet | `npm i viem` |
