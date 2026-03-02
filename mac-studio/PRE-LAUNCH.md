# Pre-Launch Checklist — Before Going Live

> **Status:** ✅ Phase 1 Complete (Tailscale-only access)
> **Last updated:** 2026-03-02
> **Context:** x402 payment rail live on Mac Studio. $3.39 USDC revenue from 21 payments. Phase 2 = public exposure.

---

## Current State: Live on Tailscale

| Area | Status | Notes |
|------|--------|-------|
| Payment rail | ✅ Working | Base Mainnet, CDP facilitator auto-auth |
| Wallet funded | ✅ Yes | Revenue wallet receiving USDC |
| Persistence | ✅ Supabase | 24 tables, full memory architecture |
| Hardware | ✅ Mac Studio M3 Ultra | 96GB, 28 cores, always-on |
| Remote access | ✅ Tailscale | SSH + Screen Sharing, direct peer-to-peer |
| Watchdog | ✅ Active | launchd, 5 min checks |
| Ollama hot-keep | ✅ Active | 24h keep-alive, 3 models, 4 parallel |
| Trade execution | Basic | Needs more testing under load |
| HTTPS/SSL | ⬜ Phase 2 | Not needed while Tailscale-only |
| Rate limiting | ⬜ Phase 2 | Not needed while Tailscale-only |
| Auto-restart | ⬜ Partial | Watchdog monitors, no KeepAlive plists yet |

**Bottom line:** Fully operational for development and trusted testing via Tailscale. Phase 2 (public) needs HTTPS + rate limiting.

---

## Phase 1 Checklist — ✅ Complete

### 1. Database (Payment Persistence) — ✅ Done
- [x] Supabase cloud as primary store (24 tables/views)
- [x] `x402_payments` table logging all payments (21 transactions, $3.39 revenue)
- [x] `x402_daily_spend` view for daily aggregations
- [x] Full 6-layer memory architecture operational

### 2. Process Management — ✅ Partial
- [x] Watchdog script (Tailscale, SSH, VNC checks every 5 min)
- [x] Watchdog launchd plist (RunAtLoad)
- [x] Ollama env launchd plist (hot-keep config)
- [x] `justfile` with 18 commands (`just all`, `just killall`, `just status`)
- [x] Power settings: never sleep, auto-restart after power failure
- [ ] **TODO:** Full LaunchDaemon plists with KeepAlive for dashboard, bridge, x402

### 3. Monitoring — ✅ Partial
- [x] `just status` — check all 5 services in one command
- [x] `just health` — full system health (services + power + disk + memory)
- [x] `just revenue` — x402 payment revenue totals
- [x] Watchdog log at `/tmp/xmetav-watchdog.log`
- [ ] **TODO:** Automated alerts (Discord/email) on service down

---

## Phase 2 Checklist — Public Exposure (Not Started)

### 4. HTTPS / SSL
> Required before exposing x402 endpoints to the internet

- [ ] **Option A (recommended):** `tailscale serve` — free auto-HTTPS via Tailscale Funnel
- [ ] **Option B:** Caddy reverse proxy (auto-HTTPS with Let's Encrypt)
- [ ] Verify: `curl https://your-endpoint/health` returns 200
- [ ] Update endpoint URLs to HTTPS
- [ ] Redirect HTTP → HTTPS

### 5. Rate Limiting
> Required before public access

- [ ] `express-rate-limit` middleware on x402-server
- [ ] Per-address limits (100 req/min general, 10 req/min payment endpoints)
- [ ] Global rate limit (1,000 req/min)
- [ ] 429 response with Retry-After header
- [ ] CORS configuration (dashboard origin only)

### 6. Request Validation
- [ ] Input validation on all POST bodies
- [ ] API key auth option for premium integrators
- [ ] Abuse pattern blocking

---

## Go-Live Sequence

```
Phase 1 (DONE):
  ✅ Mac Studio remote access (Tailscale)
  ✅ Migrate services to Studio
  ✅ Database persistence (Supabase)
  ✅ Watchdog + power management
  ✅ x402 payment flow verified
  ✅ Tooling (pnpm, just, Ollama hot-keep)

Phase 2 (NEXT):
  ⬜ HTTPS (tailscale serve or Caddy)
  ⬜ Rate limiting
  ⬜ Full LaunchDaemon plists
  ⬜ Automated alerts
  ⬜ Smoke test all endpoints
  ⬜ Fund agent wallet (ETH for on-chain anchoring)
  ⬜ Announce & go live 🚀
```

---

## Quick Validation

```bash
# From Mac Studio (or SSH from MacBook Air)
cd ~/Documents/xmetav1/XmetaV

just status       # All services UP?
just revenue      # Payments flowing?
just health       # Full system health

# Manual checks
curl -s http://localhost:4021/health | head -5    # x402 server
curl -s http://localhost:3001/health              # Bridge
curl -s http://localhost:3000 | head -1           # Dashboard
ollama list                                        # Models loaded
tailscale status                                   # VPN connected
```

---

## Related Docs

- [REMOTE-ACCESS.md](REMOTE-ACCESS.md) — Tailscale SSH + Screen Sharing setup
- [TAILSCALE-SETUP.md](TAILSCALE-SETUP.md) — Air-to-Studio Tailscale guide
- [MIGRATION.md](MIGRATION.md) — Full migration plan (✅ complete)
- [../revenue/REVENUE.md](../revenue/REVENUE.md) — Revenue tiers and pricing
- [../docs/STATUS.md](../docs/STATUS.md) — Full system status
- [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — System architecture
