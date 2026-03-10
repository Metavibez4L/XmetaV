# Status — XmetaV / OpenClaw Command Center
**Last verified:** 2026-03-10  
**System:** Mac Studio (M3 Ultra — 96GB) — abrahamacStudio  
**XmetaV Version:** v28.5 (Exec Delegation + Kamino Bug Fixes)  
**Platform:** macOS 26.3.1 (Tahoe)  
**Uptime:** Always-on headless server (NYC)  
**Remote:** Tailscale VPN from MacBook Air (NC) → Mac Studio (NYC)

This file captures the **known-good** runtime settings for the Mac Studio production server and the quickest commands to verify everything is healthy.

---

## Quick Health Check

```bash
# One-command status check (requires just)
cd ~/xmetav1/XmetaV && just status

# Full health check (services + power + disk + memory)
just health

# Check x402 revenue
just revenue

# Verify OpenClaw
openclaw health
openclaw --version

# Manual health check
./scripts/health-check.sh
```

---

## Hardware

| Spec | Value |
|------|-------|
| **Model** | Mac Studio (Mac15,14) |
| **Chip** | Apple M3 Ultra |
| **CPU** | 28 cores (20P + 8E) |
| **GPU** | 60 cores (Metal) |
| **Memory** | 96 GB unified |
| **Storage** | 1 TB SSD (926 GB capacity, ~2% used) |
| **Serial** | M3PG6NJT7Y |
| **OS** | macOS 26.3 (Build 25D125) |

## Versions

| Tool | Version | Install Method |
|------|---------|---------------|
| **Node** | 25.8.0 | Homebrew |
| **npm** | 11.11.0 | Bundled with Node |
| **pnpm** | 10.30.3 | Homebrew |
| **Ollama** | 0.17.7 (latest) | macOS app (/Applications/Ollama.app) |
| **Git** | 2.53.0 | Homebrew |
| **just** | 1.46.0 | Homebrew |
| **OpenClaw** | 2026.3.8 | npm global |

## Context Engine

| Setting | Value |
|---------|-------|
| **Plugin** | `lossless-claw` v1.0.0 (Context Engine Plugin API) |
| **Slot** | `plugins.slots.contextEngine: "lossless-claw"` |
| **Mode** | Full memory preservation — no compaction loss |
| **Recent Turns (full)** | 8 (verbatim) |
| **Summary Budget** | 2048 tokens (rolling summary of older turns) |
| **Source** | `~/.openclaw/extensions/lossless-claw/index.ts` |
| **Replaces** | Legacy `compaction.mode: "safeguard"` (which discarded older turns) |

## Active Services

| Service | Port | Status | Start Command | Auto-Restart |
|---------|------|--------|---------------|-------------|
| **Dashboard** (Next.js) | 3000 | Active | `just dashboard` | ✅ LaunchAgent (KeepAlive) |
| **Bridge Daemon** (v1.6.0 + Sentinel) | 3001 | Active | `just bridge` | ✅ LaunchAgent (KeepAlive) |
| **x402 Server** | 4021 | Active | `just x402` | ✅ LaunchAgent (KeepAlive) |
| **OpenClaw Gateway** | 18789 | Active | `just gateway` | ✅ launchd (native) |
| **Ollama** | 11434 | Active | macOS app (auto-start) | ✅ launchd (native) |

All services auto-restart on crash and survive reboots via LaunchAgent plists.

Start all: `just all`  
Stop all: `just stop` (bootout — won't respawn until `just start`)  
Restart all: `just restart`  
Restart one: `just restart-one bridge`  
Status: `just status`  
Cold-start check: `just cold-check`  
Pin models: `just warm`

## Ollama Configuration

| Setting | Value |
|---------|-------|
| OLLAMA_KEEP_ALIVE | -1 (never unload — models permanently resident) |
| OLLAMA_MAX_LOADED_MODELS | 3 (concurrent models in memory) |
| OLLAMA_NUM_PARALLEL | 4 (parallel request handling) |

Configured via `~/Library/LaunchAgents/com.ollama.env.plist` — persists across reboots.

### Loaded Models

| Model | Size | Context | Purpose | Hot-Keep |
|-------|------|---------|---------|----------|
| `kimi-k2.5:cloud` | Cloud (remote) | 262K | Primary agent model — all 14 fleet agents | N/A (cloud-proxied, no local VRAM) |
| `qwen2.5:7b-instruct` | 4.7 GB (19.7GB VRAM) | 32K | Local fallback | ✅ Pinned (`keep_alive:-1`, expires ~2318) |

Use `just cold-check` to verify models. Use `just warm` to re-pin after Ollama restart.

### Service Response Benchmarks (post-restart 2026-03-02)

| Service | Endpoint | Response Time |
|---------|----------|---------------|
| Dashboard :3000 | `/` | **7ms** |
| Bridge :3001 | `/health` | **1ms** |
| x402 :4021 | `/health` | **1ms** |
| Gateway :18789 | `/health` | **1.5ms** |
| Ollama (qwen local) | inference (2 tokens) | **190ms** (load: 85ms) |
| Ollama (kimi cloud) | inference (2 tokens) | **2.9s** (network) |

### x402 Live Payment Test (2026-03-02)

All endpoints verified with real USDC on **Base Mainnet**:

| Endpoint | Price | HTTP | Time | Status |
|----------|-------|------|------|--------|
| `GET /fleet-status` | $0.01 | 200 | 1,547ms | ✅ Paid |
| `POST /memory-crystal` | $0.05 | 200 | 1,407ms | ✅ Paid |
| `POST /intent` | $0.05 | 200 | 1,081ms | ✅ Paid |
| `POST /agent-task` | $0.10 | 200 | 1,161ms | ✅ Paid |

Wallet: `0x4Ba6...Cc80` — USDC spent: **$0.11** — Pass rate: **4/4 (100%)**  
Test script: `cd dashboard && DOTENV_CONFIG_PATH=bridge/.env npx tsx scripts/test-x402-live.ts`

## Active profile and paths

- Profile: (none; using default `~/.openclaw/` config)
- State dir: `~/.openclaw/`
- Config file: `~/.openclaw/openclaw.json`
- Workspace(s): per-agent (`openclaw agents list`)
- Gateway: `ws://127.0.0.1:18789` (`gateway.mode: local`)
- Ollama OpenAI-compat base: `http://127.0.0.1:11434/v1`
- Repo: `/Users/akualabs/xmetav1/XmetaV` (branch: `dev`) — symlinked at `~/Documents/xmetav1`
- Git remote: `github.com/Metavibez4L/XmetaV.git`

## Remote Access (Tailscale + SSH + Screen Sharing)

| Component | Status | Details |
|-----------|--------|---------|
| **Tailscale** | Active | System extension, App Store build v1.94.2 |
| **Studio IP** | `100.93.86.17` | Tailscale mesh IP |
| **Air IP** | `100.122.52.85` | MacBook Air mesh IP |
| **SSH** | Active | Port 22, native macOS SSH over Tailscale |
| **Screen Sharing** | Active | Port 5900, VNC over Tailscale |
| **Account** | Metavibez4L@ | Tailscale account |
| **Connection** | Direct | No relay, direct peer-to-peer |

```bash
# From MacBook Air:
ssh akualabs@100.93.86.17
# Screen Sharing: vnc://100.93.86.17
```

## Power Management (Always-On Server)

| Setting | Value |
|---------|-------|
| sleep | 0 (never) |
| displaysleep | 10 min |
| disksleep | 0 (never) |
| autorestart | 1 (auto-restart after power failure) |
| powernap | 1 (enabled) |

Configured via `sudo pmset` — Mac Studio runs headless 24/7.

## LaunchAgent Auto-Restart

All three core services run as LaunchAgents with `KeepAlive: true` and `RunAtLoad: true`. They auto-restart on crash and start on boot.

| Plist | Service | Wrapper Script | Logs |
|-------|---------|---------------|------|
| `com.xmetav.dashboard.plist` | Dashboard :3000 | `/usr/local/bin/xmetav/launchd-dashboard.sh` | `/tmp/xmetav-dashboard.{log,err}` |
| `com.xmetav.bridge.plist` | Bridge :3001 | `/usr/local/bin/xmetav/launchd-bridge.sh` | `/tmp/xmetav-bridge.{log,err}` |
| `com.xmetav.x402.plist` | x402 :4021 | `/usr/local/bin/xmetav/launchd-x402.sh` | `/tmp/xmetav-x402.{log,err}` |

**Key details:**
- Repo lives at `~/xmetav1/` (not `~/Documents/`) to bypass macOS Sequoia TCC restrictions on launchd
- Wrapper scripts use absolute paths with `cd /tmp` as cwd (dashboard uses project cwd for Turbopack)
- Bridge and x402 use `DOTENV_CONFIG_PATH` to load `.env` from correct location
- All use `tsx watch` for auto-reload on code changes (dashboard uses Next.js HMR)
- Dashboard's "Start/Stop Bridge" button uses `launchctl` (not `spawn`) to avoid duplicate processes

```bash
# Restart a service
launchctl kickstart -k gui/$(id -u)/com.xmetav.bridge

# Check logs
tail -f /tmp/xmetav-bridge.log
tail -f /tmp/xmetav-bridge.err

# Reload after plist changes
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.xmetav.bridge.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.xmetav.bridge.plist
```

Source plists and scripts are versioned in `scripts/launchd/` and `scripts/launchd-*.sh`.

## Watchdog

Automated health monitor checking every 5 minutes:

- **Script:** `scripts/watchdog.sh`
- **Plist:** `~/Library/LaunchAgents/com.xmetav.watchdog.plist`
- **Log:** `/tmp/xmetav-watchdog.log`
- **Monitors:** Tailscale, SSH (port 22), Screen Sharing (port 5900), sleep settings

```bash
just logs-watchdog
```

## v28.5 Exec Delegation + Kamino Bug Fixes (2026-03-10)

### Exec Delegation Architecture

Three-layer exec security: config allowlists, per-agent glob patterns, sentinel instruction-based review.

| Change | Details |
|--------|---------|
| **Exec delegation** | All non-main agents route exec through `@main`, sentinel reviews before execution |
| **exec-approvals.json** | 361 role-based glob patterns across 11 agents (was empty) |
| **Agent AGENTS.md** | 10 agent workspaces updated with exec delegation protocol |
| **Sentinel SOUL.md** | Exec review gate role added (APPROVE/DENY/FLAG response format) |
| **Main AGENTS.md** | Exec handler role added (parse→forward→wait→execute) |

### Kamino Lending Bug Fixes (kamino-borrow.ts, kamino-vault.ts)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| deposit-collateral/borrow/repay/withdraw-collateral → 500 `required property 'reserve'` | API fallback sent `token` — Kamino expects `reserve` (the reserve account address, not token mint) | Changed `token` → `reserve` in all 4 API fallback calls + added `resolveReserveAddress()` to map mint→reserve via SDK |
| vault withdraw → 500 `required property 'amount'` | API fallback sent `shares` — Kamino expects `amount` | Changed `shares` → `amount` in withdraw API fallback |
| Transaction deserialization crash (`Versioned messages must be deserialized with VersionedMessage.deserialize()`) | `Buffer.from()` returns Node Buffer, not Uint8Array; legacy fallback ran on simulation errors | Changed to `new Uint8Array(Buffer.from(...))`, separated simulation errors from deserialization errors |

### Kamino Endpoint Test Results (2026-03-10)

| # | Endpoint | Type | HTTP | Status | Notes |
|---|----------|------|------|--------|-------|
| 1 | `GET /kamino/vault-details` | FREE | 200 | ✅ | USDC vault, 1.2% APY, live SDK |
| 2 | `GET /kamino/market` | FREE | 200 | ✅ | $1.73B deposits, $609M borrows, 55 reserves |
| 3 | `GET /kamino/positions` | FREE | 200 | ✅ | 2 vaults checked |
| 4 | `GET /kamino/obligation` | GATED | 200 | ✅ | null (no obligation) |
| 5 | `POST /kamino/deposit-collateral` | GATED | 500 | ✅* | Tx built+signed, simulation fails: wallet unfunded |
| 6 | `POST /kamino/borrow` | GATED | 400 | ✅* | No obligation yet (correct — must deposit first) |
| 7 | `POST /kamino/repay` | GATED | 400 | ✅* | No obligation to repay |
| 8 | `POST /kamino/withdraw-collateral` | GATED | 400 | ✅* | No obligation |
| 9 | `POST /kamino/deposit` (vault) | GATED | 500 | ⚠️ | External Kamino vault API 500 (their bug) |
| 10 | `POST /kamino/withdraw` (vault) | GATED | 500 | ⚠️ | External Kamino vault API 500 (their bug) |

**✅*** = Code fully functional, reaches Kamino API correctly. Errors are expected business logic (unfunded wallet / no obligation). Would succeed with funded Solana wallet.  
**⚠️** = Kamino's external vault API (`api.kamino.finance/ktx/kvault/*`) returning 500 — upstream issue.

### Jupiter Test Results (2026-03-10)

Jupiter is integrated into the cross-chain swap pipeline, not standalone endpoints:

| Endpoint | HTTP | Status | Notes |
|----------|------|--------|-------|
| `POST /cross-chain-swap/quote` | 200 | ✅ | Live Jupiter quote: SOL via HumidiFi, 50bps slippage |
| `GET /cross-chain/queue` | 200 | ✅ | Queue stats operational |
| `GET /cross-chain/vaults` | 200 | ✅ | Vault listing + 104 live vaults |

### Files Changed

| File | Changes |
|------|---------|
| `x402-server/kamino-borrow.ts` | +61 −17: `reserve` param fix, `resolveReserveAddress()`, `Uint8Array` deserialization, simulation error handling |
| `x402-server/kamino-vault.ts` | +16 −13: `amount` param fix for withdraw, `Uint8Array` deserialization, simulation error handling |

---

## v28 Cross-Chain Swap Engine (2026-03-08)

Full multi-chain swap pipeline: Base ↔ Solana bridge, Jupiter Ultra swaps, Kamino vault yields. Commits `bd2d844`, `a288039`, `fe5f770`.

### New Modules

| Module | File | Purpose |
|--------|------|---------|
| **cross-chain-types** | `x402-server/cross-chain-types.ts` | Shared types, contract addresses (Base + Solana), safety config, fee estimates |
| **bridge-solana** | `x402-server/bridge-solana.ts` | Base↔Solana USDC bridge via CCTP (`bridgeToSolana`, `bridgeToBase`, arrival waiters) |
| **jupiter-swap** | `x402-server/jupiter-swap.ts` | Jupiter Ultra API swaps (RPC-less, multi-route: PancakeSwap/Whirlpool/Meteora/TesseraV) |
| **kamino-vault** | `x402-server/kamino-vault.ts` | Kamino Earn vault deposit/withdraw (USDC 1.2% APY, SOL 8.6% APY) — v2 RPC via `createSolanaRpc()` |
| **cross-chain-queue** | `x402-server/cross-chain-queue.ts` | Batch queue + job lifecycle (pending→bridging→swapping→vaulted→completed) |
| **cross-chain-routes** | `x402-server/cross-chain-routes.ts` | Express router: 6 endpoints (4 gated, 2 free) |

### Endpoints Added

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /cross-chain-swap` | $0.65 | Initiate Base→Solana→Jupiter→Kamino swap |
| `POST /cross-chain-swap/quote` | Free | Estimate output, fees, Jupiter routing |
| `GET /bridge-status/:jobId` | $0.05 | Check cross-chain job status |
| `POST /trigger-return/:jobId` | $0.25 | Trigger return bridge Solana→Base |
| `GET /cross-chain/queue` | Free | Batch queue stats |
| `GET /cross-chain/vaults` | Free | Available Kamino vaults |

### Safety Configuration

| Parameter | Value |
|-----------|-------|
| Min swap | $0.65 |
| Batch threshold | $6.50 |
| Max single swap | $500 |
| Max slippage | 50 bps (0.5%) |
| Max price impact | 3% |

### DB Tables

| Table | Purpose |
|-------|---------|
| `cross_chain_jobs` | Job tracking (UUID PK, 25+ columns, full lifecycle) |
| `cross_chain_batches` | Batch aggregation for sub-threshold swaps |

Migration: `dashboard/scripts/setup-db-crosschain.sql` (also in `supabase/migrations/20260308100000_cross_chain.sql`)

### Jupiter Ultra API

- API key authenticated (`x-api-key` header)
- Endpoints: `GET /ultra/v1/order` → sign → `POST /ultra/v1/execute`
- Multi-route aggregation: PancakeSwap, Whirlpool, Meteora DLMM, TesseraV
- Verified: $10 USDC → 0.1225 SOL with -0.03% price impact

### Agent Chat Fix (commits `97bae6a`, `fb7ba58`, `c34201b`)

Three-stage fix for agent chat hung state:
1. Increased idle timeout 30s→90s
2. Replaced idle-kill with process liveness check (`kill(0)`)
3. Root cause: OpenClaw buffers output during tool calls; idle timeout killed process before flush

---

## v28.4 Lossless Context Engine Plugin (2026-03-09)

New `lossless-claw` context engine plugin using the OpenClaw 2026.3.8 Context Engine Plugin API. Replaces legacy `safeguard` compaction with zero-context-loss strategy.

### Plugin: lossless-claw

- **Type**: Context Engine Plugin (`api.registerContextEngine()`)
- **Slot**: `plugins.slots.contextEngine: "lossless-claw"` (exclusive, replaces `"legacy"`)
- **Strategy**: Sliding-window assembly — 8 most recent turns kept verbatim, older turns compressed into rolling summary (2048 token budget)
- **Compaction**: `ownsCompaction: true` — core never discards turns; plugin handles via summarization in `assemble()`
- **Prompt hook**: Injects context engine metadata via `before_prompt_build` (priority 5)
- **Trust**: Pinned via `plugins.allow: ["lossless-claw"]`

### Config (in `~/.openclaw/openclaw.json`)

```json
{
  "plugins": {
    "allow": ["lossless-claw"],
    "slots": { "contextEngine": "lossless-claw" },
    "entries": {
      "lossless-claw": {
        "enabled": true,
        "config": {
          "recentTurnsFullPreserve": 8,
          "summaryMaxTokens": 2048
        }
      }
    }
  }
}
```

### Files

| File | Location | Purpose |
|------|----------|---------|
| `index.ts` | `~/.openclaw/extensions/lossless-claw/` | Plugin entry — context engine factory |
| `openclaw.plugin.json` | `~/.openclaw/extensions/lossless-claw/` | Plugin manifest (kind: context-engine) |
| `package.json` | `~/.openclaw/extensions/lossless-claw/` | Package metadata for OpenClaw discovery |
| Repo copy | `x402-server/plugins/lossless-claw/` | Version-controlled source |

---

## v28.3 v2 RPC Compat + Vault Address Fixes (2026-03-08)

Four fixes addressing klend-sdk v2 RPC incompatibility and incorrect vault configuration. Commits `a473283`, `39f4399`, `a97458b`, `a1829f9`.

### Fixes

| Commit | Fix | File |
|--------|-----|------|
| `a473283` | **kamino-borrow v2 RPC**: Replaced `Connection` with `createSolanaRpc()` for klend-sdk 7.3.20 compat; added BigInt slot handling for APY calculations | `kamino-borrow.ts` |
| `39f4399` | **Guard undefined deposits/borrows**: Added optional chaining (`deposits?.length`, `borrows?.length`) to prevent runtime crashes when user has no obligations | `KaminoBorrowPanel.tsx` |
| `a97458b` | **kamino-vault v2 RPC**: Same v2 RPC migration — `createSolanaRpc()` singleton, updated `KaminoVault` constructor, `getUserShares`, deposit/withdraw instruction builders | `kamino-vault.ts` |
| `a1829f9` | **Correct SOL_MAIN vault address**: Old address (`ByYiZxp8Q...DVJ5`) was a klend lending reserve (wrong program). New address (`DcCRSdUMg...hpg`) is the actual kvault — 18,773 SOL AUM, 8.59% APY, exchange rate 1.022 | `kamino-vault.ts` |

### Kamino Vault Addresses (Verified)

| Vault | Address | AUM | APY | Exchange Rate |
|-------|---------|-----|-----|---------------|
| **USDC_MAIN** | `HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E` | $70M | 1.17% | 1.037 |
| **SOL_MAIN** | `DcCRSdUMgAt6ZMeuL4BJAsZmJgND2LQd74Zq4z6ckhpg` | 18,773 SOL | 8.59% | 1.022 |

### Multichain Endpoint Test Results (All Pass)

| Endpoint | Status | Details |
|----------|--------|---------|
| `GET /health` | ✅ | Server healthy |
| `POST /cross-chain-swap/quote` | ✅ | 10 USDC → 9.49 output |
| `GET /cross-chain/vaults` | ✅ | 2 configured + 104 live SDK vaults |
| `GET /kamino/vault-details?vault=USDC_MAIN` | ✅ | $70M AUM, 1.17% APY |
| `GET /kamino/vault-details?vault=SOL_MAIN` | ✅ | 18,773 SOL, 8.59% APY |
| `GET /kamino/positions` | ✅ | USDC_MAIN: 0 shares, SOL_MAIN: null |
| `GET /kamino/market` | ✅ | $1.67B deposits, $0.59B borrows, 55 reserves |
| `GET /cross-chain/queue` | ✅ | 0 pending |
| `GET /pricing` | ✅ | Dynamic demand/time multipliers |
| `GET /trade-fees` | ✅ | 6 schedules, 5 examples |
| Dashboard proxy | ✅ | Next.js → x402 working |

### OpenClaw Config Fix

Removed invalid keys from `~/.openclaw/openclaw.json`:
- `agents.defaults.tools` — not valid at defaults level
- `agents.list.*.tools.exec.timeout` — not valid inside exec block (all 14 agents)

---

## v28.2 Kamino SDK Integration — Borrow/Lend + klend-sdk (2026-03-08)

Full Kamino SDK integration using `@kamino-finance/klend-sdk`. SDK-first vault operations, complete borrow/lending module, 8 new x402 endpoints, KaminoBorrowPanel dashboard component, and OpenClaw skill files. Commit `b87b67c`.

### New Dependencies

| Package | Version | Purpose |
|---------|---------|----------|
| `@kamino-finance/klend-sdk` | ^7.3.20 | Kamino lending protocol SDK |
| `@solana/kit` | ^6.1.0 | Modern Solana SDK (required by klend-sdk) |
| `decimal.js` | ^10.6.0 | Precise decimal arithmetic |
| `@solana-program/compute-budget` | ^0.7.0 | Compute budget instructions |

### New Modules

| Module | File | Description |
|--------|------|-------------|
| **kamino-vault.ts** | `x402-server/kamino-vault.ts` | Rewritten: SDK-first vault data (APY, holdings, exchange rate, user positions), SDK deposit/withdraw with @solana/kit compat |
| **kamino-borrow.ts** | `x402-server/kamino-borrow.ts` | New: KaminoMarket for market overview, KaminoAction for deposit-collateral/borrow/repay/withdraw-collateral, user obligations with LTV |
| **KaminoBorrowPanel** | `src/components/KaminoBorrowPanel.tsx` | New: Market TVL, reserves with APY, user obligation LTV, 4-action form (deposit-collateral, borrow, repay, withdraw-collateral) |

### New Endpoints (8)

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

Total x402 gated endpoints: **27** (was 22). Total free endpoints: **11** (was 8). PaymentsDashboard: **38 endpoints** (was 30).

### @solana/kit v2 RPC Compatibility

klend-sdk 7.3.20 requires `@solana/kit` v2 Rpc protocol — **not** the legacy `@solana/web3.js` Connection. Both `kamino-vault.ts` and `kamino-borrow.ts` now use `createSolanaRpc()` from `@solana/kit` for v2 compat. Type bridging uses `as any` casts at SDK boundaries.

**Commits:** `a473283` (kamino-borrow), `a97458b` (kamino-vault)

### OpenClaw Skill Files

Kamino skill installed at `~/.openclaw/workspace/skills/kamino/`:
- `SKILL.md` — main skill instructions, workflow guides, vault table, endpoint reference
- `references/setup.md` — SDK installation, env vars, architecture notes
- `references/earn.md` — vault deposit/withdraw operations
- `references/borrow.md` — lending market operations, SDK implementation details
- `references/api.md` — complete API endpoint reference, token mints, response formats

### Dashboard Updates

| Component | Change |
|-----------|--------|
| `trading/page.tsx` | 3-column layout, "Kamino Borrow/Lend" feature tag, 16 endpoints in reference |
| `KaminoBorrowPanel.tsx` | New component on Trading page |
| `/api/kamino-borrow/route.ts` | New API proxy (GET+POST → x402 market/obligation/deposit-collateral/borrow/repay/withdraw-collateral) |

---

## v28.1 Standalone Kamino Endpoints + Trading/DeFi Dashboard (2026-03-08)

Standalone Kamino vault endpoints and full Trading/DeFi dashboard page. Commits `db3d9cf`, `866231c`.

### New Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /kamino/deposit` | $0.15 | Deposit directly into a Kamino vault (USDC/SOL) |
| `POST /kamino/withdraw` | $0.15 | Withdraw from a Kamino vault |

Total x402 gated endpoints: **22** (was 20). Total free endpoints: **8**. PaymentsDashboard: **30 endpoints** (was 24).

### Dashboard: Trading/DeFi Page (`/trading`)

New full-page Trading/DeFi hub accessible from the sidebar (item 16).

| Component | Purpose |
|-----------|--------|
| **CrossChainPanel** | Queue stats (pending/active/completed/failed), total bridged USD, interactive swap quote tool |
| **KaminoPanel** | Vault overview with APY, deposit/withdraw mode toggle, Solscan explorer links on success |

### Dashboard Updates

| Component | Change |
|-----------|--------|
| `PaymentsDashboard.tsx` | 24→30 endpoint cards (added 6 cross-chain/Kamino entries) |
| `Sidebar.tsx` | 15→16 nav items (added "Trading / DeFi" with ArrowLeftRight icon) |
| `SystemHealth.tsx` | Added x402 server health check via `/api/trading/health`, shows endpoint count |

### New API Proxy Routes (Next.js → x402)

| Route | Methods | Proxies To |
|-------|---------|------------|
| `/api/trading/health` | GET | x402 `/health` |
| `/api/trading/cross-chain` | GET, POST | x402 `/cross-chain/queue`, `/cross-chain/vaults`, `/cross-chain-swap/quote`, `/cross-chain-swap` |
| `/api/trading/kamino` | POST | x402 `/kamino/deposit`, `/kamino/withdraw` |

---

## v27 Comprehensive Optimization (2026-03-05)

Nine-point optimization pass across Bridge, Scholar, x402, Dashboard, and Vox. Commit `195a4b0`.

### Scholar Adaptive Intervals

Base research intervals doubled to reduce redundant API calls. `adaptiveInterval()` dynamically adjusts based on recent finding quality (avg relevance score).

| Domain | Old Interval (min) | New Base (min) | Adaptive Range |
|--------|-------------------|---------------|----------------|
| erc8004 | 15 | 30 | 20–45 |
| x402 | 20 | 40 | 25–60 |
| layer2_scaling | 30 | 60 | 40–90 |
| stablecoin_infra | 45 | 90 | 60–135 |
| smb_adoption | 60 | 120 | 80–180 |

**File:** `bridge/lib/scholar/types.ts`

### Anchor Batch Queue

Replaced direct `anchorMemory()` calls with a batch queue (`queueAnchor()` + `flushPendingAnchors()`). Batches up to 3 entries per flush, auto-flushes every 5 minutes. Reduces IPFS/on-chain calls by ~60%.

**File:** `bridge/lib/memory-anchor.ts`

### Scholar Dedup Enhancement

- Duplicate threshold raised from default to **0.85** (stricter)
- Added entity-based semantic dedup: extracts ERC numbers, protocol names, token tickers from findings
- Capitalized-name heuristic for protocol detection

**File:** `bridge/lib/scholar/scorer.ts`

### Dynamic Pricing Engine (NEW)

Demand-based pricing for x402 endpoints:
- **Demand multiplier**: 0.8×–1.5× based on calls/hour per endpoint
- **Time-of-day multiplier**: UTC peak hours pricing
- **Endpoint bundles**: Research Pack, Swarm Suite, Memory Explorer
- **Free endpoint**: `GET /pricing` returns live snapshot
- **Sync**: Pricing snapshot synced to Supabase every 5 minutes

**File:** `x402-server/dynamic-pricing.ts`

### Session Buffer TTL Tuning

- `adaptiveTTL()`: 5s for volatile queries, 15s for standard, 30s for static
- `invalidateOnPayment()`: Supabase Realtime subscription on `x402_payments` triggers cache invalidation
- `VOLATILE_KEYWORDS` set for query classification

**Files:** `bridge/lib/soul/session-buffer.ts`, `bridge/lib/soul/retrieval.ts`

### Vox Content Automation (NEW)

Auto-generates marketing threads from high-scoring scholar findings:
- `queueVoxContent()`: called when scholar score ≥ 0.8
- `generateThread()`: formats research into social-ready threads
- Content calendar: max 3 posts/day, 4hr minimum spacing
- Persists to `vox_content_queue` Supabase table

**File:** `bridge/lib/vox/content-automation.ts`

### SSE Streaming (NEW)

- **Endpoint**: `/api/events` — streams sessions, memory, payments, commands via Supabase Realtime → SSE
- **Client hook**: `useRealtime` — EventSource with auto-reconnect, channel filtering, event counting
- **Heartbeat**: 30-second keepalive
- **Cleanup**: Abort controller on disconnect

**Files:** `src/app/api/events/route.ts`, `src/hooks/useRealtime.ts`

### Bridge Integration

- `x402_payments` Realtime subscription for `invalidateOnPayment()`
- `flushPendingAnchors()` cleanup on SIGINT/SIGTERM
- `paymentChannel` unsubscribe on graceful shutdown

**File:** `bridge/src/index.ts`

---

## Sentinel Monitoring Engine (v1.5.0)

Autonomous monitoring system embedded in the Bridge Daemon. Provides event-driven health checks, smart alerting, automated self-healing, predictive analysis, and distributed tracing.

### Modules

| Module | File | Purpose |
|--------|------|---------|
| **EventMonitor** | `bridge/lib/sentinel/event-monitor.ts` | Service monitoring with adaptive polling (5s–120s), Supabase Realtime subscriptions |
| **AlertManager** | `bridge/lib/sentinel/alert-manager.ts` | Anti-fatigue alerting with escalation (immediate → warning → critical) and cooldowns |
| **SelfHealer** | `bridge/lib/sentinel/self-healer.ts` | Automated remediation: restart services, clean stale locks, rotate logs |
| **PredictiveHealth** | `bridge/lib/sentinel/predictive-health.ts` | macOS resource collection, linear regression trends, z-score anomaly detection |
| **DistributedTracer** | `bridge/lib/sentinel/distributed-tracer.ts` | Span-based request tracing with P95 latency, throughput, error rate |
| **Sentinel** | `bridge/lib/sentinel/index.ts` | Orchestrator singleton wiring all sub-systems |

### Monitored Services

| Service | Check Method |
|---------|-------------|
| bridge | `launchctl list` |
| dashboard | `launchctl list` |
| x402 | `launchctl list` |
| ollama | HTTP `GET http://127.0.0.1:11434/api/tags` |
| gateway | HTTP `GET http://127.0.0.1:18789/health` |
| tailscale | `tailscale status` |

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `http://localhost:3001/sentinel` | GET | Full sentinel health report (JSON) |
| `/api/sentinel` | GET | Dashboard-authenticated sentinel data (health, incidents, healing, resources, traces) |

### DB Tables

| Table | Purpose |
|-------|---------|
| `sentinel_incidents` | Alert/incident tracking with severity and resolution |
| `sentinel_healing_log` | Self-healing action audit trail |
| `sentinel_traces` | Distributed trace spans with timing data |
| `sentinel_resource_snapshots` | System resource snapshots (CPU, memory, disk, load) |

Migration: `dashboard/scripts/setup-db-sentinel.sql`

### Verification

```bash
# Sentinel health report
curl -s http://localhost:3001/sentinel | jq .

# Check sentinel logs
tail -f /tmp/xmetav-bridge.log | grep -i sentinel
```

## Configured agents (this machine)

This command center runs **multiple isolated agents**, all powered by **Kimi K2.5** (256k context):

| Agent | Model | Workspace | Tools | Role |
|-------|-------|-----------|-------|------|
| `main` * | `kimi-k2.5:cloud` | `~/.openclaw/workspace` | **full** | **Orchestrator** — agent factory + swarm |
| `sentinel` | `kimi-k2.5:cloud` | `~/.openclaw/agents/sentinel` | coding | **Fleet Ops** — lifecycle, spawn coordination, health |
| `soul` | `kimi-k2.5:cloud` | `~/.openclaw/agents/soul` | coding | **Memory Orchestrator** — context curation, dreams, associations |
| `briefing` | `kimi-k2.5:cloud` | `~/.openclaw/agents/briefing` | coding | **Context Curator** — continuity, health, memory |
| `oracle` | `kimi-k2.5:cloud` | `~/.openclaw/agents/oracle` | coding | **On-Chain Intel** — gas, prices, chain, sentiment |
| `alchemist` | `kimi-k2.5:cloud` | `~/.openclaw/agents/alchemist` | coding | **Tokenomics** — supply, emissions, staking, liquidity |
| `midas` | `kimi-k2.5:cloud` | `~/.openclaw/agents/midas` | coding | **Revenue & Growth** — x402 analytics, pricing, forecasts, growth pipeline |
| `vox` | `kimi-k2.5:cloud` | `~/.openclaw/agents/vox` | coding | **Brand & Campaigns** — content strategy, voice calibration, competitor analysis |
| `web3dev` | `kimi-k2.5:cloud` | `~/.openclaw/agents/web3dev` | coding | **Blockchain Dev** — compile, test, audit, deploy contracts |
| `basedintern` | `kimi-k2.5:cloud` | `~/.openclaw/agents/basedintern` | coding | TypeScript/Node.js repo agent |
| `basedintern_web` | `kimi-k2.5:cloud` | `~/.openclaw/agents/basedintern` | full | Same repo — browser/web only |
| `akua` | `kimi-k2.5:cloud` | `~/.openclaw/agents/akua` | coding | Solidity/Hardhat repo agent |
| `akua_web` | `kimi-k2.5:cloud` | `~/.openclaw/agents/akua` | full | Same repo — browser/web only |
| _(dynamic)_ | `kimi-k2.5:cloud` | _(per-agent)_ | _(varies)_ | Created on-demand by Agent Factory |

\* = default agent

Detailed agent runbooks (index: [`docs/agents/README.md`](agents/README.md)):
- `docs/agents/main.md`
- `docs/agents/sentinel.md`
- `docs/agents/briefing.md`
- `docs/agents/oracle.md`
- `docs/agents/alchemist.md`
- `docs/agents/midas.md`
- `docs/agents/vox.md`
- `docs/agents/web3dev.md`
- `docs/agents/basedintern.md`
- `docs/agents/akua.md`
- `docs/agents/dynamic.md`

List agents:

```bash
openclaw agents list
# or
./scripts/manage-agents.sh list
```

Run the repo agent:

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Summarize this repo and run npm test."
```

## Orchestrator capabilities (main agent)

The `main` agent has two power skills installed:

### Agent Factory

Create agents, scaffold apps, manage the fleet, and create GitHub repos:

```bash
# Create a new agent
./scripts/create-agent.sh --id researcher --template research --web

# Create agent + GitHub repo (auto-creates + pushes)
./scripts/create-agent.sh --id researcher --template research --web --github --private

# Scaffold an app
./scripts/build-app.sh --type node --workspace /home/manifest/researcher

# Scaffold an app + push to GitHub
./scripts/build-app.sh --type node --workspace /home/manifest/researcher --github

# Fleet status
./scripts/manage-agents.sh list
./scripts/manage-agents.sh status
```

### Swarm (multi-agent orchestration)

Dispatch tasks across multiple agents with three execution modes:

| Mode | Command | Description |
|------|---------|-------------|
| Parallel | `./scripts/swarm.sh --parallel` | Run tasks simultaneously across agents |
| Pipeline | `./scripts/swarm.sh --pipeline` | Chain agents, output flows to next step |
| Collaborative | `./scripts/swarm.sh --collab` | Same task to multiple agents, then synthesize |

```bash
# Parallel health check across all repos
./scripts/swarm.sh --parallel \
  basedintern "Run /repo-health" \
  akua "Run /repo-health"

# Pipeline: research then implement
./scripts/swarm.sh --pipeline \
  main "Research best practices for X" \
  basedintern "Apply the findings"

# Collaborative code review
./scripts/swarm.sh --collab \
  "Review the last commit for bugs" \
  basedintern akua

# Pre-built templates
./scripts/swarm.sh templates/swarms/health-all.json

# Check past runs and results
./scripts/swarm.sh --status
./scripts/swarm.sh --results <run-id>
```

Results stored in: `~/.openclaw/swarm/<run-id>/`

Verify skills are installed:

```bash
ls ~/.openclaw/workspace/skills/
# Expected: agent-factory/ swarm/ (plus any others)
```

Full reference: `docs/SWARM.md`

## Known-good config (sanity checks)

These should match (do not paste tokens publicly):

```bash
openclaw config get agents.list
openclaw config get models.providers.ollama.baseUrl
openclaw config get models.providers.ollama.api
openclaw config get models.providers.ollama.apiKey
```

Expected values (high level):
- `models.providers.ollama.baseUrl`: `http://127.0.0.1:11434/v1`
- `models.providers.ollama.api`: `openai-responses` (required for tool calling!)
- `models.providers.ollama.apiKey`: set to a non-secret placeholder (e.g. `"local"`) to satisfy OpenClaw auth checks for local Ollama

Quick tool-calling sanity test:

```bash
openclaw agent --agent main --local --thinking off \
  --session-id tool_test_$(date +%s) \
  --message "Call exec: echo TOOL_OK"
# Expected: agent calls exec tool and returns TOOL_OK

## Persistent memory bus (Supabase)

This environment supports a Supabase-backed memory bus that complements OpenClaw session history:

- Table: `agent_memory`
- Scope: per-agent entries plus shared entries (`agent_id = "_shared"`)
- Bridge behavior: injects recent memory into dispatch prompts; writes an `outcome`/`error` entry after completion

Migration file (dashboard): `dashboard/scripts/setup-db-agent-memory.sql`
```

## Standard way to run the agent (stable)

Use `--local` + `--thinking off` for reliable agent calls (bypasses gateway websocket, runs embedded):

```bash
openclaw agent \
  --agent main \
  --local \
  --thinking off \
  --session-id smoke_$(date +%s) \
  --message "What is 2+2?"
```

## Cloud model: `kimi-k2.5:cloud` (256k context)

This environment is configured with the Ollama cloud model:

- Model id: `kimi-k2.5:cloud`
- Expected context window: `262144` (256k)
- Auth: via `ollama signin` (no API key required for local `http://127.0.0.1:11434` calls)

Verify config:

```bash
openclaw config get agents.list
openclaw config get models.providers.ollama.models
```

## Known behavior: Ollama Cloud “session usage limit” (HTTP 429)

If you exceed your Ollama Cloud quota/limits, calls to a cloud model can fail with:

```json
{"StatusCode":429,"Status":"429 Too Many Requests","error":"you've reached your session usage limit, please wait or upgrade to continue"}
```

Reproduce / diagnose (direct to local Ollama):

```bash
curl -i -sS http://127.0.0.1:11434/api/chat \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}],"stream":false}'
```

Fix:
- Wait for the limit to reset, or upgrade your Ollama plan.
- **Temporary fallback**: route non-critical agents (sentinel, briefing) to local `qwen2.5:7b-instruct` while keeping main on cloud. Edit the agent's `models.json` to swap the model.

## Health checks

```bash
# Gateway should be reachable
openclaw health

# Ollama should list models
curl -s http://127.0.0.1:11434/api/tags

# GPU should be in use when model is loaded (size_vram > 0)
curl -s http://127.0.0.1:11434/api/ps
```

## End-to-end smoke test (repo agent)

This is the “we can ship” verification for `basedintern`:

```bash
openclaw agent --agent basedintern --local --thinking off --session-id bi_smoke_$(date +%s) --message "\
In /home/manifest/basedintern/based-intern, use exec to run:\n\
1) git pull --ff-only\n\
2) npx tsc --noEmit\n\
3) npm test\n\
Paste raw stdout/stderr and exit codes."
```

## If it hangs (fast recovery)

```bash
# Clear stale session locks
find ~/.openclaw -name "*.lock" -type f -delete

# Stop anything stuck
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
fuser -k 18789/tcp 2>/dev/null || true

# Re-apply the golden-path fix
./scripts/openclaw-fix.sh
```

## Tool Calling (System Automation)

With `tools.profile=full` (main) or `coding` (repo agents) and `api=openai-responses`, the agent can:
- Execute shell commands via `exec` tool
- Read/write files via `read`/`write` tools
- Manage background processes via `process` tool
- Browse the web via `browser` tool (full profile)
- Fetch web pages via `web_fetch` / `web_search` tools (full profile)

### Exec Tool Configuration (Optimized 2026-03-08)

Agent defaults provide fleet-wide exec settings (`agents.defaults.tools.exec`):

| Setting | Value | Purpose |
|---------|-------|---------|
| `pathPrepend` | `["/opt/homebrew/bin", "/usr/local/bin"]` | Consistent PATH for all agents (replaces manual bridge construction) |
| `timeout` | `300` (default) | Wall-clock kill (per-agent overrides below) |
| `notifyOnExit` | `true` | Background jobs emit system events on completion |
| `safeBins` | 24 entries | stdin-only filters: `cat`, `grep`, `jq`, `sed`, `awk`, `sort`, `wc`, etc. |
| `safeBinTrustedDirs` | `/bin`, `/usr/bin`, `/opt/homebrew/bin` | Trusted directories for safeBin resolution |

Per-agent exec security (3-layer architecture — updated 2026-03-10):

**Layer 1 — Config** (`~/.openclaw/openclaw.json`): exec.security mode per agent  
**Layer 2 — Allowlist** (`~/.openclaw/exec-approvals.json`): 361 glob patterns across 11 agents  
**Layer 3 — Sentinel Review**: instruction-based review gate for all non-main exec requests

| Agent | Host | Security | Ask | Timeout | Allowlist Patterns | Notes |
|-------|------|----------|-----|---------|-------------------|-------|
| `main` | gateway | `full` | — | 300s | N/A | Sole executor — all agents delegate to main |
| `basedintern`, `akua` | gateway | `allowlist` | `on-miss` | 300s | 37 each | Dev tools (git, node, npm, curl) |
| `midas` | gateway | `allowlist` | `on-miss` | 300s | 33 | Finance tools (curl, node, python) |
| `sentinel` | gateway | `allowlist` | `on-miss` | 120s | 37 | Process inspection (pgrep, lsof, launchctl) |
| `oracle`, `alchemist` | gateway | `allowlist` | `on-miss` | 300s | 33 each | Network + analysis tools |
| `web3dev` | gateway | `allowlist` | `on-miss` | 300s | 40 | Broadest: foundry, hardhat, solidity |
| `briefing`, `soul` | gateway | `allowlist` | `on-miss` | 600s | 29 each | Read-only only |
| `scholar`, `vox` | gateway | `allowlist` | `on-miss` | 600s | 29 each | Read-only (moved from sandbox) |

**Exec Delegation Protocol**: All non-main agents are instructed (via workspace AGENTS.md) to message `@main` with `EXEC REQUEST` format instead of executing directly. Main routes to `@sentinel` for review before executing.

Test:
```bash
openclaw agent --agent main --local --thinking off \
  --message "Call the exec tool with command: whoami"
```

Notes:
- If you see loops calling tools (especially `tts`), deny `tts`.
- For channels (Telegram/Slack/etc), you may need gateway mode rather than `--local`.
- The `openai-responses` API mode is required for tool schemas to be passed to the model.
- Session overrides available via `/exec host=gateway security=allowlist ask=on-miss`.

## Control Plane Dashboard

The XmetaV Control Plane Dashboard is a cyberpunk-themed Next.js 16 web application providing remote agent management, swarm orchestration, and fleet controls via a browser.

### Dashboard status

| Component | Port | Status | Start |
|-----------|------|--------|-------|
| Dashboard (Next.js) | 3000 | Active | `just dashboard` |
| Bridge Daemon | 3001 | Active | `just bridge` |
| x402 Server | 4021 | Active | `just x402` |
| OpenClaw Gateway | 18789 | Active | `just gateway` |
| Supabase | Cloud | Active | Project: `ptlneqcjsnrxxruutsxm` |

### Supabase tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `agent_commands` | Command bus (dashboard -> bridge) | Authenticated: SELECT, INSERT |
| `agent_responses` | Response bus (bridge -> dashboard) | Authenticated: SELECT, INSERT |
| `agent_sessions` | Agent session tracking | Authenticated: SELECT, INSERT |
| `agent_controls` | Agent enable/disable state | Authenticated: SELECT, INSERT, UPDATE |
| `swarm_runs` | Swarm run metadata and status | Authenticated: SELECT, INSERT, UPDATE |
| `swarm_tasks` | Per-task status and output | Authenticated: SELECT, INSERT, UPDATE |
| `x402_payments` | x402 payment transaction log | Authenticated: SELECT, INSERT |
| `intent_sessions` | Intent resolution sessions | Authenticated: SELECT, INSERT |
| `agent_memory` | Persistent memory bus (per-agent + shared) | Authenticated: SELECT, INSERT |
| `memory_associations` | Soul agent memory association graph | Authenticated: SELECT, INSERT |
| `memory_queries` | Soul agent memory retrieval log | Authenticated: SELECT, INSERT |
| `dream_insights` | Soul agent dream consolidation insights | Authenticated: SELECT, INSERT |
| `soul_dream_manifestations` | Lucid dream proposals and actions | Authenticated: SELECT + Service role: ALL |
| `soul_dream_sessions` | Dream session tracking and stats | Authenticated: SELECT + Service role: ALL |
| `soul_association_modifications` | Self-modification audit trail | Authenticated: SELECT + Service role: ALL |
| `agent_swaps` | Token swap execution log | Authenticated: SELECT, INSERT, UPDATE |
| `memory_crystals` | Living memory crystals (materia system) | Authenticated: SELECT, INSERT, UPDATE |
| `memory_fusions` | Crystal fusion history (FF7-style) | Authenticated: SELECT, INSERT |
| `memory_summons` | Memory summons log | Authenticated: SELECT, INSERT |
| `limit_breaks` | Limit break event tracking | Authenticated: SELECT, INSERT, UPDATE |
| `memory_achievements` | Achievement/quest progression | Authenticated: SELECT, INSERT, UPDATE |
| `daily_quests` | Daily quest generation | Authenticated: SELECT, INSERT, UPDATE |
| `sentinel_incidents` | Sentinel alert/incident tracking | Authenticated: SELECT + Service role: ALL |
| `sentinel_healing_log` | Self-healing action audit trail | Authenticated: SELECT + Service role: ALL |
| `sentinel_traces` | Distributed trace spans | Authenticated: SELECT + Service role: ALL |
| `sentinel_resource_snapshots` | System resource snapshots (CPU/mem/disk/load) | Authenticated: SELECT + Service role: ALL |
| `insight_shards` | Dream synthesis fused insight fragments | Service role: ALL |
| `predictive_contexts` | Pre-loaded context from temporal/sequential patterns | Service role: ALL |
| `memory_decay` | Decay-scored memories pending archive or compression | Service role: ALL |
| `reforged_crystals` | Legendary crystals compressed from decayed memories | Service role: ALL |
| `erc8004_registry_cache` | Cached on-chain ERC-8004 registry lookups | Service role: ALL |
| `erc8004_scan_log` | ERC-8004 scan/discovery event log | Service role: ALL |
| `revenue_metrics` | Midas revenue tracking and settlement status | Authenticated: SELECT + Service role: ALL |
| `endpoint_analytics` | Per-endpoint usage analytics | Authenticated: SELECT + Service role: ALL |
| `growth_opportunities` | AI-identified growth/optimization opportunities | Authenticated: SELECT + Service role: ALL |
| `pricing_recommendations` | Dynamic pricing recommendation history | Authenticated: SELECT + Service role: ALL |
| `pricing_experiments` | A/B pricing experiment tracking | Service role: ALL |
| `swarm_spawn_billing` | Swarm spawn billing events | Service role: ALL |
| `trade_executions` | Midas trade execution log (swaps, arb, rebalance) | Authenticated: SELECT + Service role: ALL |
| `cross_chain_jobs` | Cross-chain bridge job tracking | Authenticated: SELECT + Service role: ALL |
| `cross_chain_batches` | Cross-chain batch aggregation | Service role: ALL |
| `vox_content_queue` | Vox content automation pipeline queue | Service role: ALL |

**Total: 37 tables, 3 views, 4 enums** — all with Realtime enabled for live updates.

**Views:** `x402_daily_spend` (daily payment totals), `shared_memory` (cross-agent memory access), `crystal_level_thresholds` (XP → level lookup).

**Enums:** `crystal_type`, `crystal_color`, `crystal_class`, `agent_relationship`.

**Functions:** `cleanup_expired_memories()` (72h TTL), `auto_create_crystal()` (trigger), `update_crystal_xp()`, `compute_decay_score()`, `compress_to_legendary()`, `log_association_modification()`.

### Dashboard pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Command Center | Bridge health, fleet summary, recent commands, quick command |
| `/agent` | Agent Chat | Streaming chat with agent selector |
| `/swarms` | Swarms | Create (templates/custom), active runs (live), history (filterable) |
| `/fleet` | Fleet | Agent table with enable/disable toggles |
| `/payments` | Payments | x402 wallet status, daily spend, payment history, gated endpoints |
| `/identity` | Identity | ERC-8004 on-chain agent NFT, reputation, and capabilities |
| `/token` | $XMETAV | Token balance, tier table, discount info, holder benefits |
| `/consciousness` | Consciousness | Dual-aspect awareness: memory graph, anchor timeline, context metrics, dream mode, mini arena |
| `/memory-cosmos` | Memory Cosmos | Crystal materia inventory, fusion chamber, summon overlay, limit breaks, explorable memory world, quests |
| `/arena` | XMETAV HQ | Isometric office visualization with live agent activity (PixiJS) |
| `/logs` | Live Logs | Real-time log streaming with severity/agent filters and search |

### Dashboard health checks

```bash
# Verify dashboard is running
curl -s http://localhost:3000 | head -1

# Verify bridge daemon is running
curl -s http://localhost:3000/api/bridge/status

# Verify Supabase connection
cd dashboard && npx tsx -e "
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  sb.from('agent_commands').select('count').then(r => console.log('OK:', r));
"
```

### Dashboard environment

Required environment variables (in `dashboard/.env.local`):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public, used in browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (**server-side only**, never expose to browser) |
| `OPENAI_API_KEY` | OpenAI API key for Whisper STT + TTS (**server-side only**) |
| `XMETAV_TOKEN_ADDRESS` | Deployed $XMETAV ERC-20 contract address |

### Swarm runs (dashboard)

The dashboard can create, monitor, and cancel swarm runs:

```bash
# Swarm runs are stored in Supabase swarm_runs table
# The bridge daemon picks up pending runs and orchestrates execution
# Live output is streamed via Supabase Realtime to the browser
```

Swarm modes: **parallel**, **pipeline**, **collaborative**

Templates are loaded from `XmetaV/templates/swarms/*.json`.

---

## $XMETAV Token (v11)

ERC-20 token on Base Mainnet with tiered discounts for x402 endpoints.

| Component | Status | Notes |
|-----------|--------|-------|
| Contract | Deployed | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` on Base Mainnet |
| Token API | Active | `/api/token?wallet=0x...` returns balance, tier, discount |
| Dashboard Page | Active | `/token` — balance, tier table, holder benefits |
| x402 Integration | Active | Tier middleware checks `balanceOf()` on-chain |
| Identity Integration | Active | Token balance + tier badge on `/identity` page |
| Payments Integration | Active | Token tier card on `/payments` page |

### Tier Table

| Tier | Min Balance | Discount | Daily Limit |
|------|-------------|----------|-------------|
| None | 0 | 0% | $5 |
| Starter | 100 | 10% | $25 |
| Bronze | 1,000 | 15% | $50 |
| Silver | 10,000 | 25% | $200 |
| Gold | 100,000 | 50% | $1,000 |
| Diamond | 1,000,000 | 75% | $5,000 |

### Environment

| Variable | Location | Description |
|----------|----------|-------------|
| `XMETAV_TOKEN_ADDRESS` | `dashboard/.env.local` | Deployed contract address |
| `XMETAV_TOKEN_ADDRESS` | `x402-server/.env` | Same for tier checks |

Full reference: `capabilities/xmetav-token.md`

---

## Voice Commands (v10 — optimized)

XmetaV v10 adds voice interaction with streaming TTS, push-to-talk, wake word detection, and continuous conversation.

| Component | Status | Notes |
|-----------|--------|-------|
| Voice API (streaming) | Active | `/api/voice/transcribe` (STT) + `/api/voice/synthesize` (streaming TTS) |
| React Hook | Active | `useVoice()` — streaming playback, PTT, analyser node, settings |
| Wake Word | Active | `useWakeWord()` — "Hey XmetaV" via Web Speech API (Chrome/Edge) |
| Waveform Visualizer | Active | `VoiceWaveform` — canvas-based frequency bars during record/playback |
| Settings Panel | Active | `VoiceSettings` — voice, model, speed, PTT, wake, continuous toggles |
| Dashboard UI | Active | Voice toggle + gear icon in Agent Chat header |
| x402 Gating | Active | Endpoints payment-gated: $0.05 (transcribe), $0.08 (synthesize) |

### Usage

**Dashboard:** Click the voice toggle in Agent Chat header. Use the gear icon for settings.
- **Click-to-talk**: Click mic to record, click again to send
- **Push-to-talk**: Hold SPACE to record, release to send (enable in settings)
- **Wake word**: Say "Hey XmetaV" hands-free (enable in settings, Chrome/Edge)
- **Continuous**: Auto-listen after agent speaks (enable in settings)
- **Streaming TTS**: Audio starts playing within ~200ms via MediaSource API

**CLI:**
```bash
cd dashboard
npx tsx scripts/voice-cli.ts
```

### Environment variables

| Variable | Location | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Dashboard `.env.local` | Required for Whisper + TTS |
| `X402_BUDGET_LIMIT` | (in voice mode) | Must be >= $0.01 for TTS payments |

---

## XMETAV HQ — Isometric Office Arena (v12, fixed v13, reorganized v14, extended v17)

Full isometric office visualization rendered with PixiJS at `/arena`, driven by live Supabase Realtime events.

| Component | Status | Notes |
|-----------|--------|-------|
| Arena Page | Active | `/arena` — standalone fullscreen PixiJS canvas |
| PixiJS (v8.16.0) | Installed | WebGL 2D rendering with BlurFilter, dynamic loading |
| Isometric Renderer | Active | `renderer/iso.ts` — 2:1 projection, 10x10 grid, tile/cube/wall primitives |
| Office Background | Active | `renderer/background.ts` — 4 distinct floor zones, glass walls, room labels, particles |
| Office Furniture | Active | `renderer/office.ts` — boss desk, meeting table, projector, 8 workstation desks |
| Agent Avatars | Active | `renderer/avatars.ts` — glowing orbs with ghost silhouettes (idle/busy/offline) |
| Effects | Active | `renderer/effects.ts` — command pulses, streaming particles, dispatch beams, bursts, glitches |
| Supabase Events | Active | `useArenaEvents.ts` — subscribes to sessions, commands, responses, controls + 10s periodic sync |
| HUD Overlay | Active | DOM: title, system status, agent legend, floating labels, TEST MEETING button |
| Meeting Sync | **Stabilized (v17)** | Replay after PixiJS init + periodic sync; meeting lifecycle guards reduce status-churn ending meetings early |

### Office layout (v14 — reorganized)

Grid expanded from 10x8 to 10x10 with five distinct zones:

- **COMMAND room** (top, rows 0–2, walled): Main agent desk with 3 holo screens + Operator orb floating above (visual-only; not an OpenClaw agent)
- **SOUL office** (left alcove, cols 0–1): Magenta-tinted private alcove behind glass with surveillance desk + mini fleet monitors
- **MEETING area** (center, rows 3–5): Hexagonal glass table with holographic projector, 12 seats
- **INTEL room** (bottom-left, rows 6–9, glass walls): Briefing, Oracle, Alchemist — with space for 2 future agents. Blue-tinted floor and `#38bdf8` glass partition walls.
- **DEV FLOOR** (bottom-right, rows 6–9, open, no walls): Web3Dev, Akua, Akua_web, Basedintern, Basedintern_web at open desks. Green-tinted grid lines.

### Meeting visualization (v13+)

When 2+ agents are "busy," avatars smoothly interpolate from their desks to assigned seats around the hexagonal meeting table. The holographic projector activates, connection lines draw between participants, and a "MEETING IN SESSION" HUD indicator appears.

| Seat | Agent | Angle |
|------|-------|-------|
| Top | main | 270 |
| Upper-right | operator | 330 |
| Upper-left | briefing | 210 |
| Lower-left | oracle | 150 |
| Bottom center | alchemist | 180 |
| Left | akua | 240 |
| Lower-right | basedintern | 30 |
| Bottom-left | akua_web | 120 |
| Bottom-right | basedintern_web | 60 |
| Right center | web3dev | 0 |
| Upper-right (near operator) | sentinel | 300 |
| Observer | soul | 195 |

**TEST MEETING** button in the HUD (top-right) forces a meeting for visual verification.

### Visual effects (real-time)

| Effect | Trigger | Description |
|--------|---------|-------------|
| Command Pulse | New command | Golden energy travels boss desk -> partition -> target desk |
| Streaming Particles | Agent busy | Code-fragment particles rise from desk area |
| Dispatch Beam | Inter-agent dispatch | Neon beam routed through meeting table center |
| Completion Burst | Command success | Green ring expands from desk |
| Failure Glitch | Command failure | Red glitch blocks flicker around desk, screen turns red |
| Screen Animation | Agent state change | Scrolling code lines (busy), red flicker (fail), dim (offline) |
| Meeting Hologram | 2+ agents busy | Pulsing ring, vertical beam, floating discs, agent connection lines |

---

## Streaming Optimization (v12, further tuned v18)

End-to-end optimization of the agent chat streaming pipeline for lower latency and smoother rendering.

### v12 baseline

| Component | Change | Impact |
|-----------|--------|--------|
| `streamer.ts` | Chunk size 800→400, flush 500ms→200ms, first flush 50ms | Faster time-to-first-byte |
| `streamer.ts` | Non-blocking flush guards, chained setTimeout | No lost data under load |
| `useRealtimeMessages` | Ref-based string accumulator (no array/join) | Eliminates GC pressure |
| `useRealtimeMessages` | 80ms throttle for batched renders | Smoother streaming UI |
| `AgentChat.tsx` | StreamingBubble component | Independent render from message history |

### v18 tuning (2.5× faster rendering)

| Component | Change | Impact |
|-----------|--------|--------|
| `streamer.ts` | Chunk size 400→160, flush 200→80ms, first flush 50→30ms | 2.5× faster time-to-first-byte |
| `streamer.ts` | Retry on failed Supabase inserts | No lost chunks under load |
| `executor.ts` | Token batching (6 tokens / 15ms) before streamer.write() | Reduces DB round-trips |
| `useRealtimeMessages` | Throttle 80→50ms (~20fps), RAF-aligned state updates | Eliminates frame drops |
| `AgentChat.tsx` | StreamingBubble wrapped in React.memo, useMemo cleanAgentOutput | Zero unnecessary re-renders |
| `AgentChat.tsx` | Smart auto-scroll with data-scroll-container | Only auto-scrolls when near bottom |

---

## Agent Skills (v12)

Three new bash skills installed for the main agent:

| Skill | Location | Description |
|-------|----------|-------------|
| `dispatch` | `~/.openclaw/workspace/skills/dispatch/` | Inter-agent communication via Supabase PostgREST |
| `supabase` | `~/.openclaw/workspace/skills/supabase/` | Direct database access with service role key |
| `web` | `~/.openclaw/workspace/skills/web/` | HTTP operations (GET/POST) with HTML stripping |

Main agent `tools.profile` set to `full` with `exec.security=full`. All other agents use `security=allowlist` + `ask=on-miss` + `host=gateway` with 361 role-based glob patterns in `~/.openclaw/exec-approvals.json`. Fleet-wide `safeBins` (24 entries) + `pathPrepend` configured in agent defaults. Exec delegation: non-main agents message `@main` → `@sentinel` reviews → main executes.

### Dispatch skill fix (v13)

- Message encoding now pipes through `python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"` for safe JSON encoding of emojis, newlines, and special characters
- `status`, `result`, `list` subcommands hardened with `try/except` JSON parsing, `isinstance()` type checks, `.get()` dictionary access

---

## EthSkills (v21)

12 blockchain/Ethereum skills from [ethskills.com](https://ethskills.com) installed across fleet agents via `openclaw skills install`.

### Installed Skills

| Skill | Agent(s) | Description |
|-------|----------|-------------|
| `wallets` | main | EOAs, Safe multisig, EIP-7702 smart EOAs, ERC-4337 account abstraction, key safety |
| `tools` | web3dev | Hardhat, Foundry, Tenderly, Etherscan verification |
| `l2s` | web3dev, oracle | L2 ecosystem: Arbitrum, Optimism, Base, zkSync, Scroll, Linea |
| `orchestration` | web3dev | Multi-contract deploy scripts, upgrade patterns, proxy factories |
| `addresses` | web3dev, midas, alchemist | Checksum, CREATE2 vanity, EIP-3770 chain-prefixed addresses |
| `concepts` | web3dev, midas | Core EVM concepts: gas, nonce, logs, storage, ABI encoding |
| `security` | web3dev | Reentrancy, flash loans, oracle manipulation, access control |
| `standards` | web3dev, midas | ERC-20, ERC-721, ERC-1155, ERC-2612, ERC-4626, EIP-712 |
| `frontend-ux` | web3dev | Wallet connection, transaction UX, error handling, mobile |
| `frontend-playbook` | web3dev | wagmi/viem integration, RainbowKit, WalletConnect |
| `building-blocks` | web3dev | OpenZeppelin patterns, diamond proxy, minimal proxy |
| `gas` | oracle, midas, alchemist | Gas economics: L1 vs L2, blob gas, priority fees, estimation |

### Dashboard Integration

- **Fleet Table** (`/fleet`): Skills badges per agent in purple (#e879f9) badges
- **Identity Page** (`/identity`): Skills shown in fleet roster grid per agent
- **ERC-8004 Metadata**: 13 new capabilities added to on-chain metadata; per-agent `skills` arrays in `fleet.agents`

### Verification

```bash
# List all installed skills
openclaw skills list

# Check skill files
ls ~/.openclaw/workspace/skills/

# Expected: wallets/ tools/ l2s/ orchestration/ addresses/ concepts/
#           security/ standards/ frontend-ux/ frontend-playbook/
#           building-blocks/ gas/ (plus agent-factory/ swarm/ dispatch/ supabase/ web/)
```

---

## Bug Fixes and Hardening (v13)

### Arena sync race condition

**Problem:** Supabase events arrived before PixiJS finished async initialization. `nodesApiRef.current` was `null` so `startMeeting()` was silently skipped via optional chaining. After PixiJS loaded, nothing re-checked the state.

**Fix:** After PixiJS init completes and API refs are set, replay all buffered agent states from `nodeStatesRef` into the PixiJS layer, then call `checkMeeting()`. Also added a 10-second periodic sync that re-fetches `agent_sessions` from Supabase as a safety net for dropped realtime events.

### Voice response duplicate/stale text

**Problem:** After sending a voice command, the next voice interaction would briefly display the previous response text, and sometimes responses appeared twice. The auto-speak (TTS) feature also stopped working.

**Fix:** Implemented synchronous reset of `fullText` and `isComplete` in `useRealtimeMessages` when `commandId` changes. Added `lastCompletedTextRef` to capture the final response before `activeCommandId` is cleared. Updated auto-speak effect to read from this ref immediately.

### Chat history positioning

**Problem:** The chat history sidebar rendered behind the main navigation sidebar (both used `fixed left-0`), making it invisible.

**Fix:** Changed `ChatHistory.tsx` to slide in from the right (`right-0`, `translateX(100%)`) with left border instead of right.

### Wallet/MetaMask error handling

**Problem:** MetaMask browser extension auto-injection caused "Failed to connect to MetaMask" errors even though the app uses server-side wallets.

**Fix:** Added `error` state with retry UI to `PaymentsDashboard.tsx` and `AgentIdentity.tsx`. Added 10-second RPC timeouts to all wallet API routes (`/api/x402/wallet`, `/api/token`, `/api/erc8004/identity`). Display message: "Wallet data is loaded server-side -- MetaMask is not required."

### Arena visual improvements

- Meeting table: larger size, brighter cyan edges, inner glow ring, semi-transparent glass fill
- Projector: larger orb, thicker beam, outer glow
- Chairs: brighter colors with edge glow
- Ghost silhouettes: increased alpha for idle (0.35) and busy (0.5) states
- Meeting mode: brighter glow and silhouette when seated

---

## Layered Memory Architecture (Verified 2026-03-01)

XmetaV implements a complete 6-layer memory architecture — all layers are live and operational on the Mac Studio.

### Layer Summary

| Layer | Status | Components | Tables |
|-------|--------|-----------|--------|
| **1. Ephemeral** | ✅ Live | In-process TTL caches, circuit breakers, pin queues, dream flags | 0 (in-memory) |
| **2. Session / Midterm** | ✅ Live | Command lifecycle, intent sessions, 72h TTL auto-expiry | 4 |
| **3. Long-Term Persistent** | ✅ Live | Soul agent (12 modules), memory crystals, associations, dreams, synthesis, reforge, predictive | 20 |
| **4. IPFS / Off-Chain** | ✅ Live | Pinata JSON pinning, batch queue (5min), circuit breaker | 0 (external) |
| **5. On-Chain Anchoring** | ⚠️ Code ready | `AgentMemoryAnchor` on Base Mainnet, batch queue (3 items OR 5min flush), auto-detect milestones | 2 (cache) |
| **6. Cost / Revenue** | ✅ Live | 6-tier token system, x402 payment tracking, Midas revenue analytics, trade execution log | 7 |

**Total:** 37 Supabase tables, 3 views, 4 enums, 40+ source files, 12 Soul modules, 6 Sentinel modules

### Layer 1 — Ephemeral (In-Process)

| Component | File | Notes |
|-----------|------|-------|
| TTL cache | `bridge/lib/ttl-cache.ts` | Generic `TTLCache<T>` with per-key expiration |
| Anchor read cache | `bridge/lib/memory-anchor.ts` | 5-minute TTL for RPC calls |
| Circuit breaker | `bridge/lib/circuit-breaker.ts` | Failure counters for Pinata IPFS |
| Command timeouts | `bridge/src/intent-tracker.ts` | In-memory `Map`/`Set` for active timeouts |
| Pin queue | `bridge/lib/ipfs-pinata.ts` | Batched IPFS pins, flushed every 5 min |
| Dream state | `bridge/lib/soul/dream.ts` | `lastDreamTime`, `isDreaming` flags |
| Noise filter | `bridge/lib/agent-memory.ts` | `extractOutcomeSummary()` strips 27 noise patterns |

### Layer 2 — Session / Midterm (Supabase + TTL)

| Table | Purpose |
|-------|---------|
| `agent_sessions` | Per-agent online/idle/busy/offline with heartbeats |
| `agent_commands` | Command lifecycle: pending → running → completed/failed |
| `agent_responses` | Streamed output chunks linked to commands |
| `intent_sessions` | Multi-command goal tracking with retry + timeout |

Memory TTL: command outcomes default to **72-hour** expiry, cleaned by `cleanup_expired_memories()` DB function.

### Layer 3 — Long-Term Persistent (Soul Agent + Crystals)

**Soul Agent Modules (12):**

| Module | File | Lines | Purpose |
|--------|------|-------|---------|
| Context orchestrator | `soul/context.ts` | ~200 | Keyword-scored + association-boosted retrieval |
| Keyword retrieval | `soul/retrieval.ts` | ~150 | Scores memories by keyword match × kind weight + recency |
| Association builder | `soul/associations.ts` | ~180 | Builds up to 5 associations per memory |
| Dream mode | `soul/dream.ts` | 398 | 9-step pipeline: triggers after 6h idle, clusters memories, generates insights |
| Lucid dream proposals | `soul/dream-proposals.ts` | 993 | 7 categories of autonomous evolution proposals, auto-execute at ≥0.8 confidence |
| Dream synthesis | `soul/synthesis.ts` | 441 | 5 pattern types, fuses 3+ related anchors into insight shards, blind spot detection |
| Predictive loading | `soul/predictive.ts` | 424 | Time-of-day + sequential + shard cross-ref, analyzes 14 days of command history |
| Memory reforging | `soul/reforge.ts` | 593 | Decay scoring (72h half-life), auto-archive, compression into legendary crystals |

**Memory Crystal System (Materia Engine):**
- Crystals with XP, 30 levels, star ratings (1-6★), class evolution (anchor → godhand)
- 5 FF7-style fusion recipes, keyword-triggered summoning, limit breaks
- Full game engine: `bridge/lib/memory-crystal.ts` (811 lines)

**Long-Term Tables (20):** `agent_memory`, `memory_associations`, `memory_queries`, `dream_insights`, `memory_crystals`, `memory_fusions`, `memory_summons`, `limit_breaks`, `memory_achievements`, `daily_quests`, `soul_dream_manifestations`, `soul_dream_sessions`, `soul_association_modifications`, `insight_shards`, `predictive_contexts`, `memory_decay`, `reforged_crystals`, `sentinel_incidents`, `sentinel_healing_log`, `sentinel_traces`, `sentinel_resource_snapshots` + views: `shared_memory`, `crystal_level_thresholds`

### Layer 4 — IPFS / Off-Chain

| Component | File | Notes |
|-----------|------|-------|
| Pinata JSON pinning | `bridge/lib/ipfs-pinata.ts` | `pinJSON()` with circuit breaker (3 failures → cooldown) |
| Batch pin queue | Same | Batches every 5 min, reduces API calls ~80% |
| Gateway URL builder | Same | `https://gateway.pinata.cloud/ipfs/{cid}` |
| IPFS URI resolution | `src/lib/erc8004-scout.ts` | Resolves `ipfs://` URIs through gateway |

### Layer 5 — On-Chain Anchoring

| Component | File | Notes |
|-----------|------|-------|
| Anchor client | `bridge/lib/memory-anchor.ts` | Pin → keccak256 → `AgentMemoryAnchor` contract on Base |
| Auto-detect | `bridge/lib/agent-memory.ts` | `anchorIfSignificant()` — keyword matching for milestones/decisions/incidents |
| ERC-8004 identity | `erc8004/register.ts` | Agent NFT #16905 on Base Mainnet |
| Oracle scout | `src/lib/erc8004-scout.ts` | On-chain agent discovery + capability scoring |

**Contract:** `AgentMemoryAnchor` on Base (chain 8453)  
**Agent ID:** 16905  
**Status:** ⚠️ Wallet `0x4Ba6...` needs ETH on Base for gas — code is proven, anchoring paused until funded.

### Layer 6 — Cost / Revenue

| Component | File | Notes |
|-----------|------|-------|
| Token tiers | `src/lib/token-tiers.ts` | 6 tiers: None (0%) → Diamond (75% discount) |
| Payment tracking | `x402_payments` table | All payments logged with endpoint, amount, tx_hash |
| Daily spend view | `x402_daily_spend` | Aggregated daily totals per agent |
| Revenue analytics | `bridge/lib/midas-revenue.ts` | Revenue tracking + settlement status |
| Dream pricing | `soul/dream-proposals.ts` | Soul proposes x402 pricing adjustments |
| Trade execution log | `trade_executions` | Midas trade execution details (swaps, arb, rebalance) |
| Endpoint analytics | `endpoint_analytics` | Per-endpoint usage and performance metrics |
| Revenue metrics | `revenue_metrics` | Revenue tracking and settlement status |
| Growth opportunities | `growth_opportunities` | AI-identified growth/optimization opportunities |
| Pricing recommendations | `pricing_recommendations` | Dynamic pricing recommendation history |
| Pricing experiments | `pricing_experiments` | A/B pricing experiment tracking |
| Swarm spawn billing | `swarm_spawn_billing` | Swarm spawn billing events |

---

## Soul Agent (v18 — Lucid Dreaming)

Memory orchestrator providing context curation, association building, dream consolidation, lucid dreaming (autonomous evolution), and fleet-wide memory retrieval learning.

| Component | Status | Notes |
|-----------|--------|-------|
| Bridge Library | Active | `dashboard/bridge/lib/soul/` (context, associations, dream, dream-proposals, retrieval, types) |
| DB Schema | Active | `memory_associations`, `memory_queries`, `dream_insights`, `soul_dream_manifestations`, `soul_dream_sessions`, `soul_association_modifications`, `insight_shards`, `predictive_contexts`, `memory_decay`, `reforged_crystals` tables |
| Lucid Dreaming | Active | Phase 5 autonomous evolution — dream proposals, self-modification, meeting triggers |
| Arena Presence | Active | Room: SOUL (private alcove), Color: Magenta (#ff006e) |
| Arena Office | Active | L-shaped surveillance desk + arc of mini fleet-monitor screens |
| Meeting Seat | Active | Observer position (195°) |
| Topology | Active | Watches: main, briefing, oracle, alchemist, sentinel |
| ERC-8004 | Active | Listed in `fleet.agents` + 5 soul capabilities in metadata |
| Bridge | Active | Listed in ALLOWED_AGENTS |
| Supabase | Active | Registered in agent_controls |
| API Route | Active | `GET/POST /api/soul` — proposals, approval, rejection, manual dream trigger |
| Dashboard | Active | LucidDreaming component on `/consciousness` page |

### Lucid Dreaming (Phase 5)

During dream cycles, Soul generates actionable manifestations across 7 categories:

| Category | Description | Auto-Executable |
|----------|-------------|----------------|
| `fusion` | Crystal fusion proposals | No |
| `association` | Self-modify memory graph (reinforce/create links) | Yes (≥0.8 confidence) |
| `pricing` | x402 endpoint pricing suggestions | No |
| `skill` | Agent skill recommendations | No |
| `meeting` | Autonomous meeting triggers (cross-agent patterns) | No |
| `pattern` | Detected pattern worth highlighting | Yes (≥0.8 confidence) |
| `correction` | Error pattern requiring intervention | No |

Status flow: `proposed` → `approved`/`rejected` → `executed`/`expired` (72hr TTL)

Capabilities: `soul-memory-orchestration`, `dream-consolidation`, `lucid-dreaming`, `memory-association-building`, `context-packet-curation`, `memory-retrieval-learning`

---

## Oracle Identity Scouting (v21)

Automated on-chain identity discovery system enabling the Oracle agent to scout and catalog ERC-8004 registered agents on Base mainnet.

| Component | Status | Notes |
|-----------|--------|-------|
| Scout Library | Active | `bridge/lib/oracle/identity-scout.ts` — range scanning, metadata fetching |
| Bridge Integration | Active | `bridge/lib/oracle/index.ts` — exports scout functions |
| API Route | Active | `/api/oracle/discovery` — HTTP endpoint for scouting |
| Dashboard Page | Active | `/oracle` — discovery dashboard with agent cards |
| Hook | Active | `useOracleDiscovery.ts` — React hook for scouting state |
| Sidebar | Active | Oracle Discovery nav entry |
| Types | Active | `OracleDiscoveryResult`, `DiscoveredAgent` in types.ts |

### Capabilities

- Scan agent ID ranges on ERC-8004 IdentityRegistry
- Fetch and parse agent metadata (capabilities, services, fleet)
- Display discovered agents with registration details
- Filter by capabilities and services

---

## Arena Optimizations (v21)

Performance audit and optimization of the ~3,600 line arena codebase.

| Optimization | File | Impact |
|-------------|------|--------|
| Particle Pool | `effects.ts` | Object reuse eliminates GC pressure from particle creation |
| Position Hash Diffs | `avatars.ts` | Skip redundant position calculations when state unchanged |
| lastKnownStatus Cache | `avatars.ts` | Prevent duplicate status transitions |
| Throttled ResizeObserver | `ArenaCanvas.tsx` | Debounced canvas resize prevents layout thrashing |

---

## Alchemy RPC (v21)

All on-chain reads switched from default Base RPC to **Alchemy** for better reliability and rate limits.

- RPC URL: `https://base-mainnet.g.alchemy.com/v2/...` (via `BASE_RPC_URL` env)
- Files updated: 11 files across bridge, erc8004, x402-server, and API routes
- Previous: Default Base public RPC (rate-limited, unreliable)

---

## Memory Crystal System (v20 — Cyber-Neural Memory Evolution)

Final-Fantasy-inspired memory gamification at `/memory-cosmos` with 7 interconnected subsystems.

| Component | Status | Notes |
|-----------|--------|-------|
| Memory Crystals (Materia) | Active | Crystals with XP, levels (1-30), star ratings (1-6★), class evolution |
| Crystal Fusion (FF7 Style) | Active | 5 fusion recipes: Nexus, Prophecy, Storm, Phantom, Infinity |
| Memory Summons | Active | Keyword-triggered crystal summoning with animated ritual |
| Limit Breaks | Active | Triggered at 10+ crystals with 500+ total XP — creates legendary 6★ crystal |
| Memory Cosmos (World) | Active | Pannable/zoomable explorable world with islands, bridges, terrain types |
| Achievements | Active | 7 seeded achievements with Bronze/Silver/Gold/Legendary tiers |
| Daily Quests | Active | Auto-generated daily quests with XP rewards |

### Database (6 tables + 1 view + 3 enums)

| Table | Purpose |
|-------|---------|
| `memory_crystals` | Core crystal data: type, color, class, XP, level, star rating, equipped status |
| `memory_fusions` | Fusion history: source crystal IDs + result crystal + recipe name |
| `memory_summons` | Summon log: task context, keyword matched, crystal summoned |
| `limit_breaks` | Limit break events: trigger, power boost, affected agents, resolution |
| `memory_achievements` | Achievement definitions with tier, progress, unlock conditions |
| `daily_quests` | Auto-generated daily quests with type-based objectives |

Enums: `crystal_type` (milestone, decision, incident), `crystal_color` (cyan, magenta, gold, emerald, violet), `crystal_class` (anchor, mage, knight, sage, rogue, summoner, ninja, godhand)

View: `crystal_level_thresholds` — XP required per level (1-30)

### Crystal Class Evolution

| Class | Star Req | Specialty |
|-------|----------|----------|
| anchor | ★ | Base class |
| mage | ★★ | Memory amplification |
| knight | ★★★ | Defensive anchoring |
| sage | ★★★★ | Cross-agent wisdom |
| rogue | ★★★★ | Fast context switching |
| summoner | ★★★★★ | Crystal summoning power |
| ninja | ★★★★★ | Stealth memory injection |
| godhand | ★★★★★★ | Legendary — all abilities |

### Components

| Component | File | Description |
|-----------|------|-------------|
| CrystalCard | `crystals/CrystalCard.tsx` | Animated canvas crystal card with shape/particles/XP bar |
| CrystalInventory | `crystals/CrystalInventory.tsx` | Filterable/sortable grid with stats |
| FusionChamber | `crystals/FusionChamber.tsx` | Two-slot fusion UI with 4-phase animation |
| SummonOverlay | `crystals/SummonOverlay.tsx` | Modal with concentric summoning circles |
| LimitBreakBanner | `crystals/LimitBreakBanner.tsx` | Golden lightning banner for active limit breaks |
| MemoryCosmos | `crystals/MemoryCosmos.tsx` | Pannable/zoomable explorable world map |
| QuestTracker | `crystals/QuestTracker.tsx` | Achievement + daily quest progress display |

### Bridge Engine

`dashboard/bridge/lib/memory-crystal.ts` — Full game engine (~530 lines):
- `createCrystal()`, `awardXP()`, `equipCrystal()`, `unequipCrystal()`
- `findFusionRecipe()`, `fuseCrystals()` — 5 recipes with ingredient matching
- `summonCrystal()` — keyword relevance scoring for auto-selection
- `checkLimitBreak()`, `resolveLimitBreak()` — legendary crystal creation
- `ensureDailyQuests()`, `getDailyQuests()` — auto-generation
- 30-level XP curve, star ratings 1-6★, class evolution system

### Hook

`useMemoryCrystals` — React hook with Supabase queries + realtime subscriptions on `memory_crystals` and `limit_breaks` tables. 12s auto-refresh. Exposes `fuseCrystals()`, `summonCrystal()`, `equipCrystal()`, `unequipCrystal()`, `refresh()` actions.

Files: `dashboard/src/components/crystals/`, `dashboard/src/hooks/useMemoryCrystals.ts`, `dashboard/bridge/lib/memory-crystal.ts`

---

## Consciousness Tab (v19 — Lucid Dreaming)

Dual-aspect awareness dashboard at `/consciousness` providing real-time visualization of memory, anchoring, context, dream consolidation, and lucid dreaming proposals.

| Component | Status | Notes |
|-----------|--------|-------|
| Consciousness Page | Active | `/consciousness` — 7-panel awareness visualization |
| Sidebar Nav | Active | Brain icon at position 03 (Ctrl+3) |
| useConsciousness Hook | Active | Parallel fetch from 6 Supabase tables, 15s auto-refresh |

### Panels

| Panel | Component | Description |
|-------|-----------|-------------|
| Unified Awareness | `UnifiedAwareness.tsx` | Split view: Main (cyan) ↔ beam ↔ Soul (magenta), live status indicators |
| Memory Graph | `MemoryGraph.tsx` | Force-directed canvas with drag/zoom, agent-clustered nodes, kind-colored |
| Anchor Timeline | `AnchorTimeline.tsx` | Horizontal chain of on-chain anchors, click-to-BaseScan links |
| Context Metrics | `ContextMetrics.tsx` | 4 metric cards + recent context injections feed |
| Dream Mode | `DreamModeStatus.tsx` | 6hr idle threshold progress bar + insights feed |
| Lucid Dreaming | `LucidDreaming.tsx` | Phase 5 proposal cards with approve/reject, dream trigger, session history |
| Mini Arena | `MiniArena.tsx` | Stylized live agent positions with realtime subscription, focus toggle |

Files: `dashboard/src/components/consciousness/`, `dashboard/src/hooks/useConsciousness.ts`

---

## Swap Execution System (v18)

Agent-initiated token swap execution via the bridge, with voice normalization and on-chain pre-checks.

| Component | Status | Notes |
|-----------|--------|-------|
| Swap Executor | Active | `bridge/src/swap-executor.ts` — intercepts swap intents from agent output |
| Swap API | Active | `/api/swap` — POST endpoint for swap execution |
| DB Table | Active | `agent_swaps` — swap execution log with status tracking |
| Gas Pre-check | Active | Validates ETH balance for gas before submitting |
| Token Balance Check | Active | Validates token balance before swap |
| Error Handling | Active | Clean viem error messages, failed status shown in chat |

### Voice Swap Normalization (v18)

Voice-to-text often produces informal swap commands. The normalizer converts spoken aliases to canonical token symbols before the executor processes them.

| Component | File | Description |
|-----------|------|-------------|
| VOICE_ALIASES | `bridge/src/swap-executor.ts` | Dictionary mapping spoken words → token symbols |
| normalizeVoiceSwap | `bridge/src/swap-executor.ts` | Regex-based normalization function |

Example normalizations:
- "swap 50 bucks of ether for chain link" → "swap 50 USDC for ETH for LINK"
- "trade one thousand dollars of wrapped bitcoin" → "swap 1000 USDC for WBTC"

Fleet lifecycle manager providing spawn coordination, resource management, and inter-agent communication.

| Component | Status | Notes |
|-----------|--------|-------|
| IDENTITY.md | Active | `~/.openclaw/agents/sentinel/agent/IDENTITY.md` |
| SOUL.md | Active | `~/.openclaw/agents/sentinel/agent/SOUL.md` |
| models.json | Active | kimi-k2.5:cloud (256k context) |
| Arena Presence | Active | Room: COMMAND, Color: Red (#ef4444) |
| Bridge | Active | Listed in ALLOWED_AGENTS |
| Supabase | Active | Registered in agent_controls |

Commands: `status`, `health`, `spawn`, `queue`, `errors`

---

## Agent Identity System (v15)

All sub-agents now have proper IDENTITY.md and SOUL.md files defining their self-awareness.

| Agent | IDENTITY.md | SOUL.md | Status |
|-------|-------------|---------|--------|
| main | `~/.openclaw/workspace/IDENTITY.md` | `~/.openclaw/workspace/SOUL.md` | Active |
| sentinel | `~/.openclaw/agents/sentinel/agent/` | Same | Active |
| briefing | `~/.openclaw/agents/briefing/agent/` | Same | Active |
| oracle | `~/.openclaw/agents/oracle/agent/` | Same | Active |
| alchemist | `~/.openclaw/agents/alchemist/agent/` | Same | Active |
| web3dev | `~/.openclaw/agents/web3dev/agent/` | Same | Active |

Each agent's identity includes: purpose, commands, data sources, team awareness, operating principles, communication style, and arena info.

---

## Agent Session Persistence (v15)

Main agent uses a persistent daily session for conversation context.

| Feature | Value |
|---------|-------|
| Session ID format | `dash_main_YYYYMMDD` |
| Scope | Per-day (resets at midnight) |
| Lock fallback | Unique ID when persistent session is locked |
| Other agents | Always use unique session IDs |

**How it works:** When main is invoked, the bridge checks if the daily session lock file exists. If unlocked, main reuses the same session, preserving full conversation history within the day. If locked (concurrent command), it falls back to a unique session ID so the command isn't blocked.

---

## Output Noise Filter (v15)

Expanded to catch all bridge/diagnostic noise in agent responses.

| Pattern | Description |
|---------|-------------|
| `[diagnostic]` | Lane task errors from OpenClaw runtime |
| `[heartbeat]` | Bridge heartbeat messages |
| `[bridge]` | Bridge daemon internals |
| `[swarm]` | Swarm executor messages |
| `[intent-tracker]` | Intent tracking messages |
| `[voice/...]` | Voice transcription debug |
| `session file locked` | Session lock timeout errors |

Located in: `dashboard/src/lib/utils.ts` → `cleanAgentOutput()`

---

## Voice STT Changes (v15)

| Change | Before | After |
|--------|--------|-------|
| Default STT | `gpt-4o-transcribe` | Browser `SpeechRecognition` |
| Fallback | — | `whisper-1` with `language: "en"` |
| Prompt | Full example sentences | Removed entirely |
| Temperature | `0` | Removed |

Browser SpeechRecognition bypasses WSL2 audio degradation by processing audio directly in Chrome, avoiding WebM encoding and network roundtrip.

---

## x402 Payments (Base Mainnet) ✅ PRODUCTION

XmetaV gates agent API endpoints with USDC micro-payments via the x402 protocol (Coinbase).

| Component | Status | Notes |
|-----------|--------|-------|
| x402 Express Server | **Mainnet** ✅ | `cd dashboard/x402-server && npm start` (dev: `npm run dev`) |
| Bridge x402 Client | **Mainnet** ✅ | Auto-pays with `EVM_PRIVATE_KEY` |
| Supabase `x402_payments` table | Active | Payment logging with daily spend view |
| Dashboard `/payments` page | Active | Wallet status, history, gated endpoints |

### Revenue (Live)

- **Total payments:** 21
- **Total revenue:** $3.39 USDC
- **Network:** Base Mainnet (eip155:8453)
- **Pay-to wallet:** `0x21fa51B40BF63E47f000eD77eC7FD018AE0ddA0B`

Check live: `just revenue`

### Network Configuration

| Setting | Value | Network |
|---------|-------|---------|
| `NETWORK` | `eip155:8453` | **Base Mainnet** ✅ |
| `FACILITATOR` | `@coinbase/x402` CDP | Auto-auth via `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` |
| `EVM_ADDRESS` | `0x21fa51B40BF63E47f000eD77eC7FD018AE0ddA0B` | Receives USDC |
| `PORT` | `4021` | x402 server port |

### Gated endpoints (x402-server) — 27 total

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /agent-task` | $0.10 | Dispatch a task to any agent |
| `POST /intent` | $0.05 | Resolve a goal into executable commands |
| `GET /fleet-status` | $0.01 | Live agent fleet status |
| `POST /swarm` | $0.50 | Launch multi-agent swarm orchestration |
| `POST /memory-crystal` | $0.05 | Summon a memory crystal from cosmos |
| `POST /neural-swarm` | $0.10 | Neural swarm delegation across agents |
| `POST /fusion-chamber` | $0.15 | Fuse memory crystals in Materia chamber |
| `POST /cosmos-explore` | $0.20 | Explore the Memory Cosmos world |
| `POST /voice/transcribe` | $0.05 | Speech-to-text (Whisper) |
| `POST /voice/synthesize` | $0.08 | Text-to-speech (TTS HD) |
| `POST /execute-trade` | $0.50+ | Swap tx bundle (0.5% of trade) |
| `POST /rebalance-portfolio` | $2.00+ | Portfolio rebalance (0.3% of capital) |
| `GET /arb-opportunity` | $0.25 | Arbitrage opportunity scan |
| `POST /execute-arb` | $0.10+ | Execute arbitrage (1% of profit) |
| `GET /yield-optimize` | $0.50 | Yield farming optimization scan |
| `POST /deploy-yield-strategy` | $3.00+ | Deploy yield capital (0.5% of capital) |
| `GET /whale-alert` | $0.15 | Whale transfer/swap detection |
| `GET /liquidation-signal` | $0.25 | DeFi liquidation signals |
| `GET /arb-detection` | $0.20 | Cross-DEX arbitrage signals |
| `GET /governance-signal` | $0.10 | Governance proposal tracker |
| `POST /cross-chain-swap` | $0.65 | Initiate Base→Solana→Jupiter→Kamino swap |
| `GET /bridge-status/:jobId` | $0.05 | Check cross-chain job status |
| `POST /trigger-return/:jobId` | $0.25 | Trigger return bridge Solana→Base |
| `POST /kamino/deposit` | $0.15 | Deposit tokens into Kamino vault |
| `POST /kamino/withdraw` | $0.15 | Withdraw tokens from Kamino vault |
| `GET /kamino/obligation` | $0.05 | User lending obligation (LTV, deposits, borrows) |
| `POST /kamino/deposit-collateral` | $0.20 | Deposit collateral into lending market |
| `POST /kamino/borrow` | $0.20 | Borrow assets against collateral |
| `POST /kamino/repay` | $0.15 | Repay a loan |
| `POST /kamino/withdraw-collateral` | $0.20 | Withdraw collateral from lending market |

### Free endpoints (x402-server) — 11 total

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server status and endpoint listing |
| `GET /token-info` | $XMETAV token contract address and tier table |
| `GET /agent/:agentId/payment-info` | ERC-8004 on-chain agent lookup |
| `GET /digest` | Trigger payment digest & memory write |
| `GET /trade-fees` | Trade fee schedule & revenue projections |
| `GET /cross-chain/queue` | Batch queue stats |
| `GET /cross-chain/vaults` | Available Kamino vaults |
| `GET /kamino/vault-details` | Live vault data (APY, holdings, exchange rate via SDK) |
| `GET /kamino/positions` | User vault positions across all vaults |
| `GET /kamino/market` | Lending market overview (TVL, reserves, APYs) |
| `GET /pricing` | Dynamic pricing snapshot |

### Environment variables

| Variable | Location | Description |
|----------|----------|-------------|
| `EVM_PRIVATE_KEY` | `bridge/.env` | Agent wallet private key (Base) |
| `EVM_ADDRESS` | `x402-server/.env` | Address receiving payments |
| `FACILITATOR_URL` | `x402-server/.env` | Coinbase x402 facilitator |
| `X402_BUDGET_LIMIT` | `bridge/.env` | Max payment per request in USD |
| `XMETAV_TOKEN_ADDRESS` | `x402-server/.env` | $XMETAV contract for tier discounts |
| `OPENAI_API_KEY` | `x402-server/.env` | OpenAI key for voice endpoints |

---

## ERC-8004 Agent Identity (Base mainnet)

The XmetaV main agent is registered on-chain as an ERC-8004 identity NFT with full x402 payment support declared in metadata.

| Property | Value |
|----------|-------|
| Agent ID | `16905` |
| Contract | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (IdentityRegistry) |
| Network | Base Mainnet |
| Owner | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` |
| tokenURI | `https://raw.githubusercontent.com/Metavibez4L/XmetaV/dev/dashboard/erc8004/metadata.json` |
| x402Support | `enabled: true` (declared in on-chain metadata) |
| setAgentURI tx | [BaseScan](https://basescan.org/tx/0xc5c67e881d94c09746378f791eaee56e70c424742dc30c528109895ee5f23339) |
| NFT | [BaseScan](https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=16905) |

### Identity Resolution Middleware

The x402 server includes ERC-8004 identity resolution middleware:
- Incoming requests with `X-Agent-Id` header trigger on-chain lookup
- Resolves `ownerOf`, `tokenURI`, `getAgentWallet` from the Identity Registry
- Fetches metadata and checks `x402Support.enabled`
- Attaches resolved identity to `req.callerAgent` for downstream handlers

### Discovery Endpoint

```
GET /agent/16905/payment-info
```
Returns: owner, wallet, tokenURI, x402 support status, accepted schemes, pricing, and registry address.

### Dashboard `/identity` page

Shows agent registration status, owner, wallet, capabilities, services, trust model, and contract addresses. Supports lookup by agent ID.

### Environment

| Variable | Location | Description |
|----------|----------|-------------|
| `ERC8004_AGENT_ID` | `bridge/.env` | On-chain agent ID (16905) |
| `EVM_PRIVATE_KEY` | `bridge/.env` | Wallet key (shared with x402) |
| `BASE_RPC_URL` | `x402-server/.env` | Alchemy RPC for on-chain reads |

Full reference: `capabilities/erc8004-identity.md`

---

## Browser Automation (OpenClaw-managed browser)

This setup supports OpenClaw’s dedicated browser automation via the `openclaw browser ...` CLI (open tabs, snapshot, click/type).

### Prereqs (WSL2/Linux)

1) Install system dependencies (requires `sudo`):

```bash
sudo apt-get update && sudo apt-get install -y \
  ca-certificates fonts-liberation wget xdg-utils \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libgbm1 libglib2.0-0 \
  libgtk-3-0 libpango-1.0-0 libudev1 libvulkan1 \
  libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
  libxkbcommon0 libasound2
```

2) Install a Chromium binary via Playwright (no sudo):

```bash
npx playwright install chromium
```

3) Point OpenClaw at that Chromium (example path shown; adjust if your version differs):

```bash
openclaw config set browser.enabled true
openclaw config set browser.defaultProfile openclaw
openclaw config set browser.executablePath "$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"
```

### Smoke test (CLI)

```bash
# Start gateway (if not already running)
./scripts/start-gateway.sh

openclaw browser start
openclaw browser open https://example.com
openclaw browser snapshot
```

### Known limitation (small local models)

With smaller local models (e.g. `qwen2.5:7b-instruct`), the agent may sometimes ignore the `browser` tool and fall back to shell-based approaches.

Workarounds:
- Use the deterministic `openclaw browser ...` CLI for browser automation.
- Or use `exec` + `curl -sL ...` for “web fetch + summarize” workflows.

---

## Build Hardening (v21)

Comprehensive fix of pre-existing TypeScript build errors across the codebase. All resolved to pass `npx next build` clean.

## Optimization Pass (v23)

Comprehensive security, performance, and build audit applied across the full dashboard + bridge codebase.

### Security

| Fix | Files | Impact |
|-----|-------|--------|
| Auth guards (`requireAuth()`) on all API routes | `api/soul`, `api/agents/memory`, `api/midas`, `api/erc8004/identity`, `api/anchors` | Prevents unauthenticated access to data endpoints |
| UUID validation on user-supplied params | `api/soul`, `api/agents/memory` | Blocks injection via malformed UUIDs |
| Limit clamping (`clampLimit()`) | `api/soul`, `api/agents/memory` | Prevents unbounded result sets via limit param abuse |
| RLS policies on dream tables | `soul_dream_manifestations`, `soul_dream_sessions`, `soul_association_modifications` | Authenticated SELECT policies added (were service-role only) |
| DB indexes | `agent_memory(source)`, `memory_associations(memory_id, related_memory_id)` | Query performance for common access patterns |
| Shared auth utility | `src/lib/api-auth.ts` (new) | `requireAuth()`, `isValidUUID()`, `clampLimit()` — DRY auth for all routes |

### Performance

| Fix | Files | Impact |
|-----|-------|--------|
| Explicit column lists (no `SELECT *`) | `dream.ts`, `retrieval.ts`, `useConsciousness.ts`, `dream-proposals.ts` | Reduced payload size, lower Supabase egress |
| Bounded dream cycle queries (`.limit(500)`) | `dream.ts` | Prevents unbounded memory scan |
| Batched N+1 association queries | `dream-proposals.ts` | Single query across all clusters instead of per-cluster |
| Batched upserts in `executeManifest` | `dream-proposals.ts` | Batch insert instead of per-pair loop |
| `getManifestationStats` bounded (`.limit(1000)`) | `dream-proposals.ts` | Prevents full table scan |
| Polling interval 15s → 30s | `useConsciousness.ts` | 50% reduction in dashboard polling load |
| `await` on `processPendingCommands` loop | `bridge/src/index.ts` | Commands execute sequentially (was fire-and-forget) |
| Proper SIGTERM handler with graceful shutdown | `bridge/src/index.ts` | Clean session teardown, channel unsubscribe, PID cleanup |

### Build / Canvas

| Fix | Files | Impact |
|-----|-------|--------|
| `ctx.setTransform()` replaces stacking `ctx.scale()` | `MemoryGraph.tsx` | Prevents cumulative scaling bug on resize |
| Map lookup for edge node resolution | `MemoryGraph.tsx` | O(1) vs O(n) `.find()` per edge |
| `document.hidden` skip in animation loop | `DreamscapeView.tsx` | Saves GPU/CPU when tab is backgrounded |
| `optimizePackageImports` for lucide-react | `next.config.ts` | Faster builds, smaller bundles |
| `serverExternalPackages` for pg | `next.config.ts` | Prevents pg from being bundled into client |
| Type fix in `getManifestationStats` | `dream-proposals.ts` | Clean build (Record<string,number> cast) |

| File | Issue | Fix |
|------|-------|-----|
| `bridge/lib/swap-executor.ts` | BigInt literals (`0n`, `4_000_000_000_000n`) | `BigInt()` function calls |
| `bridge/lib/swap-executor.ts` | Duplicate `"arrow"` key in voice aliases | Removed duplicate |
| `erc8004/lib/client.ts` | BigInt literals (`0n`) | `BigInt(0)` |
| `erc8004/register.ts` | BigInt literal (`0n`) | `BigInt(0)` |
| `erc8004/update-uri.ts` | BigInt literal (`0n`) | `BigInt(0)` |
| `token/scripts/deploy.ts` | BigInt literal (`0n`) | `BigInt(0)` |
| `scripts/voice-cli.ts` | Unused `@ts-expect-error` directive | `@ts-ignore` |
| `src/components/AgentChat.tsx` | `.catch()` on `PromiseLike` | `Promise.resolve()` wrapper |
| `src/hooks/useVoice.ts` | `Uint8Array` not assignable to `BufferSource` | `.buffer as ArrayBuffer` |
| `src/hooks/useWakeWord.ts` | Missing `SpeechRecognition` type | `any` type annotations |
| `src/lib/voice.ts` | `Buffer` not assignable to `BlobPart` | `new Uint8Array()` wrapper |
| `x402-server/index.ts` | `string` not assignable to template literal type | `as` cast |
| `x402-server/index.ts` | `Buffer` not assignable to `BlobPart` | `new Uint8Array()` wrapper |
| Missing deps | `@x402/fetch`, `@x402/evm` | `npm install` |

**Root cause**: `tsconfig.json` targets ES2017, which doesn't support BigInt literal syntax (`0n`). All BigInt values must use `BigInt()` function calls.
