---
name: {{NAME}}
description: {{DESCRIPTION}}
user-invocable: true
disable-model-invocation: false
allowed-tools: ["Bash(npx awal@2.0.3 x402 pay *)", "Bash(npx awal@2.0.3 status*)"]
---

# {{NAME}}

**Category:** monetization | **Risk:** medium

{{DESCRIPTION}}

## Prerequisites

Ensure wallet is authenticated:

```bash
npx awal@2.0.3 status
```

If not authenticated, use the `authenticate-wallet` skill first.

Check balance:

```bash
npx awal@2.0.3 balance
```

## Command Syntax

```bash
npx awal@2.0.3 x402 pay "{{ENDPOINT_URL}}" \
  -X {{METHOD}} \
  {{#if HAS_BODY}}-d '{{BODY_TEMPLATE}}' \{{/if}}
  --max-amount {{MAX_AMOUNT}} \
  --json
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `endpoint` | string | yes | The x402-protected endpoint URL |
| `method` | string | no | HTTP method (default: GET) |
| `body` | object | no | Request body (for POST/PUT) |
| `maxAmount` | number | no | Max USDC payment in atomic units (default: 10000 = $0.01) |

## Pricing

| Tier | Price | Description |
| --- | --- | --- |
| Standard | {{STANDARD_PRICE}} USDC | {{STANDARD_DESCRIPTION}} |
| Premium | {{PREMIUM_PRICE}} USDC | {{PREMIUM_DESCRIPTION}} |

## Response Format

```json
{
  "paymentVerified": true,
  "data": {},
  "cost": "0.01",
  "txHash": "0x..."
}
```

## Error Handling

- **402 Payment Required**: Endpoint requires payment — check balance and max amount
- **403 Forbidden**: Wallet not authorized for this endpoint
- **Payment exceeded max**: Abort — do NOT auto-increase max amount
- **Network error**: Report and suggest retry

## Safety Notes

- Always set `--max-amount` to cap spending
- Never auto-approve payments above $1.00 without user confirmation
- Log all payment transactions for audit trail
- Verify endpoint is on the bazaar or known-good list before paying
