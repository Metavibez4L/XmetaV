# Mac Studio Migration Plan

> **Target:** Mac Studio (M3 Ultra — 96GB / 28 CPU / 60 GPU cores)
> **Source:** MacBook Air (previous dev machine)
> **Status:** ✅ COMPLETE — Live since 2026-02-27
> **Last updated:** 2026-03-02

---

## Overview

All XmetaV services have been migrated from MacBook Air to Mac Studio. The Studio runs as an always-on headless server in NYC, managed remotely from a MacBook Air in NC via Tailscale VPN.

### What's Running

| Service | Port | Status |
|---------|------|--------|
| Next.js Dashboard | 3000 | ✅ Live |
| Bridge Daemon | 3001 | ✅ Live |
| x402 Payment Server | 4021 | ✅ Live |
| OpenClaw Gateway | 18789 | ✅ Live |
| Ollama | 11434 | ✅ Live (24h hot-keep, 3 models) |
| SSH | 22 | ✅ Live (Tailscale) |
| Screen Sharing | 5900 | ✅ Live (Tailscale) |
| Watchdog | launchd | ✅ Live (5 min checks) |

### Quick Commands

```bash
cd ~/Documents/xmetav1/XmetaV
just status     # Check all services
just all        # Start everything
just killall    # Stop everything
just health     # Full system health
just revenue    # Check x402 payments
```

---

## Priority Improvements

### Critical — ✅ Complete

#### 1. HTTPS/SSL Termination
- **Status:** Partially addressed — services accessible via Tailscale (encrypted tunnel)
- **Public exposure:** Not yet public. Currently accessible only via Tailscale VPN.
- **Phase 2 plan:** `tailscale serve` or Caddy reverse proxy when ready for public access

#### 2. Process Management — ✅ Complete
- **Watchdog:** `scripts/watchdog.sh` monitors Tailscale, SSH, Screen Sharing every 5 min
- **launchd plist:** `~/Library/LaunchAgents/com.xmetav.watchdog.plist` (RunAtLoad)
- **Ollama hot-keep:** `~/Library/LaunchAgents/com.ollama.env.plist` (24h keep-alive, 3 models, 4 parallel)
- **Power settings:** sleep 0, autorestart 1, disksleep 0 (always-on headless)
- **Services:** Started via `just all` — dashboard, bridge, x402, gateway
- **TODO:** Full LaunchDaemon plists for auto-restart on crash (KeepAlive: true)

#### 3. Database Persistence — ✅ Complete (Supabase)
- **Primary store:** Supabase cloud (24 tables/views, all with Realtime + RLS)
- **Payment persistence:** `x402_payments` table — 21 payments, $3.39 revenue logged
- **Memory persistence:** Full 6-layer memory architecture (ephemeral → session → long-term → IPFS → on-chain)
- **No local PostgreSQL needed** — Supabase handles persistence, bridge writes all critical state

---

### Important — In Progress

#### 4. API Authentication & Rate Limiting
- **Current state:** x402 payment gating only, Tailscale-only access
- **TODO:**
  - [ ] Add rate limiting middleware (express-rate-limit)
  - [ ] CORS configuration for dashboard origin
  - [ ] API key auth for premium integrators

#### 5. Webhook Reliability
- **Current state:** Fire-and-forget
- **TODO:**
  - [ ] Idempotency keys on payment endpoints
  - [ ] Retry logic with exponential backoff
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

### Pre-Migration (on MacBook Air) — ✅ Complete

- [x] Document all running services and their ports
- [x] Export all environment variables / `.env` files
- [x] List all installed global packages
- [x] Back up wallet private keys securely
- [x] Git push all repos to remote (clean state)
- [x] Document OpenClaw config
- [x] Note Supabase connection strings and API keys
- [x] Export Ollama models list

### Mac Studio Setup — ✅ Complete

- [x] macOS initial setup + latest updates (macOS 26.3)
- [x] Install Homebrew
- [x] Install Node.js v25.6.1 via Homebrew
- [x] Install pnpm v10.30.3 via Homebrew
- [x] Install just v1.46.0 via Homebrew
- [x] Install Ollama v0.17.4 (macOS app) + pull models (kimi-k2.5:cloud, qwen2.5:7b-instruct)
- [x] Configure Ollama hot-keep (24h, 3 models, 4 parallel) via launchd
- [x] Install OpenClaw v2026.2.17 (npm global)
- [x] Clone XmetaV repo to `/Users/akualabs/Documents/xmetav1/XmetaV`
- [x] Copy `.env` files (bridge, x402-server, dashboard)
- [x] Fix Linux→macOS paths in bridge/.env (NODE_PATH, OPENCLAW_PATH)
- [x] Fix x402-server/.env (remove FACILITATOR_URL, use CDP auto-auth)
- [x] Run npm install in dashboard, bridge, x402-server
- [x] Restore OpenClaw config (`~/.openclaw/openclaw.json`)
- [x] Set up SSH keys for GitHub (user: akualabs, email: metavibez4l@gmail.com)
- [x] Enable SSH via `launchctl load -w /System/Library/LaunchDaemons/ssh.plist`
- [x] Enable Screen Sharing
- [x] Configure Tailscale (App Store build, system extension, 100.93.86.17)

### Service Migration — ✅ Complete

- [x] Start and test dashboard (port 3000)
- [x] Start and test bridge (port 3001)
- [x] Start and test x402-server (port 4021)
- [x] Start and test OpenClaw gateway (port 18789)
- [x] Verify Ollama model inference (kimi-k2.5:cloud + qwen2.5:7b)
- [x] Verify Supabase connectivity (realtime subscriptions active)
- [x] Verify on-chain identity (ERC-8004 #16905 on Base)
- [x] Verify x402 payments (402 Payment Required confirmed, 21 payments logged)
- [x] Fix health-check.sh and start-gateway.sh for macOS compatibility

### Post-Migration — ✅ Mostly Complete

- [x] Configure power settings (sleep 0, autorestart 1, always-on)
- [x] Install watchdog (launchd plist, 5 min checks)
- [x] Set up monitoring (watchdog checks Tailscale, SSH, Screen Sharing)
- [x] Verify x402 payment flow end-to-end ($3.39 revenue confirmed)
- [x] MacBook Air kept as remote dev machine (Tailscale connection verified)
- [x] Create justfile with 18 commands for service management
- [x] Document architecture in `docs/ARCHITECTURE.md` — updated 2026-03-02
- [ ] **TODO:** Full LaunchDaemon plists for auto-restart on crash
- [ ] **TODO:** HTTPS/SSL for public exposure (Caddy or tailscale serve)
- [ ] **TODO:** Rate limiting middleware

---

## Wallets (Migrated)

| Wallet | Address | Purpose | Status |
|--------|---------|---------|--------|
| **Identity / Agent** | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` | On-chain anchors (ERC-8004), agent wallet | ⚠️ Needs ETH for gas |
| **Revenue** | `0x21fa51B40BF63E47f000eD77eC7FD018AE0ddA0B` | x402 USDC payments | ✅ Active, receiving |

---

## Network Architecture (Current — Tailscale Only)

```
MacBook Air (NC) ─── Tailscale VPN ─── Mac Studio (NYC)
100.122.52.85                            100.93.86.17
                                          │
                                          ├── Dashboard    :3000
                                          ├── Bridge       :3001
                                          ├── x402 Server  :4021
                                          ├── Gateway WS   :18789
                                          ├── Ollama       :11434
                                          ├── SSH          :22
                                          └── VNC          :5900
```

### Phase 2 — Public Exposure (Planned)

```
Internet
  │
  ├── Tailscale Funnel or Caddy (443/HTTPS)
  │     ├── /api/x402/*  →  x402-server (:4021)
  │     ├── /*           →  dashboard (:3000)
  │     └── /ws          →  OpenClaw gateway (:18789)
  │
  ├── Tailscale (admin remote access)
  │     ├── SSH (:22)
  │     ├── Screen Sharing (:5900)
  │     └── Direct service access (admin only)
  │
  │
  └── Local only
        ├── Ollama (:11434)
        └── Bridge (internal :3001)
```

---

## Timeline (Actual)

| Phase | Tasks | Completed |
|-------|-------|-----------| 
| **Prep** | Document state, back up keys, export configs | 2026-02-27 |
| **Setup** | Install toolchain, configure macOS | 2026-02-27 |
| **Migrate** | Clone repos, fix paths, start services | 2026-02-27 |
| **Harden** | Watchdog, power settings, Tailscale SSH/VNC | 2026-02-28 |
| **x402 Live** | Fix facilitator auth, verify payments | 2026-03-01 |
| **Tooling** | Install pnpm, just, create justfile, Ollama hot-keep | 2026-03-01 |
| **Docs** | Full documentation update | 2026-03-02 |

---

## Notes

- MacBook Air is now the remote dev machine — test changes locally before deploying to Studio
- Mac Studio runs headless 24/7 with Screen Sharing + SSH for remote management
- Ollama benefits massively from 96GB unified memory — models stay hot 24h
- FileVault is ON — potential lockout risk on reboot if no one enters password locally
- On-chain anchoring paused until agent wallet is funded with ETH on Base
