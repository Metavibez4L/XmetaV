# Optimization Plan — Full System Review

> **Status:** Active
> **Created:** 2026-03-02
> **Platform:** Mac Studio M3 Ultra · macOS 26.3 · OpenClaw 2026.3.1
> **Branch:** dev

---

## Current State Audit

Before planning, here's what's **already done** vs what's **not**:

| Optimization | Status | Notes |
|-------------|--------|-------|
| Ollama hot-keep (keep_alive=-1, 3 models, 4 parallel) | ✅ Done | launchd plist `com.ollama.env` + `just warm` |
| Watchdog (Tailscale/SSH/VNC checks) | ✅ Done | launchd plist `com.xmetav.watchdog` |
| DB indexes (7 CONCURRENTLY indexes) | ✅ Done | `setup-db-indexes.sql` |
| Circuit breaker (bridge) | ✅ Done | `bridge/lib/circuit-breaker.ts` |
| TTL cache (bridge) | ✅ Done | `bridge/lib/ttl-cache.ts` |
| RLS on soul/swaps tables (4 tables, 5 policies) | ✅ Done | `setup-db-soul.sql`, `setup-db-swaps-log.sql` |
| Power management (never sleep, auto-restart) | ✅ Done | `pmset` configured |
| `justfile` (24 recipes, launchd-native) | ✅ Done | `just status`, `just restart`, `just cold-check`, `just warm`, etc. |
| LaunchAgent auto-restart (all 3 services) | ✅ Done | `com.xmetav.{dashboard,bridge,x402}.plist` — KeepAlive + RunAtLoad |
| RLS on x402_payments, agent_memory, agent_commands | ❌ Not done | Critical tables unprotected |
| SSE/WebSocket streaming | ❌ Not done | Still using Supabase polling |
| Middleware `getSession()` optimization | ✅ Done | Replaced `getUser()` — saves ~130ms per request |
| `useBridgeControl` visibility-aware polling | ✅ Done | 5s→15s interval, pauses on hidden tabs |
| CSS animation GPU optimization | ✅ Done | `will-change`, hover-only spin, `prefers-reduced-motion` |
| `optimizePackageImports` expanded | ✅ Done | Added `@supabase/supabase-js`, `viem` |
| Bridge manager → launchctl | ✅ Done | Dashboard buttons use `launchctl` instead of `spawn` |
| Structured logging (Pino) | ❌ Not done | Console.log scattered |
| Secrets consolidation | ❌ Not done | Multiple .env files |
| Redis/caching layer | ❌ Not done | No in-memory cache beyond TTL |
| Alerting (Discord/email) | ❌ Not done | Silent failures |
| Docker | ❌ Not done | Bare metal only |

---

## Priority Matrix

| # | Optimization | Impact | Effort | Priority | ETA |
|---|-------------|--------|--------|----------|-----|
| 1 | ~~LaunchDaemon auto-restart (all services)~~ | High | Low | **P0 ✅** | Done |
| 2 | RLS on critical tables | High | Low | **P0** | 30 min |
| 3 | Structured logging (Pino) | Medium | Low | **P1** | 2 hr |
| 4 | Secrets consolidation (.env → single source) | Medium | Low | **P1** | 1 hr |
| 5 | SSE streaming (replace polling) | High | Medium | **P1** | 4 hr |
| 6 | Alerting (Discord webhook) | Medium | Low | **P1** | 1 hr |
| 7 | Supabase selective Realtime | Medium | Low | **P2** | 30 min |
| 8 | Redis caching layer | Medium | Medium | **P2** | 3 hr |
| 9 | x402 batch settlements | Medium | Medium | **P2** | 4 hr |
| 10 | Docker multi-stage builds | Medium | High | **P3** | 8 hr |
| 11 | Context embeddings cache | Medium | High | **P3** | 6 hr |
| 12 | Kubernetes / HPA | Low | High | **P3** | — |

---

## P0 — Do Now

### 1. ✅ LaunchAgent Auto-Restart (All Services) — COMPLETE

**Implemented:** 2026-03-02

All three services run as LaunchAgents with `KeepAlive: true` + `RunAtLoad: true`:
- `com.xmetav.dashboard.plist` → Next.js dev (:3000)
- `com.xmetav.bridge.plist` → tsx watch (:3001)
- `com.xmetav.x402.plist` → tsx watch (:4021)

**Key decisions:**
- Repo moved to `~/xmetav1/` (symlink at `~/Documents/xmetav1`) — macOS Sequoia TCC blocks launchd from `~/Documents`
- Wrapper scripts in `/usr/local/bin/xmetav/` use absolute paths
- Bridge and x402 use `DOTENV_CONFIG_PATH` since cwd is `/tmp`
- Dashboard `bridge-manager.ts` refactored to use `launchctl` instead of `spawn`
- All services use `tsx watch` for auto-reload on code changes

**Also completed (performance):**
- Middleware: `getSession()` replaces `getUser()` — ~130ms saved per request
- `useBridgeControl`: poll interval 5s→15s + visibility-aware pause
- `optimizePackageImports`: added `@supabase/supabase-js`, `viem`
- CSS: `will-change` on animations, hover-only spin, `prefers-reduced-motion`
- Sidebar + useIntentSession: `useMemo` for `createClient()`

---

### 2. RLS on Critical Tables

**Problem:** `x402_payments`, `agent_memory`, `agent_commands` have no RLS.
**Risk:** Any authenticated Supabase client can read/write all payments and commands.

**Tables needing RLS:**

| Table | Risk | Policy Needed |
|-------|------|---------------|
| `x402_payments` | Payment data exposed | Service-role write, authenticated read |
| `x402_daily_spend` | Spend data exposed | Service-role only |
| `agent_memory` | Memory leakage | Service-role write, authenticated read own agent |
| `agent_commands` | Command injection | Service-role write, authenticated read |
| `agent_controls` | Agent enable/disable | Service-role manage, authenticated read |

**SQL:**
```sql
-- x402_payments
ALTER TABLE x402_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON x402_payments
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Authenticated read own payments" ON x402_payments
  FOR SELECT USING (auth.role() = 'authenticated');

-- agent_memory
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON agent_memory
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Authenticated read" ON agent_memory
  FOR SELECT USING (auth.role() = 'authenticated');

-- agent_commands
ALTER TABLE agent_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON agent_commands
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Authenticated read own" ON agent_commands
  FOR SELECT USING (auth.role() = 'authenticated');

-- agent_controls
ALTER TABLE agent_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manage" ON agent_controls
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Authenticated read" ON agent_controls
  FOR SELECT USING (auth.role() = 'authenticated');
```

**Validation:**
```bash
# From dashboard, verify API still works (uses service_role)
curl -s localhost:3000/api/x402/payments | head -5
# From anon key, verify read-only
```

---

## P1 — This Week

### 3. Structured Logging (Pino)

**Problem:** `console.log` scattered across bridge, x402, and streamer. No structured format, no log levels, no correlation IDs.

**Plan:**
```
Install: pnpm add pino pino-pretty (bridge + x402-server)
Replace: console.log → logger.info/warn/error
Format: JSON with agent_id, command, duration, tokens
Dev: pino-pretty for readable terminal output
Prod: raw JSON → pipe to file or aggregator
```

**Example output:**
```json
{"level":"info","time":1709400000,"agent":"oracle","cmd":"whale-scan","dur":1250,"tokens":450}
{"level":"error","time":1709400001,"agent":"main","cmd":"dispatch","err":"timeout after 30s"}
```

### 4. Secrets Consolidation

**Problem:** Multiple `.env` files: `dashboard/.env.local`, `bridge/.env`, `x402-server/.env`, `erc8004/.env`.

**Plan:**
```
Option A (recommended): Single .env at repo root, symlinked
Option B: 1Password CLI (`op run --env-file`)
Option C: dotenvx for encrypted .env

Start with A:
  1. Create XmetaV/.env.shared with common vars (SUPABASE_URL, keys, wallet)
  2. Source from sub-project .env files
  3. Remove duplicated secrets
```

### 5. SSE Streaming (Replace Polling)

**Problem:** Bridge streams via Supabase INSERT → dashboard polls every ~1s. Adds latency and unnecessary DB writes.

**Plan:**
```
Phase 1: Add SSE endpoint to bridge (/api/stream)
Phase 2: Dashboard subscribes via EventSource
Phase 3: Keep Supabase as persistence but remove real-time polling
Phase 4: Measure latency improvement (target: <50ms)
```

**Architecture:**
```
Agent → Bridge → SSE → Dashboard
                  ↓
              Supabase (persist only)
```

### 6. Alerting (Discord Webhook)

**Problem:** Service failures are silent. Watchdog logs to `/tmp` but nobody reads it at 3 AM.

**Plan:**
```
1. Create Discord webhook for #ops channel
2. Add to watchdog.sh: curl webhook on service down
3. Add daily summary: revenue, uptime, errors
4. Add wallet balance alert (< 0.01 ETH)
```

**Implementation:**
```bash
# Add to scripts/watchdog.sh
DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."
alert() {
  curl -s -H "Content-Type: application/json" \
    -d "{\"content\":\"🚨 XmetaV Alert: $1\"}" \
    "$DISCORD_WEBHOOK"
}
```

---

## P2 — This Month

### 7. Supabase Selective Realtime

**Current:** Realtime enabled on all tables.
**Optimized:** Only enable on tables the dashboard actually subscribes to.

**Tables needing Realtime:**
- `agent_commands` (command dispatch)
- `agent_memory` (memory feed)
- `swarm_runs` / `swarm_tasks` (swarm progress)

**Disable Realtime on:**
- `x402_payments` (read via API, not real-time)
- `x402_daily_spend` (aggregation view)
- `dream_insights`, `memory_associations` (batch queries)

### 8. Redis Caching Layer

**Use cases:**
- Agent context packets (TTL 5 min)
- x402 payment verification (TTL 1 hr, prevent double-process)
- Soul memory associations (TTL 10 min)
- Rate limit counters (TTL 1 min)

**Stack:** Redis via Homebrew (`brew install redis`) + `ioredis` client.

### 9. x402 Batch Settlements

**Current:** Each payment settles independently on-chain.
**Optimized:** Batch settlements every N minutes or $X threshold.
**Savings:** ~80% gas cost reduction.

---

## P3 — Future

### 10. Docker Multi-Stage Builds

Containerize each service for reproducible deploys. Not urgent while single-server.

### 11. Context Embeddings Cache

Cache agent context embeddings to reduce token usage on repeated queries. Requires embedding model (e.g., `nomic-embed-text` via Ollama).

### 12. Kubernetes / HPA

Horizontal pod autoscaling, service mesh. Only relevant when scaling beyond single Mac Studio.

---

## Revenue Optimization (Separate Track)

### Pricing Review

| Endpoint | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| `/fleet-status` | $0.01 | $0.005 | Volume driver, low cost to serve |
| `/agent-task` | $0.10 | $0.08 | Competitive, still profitable |
| `/swarm` | $0.50 | $0.25 + 1% of value | Align with value delivered |
| `/alpha-*` feeds | $0.05 | $0.03 | Increase consumption |
| `/trade/*` | 0.5% | 0.3% + $0.01 base | Competitive with CEX fees |

### $XMETAV Token Utility
- Staking for discount tiers (already implemented: Bronze→Diamond)
- Revenue sharing for Diamond holders (>100K tokens)
- Governance rights on pricing changes
- Priority queue for agent tasks

---

## Quick Reference

```bash
# Check what's implemented
just status                    # Service health
just health                    # Full system (services + power + disk)
just revenue                   # x402 payment totals

# After implementing P0
launchctl list | grep xmetav   # All services auto-managed
just rls-check                 # RLS policy audit (TODO: add to justfile)
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial plan created. Audited current state. |
