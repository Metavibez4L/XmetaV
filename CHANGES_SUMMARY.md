# Changes Summary — March 10, 2026

## System Status: ACTIVE
**XmetaV Version:** v28.5 (Exec Delegation + Kamino Bug Fixes)

---

## Major Changes (March 10, 2026)

### v28.5 — Exec Delegation Architecture + Kamino API Fixes

#### 1. Three-Layer Exec Security

All 14 agents now use a delegation model: non-main agents route exec requests through `@main`, with `@sentinel` reviewing before execution.

| Layer | Component | Details |
|-------|-----------|---------|
| **Config** | `exec.security` in `openclaw.json` | Per-agent mode: `full` (main only), `allowlist` (all others) |
| **Allowlist** | `exec-approvals.json` | 361 role-based glob patterns across 11 agents |
| **Sentinel Review** | Instruction-based gate in `SOUL.md` | APPROVE/DENY/FLAG decisions with criteria table |

**Key files modified:**
- `~/.openclaw/openclaw.json` — All non-main agents: `exec.security: "allowlist"`, `exec.host: "gateway"`, `exec.ask: "on-miss"`
- `~/.openclaw/exec-approvals.json` — 361 patterns (was empty)
- `~/.openclaw/workspace-sentinel/SOUL.md` — Exec review gate role
- 10 agent workspace `AGENTS.md` files — Exec delegation protocol

#### 2. Kamino Lending API Bug Fixes

Fixed 5 bugs in Kamino API fallback paths across `kamino-borrow.ts` and `kamino-vault.ts`:

| Bug | Fix |
|-----|-----|
| `token` → Kamino expects `reserve` | Changed param name in 4 API calls, added `resolveReserveAddress()` (mint→reserve via SDK) |
| Vault withdraw sends `shares` → Kamino expects `amount` | Changed param name |
| `Buffer.from()` breaks `VersionedTransaction.deserialize()` | Changed to `new Uint8Array(Buffer.from(...))` |
| Legacy tx fallback runs on simulation errors | Added error type check: only fall through on deserialization errors |

#### 3. Full Kamino + Jupiter Endpoint Audit

| Category | Tested | Pass | Fail | Notes |
|----------|--------|------|------|-------|
| Kamino FREE | 3 | 3 | 0 | vault-details, market, positions |
| Kamino GATED | 7 | 5 | 2 | 5 functional (unfunded wallet), 2 blocked by Kamino vault API 500 |
| Jupiter (cross-chain) | 3 | 3 | 0 | quote, queue, vaults |
| **Total** | **13** | **11** | **2** | 2 failures are upstream (Kamino vault API) |

---

## Previous Changes (March 9, 2026)

### v28.4 — Lossless Context Engine Plugin

New `lossless-claw` context engine plugin leveraging the OpenClaw 2026.3.8 Context Engine Plugin API (`api.registerContextEngine()`). Replaces legacy `safeguard` compaction with zero-context-loss architecture.

#### What Changed

| Before | After |
|--------|-------|
| `compaction.mode: "safeguard"` | `plugins.slots.contextEngine: "lossless-claw"` |
| Drops older turns beyond `recentTurnsPreserve: 4` | 8 recent turns verbatim + rolling summary of all older turns |
| Context silently discarded | No context ever lost — older turns compressed, not deleted |

#### Plugin Architecture

- **`ingest()`**: Accepts all messages unconditionally
- **`assemble()`**: Sliding-window — system messages first, rolling summary of older turns (2048 token budget), then 8 most recent turns verbatim
- **`compact()`**: Returns `{ ok: true, compacted: false }` — plugin owns compaction, core doesn't discard
- **`before_prompt_build` hook**: Appends context engine metadata to system prompt

#### Plugin Config

```json
{
  "plugins": {
    "allow": ["lossless-claw"],
    "slots": { "contextEngine": "lossless-claw" },
    "entries": {
      "lossless-claw": {
        "enabled": true,
        "config": { "recentTurnsFullPreserve": 8, "summaryMaxTokens": 2048 }
      }
    }
  }
}
```

#### Files

| File | Purpose |
|------|---------|
| `~/.openclaw/extensions/lossless-claw/index.ts` | Plugin entry — context engine factory |
| `~/.openclaw/extensions/lossless-claw/openclaw.plugin.json` | Manifest (kind: context-engine, configSchema, uiHints) |
| `x402-server/plugins/lossless-claw/` | Repo copy for version control |

---

## Previous Changes (March 8, 2026)

### v28.3 — v2 RPC Compat + Vault Address Fixes

Four commits fixing klend-sdk v2 RPC incompatibility, UI crash guard, and incorrect SOL vault address.

#### Fixes

| Commit | Fix | File |
|--------|-----|------|
| `a473283` | kamino-borrow v2 RPC — replaced `Connection` with `createSolanaRpc()`, BigInt slot handling | `kamino-borrow.ts` |
| `39f4399` | Guard undefined deposits/borrows — optional chaining to prevent runtime crash | `KaminoBorrowPanel.tsx` |
| `a97458b` | kamino-vault v2 RPC — `createSolanaRpc()` singleton, updated constructor + deposit/withdraw | `kamino-vault.ts` |
| `a1829f9` | Correct SOL_MAIN vault address — old was klend reserve, new is kvault (18.7K SOL, 8.59% APY) | `kamino-vault.ts` |

#### Kamino Vault Addresses (Verified Live)

| Vault | Address | AUM | APY | Rate |
|-------|---------|-----|-----|------|
| USDC_MAIN | `HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E` | $70M | 1.17% | 1.037 |
| SOL_MAIN | `DcCRSdUMgAt6ZMeuL4BJAsZmJgND2LQd74Zq4z6ckhpg` | 18,773 SOL | 8.59% | 1.022 |

#### Multichain Test Results (All Pass)

| Endpoint | Result |
|----------|--------|
| `GET /health` | ✅ |
| `POST /cross-chain-swap/quote` | ✅ 10 USDC → 9.49 |
| `GET /cross-chain/vaults` | ✅ 2 configured + 104 live |
| `GET /kamino/vault-details?vault=USDC_MAIN` | ✅ $70M, 1.17% APY |
| `GET /kamino/vault-details?vault=SOL_MAIN` | ✅ 18.7K SOL, 8.59% APY |
| `GET /kamino/positions` | ✅ |
| `GET /kamino/market` | ✅ $1.67B deposits, 55 reserves |
| `GET /cross-chain/queue` | ✅ |
| `GET /pricing` | ✅ |
| `GET /trade-fees` | ✅ |
| Dashboard proxy | ✅ |

#### OpenClaw Config Fix

Removed invalid keys from `~/.openclaw/openclaw.json`: `agents.defaults.tools` and `exec.timeout` from all 14 agents.

---

### 0. Kamino SDK Integration — Borrow/Lend (commit `b87b67c`)

Full `@kamino-finance/klend-sdk` integration: SDK-first vault operations, complete borrow/lending module, 8 new x402 endpoints, KaminoBorrowPanel dashboard component, OpenClaw skill files. 9 files changed, 8775 insertions, 1166 deletions.

#### New Dependencies

| Package | Version | Purpose |
|---------|---------|----------|
| `@kamino-finance/klend-sdk` | ^7.3.20 | Kamino lending protocol SDK |
| `@solana/kit` | ^6.1.0 | Modern Solana SDK (required by klend-sdk) |
| `decimal.js` | ^10.6.0 | Precise decimal arithmetic |
| `@solana-program/compute-budget` | ^0.7.0 | Compute budget instructions |

#### New/Rewritten Modules

| Module | File | Description |
|--------|------|-------------|
| `kamino-vault.ts` | `x402-server/` | Rewritten: SDK-first vault data (APY, holdings, exchange rate, user positions), SDK deposit/withdraw |
| `kamino-borrow.ts` | `x402-server/` | New: KaminoMarket for market overview, KaminoAction for lending ops, user obligations with LTV |
| `KaminoBorrowPanel.tsx` | `src/components/` | New: Market TVL, reserves with APY, user obligation LTV, 4-action form |
| `kamino-borrow/route.ts` | `src/app/api/` | New: API proxy (GET+POST) for all lending endpoints |

#### New Endpoints (8)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /kamino/vault-details` | free | Live vault data (APY, holdings, exchange rate via SDK) |
| `GET /kamino/positions` | free | User vault positions across all vaults |
| `GET /kamino/market` | free | Lending market overview (TVL, reserves, APYs) |
| `GET /kamino/obligation` | $0.05 | User lending obligation (LTV, deposits, borrows) |
| `POST /kamino/deposit-collateral` | $0.20 | Deposit collateral into lending market |
| `POST /kamino/borrow` | $0.20 | Borrow assets against collateral |
| `POST /kamino/repay` | $0.15 | Repay a loan |
| `POST /kamino/withdraw-collateral` | $0.20 | Withdraw collateral from lending market |

Total x402: **27 gated**, **11 free** = **38 endpoints** (was 22 gated, 8 free = 30).

#### @solana/kit Compatibility

klend-sdk uses `@solana/kit` types (Address, Rpc, TransactionSigner) while codebase uses `@solana/web3.js` (PublicKey, Connection, Keypair). Resolved with `as any` casts at SDK boundaries.

#### Dashboard Updates

- `trading/page.tsx`: 3-column layout, "Kamino Borrow/Lend" feature tag, 16 endpoints in reference
- `KaminoBorrowPanel.tsx`: Market TVL, reserve APYs, user obligation LTV, 4-action form
- `/api/kamino-borrow/route.ts`: API proxy for all lending endpoints

#### OpenClaw Skill Files

Installed at `~/.openclaw/workspace/skills/kamino/`:
- `SKILL.md`, `references/setup.md`, `references/earn.md`, `references/borrow.md`, `references/api.md`

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

### 7. Standalone Kamino Vault Endpoints (commit `db3d9cf`)

Added direct Kamino vault deposit/withdraw endpoints to `cross-chain-routes.ts`, bypassing the full cross-chain swap flow.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /kamino/deposit` | $0.15 | Deposit into a Kamino vault (USDC/SOL) |
| `POST /kamino/withdraw` | $0.15 | Withdraw from a Kamino vault |

Health endpoint updated to include both in gated list. Total gated: 22, total free: 8.

### 8. Trading/DeFi Dashboard Page (commit `866231c`)

Full Trading/DeFi hub page at `/trading` with 9 new files (651 insertions):

| File | Purpose |
|------|--------|
| `src/app/(dashboard)/trading/page.tsx` | Two-column layout: CrossChainPanel + KaminoPanel, feature tags, endpoint reference grid |
| `src/components/CrossChainPanel.tsx` | Queue stats (pending/active/completed/failed), total bridged USD, interactive swap quote form |
| `src/components/KaminoPanel.tsx` | Vault cards with APY, deposit/withdraw mode toggle, Solscan explorer links on success |
| `src/app/api/trading/health/route.ts` | GET proxy → x402 `/health` |
| `src/app/api/trading/cross-chain/route.ts` | GET/POST proxy → x402 cross-chain endpoints |
| `src/app/api/trading/kamino/route.ts` | POST proxy → x402 Kamino endpoints |

Also updated:
- **PaymentsDashboard.tsx**: 24→30 endpoint cards (added 6 cross-chain/Kamino entries)
- **Sidebar.tsx**: 15→16 nav items (added "Trading / DeFi" with ArrowLeftRight icon, shortcut 16)
- **SystemHealth.tsx**: Added x402 server health check, shows endpoint count

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

## Service Status (v28.3)

| Service | Port | Status |
|---------|------|--------|
| Dashboard | 3000 | ✅ Running (LaunchAgent) — 12 pages incl. `/trading` |
| Bridge | 3001 | ✅ Running (v1.6.0 + Sentinel) |
| x402 | 4021 | ✅ Running (+ Cross-Chain + Kamino v2 RPC + Dynamic Pricing) |
| Ollama | 11434 | ✅ System service |

---

## Verification

```bash
# Check exec approvals loaded
openclaw approvals get 2>&1 | head -5

# Bridge health
curl -s http://localhost:3001/health | jq .

# Sentinel health report
curl -s http://localhost:3001/sentinel | jq .

# Dynamic pricing snapshot
curl -s http://localhost:4021/pricing | jq .

# Cross-chain queue stats
curl -s http://localhost:4021/cross-chain/queue | jq .

# Cross-chain swap quote (uses Jupiter internally)
curl -s -X POST http://localhost:4021/cross-chain-swap/quote \
  -H "Content-Type: application/json" \
  -d '{"amount": "10", "outputToken": "SOL"}' | jq .

# Kamino free endpoints
curl -s http://localhost:4021/kamino/vault-details | jq .vault,.apy
curl -s http://localhost:4021/kamino/market | jq .totalDepositTVL,.totalBorrowTVL
curl -s http://localhost:4021/kamino/positions | jq .

# Kamino gated (lending) — requires funded Solana wallet
curl -s http://localhost:4021/kamino/obligation | jq .
curl -s -X POST http://localhost:4021/kamino/deposit-collateral \
  -H "Content-Type: application/json" \
  -d '{"token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": "100"}' | jq .

# SSE stream test
curl -N http://localhost:3000/api/events

# Check all services
launchctl list | grep com.xmetav
```

---

*Generated: 2026-03-10*
