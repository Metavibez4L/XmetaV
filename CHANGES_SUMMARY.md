# Changes Summary — March 8, 2026

## System Status: ACTIVE
**XmetaV Version:** v28 (Cross-Chain Swap Engine + Jupiter Ultra)

---

## Major Changes (March 8, 2026)

### 1. Multi-Chain x402 Cross-Chain Swap System (commit `bd2d844`)

Complete Base↔Solana swap pipeline with 7 new modules:

| Module | File | Purpose |
|--------|------|---------|
| `cross-chain-types.ts` | Types, contract addresses, safety config, fee estimates |
| `bridge-solana.ts` | Base↔Solana USDC bridge via CCTP |
| `jupiter-swap.ts` | Jupiter Ultra API swaps (RPC-less, multi-route) |
| `kamino-vault.ts` | Kamino Earn vault deposit/withdraw |
| `cross-chain-queue.ts` | Batch queue + job lifecycle manager |
| `cross-chain-routes.ts` | x402-gated Express router (6 endpoints) |
| `setup-db-crosschain.sql` | DB migration for job/batch tables |

**Flow**: USDC on Base → CCTP bridge → Solana USDC → Jupiter swap → Kamino vault → withdraw → bridge back

### 2. Cross-Chain Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /cross-chain-swap` | $0.65 | Initiate Base→Solana→Jupiter→Kamino swap |
| `POST /cross-chain-swap/quote` | Free | Estimate output, fees, Jupiter routing |
| `GET /bridge-status/:jobId` | $0.05 | Check cross-chain job status |
| `POST /trigger-return/:jobId` | $0.25 | Trigger return bridge Solana→Base |
| `GET /cross-chain/queue` | Free | Batch queue stats |
| `GET /cross-chain/vaults` | Free | Available Kamino vaults |

### 3. DB Migration (commit `a288039`)

- Executed `setup-db-crosschain.sql` via Supabase Management API
- Created `cross_chain_jobs` table (UUID PK, 25+ columns, full lifecycle tracking)
- Created `cross_chain_batches` table (batch aggregation for sub-threshold swaps)
- RLS policies, indexes, `updated_at` trigger
- Copied to `supabase/migrations/20260308100000_cross_chain.sql`

### 4. Jupiter Ultra API Key (commit `fe5f770`)

- Wired Jupiter API key via `x-api-key` header on both order and execute endpoints
- Verified: $10 USDC → 0.1225 SOL via PancakeSwap + Whirlpool + Meteora DLMM + TesseraV
- Price impact: -0.03% (near zero)

### 5. Safety Configuration

| Parameter | Value |
|-----------|-------|
| Min swap | $0.65 |
| Batch threshold | $6.50 |
| Max single swap | $500 |
| Max slippage | 50 bps (0.5%) |
| Max price impact | 3% |

### 6. Agent Chat Hung Fix (commits `97bae6a`, `fb7ba58`, `c34201b`)

Three-stage fix for agent chat hung state:
1. Increased idle timeout 30s→90s (`fb7ba58`)
2. Replaced idle-kill with process liveness check via `kill(0)` (`c34201b`)
3. Root cause: OpenClaw buffers all output during tool calls; idle timeout was killing the process before output could flush

---

## Previous Changes (March 5, 2026)

### v27 Comprehensive 9-Point Optimization (commit `195a4b0`)

Full-stack optimization pass spanning Bridge, Scholar, x402, Dashboard, and Vox.

### 2. Scholar Adaptive Intervals

Doubled all base research intervals to reduce redundant API calls. Added `adaptiveInterval()` that scales polling dynamically based on recent finding quality.

| Domain | Old (min) | New Base (min) |
|--------|-----------|---------------|
| erc8004 | 15 | 30 |
| x402 | 20 | 40 |
| layer2_scaling | 30 | 60 |
| stablecoin_infra | 45 | 90 |
| smb_adoption | 60 | 120 |

### 3. Anchor Batch Queue

Replaced individual `anchorMemory()` calls with batch queue system:
- `queueAnchor()` buffers entries; `flushPendingAnchors()` processes in batch
- Batch size: 3, auto-flush timer: 5 minutes
- ~60% reduction in IPFS/on-chain calls
- Flush on graceful shutdown (SIGINT/SIGTERM)

### 4. Scholar Dedup Enhancement

- Duplicate threshold raised to **0.85** (stricter filtering)
- Entity-based semantic dedup: extracts ERC numbers, protocol names, token tickers
- `KNOWN_ENTITIES` list for domain-specific entity recognition
- Capitalized-name heuristic for protocol detection

### 5. Dynamic Pricing Engine (NEW)

New demand-based pricing module for x402 server:
- **Demand multiplier**: 0.8×–1.5× based on calls/hour per endpoint
- **Time-of-day multiplier**: UTC peak hours adjustment
- **Endpoint bundles**: Research Pack, Swarm Suite, Memory Explorer
- **Free endpoint**: `GET /pricing` returns live pricing snapshot
- **Sync**: Pricing snapshot synced to Supabase every 5 minutes
- `recordDemand()` called in payment callback for real-time tracking

### 6. Session Buffer TTL Tuning

- `adaptiveTTL()`: 5s for volatile queries, 15s for standard, 30s for static
- `invalidateOnPayment()`: Supabase Realtime subscription on `x402_payments` triggers cache invalidation
- `VOLATILE_KEYWORDS` set for automatic query classification
- Integrated into `retrieval.ts` for per-query TTL selection

### 7. Vox Content Automation (NEW)

Auto-generates marketing threads from scholar findings:
- `queueVoxContent()`: queues high-scoring findings (≥ 0.8 relevance)
- `generateThread()`: formats research into social-ready threads
- Content calendar: max 3 posts/day, 4hr minimum spacing
- Persists to `vox_content_queue` Supabase table

### 8. SSE Streaming (NEW)

Dashboard server-sent events for real-time updates:
- **Endpoint**: `/api/events` — streams sessions, memory, payments, commands
- **Client hook**: `useRealtime` — EventSource with auto-reconnect, channel filtering, event counting
- **Heartbeat**: 30-second keepalive
- **Source**: Supabase Realtime → SSE bridge → EventSource client

### 9. Bridge v1.6.0 Integration

- `x402_payments` Realtime channel subscription for payment cache invalidation
- `flushPendingAnchors()` cleanup on SIGINT/SIGTERM
- `paymentChannel` unsubscribe on graceful shutdown

### 10. OpenClaw Updated to 2026.3.2

### 11. Model: kimi-k2.5:cloud (all 14 agents)

---

## Previous Changes (March 3, 2026)

### Sentinel Monitoring Engine

Full autonomous monitoring system integrated into the Bridge Daemon (v1.5.0). Six interconnected modules provide event-driven health checks, smart alerting, self-healing, predictive analysis, and distributed tracing.

**Modules:**

| Module | File | Purpose |
|--------|------|---------|
| **EventMonitor** | `bridge/lib/sentinel/event-monitor.ts` | Event-driven service monitoring with adaptive polling (5s–120s) |
| **AlertManager** | `bridge/lib/sentinel/alert-manager.ts` | Anti-fatigue alerting with escalation & cooldowns |
| **SelfHealer** | `bridge/lib/sentinel/self-healer.ts` | Automated remediation for downed services |
| **PredictiveHealth** | `bridge/lib/sentinel/predictive-health.ts` | macOS resource collection, trend prediction, z-score anomaly detection |
| **DistributedTracer** | `bridge/lib/sentinel/distributed-tracer.ts` | End-to-end request tracing with P95 latency, throughput, error rate |
| **Sentinel (orchestrator)** | `bridge/lib/sentinel/index.ts` | Wires all sub-systems, singleton lifecycle |

### Bridge Daemon v1.5.0 → v1.6.0

- v1.5.0: Sentinel integration, `/sentinel` endpoint, graceful shutdown
- v1.6.0: Anchor batch queue, payment cache invalidation, Vox feed pipeline

### Dashboard CWD Fix

- `scripts/launchd-dashboard.sh`: Changed cwd from `/tmp` to `${REPO}/dashboard`

---

## Files Added/Modified (v27)

**New Files:**
```
dashboard/x402-server/dynamic-pricing.ts
dashboard/bridge/lib/vox/content-automation.ts
dashboard/src/app/api/events/route.ts
dashboard/src/hooks/useRealtime.ts
```

**Modified Files:**
```
dashboard/bridge/lib/scholar/types.ts (adaptive intervals)
dashboard/bridge/lib/scholar/scorer.ts (85% dedup + entity dedup)
dashboard/bridge/lib/scholar/research-loop.ts (adaptiveInterval, queueAnchor, Vox feed)
dashboard/bridge/lib/memory-anchor.ts (batch queue system)
dashboard/bridge/lib/soul/session-buffer.ts (adaptiveTTL, invalidateOnPayment)
dashboard/bridge/lib/soul/retrieval.ts (per-query adaptive TTL)
dashboard/bridge/src/index.ts (v1.6.0 — payment channel, anchor flush)
dashboard/x402-server/index.ts (dynamic pricing, /pricing endpoint)
```

---

## Service Status (v27)

| Service | Port | Status |
|---------|------|--------|
| Dashboard | 3000 | ✅ Running (LaunchAgent) |
| Bridge | 3001 | ✅ Running (v1.6.0 + Sentinel) |
| x402 | 4021 | ✅ Running (+ Cross-Chain + Dynamic Pricing) |
| Ollama | 11434 | ✅ System service |

---

## Verification

```bash
# Bridge health
curl -s http://localhost:3001/health | jq .

# Sentinel health report
curl -s http://localhost:3001/sentinel | jq .

# Dynamic pricing snapshot
curl -s http://localhost:4021/pricing | jq .

# Cross-chain queue stats
curl -s http://localhost:4021/cross-chain/queue | jq .

# Cross-chain vaults
curl -s http://localhost:4021/cross-chain/vaults | jq .

# Cross-chain swap quote
curl -s -X POST http://localhost:4021/cross-chain-swap/quote \
  -H "Content-Type: application/json" \
  -d '{"amount": "10", "outputToken": "SOL"}' | jq .

# SSE stream test
curl -N http://localhost:3000/api/events

# Check all services
launchctl list | grep com.xmetav
```

---

*Generated: 2026-03-08*
