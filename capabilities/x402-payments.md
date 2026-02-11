# x402 Autonomous Payment Protocol

Reference for integrating **x402** — Coinbase's open payment protocol — with the XmetaV agent system.

> Source: https://docs.base.org/base-app/agents/x402-agents

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
              (amount, recipient, reference)
                 │
Client ◀────────┘
  │
  ├── Execute payment (USDC on Base)
  │
Client ──GET──▶ Server (X-PAYMENT header)
                 │
              200 OK + X-PAYMENT-RESPONSE
```

1. **Request** — Client hits a protected endpoint
2. **402 Response** — Server returns payment details (amount, recipient, reference)
3. **Pay** — Client signs and sends USDC payment on-chain
4. **Retry** — Client retries with `X-PAYMENT` header containing the payment payload
5. **Deliver** — Server verifies payment and returns content

## Dependencies

```bash
npm i @xmtp/agent-sdk @coinbase/x402-sdk
```

## Environment Variables

```bash
XMTP_WALLET_KEY=         # Private key for the agent wallet
XMTP_DB_ENCRYPTION_KEY=  # Encryption key for local XMTP database
XMTP_ENV=production      # local, dev, production
NETWORK=base             # Blockchain network for payments
```

## Server-Side Setup (Payment Gating)

Apply x402 middleware to protect endpoints with micro-payments:

```typescript
import express from 'express';
import { paymentMiddleware } from '@coinbase/x402-middleware';

const app = express();

// Gate endpoints with pricing
app.use(paymentMiddleware(process.env.PAYMENT_ADDRESS, {
  "/api/nft-floor/*": "$0.01",
  "/api/market-data/*": "$0.005"
}));

app.get('/api/nft-floor/:collection', (req, res) => {
  res.json({
    collection: req.params.collection,
    floorPrice: "2.450",
    currency: 'ETH',
    timestamp: new Date().toISOString()
  });
});
```

## Agent-Side Integration (XMTP + x402)

### Basic Payment Handler

```typescript
import { Agent } from '@xmtp/agent-sdk';
import { PaymentFacilitator } from '@coinbase/x402-sdk';

const facilitator = new PaymentFacilitator({
  privateKey: process.env.XMTP_WALLET_KEY!,
  network: process.env.NETWORK || 'base'
});

async function handlePaidRequest(ctx: any, endpoint: string) {
  const response = await fetch(endpoint);

  if (response.status === 402) {
    const paymentDetails = await response.json();
    await ctx.sendText(`Payment required: ${paymentDetails.amount} USDC. Processing...`);

    // Execute on-chain payment
    const payment = await facilitator.createPayment({
      amount: paymentDetails.amount,
      recipient: paymentDetails.recipient,
      reference: paymentDetails.reference,
      currency: 'USDC'
    });

    // Retry with payment proof
    const retryResponse = await fetch(endpoint, {
      headers: { "X-PAYMENT": payment.payload }
    });

    if (retryResponse.ok) {
      const data = await retryResponse.json();
      await ctx.sendText(`Data: ${JSON.stringify(data)}`);
    }
  } else if (response.ok) {
    const data = await response.json();
    await ctx.sendText(`Data: ${JSON.stringify(data)}`);
  }
}
```

### Full XMTP Chat Agent with x402

```typescript
import { Agent } from '@xmtp/agent-sdk';
import { PaymentFacilitator } from '@coinbase/x402-sdk';

const facilitator = new PaymentFacilitator({
  privateKey: process.env.XMTP_WALLET_KEY!,
  network: process.env.NETWORK || 'base'
});

const agent = await Agent.createFromEnv({ env: 'production' });

agent.on('text', async (ctx) => {
  const content = ctx.message.content.toLowerCase();

  if (content.includes('floor price')) {
    await handleFloorPrice(ctx, content);
  } else if (content.includes('market data')) {
    await handleMarketData(ctx, content);
  } else {
    await ctx.sendText("I can help with:\n- NFT floor prices\n- Market data\n\nJust ask!");
  }
});

async function handleFloorPrice(ctx: any, content: string) {
  const collection = extractCollection(content);
  if (!collection) {
    await ctx.sendText("Please specify an NFT collection.");
    return;
  }
  await processPaymentAndRetry(ctx, `/api/nft-floor/${collection}`);
}

async function processPaymentAndRetry(ctx: any, endpoint: string) {
  try {
    const response = await fetch(endpoint);

    if (response.status === 402) {
      const details = await response.json();

      // Safety check
      if (parseFloat(details.amount) > 1.0) {
        await ctx.sendText(`High payment: ${details.amount} USDC. Skipping.`);
        return;
      }

      await ctx.sendText(`Payment: ${details.amount} USDC. Processing...`);

      const payment = await facilitator.createPayment({
        amount: details.amount,
        recipient: details.recipient,
        reference: details.reference,
        currency: 'USDC'
      });

      const retry = await fetch(endpoint, {
        headers: { "X-PAYMENT": payment.payload }
      });

      if (retry.ok) {
        const data = await retry.json();
        await ctx.sendText(`Result: ${JSON.stringify(data, null, 2)}`);
      } else {
        await ctx.sendText("Payment processed but service error.");
      }
    } else if (response.ok) {
      const data = await response.json();
      await ctx.sendText(`Result: ${JSON.stringify(data, null, 2)}`);
    }
  } catch (error) {
    await ctx.sendText(`Payment error: ${error.message}`);
  }
}

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

## Resources

| Resource | URL |
|----------|-----|
| x402 Protocol Docs | https://docs.cdp.coinbase.com/x402/welcome |
| x402.org | https://www.x402.org |
| Coinbase x402 SDK | https://github.com/coinbase/x402 |
| XMTP Documentation | https://docs.xmtp.org |
| Base Docs (x402 Agents) | https://docs.base.org/base-app/agents/x402-agents |
| Agent SDK | `npm i @xmtp/agent-sdk` |
| x402 Middleware | `npm i @coinbase/x402-middleware` |
| x402 Client SDK | `npm i @coinbase/x402-sdk` |
