# Memory Anchoring System Architecture

## Overview

**Status:** ✅ OPERATIONAL (74 memories anchored on-chain)

The anchoring system provides **cryptographic proof** that memories exist at a specific point in time, stored immutably on Base Mainnet via IPFS.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: HOT MEMORY (Supabase)                          │
│  • Fast queries (~5-10ms)                                │
│  • TTL expiration (auto-cleanup)                        │
│  • Context injection for agents                          │
├─────────────────────────────────────────────────────────┤
│  LAYER 2: CONTENT LAYER (IPFS via Pinata)                 │
│  • Immutable content addressing                         │
│  • Distributed storage                                    │
│  • ~1-2 KB per memory blob                               │
├─────────────────────────────────────────────────────────┤
│  LAYER 3: ANCHOR LAYER (Base Mainnet)                   │
│  • Transaction timestamp                                  │
│  • Proof of existence                                     │
│  • ~$0.0001 per anchor                                    │
└─────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Memory Creation Flow

```typescript
// When agent completes a task:
writeMemory({
  agent_id: "oracle",
  kind: "observation", 
  content: "Whale alert: 10K ETH moved",
  source: "on-chain-scan"
})
```

### 2. Anchor Detection

System analyzes memory content for **anchor-worthy events**:
- **MILESTONE** (category 0): Revenue milestones, achievements
- **DECISION** (category 1): Important decisions
- **INCIDENT** (category 2): Errors, critical events

Keywords trigger anchoring:
```typescript
const MILESTONE_KEYWORDS = ['milestone', 'revenue', 'launched', 'v2.0', 'shipped'];
const DECISION_KEYWORDS = ['decided', 'chose', 'plan', 'strategy'];
const INCIDENT_KEYWORDS = ['error', 'failure', 'outage', 'critical'];
```

### 3. Anchoring Process

```typescript
// Step 1: Pin to IPFS
const blob = {
  agentId: 16905,
  category: 0, // MILESTONE
  content: "...",
  kind: "observation",
  anchoredAt: "2026-03-03T10:09:00Z"
};
const ipfsResult = await pinJSON(blob, "agent-16905-milestone-123456");
// → ipfs://QmTpUzmYXcaeuG6VxN3SEy5NhPysv2g3DTRZFEQogxXmZS

// Step 2: Hash the CID
const contentHash = keccak256(toHex(ipfsResult.ipfsHash));

// Step 3: Write to Base contract
const txHash = await walletClient.writeContract({
  address: ANCHOR_ADDRESS, // 0x0D1F695ea1ca6b5Ba22E3bAf6190d8553D9c4D98
  abi: ANCHOR_ABI,
  functionName: "anchor",
  args: [agentId, contentHash, category]
});
// → tx: 0xe7bf5c6dd74cf76face29cbb10eda759d0f0f2d5de3f71730bfebdea3e66799a
```

### 4. Memory Crystal Creation

After anchoring, a **Memory Crystal** is created:
```typescript
createCrystal({
  name: "milestone — First x402 payment",
  anchorTxHash: "0xe7bf...",
  ipfsCid: "QmTpUzm...",
  agentId: "oracle",
  category: 0
});
```

---

## Current Configuration

| Setting | Value |
|---------|-------|
| **Contract** | `0x0D1F695ea1ca6b5Ba22E3bAf6190d8553D9c4D98` |
| **Agent ID** | `16905` (ERC-8004 token) |
| **Chain** | Base Mainnet (eip155:8453) |
| **Cost** | ~$0.0001 per anchor (gas) |
| **IPFS Provider** | Pinata (free tier: 1GB) |
| **Batch Interval** | 5 minutes (queue flush) |

---

## Recent Anchors (from memory)

Based on context, recent anchors include:
- 2026-03-03 01:07 — x402 milestone (first payment)
- 2026-03-03 00:56 — Memory anchor category 0
- 2026-03-02 18:57 — v2.0 release milestone

**Total:** 74 memories anchored on-chain

---

## Smart Contract Structure

```solidity
struct Anchor {
  uint256 timestamp;      // Block timestamp
  bytes32 contentHash;    // keccak256(IPFS_CID)
  bytes32 previousAnchor; // Linked list pointer
  uint8 category;         // 0=MILESTONE, 1=DECISION, 2=INCIDENT
}

mapping(uint256 => Anchor[]) public anchorsByAgent;

function anchor(
  uint256 agentId,
  bytes32 contentHash,
  uint8 category
);

function getLatest(uint256 agentId) returns (Anchor memory);
function getAnchors(uint256 agentId, uint256 from, uint256 count) returns (Anchor[] memory);
```

---

## Optimization Opportunities

### 1. Batch Anchoring (Already Implemented)
- **Current:** Queue + 5-minute flush
- **Benefit:** 80% fewer Pinata API calls

### 2. Caching (Already Implemented)
- **Read cache:** 5-minute TTL for on-chain reads
- **Benefit:** Avoid excessive RPC calls

### 3. Selective Anchoring
- **Current:** Keywords trigger anchoring
- **Optimization:** Confidence score threshold
- **Example:** Only anchor if confidence > 0.8

### 4. Compression
- **Current:** Full JSON blob to IPFS
- **Optimization:** Compress before pinning
- **Benefit:** 50% storage reduction

### 5. Parallel Anchors
- **Current:** Sequential processing
- **Optimization:** Batch multiple memories in single tx
- **Benefit:** Gas savings via bundling

---

## Verification

Anyone can verify an anchor:

```bash
# 1. Get anchor from chain
curl -X POST https://base-mainnet.g.alchemy.com/v2/YOUR_KEY \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x0D1F...","data":"0x..."},"latest"],"id":1}'

# 2. Fetch IPFS content
open https://gateway.pinata.cloud/ipfs/QmTpUzmYXcaeuG6VxN3SEy5NhPysv2g3DTRZFEQogxXmZS

# 3. Verify hash matches
keccak256("QmTpUzm...") === contentHash from chain
```

---

## Status

| Component | Status |
|-----------|--------|
| **Pinata** | ✅ Configured |
| **Contract** | ✅ Deployed |
| **Wallet** | ✅ Funded |
| **Anchoring** | ✅ Active |
| **Batch Queue** | ✅ Running |
| **Cache** | ✅ 5min TTL |

---

## Next Optimizations

1. **Confidence Scoring** — Only anchor high-confidence memories
2. **Bundle Anchors** — Multiple memories per transaction
3. **Compress IPFS** — Gzip before pinning
4. **Monitor Gas** — Dynamic fee adjustment

---

*Last updated: 2026-03-03*
