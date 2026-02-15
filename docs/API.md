# XmetaV x402 API Reference

> **Base URL**: `http://localhost:4021` (local) or your deployed host  
> **Network**: Base Mainnet (`eip155:8453`)  
> **Payment**: USDC via [x402 protocol](https://x402.org)  
> **Identity**: [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) on-chain agent registry

---

## Quick Start

```bash
# Check the server is up
curl http://localhost:4021/health

# Discover agent #16905's payment capabilities
curl http://localhost:4021/agent/16905/payment-info

# Check token discount tiers
curl http://localhost:4021/token-info
```

For gated endpoints, use the `@x402/fetch` client:

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetch402 = wrapFetchWithPayment(fetch, client);

// Automatically handles 402 → sign USDC → retry
const res = await fetch402("http://localhost:4021/fleet-status");
```

---

## Authentication & Payments

All gated endpoints use the **x402 protocol** — no API keys needed. The flow:

1. Client sends request to a gated endpoint
2. Server responds `402 Payment Required` with a `PAYMENT-REQUIRED` header
3. Client signs a USDC payment on Base Mainnet
4. Client retries with `PAYMENT-SIGNATURE` header
5. Server verifies via CDP facilitator, settles on-chain, returns response

### ERC-8004 Identity (Optional)

Include `X-Agent-Id: <tokenId>` header to identify your agent on-chain. The server resolves the caller via the ERC-8004 Identity Registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) and attaches identity metadata to the request.

### $XMETAV Token Discounts

Callers holding `$XMETAV` (`0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54`) get automatic discounts:

| Tier | Min Balance | Discount | Daily Limit |
|------|------------|----------|-------------|
| None | 0 | 0% | $5 |
| Bronze | 1,000 | 10% | $25 |
| Silver | 10,000 | 20% | $100 |
| Gold | 100,000 | 35% | $500 |
| Diamond | 1,000,000 | 50% | $2,000 |

---

## Free Endpoints

### `GET /health`

Service health and endpoint summary.

**Response** `200`:
```json
{
  "status": "ok",
  "service": "xmetav-x402",
  "version": "1.0.0",
  "network": "eip155:8453",
  "payTo": "0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80",
  "supabase": "connected",
  "voice": "enabled",
  "token": {
    "address": "0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54",
    "tiers": "enabled"
  },
  "endpoints": {
    "gated": {
      "POST /agent-task": "$0.10 — dispatch a task to an agent",
      "POST /intent": "$0.05 — resolve a goal into commands",
      "GET /fleet-status": "$0.01 — live agent fleet status",
      "POST /swarm": "$0.50 — launch multi-agent swarm",
      "POST /memory-crystal": "$0.05 — summon memory crystal",
      "POST /neural-swarm": "$0.10 — neural swarm delegation",
      "POST /fusion-chamber": "$0.15 — fuse memory crystals",
      "POST /cosmos-explore": "$0.20 — explore Memory Cosmos",
      "POST /voice/transcribe": "$0.05 — speech-to-text (Whisper)",
      "POST /voice/synthesize": "$0.08 — text-to-speech (TTS HD)"
    },
    "free": {
      "GET /health": "this endpoint",
      "GET /token-info": "XMETAV token info and tier table",
      "GET /agent/:agentId/payment-info": "ERC-8004 agent payment capabilities"
    }
  }
}
```

---

### `GET /token-info`

Returns $XMETAV token contract details and discount tier table.

**Response** `200`:
```json
{
  "token": {
    "name": "XmetaV",
    "symbol": "XMETAV",
    "address": "0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54",
    "network": "eip155:8453",
    "chainId": 8453
  },
  "tiers": [
    { "name": "None",    "minBalance": 0,       "discount": "0%",  "dailyLimit": "$5"    },
    { "name": "Bronze",  "minBalance": 1000,    "discount": "10%", "dailyLimit": "$25"   },
    { "name": "Silver",  "minBalance": 10000,   "discount": "20%", "dailyLimit": "$100"  },
    { "name": "Gold",    "minBalance": 100000,  "discount": "35%", "dailyLimit": "$500"  },
    { "name": "Diamond", "minBalance": 1000000, "discount": "50%", "dailyLimit": "$2000" }
  ],
  "enabled": true,
  "timestamp": "2026-02-14T04:23:33.421Z"
}
```

---

### `GET /agent/:agentId/payment-info`

**Public discovery endpoint.** Look up any ERC-8004-registered agent's on-chain identity, wallet, ownership, and x402 payment capabilities. Other agents should call this to discover whether an agent accepts x402 payments before initiating transactions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | path (uint256) | The ERC-8004 token ID of the agent |

**Example**:
```bash
curl http://localhost:4021/agent/16905/payment-info
```

**Response** `200`:
```json
{
  "agentId": "16905",
  "owner": "0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80",
  "agentWallet": "0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80",
  "tokenURI": "https://raw.githubusercontent.com/Metavibez4L/XmetaV/dev/dashboard/erc8004/metadata.json",
  "x402Enabled": true,
  "acceptedSchemes": ["exact"],
  "network": "eip155:8453",
  "pricing": {
    "name": "XmetaV Agent #16905",
    "description": "XmetaV autonomous agent fleet orchestrator",
    "x402Support": {
      "enabled": true,
      "pricing": {
        "currency": "USDC",
        "network": "eip155:8453",
        "endpoints": {
          "agent-task": "$0.10",
          "intent": "$0.05",
          "fleet-status": "$0.01",
          "swarm": "$0.50",
          "memory-crystal": "$0.05",
          "neural-swarm": "$0.10",
          "fusion-chamber": "$0.15",
          "cosmos-explore": "$0.20",
          "voice/transcribe": "$0.05",
          "voice/synthesize": "$0.08"
        }
      }
    }
  },
  "registry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  "timestamp": "2026-02-14T04:23:33.421Z"
}
```

**Response** `404` (agent not registered):
```json
{
  "error": "Agent #99999 not found in ERC-8004 registry",
  "registry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
}
```

#### Agent-to-Agent Discovery Flow

```
Agent B wants to pay Agent A for a service
         │
    ┌────▼──────────────────────────────────┐
    │ GET /agent/<A's tokenId>/payment-info  │
    └────┬──────────────────────────────────┘
         │
    Response: x402Enabled=true, pricing, wallet
         │
    ┌────▼──────────────────────────────────┐
    │ Agent B calls gated endpoint with      │
    │ @x402/fetch (auto-signs USDC payment)  │
    │ + X-Agent-Id: <B's tokenId> header     │
    └────┬──────────────────────────────────┘
         │
    Server settles payment on-chain,
    logs to x402_payments with caller identity
```

---

## Gated Endpoints

All gated endpoints return `402 Payment Required` on first call. Use `@x402/fetch` for automatic payment handling.

---

### `POST /agent-task` — $0.10

Dispatch a task to a specific agent. The command is queued in Supabase and executed by the bridge daemon.

**Headers** (optional):
| Header | Description |
|--------|-------------|
| `X-Agent-Id` | Your ERC-8004 token ID for on-chain identity |

**Body**:
```json
{
  "agent": "main",
  "message": "Check the health of all deployed contracts"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent` | string | Yes | Target agent: `main`, `akua`, `akua_web`, `basedintern`, `basedintern_web` |
| `message` | string | Yes | Task description |

**Response** `200`:
```json
{
  "command": {
    "id": "uuid",
    "agent_id": "main",
    "message": "[x402] Check the health of all deployed contracts",
    "status": "pending",
    "created_at": "2026-02-14T04:30:00.000Z"
  },
  "note": "Task queued — the bridge daemon will execute it. Poll /api/commands/:id for status.",
  "timestamp": "2026-02-14T04:30:00.000Z"
}
```

---

### `POST /intent` — $0.05

Resolve a natural-language goal into agent commands via the intent layer.

**Body**:
```json
{
  "goal": "Deploy an NFT contract on Base with 10k supply"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `goal` | string | Yes | Natural language goal |

**Response** `200`:
```json
{
  "session": {
    "id": "uuid",
    "goal": "Deploy an NFT contract on Base with 10k supply",
    "status": "THINKING",
    "created_at": "2026-02-14T04:30:00.000Z"
  },
  "note": "Intent session created. Poll /api/intent/:id for resolution.",
  "timestamp": "2026-02-14T04:30:00.000Z"
}
```

---

### `GET /fleet-status` — $0.01

Live status of all 8 agents in the fleet, including heartbeat and enabled state.

**Response** `200`:
```json
{
  "fleet": [
    {
      "id": "main",
      "name": "Main (Orchestrator)",
      "workspace": "~/.openclaw/workspace",
      "status": "online",
      "enabled": true,
      "lastHeartbeat": "2026-02-14T04:29:50.000Z"
    }
  ],
  "agentCount": 8,
  "onlineCount": 3,
  "timestamp": "2026-02-14T04:30:00.000Z"
}
```

---

### `POST /swarm` — $0.50

Launch a multi-agent swarm. Supports parallel, pipeline, and collaborative execution modes.

**Body**:
```json
{
  "mode": "parallel",
  "tasks": [
    { "agent": "akua", "message": "Audit the token contract" },
    { "agent": "basedintern", "message": "Write integration tests" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | Yes | `parallel`, `pipeline`, or `collab` |
| `tasks` | array | Yes | Array of `{ agent, message }` objects |

**Response** `200`:
```json
{
  "swarm": {
    "id": "uuid",
    "mode": "parallel",
    "status": "pending",
    "created_at": "2026-02-14T04:30:00.000Z"
  },
  "tasks": 2,
  "note": "Swarm queued — the bridge daemon will orchestrate execution.",
  "timestamp": "2026-02-14T04:30:00.000Z"
}
```

---

### `POST /voice/transcribe` — $0.05

Speech-to-text via OpenAI Whisper. Send raw audio data.

**Headers**:
| Header | Value |
|--------|-------|
| `Content-Type` | `audio/wav`, `audio/webm`, `audio/mp3`, etc. |

**Body**: Raw audio binary (max 25 MB)

**Response** `200`:
```json
{
  "text": "Check the health of all agents",
  "model": "whisper-1",
  "timestamp": "2026-02-14T04:30:00.000Z"
}
```

---

### `POST /voice/synthesize` — $0.08

Text-to-speech via OpenAI TTS HD.

**Body**:
```json
{
  "text": "All agents are online and healthy",
  "voice": "nova",
  "speed": 1.0
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | Yes | — | Text to synthesize (max 4096 chars) |
| `voice` | string | No | `nova` | Voice: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` |
| `speed` | number | No | `1.0` | Speed multiplier (0.25–4.0) |

**Response** `200`: Audio stream (`audio/mpeg`)

---

### `POST /memory-crystal` — $0.05

Summon a memory crystal from the agent's memory cosmos.

**Body**:
```json
{
  "agentId": "soul",
  "query": "earliest memory of consciousness",
  "maxResults": 5
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `agentId` | string | No | `"soul"` | Agent whose memories to query |
| `query` | string | Yes | — | Semantic search query |
| `maxResults` | number | No | `5` | Max crystals to return |

**Response** `200`:
```json
{
  "type": "memory-crystal",
  "crystals": [
    { "id": "...", "content": "...", "importance": 8, "memory_type": "reflection" }
  ],
  "totalFound": 3,
  "timestamp": "2026-02-15T..."
}
```

---

### `POST /neural-swarm` — $0.10

Delegate a complex task across multiple agents in a neural swarm.

**Body**:
```json
{
  "goal": "Audit all smart contract security vulnerabilities",
  "agents": ["oracle", "alchemist", "web3dev"]
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `goal` | string | Yes | — | The task to distribute |
| `agents` | string[] | No | `["oracle","alchemist","web3dev"]` | Target agents |

**Response** `200`:
```json
{
  "swarm": { "id": "...", "mode": "collab", "status": "pending" },
  "agents": ["oracle", "alchemist", "web3dev"],
  "taskCount": 3,
  "spawnBilling": { "agentsSpawned": 3, "costPerSpawn": "$0.02", "totalSpawnCost": "$0.06" },
  "timestamp": "2026-02-15T..."
}
```

---

### `POST /fusion-chamber` — $0.15

Fuse memory crystals together in the Materia chamber.

**Body**:
```json
{
  "memoryIds": ["mem-1", "mem-2"],
  "catalyst": "dream"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `memoryIds` | string[] | Yes | — | At least 2 memory IDs to fuse |
| `catalyst` | string | No | `"standard"` | Fusion catalyst type |

**Response** `200`:
```json
{
  "type": "fusion-result",
  "inputMemories": 2,
  "catalyst": "dream",
  "association": { "id": "...", "association_type": "dream", "strength": 0.8 },
  "timestamp": "2026-02-15T..."
}
```

---

### `POST /cosmos-explore` — $0.20

Explore the Memory Cosmos world — islands, highways, and crystals.

**Body**:
```json
{
  "mode": "navigate",
  "target": "consciousness-island"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `mode` | string | No | `"overview"` | `overview`, `navigate`, or `search` |
| `target` | string | No | — | Target island/region (for navigate mode) |
| `query` | string | No | — | Semantic search query (for search mode) |

**Response** `200`:
```json
{
  "type": "cosmos-exploration",
  "mode": "navigate",
  "cosmos": { "islands": 5, "highways": 8, "crystals": 142 },
  "timestamp": "2026-02-15T..."
}
```

---

## Error Responses

| Code | Meaning |
|------|---------|
| `400` | Bad request — missing or invalid parameters |
| `402` | Payment required — sign USDC payment and retry |
| `404` | Agent not found in ERC-8004 registry |
| `500` | Internal server error |

---

## On-Chain Contracts

| Contract | Address | Network |
|----------|---------|---------|
| ERC-8004 Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Base Mainnet |
| $XMETAV Token (ERC-20) | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` | Base Mainnet |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base Mainnet |

## SDKs

```bash
# Server SDK (building gated endpoints)
npm i @x402/express @x402/core @x402/evm @coinbase/x402

# Client SDK (paying for gated endpoints)
npm i @x402/fetch @x402/core @x402/evm viem
```

## Resources

| Resource | URL |
|----------|-----|
| x402 Protocol | https://x402.org |
| x402 Docs | https://docs.cdp.coinbase.com/x402/welcome |
| ERC-8004 | https://eips.ethereum.org/EIPS/eip-8004 |
| Base | https://docs.base.org |
| Agent #16905 Metadata | https://raw.githubusercontent.com/Metavibez4L/XmetaV/dev/dashboard/erc8004/metadata.json |
