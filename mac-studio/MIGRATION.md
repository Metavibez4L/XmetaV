# Mac Studio Migration Plan

> **Target:** Mac Studio (M4 Ultra — 96GB / 28 CPU / 60 GPU cores)
> **Source:** MacBook Air (current dev machine)
> **Status:** Planning
> **Last updated:** 2026-02-23

---

## Overview

Migrate all XmetaV services from MacBook Air to Mac Studio. The Studio has the resources to run production infrastructure properly — Postgres, nginx, Ollama, and the x402 server concurrently without fighting the hardware.

---

## Priority Improvements (Bundle with Migration)

### Critical (must-have)

#### 1. HTTPS/SSL Termination
- **Current state:** HTTP only — not acceptable for production x402 payments
- **Plan:** Reverse proxy with proper certs
  - **Option A:** Caddy (auto-HTTPS with Let's Encrypt, zero config)
  - **Option B:** nginx + certbot
- **Tasks:**
  - [ ] Install Caddy or nginx on Mac Studio
  - [ ] Configure reverse proxy for x402-server (port 3001 → 443)
  - [ ] Configure reverse proxy for dashboard (port 3000 → 443)
  - [ ] Set up auto-renewal for SSL certs
  - [ ] Configure HSTS headers
  - [ ] Domain DNS → Mac Studio IP (or Tailscale Funnel)

#### 2. Process Management
- **Current state:** Running with `npm start` / `npm run dev` — dies on crash, no auto-start
- **Plan:** LaunchDaemon plists with auto-restart and log rotation
- **Tasks:**
  - [ ] Create `ai.xmetav.x402-server.plist` (LaunchDaemon)
  - [ ] Create `ai.xmetav.bridge.plist` (LaunchDaemon)
  - [ ] Create `ai.xmetav.dashboard.plist` (LaunchDaemon)
  - [ ] Configure `KeepAlive: true` + `ThrottleInterval: 10`
  - [ ] Set up log rotation via `newsyslog` or `logrotate`
  - [ ] Test crash recovery (kill -9 → auto-restart)
  - [ ] OpenClaw gateway already has a LaunchAgent — verify it migrates

#### 3. Database Persistence
- **Current state:** Supabase (cloud) for most data; x402 payment logs may be in-memory
- **Plan:** PostgreSQL for transaction records + local caching
- **Tasks:**
  - [ ] Install PostgreSQL on Mac Studio
  - [ ] Migrate Supabase schema locally (or keep Supabase as primary, PG as backup)
  - [ ] Ensure x402 payment records persist across restarts
  - [ ] Run existing setup scripts (`scripts/setup-db*.sql`)
  - [ ] Verify `payment-memory.ts` writes to persistent store
  - [ ] Set up PG backup schedule (pg_dump daily)

---

### Important (should-have)

#### 4. API Authentication & Rate Limiting
- **Current state:** x402 endpoints rely on payment gating only
- **Plan:** Add defense-in-depth
- **Tasks:**
  - [ ] Add rate limiting middleware (e.g., express-rate-limit)
  - [ ] Configure per-IP limits (100 req/min general, 10 req/min for payment endpoints)
  - [ ] Add optional API key auth for premium integrators
  - [ ] Block common abuse patterns (user-agent filtering, geo blocking if needed)
  - [ ] Add CORS configuration for dashboard origin only

#### 5. Webhook Reliability
- **Current state:** Fire-and-forget callbacks
- **Plan:** Reliable delivery with retries
- **Tasks:**
  - [ ] Implement idempotency keys on payment endpoints
  - [ ] Add retry logic with exponential backoff (3 attempts, 1s/5s/30s)
  - [ ] Dead letter queue for failed callbacks (log to DB for manual review)
  - [ ] Webhook signature verification (HMAC-SHA256)

#### 6. Monitoring & Alerting
- **Current state:** Manual log checking
- **Plan:** Automated health checks + alerts
- **Tasks:**
  - [ ] Add `/health` endpoint to x402-server (DB connectivity, wallet balance, uptime)
  - [ ] Set up uptime monitor (UptimeRobot, or self-hosted with cron)
  - [ ] Alert on: service down, wallet balance low, payment failures spike
  - [ ] Dashboard integration — show x402 health on Command Center page
  - [ ] Grafana or simple metrics endpoint for historical data

#### 7. Backup Strategy
- **Current state:** No automated backups
- **Plan:** Multi-layer backup
- **Tasks:**
  - [ ] Wallet private keys → encrypted backup (1Password / hardware wallet)
  - [ ] Database → daily pg_dump to encrypted external storage
  - [ ] Config files → Git-tracked (secrets excluded via .gitignore)
  - [ ] OpenClaw state → `~/.openclaw/` backed up
  - [ ] Time Machine on Mac Studio for full machine backup
  - [ ] Test restore procedure

---

### Nice-to-have

#### 8. Documentation
- **Current state:** Internal docs only
- **Plan:** Public-facing API reference
- **Tasks:**
  - [ ] API reference with curl examples for all x402 endpoints
  - [ ] x402 payment scheme documentation for integrators
  - [ ] OpenAPI/Swagger spec for the x402-server
  - [ ] Integration guide: "How to pay for XmetaV API access"
  - [ ] Rate limits and pricing table

---

## Migration Checklist

### Pre-Migration (on MacBook Air)

- [ ] Document all running services and their ports
- [ ] Export all environment variables / `.env` files
- [ ] List all installed global packages (`npm list -g`, `brew list`)
- [ ] Back up wallet private keys securely
- [ ] Git push all repos to remote (ensure clean state)
- [ ] Document OpenClaw config (`~/.openclaw/openclaw.json`)
- [ ] Note Supabase connection strings and API keys
- [ ] Export Ollama models list

### Mac Studio Setup

- [ ] macOS initial setup + latest updates
- [ ] Install Homebrew
- [ ] Install Node.js (v25.x via Homebrew or nvm)
- [ ] Install Ollama + pull models (`kimi-k2.5:cloud`)
- [ ] Install PostgreSQL
- [ ] Install Caddy or nginx
- [ ] Install OpenClaw (`npm install -g openclaw`)
- [ ] Clone XmetaV repo
- [ ] Copy `.env` files from Air
- [ ] Run `npm install` in dashboard, bridge, x402-server, token
- [ ] Restore OpenClaw config (`~/.openclaw/openclaw.json`)
- [ ] Set up SSH keys for GitHub
- [ ] Enable remote access (Screen Sharing + SSH)
- [ ] Configure Tailscale for remote access

### Service Migration

- [ ] Start and test x402-server
- [ ] Start and test bridge
- [ ] Start and test dashboard
- [ ] Start and test OpenClaw gateway
- [ ] Verify Ollama model inference
- [ ] Verify Supabase connectivity
- [ ] Verify on-chain identity anchor still works
- [ ] Verify wallet balances accessible
- [ ] Run `openclaw doctor` — all green

### Post-Migration

- [ ] Install LaunchDaemon plists for all services
- [ ] Configure nginx/Caddy reverse proxy + SSL
- [ ] Set up monitoring and health checks
- [ ] Run full integration test (x402 payment flow end-to-end)
- [ ] Update DNS / public URLs
- [ ] Decommission MacBook Air services (keep as dev machine)
- [ ] Document final architecture in `docs/ARCHITECTURE.md`

---

## Wallet Migration

| Wallet | Address | Purpose | Location |
|--------|---------|---------|----------|
| **Identity** | `0x4Ba6...` | On-chain anchors (ERC-8004) | OpenClaw config |
| **Revenue** | `0x21fa...dA0B` | x402 USDC payments | `dashboard/x402-server/.env` |

Both wallets need private keys transferred securely:
- **Never** copy private keys over plain text / unencrypted channels
- Use encrypted USB drive or 1Password vault
- Verify balances on both machines after migration
- Keep MacBook Air as cold backup until confirmed working

---

## Network Architecture (Post-Migration)

```
Internet
  │
  ├── Caddy/nginx (443/HTTPS)
  │     ├── /api/x402/*  →  x402-server (:3001)
  │     ├── /*           →  dashboard (:3000)
  │     └── /ws          →  OpenClaw gateway (:18789)
  │
  ├── Tailscale (remote access)
  │     ├── SSH (:22)
  │     ├── Screen Sharing (:5900)
  │     └── Direct service access (dev only)
  │
  └── Local only
        ├── Ollama (:11434)
        ├── PostgreSQL (:5432)
        └── Bridge (internal)
```

---

## Timeline

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| **Prep** | Document current state, back up keys, export configs | 1-2 hours |
| **Setup** | Install toolchain on Mac Studio | 2-3 hours |
| **Migrate** | Clone repos, copy configs, start services | 2-3 hours |
| **Harden** | Plists, nginx, monitoring, backups | 3-4 hours |
| **Verify** | End-to-end testing, DNS cutover | 1-2 hours |
| **Total** | | ~10-14 hours |

---

## Notes

- Keep MacBook Air as development machine — test changes locally before deploying to Studio
- Consider running Mac Studio headless with Screen Sharing + SSH for remote management
- Ollama will benefit massively from 96GB unified memory — can run much larger models
- iMessage integration can be re-enabled on the Studio once migration is stable
