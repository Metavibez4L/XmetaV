# ERC-8004 Trustless Agent Identity

Reference for integrating **ERC-8004** — the on-chain agent identity and reputation protocol — with XmetaV.

> Source: https://eips.ethereum.org/EIPS/eip-8004
> Contracts: https://github.com/erc-8004/erc-8004-contracts

**XmetaV Status:** Registered as Agent **#16905** on Base Mainnet (2026-02-12). See [ERC8004-SCAN.md](../docs/ERC8004-SCAN.md) for the full registry scan.

## What is ERC-8004?

ERC-8004 provides **portable, on-chain identities** for autonomous agents. It defines three registries:

1. **Identity Registry** — ERC-721 NFT-based agent identifiers with metadata
2. **Reputation Registry** — standardized feedback signals (scores, ratings, reviews)
3. **Validation Registry** — hooks for independent validator checks (TEE, zkML, stakers)

### Why it matters for XmetaV

- The `main` agent (named "XmetaV" on-chain) gets a **verifiable identity** on Base
- Other agents and protocols can **discover** XmetaV via the registry
- Reputation signals from x402 payment interactions build **on-chain trust**
- The agent NFT is **portable** — works across any ERC-8004 compatible platform

## Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

Same addresses on Base Sepolia (testnet):

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

## Registration Flow

```
1. Create wallet (EVM_PRIVATE_KEY — same as x402)
         │
2. Call IdentityRegistry.register(agentURI)
         │ — mints ERC-721 NFT
         │ — sets agentWallet = msg.sender
         │ — returns agentId (tokenId)
         │
3. Host registration.json (IPFS or HTTPS)
         │
4. Call setAgentURI(agentId, hostedURL)
         │
5. Agent is now discoverable on-chain
```

### Registration Script (one-time — already done)

```bash
cd dashboard/erc8004 && npm install && npx tsx register.ts
```

This will:
- Read `EVM_PRIVATE_KEY` from `dashboard/bridge/.env`
- Call `register()` on Base mainnet
- Save the `agentId` to `dashboard/erc8004/agent-config.json`
- Update `registration.json` with the on-chain reference

### Set / Update Metadata URI

```bash
cd dashboard/erc8004
npx tsx update-uri.ts
# defaults to raw GitHub URL for metadata.json
# or pass a custom URI:
# npx tsx update-uri.ts "https://example.com/metadata.json"
```

This calls `setAgentURI(16905, uri)` on Base Mainnet, making XmetaV discoverable.

### Agent Registration Metadata

The `agentURI` (tokenURI) points to a JSON file following the ERC-8004 spec:

```json
{
  "type": "erc8004:agent-registration:1.0",
  "name": "XmetaV",
  "description": "Orchestrator agent for the XmetaV multi-agent system...",
  "image": "",
  "services": [
    { "type": "x402", "url": "http://localhost:4021", "description": "Payment-gated API" },
    { "type": "dashboard", "url": "http://localhost:3000", "description": "Control Plane" }
  ],
  "registrations": [
    { "agentRegistry": "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "agentId": "16905" }
  ],
  "supportedTrust": ["reputation", "x402-payment-history", "on-chain-identity"],
  "capabilities": ["agent-orchestration", "swarm-execution", "x402-payments", "persistent-agent-memory"]
}
```

## Identity Registry Functions

### Write (requires wallet)

| Function | Description |
|----------|-------------|
| `register()` | Mint agent NFT (no URI) |
| `register(string agentURI)` | Mint agent NFT with metadata URI |
| `setAgentURI(uint256 agentId, string newURI)` | Update metadata URI |
| `setMetadata(uint256 agentId, string key, bytes value)` | Set custom metadata |
| `setAgentWallet(uint256 agentId, address wallet, uint256 deadline, bytes sig)` | Verify + set receiving wallet |

### Read (public, no wallet needed)

| Function | Description |
|----------|-------------|
| `ownerOf(uint256 tokenId)` | NFT owner address |
| `tokenURI(uint256 tokenId)` | Agent metadata URI |
| `getAgentWallet(uint256 agentId)` | Verified wallet address |
| `getMetadata(uint256 agentId, string key)` | Custom metadata |
| `isAuthorizedOrOwner(address, uint256 agentId)` | Authorization check |

## Reputation Registry Functions

| Function | Description |
|----------|-------------|
| `giveFeedback(agentId, value, decimals, tag1, tag2, ...)` | Post feedback |
| `getSummary(agentId, clientAddresses[], tag1, tag2)` | Aggregate score |
| `readFeedback(agentId, clientAddress, index)` | Read specific feedback |
| `revokeFeedback(agentId, index)` | Revoke own feedback |

### Interpreting scores

Feedback uses signed fixed-point: `value` + `valueDecimals`.
- `value=9977, decimals=2` → score of `99.77`
- `value=5, decimals=0` → score of `5`

## Integration with x402

ERC-8004 identity and x402 payments are complementary:

| Feature | ERC-8004 | x402 |
|---------|----------|------|
| Purpose | Discovery + trust | Payments |
| On-chain data | Agent NFT + reputation | USDC settlement |
| Wallet | Same `EVM_PRIVATE_KEY` | Same `EVM_PRIVATE_KEY` |
| Network | Base mainnet | Base mainnet/Sepolia |

After x402 payment interactions, clients can post reputation feedback to the Reputation Registry, building the agent's on-chain trust score.

## Dashboard

The `/identity` page in the dashboard shows:
- Agent NFT details (ID, owner, wallet, URI)
- Registration status (on-chain / not registered)
- Capabilities and services from `registration.json`
- Trust model
- Direct links to BaseScan

## Environment Variables

```bash
# In dashboard/bridge/.env (already configured)
EVM_PRIVATE_KEY=0x...        # Same wallet for both x402 and ERC-8004

# After registration — add to bridge/.env
ERC8004_AGENT_ID=<tokenId>   # The agentId returned by register()
```

## XmetaV Agent Mapping

| On-chain name | Repo agent ID | Role |
|---------------|---------------|------|
| XmetaV | `main` | Orchestrator — the registered ERC-8004 identity |
| (future) | `akua` | Could register separately for Solidity/Base work |
| (future) | `basedintern` | Could register separately for TypeScript work |

## Resources

| Resource | URL |
|----------|-----|
| ERC-8004 Spec | https://eips.ethereum.org/EIPS/eip-8004 |
| Contracts Repo | https://github.com/erc-8004/erc-8004-contracts |
| 8004.org | https://www.8004.org |
| Base Mainnet Explorer | https://basescan.org |
| create-8004-agent CLI | `npx create-8004-agent` |
