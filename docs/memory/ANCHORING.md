# On-Chain Memory Anchoring

> When something significant happens — a deployment, a critical decision, an incident — XmetaV doesn't just store it in the database. It pins the memory to IPFS and writes a permanent hash to Base Mainnet. These anchors create a tamper-proof, verifiable memory trail on-chain.

---

## How It Works

```mermaid
flowchart TD
    CMD["Command completes"] --> CAPTURE["captureCommandOutcome()"]

    CAPTURE --> WRITE["Write to agent_memory<br/><i>kind = outcome | error</i>"]

    CAPTURE --> CHECK["anchorIfSignificant()"]

    CHECK --> SCAN["Scan task + output for keywords"]

    subgraph "Category Detection"
        SCAN --> MILE{Milestone keywords?<br/>deploy, launch, token,<br/>contract, mainnet, live...}
        MILE -->|yes| CAT_M["MILESTONE (0)"]
        MILE -->|no| DEC{Decision keywords?<br/>chose, switched, migrated,<br/>upgraded, configured...}
        DEC -->|yes| CAT_D["DECISION (1)"]
        DEC -->|no| INC{Error + incident keywords?<br/>crash, down, outage,<br/>critical, rollback...}
        INC -->|yes| CAT_I["INCIDENT (2)"]
        INC -->|no| SKIP["Not significant — skip"]
    end

    CAT_M --> ANCHOR
    CAT_D --> ANCHOR
    CAT_I --> ANCHOR

    ANCHOR["anchorMemory(agentId, category, blob)"]

    subgraph "IPFS Pinning"
        ANCHOR --> PIN["pinJSON(blob, name)<br/><i>Pinata API</i>"]
        PIN --> CID["ipfsCid<br/><i>e.g. QmX7b3...</i>"]
    end

    subgraph "On-Chain Write"
        CID --> HASH["keccak256(ipfsCid)<br/><i>bytes32 content hash</i>"]
        HASH --> TX["anchor(16905, contentHash, category)<br/><i>AgentMemoryAnchor contract</i>"]
        TX --> RECEIPT["txHash<br/><i>~$0.0001 on Base</i>"]
    end

    RECEIPT --> FACT["Write permanent memory:<br/>'Memory anchored on-chain:<br/>ipfs://QmX7b3... (tx: 0xabc...)'"]

    style ANCHOR fill:#ff006e,stroke:#ff006e,color:#fff
    style CID fill:#065f46,stroke:#10b981,color:#fff
    style TX fill:#0052ff,stroke:#0052ff,color:#fff
```

---

## The Anchor Contract

**AgentMemoryAnchor** on Base Mainnet stores a linked list of content hashes per agent:

```mermaid
graph LR
    subgraph "Agent #16905 Anchors"
        A1["Anchor 0<br/>timestamp: 1707753044<br/>hash: 0xab3f...<br/>category: MILESTONE<br/>prev: 0x0000"]
        A2["Anchor 1<br/>timestamp: 1707839444<br/>hash: 0xcd91...<br/>category: DECISION<br/>prev: 0xab3f..."]
        A3["Anchor 2<br/>timestamp: 1707925844<br/>hash: 0xef22...<br/>category: INCIDENT<br/>prev: 0xcd91..."]
    end

    A1 --> A2 --> A3

    style A1 fill:#064e3b,stroke:#10b981,color:#fff
    style A2 fill:#1e3a5f,stroke:#38bdf8,color:#fff
    style A3 fill:#7f1d1d,stroke:#ef4444,color:#fff
```

### Contract ABI (used functions)

| Function | Type | Description |
|----------|------|-------------|
| `anchor(agentId, contentHash, category)` | write | Store a new memory anchor |
| `getLatest(agentId)` | view | Get the most recent anchor |
| `anchorCount(agentId)` | view | Total anchors for an agent |
| `getAnchors(agentId, from, count)` | view | Paginated anchor history |

### Memory Categories

| Category | Value | Keyword Triggers |
|----------|-------|-----------------|
| `MILESTONE` | 0 | deploy, launched, release, shipped, contract, token, created, mainnet, live |
| `DECISION` | 1 | chose, decided, switched, migrated, upgraded, replaced, configured |
| `INCIDENT` | 2 | crash, down, outage, failed, timeout, panic, critical, rollback |

Incidents require both `kind = "error"` AND incident keywords to trigger.

---

## IPFS Storage

Each anchored memory is pinned as a JSON blob to Pinata IPFS:

```json
{
  "agentId": 16905,
  "category": 0,
  "content": "Compiled 3 contracts. Deployed StakingVault to 0x7a2b...",
  "kind": "outcome",
  "source": "web3dev",
  "task": "deploy the staking contract on Base mainnet",
  "timestamp": "2026-02-14T05:30:00.000Z",
  "anchoredAt": "2026-02-14T05:30:12.000Z"
}
```

Accessible at: `https://gateway.pinata.cloud/ipfs/<CID>`

### Cost

| Component | Cost |
|-----------|------|
| IPFS pin (Pinata free tier) | Free (1 GB storage) |
| On-chain anchor (Base L2) | ~$0.0001 per write |
| Memory blob size | ~1-2 KB each |

---

## How Soul Uses Anchors

During context retrieval, Soul reads the on-chain anchor count to inject identity context:

```mermaid
sequenceDiagram
    participant S as Soul
    participant C as Base Mainnet

    S->>C: anchorCount(16905)
    C-->>S: 3

    S->>C: getLatest(16905)
    C-->>S: {timestamp, hash, category: 0}

    S->>S: Format: "[identity] 3 memories anchored on-chain.<br/>Last anchor: category 0, block time 2026-02-12 18:30."

    Note over S: This line appears at the top<br/>of every Soul context injection
```

This gives agents a persistent sense of their on-chain history — how many significant events have been permanently recorded, and when the last one was.

---

## Configuration

Anchoring requires three environment variables in `bridge/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANCHOR_CONTRACT_ADDRESS` | Yes | AgentMemoryAnchor contract on Base |
| `EVM_PRIVATE_KEY` | Yes | Wallet private key for signing txs |
| `PINATA_JWT` | Yes | Pinata API JWT for IPFS pinning |
| `BASE_RPC_URL` | No | Custom RPC (default: `https://mainnet.base.org`) |
| `ERC8004_AGENT_ID` | No | Agent ID (default: `16905`) |

If any required variable is missing, anchoring silently skips — it's never fatal to command execution.

---

## Source Files

| File | Purpose |
|------|---------|
| `bridge/lib/memory-anchor.ts` | `anchorMemory()`, `getLatestAnchor()`, `isAnchoringEnabled()` |
| `bridge/lib/ipfs-pinata.ts` | `pinJSON()`, `isPinataConfigured()`, `ipfsGatewayURL()` |
| `bridge/lib/agent-memory.ts` | `anchorIfSignificant()` — keyword detection and trigger |

---

## Next

- [Architecture Overview](./README.md) — Full system diagram and data flow
- [Soul Agent Deep Dive](./SOUL.md) — Context curation, associations, and dream consolidation
