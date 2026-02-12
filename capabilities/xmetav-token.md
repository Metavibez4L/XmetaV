# $XMETAV Token

ERC-20 token on Base Mainnet powering the XmetaV agent orchestration platform. Hold XMETAV for tiered discounts on x402-gated endpoints and increased daily spend limits.

## Token Details

| Property | Value |
|----------|-------|
| Name | XmetaV |
| Symbol | XMETAV |
| Standard | ERC-20 |
| Network | Base Mainnet (chain ID 8453) |
| Contract | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` |
| Total Supply | 1,000,000,000 (1B) |
| Decimals | 18 |
| Deployer | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` |
| Minting | Fixed supply — no additional minting |

## Tier System

Token balance determines discount on x402 payment-gated endpoints:

| Tier | Min Balance | Discount | Daily Limit |
|------|-------------|----------|-------------|
| None | 0 | 0% | $5 |
| Bronze | 1,000 | 10% | $25 |
| Silver | 10,000 | 20% | $100 |
| Gold | 100,000 | 35% | $500 |
| Diamond | 1,000,000 | 50% | $2,000 |

## Holder Benefits

- **x402 Endpoint Discounts**: Up to 50% off all payment-gated agent, intent, swarm, and voice endpoints
- **Higher Daily Limits**: Diamond holders can spend up to $2,000/day vs $5 for non-holders
- **Priority Processing**: Higher-tier requests are prioritized in the agent queue
- **On-Chain Identity**: Token linked to ERC-8004 agent identity on Base Mainnet

## Dashboard Integration

### Token Page (`/token`)

Dedicated dashboard page showing:
- Token overview (name, symbol, supply, contract address with BaseScan link)
- Agent wallet balance and current tier
- Full tier table with "CURRENT" indicator
- Holder benefits description

### Identity Page (`/identity`)

The "Agent Wallet & x402 Payments" section now shows:
- XMETAV balance of the agent wallet
- Current tier badge with color
- Discount percentage

### Payments Page (`/payments`)

Stats cards include a "Token Tier" card showing:
- Current tier name and color
- Discount percentage
- XMETAV balance

## API

### GET /api/token

Returns token info and tier table. Add `?wallet=0x...` to include balance and tier for a specific wallet.

**Response (with wallet)**:
```json
{
  "token": {
    "name": "XmetaV",
    "symbol": "XMETAV",
    "decimals": 18,
    "address": "0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54",
    "network": "eip155:8453",
    "chainId": 8453,
    "totalSupply": 1000000000
  },
  "tiers": [...],
  "wallet": {
    "address": "0x...",
    "balance": 1000000,
    "tier": "Diamond",
    "discount": "50%",
    "dailyLimit": "$2000",
    "tierColor": "#b9f2ff"
  }
}
```

### GET /token-info (x402 server, port 4021)

Free endpoint on the x402 server returning token contract address and tier table.

## x402 Server Integration

The x402 server checks the caller's XMETAV balance on-chain before processing gated requests:

1. Caller sends `X-Caller-Address` header with their wallet address
2. Server reads `balanceOf()` from the XMETAV contract
3. Tier discount is applied to the endpoint price
4. Response includes `X-Token-Tier` and `X-Token-Discount` headers

## Smart Contract

Minimal ERC-20 using OpenZeppelin:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract XMETAV is ERC20, Ownable {
    constructor() ERC20("XmetaV", "XMETAV") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }
}
```

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `XMETAV_TOKEN_ADDRESS` | `dashboard/.env.local` | Deployed contract address |
| `XMETAV_TOKEN_ADDRESS` | `x402-server/.env` | Same address for tier checks |
| `EVM_PRIVATE_KEY` | `token/.env` | For deployment only |

## File Structure

```
dashboard/
  token/
    contracts/XMETAV.sol              # ERC-20 contract
    scripts/deploy.ts                 # Hardhat deploy script
    hardhat.config.ts                 # Base Mainnet network config
    token-config.json                 # Deployed contract details
    package.json                      # Hardhat dependencies
  src/
    lib/token-tiers.ts                # Tier definitions and helpers
    app/api/token/route.ts            # Token API route
    app/(dashboard)/token/page.tsx    # Token dashboard page
    components/TokenDashboard.tsx     # Token page component
  x402-server/index.ts               # Token tier middleware + /token-info
```
