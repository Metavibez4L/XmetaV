# Pre-Launch Checklist — Before Going Live

> **Status:** Blocked (waiting on Mac Studio setup)
> **Last updated:** 2026-02-23
> **Context:** x402 payment rail works (received $5.11 USDC) but is NOT production-ready

---

## Current State: Works, But Will Break

| Area | Status | Risk |
|------|--------|------|
| Payment rail | Working | — |
| Wallet funded | Yes | — |
| Trade execution | Basic | Fragile under load |
| Persistence | **None** | Restart = lost tx history |
| Auto-restart | **None** | Crash = downtime |
| HTTPS/SSL | **None** | Most clients will reject |
| Rate limiting | **None** | Spammer drains funds in minutes |
| Hardware | MacBook Air | Crashes under concurrent load |

**Bottom line:** Fine for testing with trusted users. Not safe for real revenue.

---

## Must-Have Before Go-Live

### 1. Database (Payment Persistence)

> Without this: restart = lost transaction history, can't verify who paid what, risk of double-charging

- [ ] Install PostgreSQL on Mac Studio
- [ ] Create `x402_payments` table (tx hash, amount, sender, endpoint, timestamp, status)
- [ ] Create `x402_sessions` table (active sessions, rate limit tracking)
- [ ] Migrate payment-memory from in-memory to Postgres
- [ ] Add payment verification queries (lookup by tx hash, prevent replays)
- [ ] Backfill any test transactions from current logs

**Schema sketch:**
```sql
CREATE TABLE x402_payments (
  id SERIAL PRIMARY KEY,
  tx_hash TEXT UNIQUE NOT NULL,
  sender_address TEXT NOT NULL,
  amount_usdc DECIMAL(18,6) NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE x402_rate_limits (
  sender_address TEXT PRIMARY KEY,
  request_count INT DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ
);
```

### 2. Process Management (Auto-Restart)

> Without this: crash or reboot = downtime, lost revenue, no one monitoring at 3 AM

- [ ] Create LaunchDaemon plist for x402-server
- [ ] Create LaunchDaemon plist for bridge server
- [ ] Create LaunchDaemon plist for Ollama
- [ ] Create LaunchDaemon plist for OpenClaw gateway
- [ ] Test: kill process → verify auto-restart within 10s
- [ ] Test: reboot Mac Studio → verify all services come back
- [ ] Add health check endpoint (`/health`) that returns service status

**LaunchDaemon location:** `/Library/LaunchDaemons/com.xmetav.x402.plist`

### 3. HTTPS / SSL

> Without this: most browsers, API clients, and agent frameworks refuse to connect

- [ ] **Option A (recommended):** Tailscale Funnel — free auto-HTTPS, zero config
- [ ] **Option B:** nginx reverse proxy + Let's Encrypt cert
- [ ] **Option C:** Caddy (auto-HTTPS built in)
- [ ] Verify: `curl https://your-endpoint/health` returns 200
- [ ] Update all x402 endpoint URLs to HTTPS
- [ ] Redirect HTTP → HTTPS

### 4. Rate Limiting

> Without this: one bad actor floods your endpoints, drains wallet, crashes server

- [ ] Implement per-address rate limiting (e.g., 100 req/min per sender)
- [ ] Implement global rate limiting (e.g., 1,000 req/min total)
- [ ] Add automatic blocking for abusive patterns
- [ ] Return 429 status with retry-after header
- [ ] Log rate limit events for monitoring

### 5. Monitoring & Alerts

> Without this: problems happen silently, you find out when users complain

- [ ] Set up uptime monitoring (ping `/health` every 60s)
- [ ] Alert on: service down, high error rate, wallet balance low
- [ ] Daily revenue summary (automated email or Discord message)
- [ ] Log rotation (don't fill disk with logs)
- [ ] Disk space monitoring (alert at 80% usage)

---

## Nice-to-Have Before Go-Live

- [ ] Request logging with structured JSON (for debugging)
- [ ] Revenue dashboard page in Next.js app
- [ ] Webhook notifications for large payments (>$1)
- [ ] Graceful shutdown (finish in-flight requests before stopping)
- [ ] Backup strategy for Postgres (daily pg_dump)
- [ ] API documentation / endpoint catalog page
- [ ] Terms of service for API consumers

---

## Go-Live Sequence

```
Step 1: Mac Studio remote access     ← REMOTE-ACCESS.md
Step 2: Migrate services to Studio   ← MIGRATION.md
Step 3: Database setup (Postgres)    ← this checklist
Step 4: LaunchDaemons (auto-restart) ← this checklist
Step 5: HTTPS (Tailscale Funnel)     ← this checklist
Step 6: Rate limiting                ← this checklist
Step 7: Monitoring                   ← this checklist
Step 8: Smoke test all endpoints     ← manual verification
Step 9: Enable Tier 1 pricing        ← revenue/REVENUE.md
Step 10: Announce & go live          🚀
```

---

## Quick Validation Before Each Step

After completing each must-have, run this sanity check:

```bash
# From MacBook Air in NC
ssh studio << 'EOF'
  echo "=== Services ==="
  curl -s localhost:3001/health | jq .
  curl -s localhost:3000 | head -1
  openclaw health

  echo "=== Database ==="
  psql -d xmetav -c "SELECT count(*) FROM x402_payments;"

  echo "=== SSL ==="
  curl -s https://$(tailscale status --json | jq -r '.Self.DNSName'):3001/health

  echo "=== Rate Limits ==="
  for i in {1..5}; do curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/health; done

  echo "=== Disk ==="
  df -h / | tail -1
EOF
```

---

## Related Docs

- [REMOTE-ACCESS.md](REMOTE-ACCESS.md) — Priority 1: get remote access working
- [MIGRATION.md](MIGRATION.md) — Full service migration plan
- [../revenue/REVENUE.md](../revenue/REVENUE.md) — Revenue tiers and pricing
