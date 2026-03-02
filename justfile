# XmetaV — Mac Studio Command Runner
# Usage: just <command>

set dotenv-load := false
root := justfile_directory()
dashboard := root / "dashboard"
bridge := dashboard / "bridge"
x402 := dashboard / "x402-server"

# List all available commands
default:
    @just --list

# ── Services ──────────────────────────────────────────

# Start all services (dashboard + bridge + x402)
all: dashboard bridge x402
    @echo "✅ All services started"

# Start Next.js dashboard (port 3000)
dashboard:
    cd {{dashboard}} && npm run dev &

# Start bridge daemon (port 3001)
bridge:
    cd {{bridge}} && npm run dev &

# Start x402 payment server (port 4021)
x402:
    cd {{x402}} && npm run dev &

# Start OpenClaw gateway (port 18789)
gateway:
    openclaw gateway start

# ── Status ────────────────────────────────────────────

# Check all service health
status:
    @echo "── Service Status ──"
    @lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && echo "  Dashboard  :3000  ✅ UP" || echo "  Dashboard  :3000  ❌ DOWN"
    @lsof -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1 && echo "  Bridge     :3001  ✅ UP" || echo "  Bridge     :3001  ❌ DOWN"
    @lsof -iTCP:4021 -sTCP:LISTEN >/dev/null 2>&1 && echo "  x402       :4021  ✅ UP" || echo "  x402       :4021  ❌ DOWN"
    @lsof -iTCP:18789 -sTCP:LISTEN >/dev/null 2>&1 && echo "  Gateway    :18789 ✅ UP" || echo "  Gateway    :18789 ❌ DOWN"
    @curl -s http://localhost:11434/api/tags >/dev/null 2>&1 && echo "  Ollama     :11434 ✅ UP" || echo "  Ollama     :11434 ❌ DOWN"
    @echo "── Tailscale ──"
    @tailscale status --peers=false 2>/dev/null || echo "  Tailscale  ❌ Not connected"

# ── Stop ──────────────────────────────────────────────

# Kill all XmetaV services
killall:
    @echo "Stopping services..."
    -@pkill -f "next-server" 2>/dev/null
    -@pkill -f "tsx watch src/index.ts" 2>/dev/null
    -@pkill -f "tsx watch index.ts" 2>/dev/null
    @sleep 1
    @just status

# Kill a specific service by port
kill port:
    @lsof -iTCP:{{port}} -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null && echo "Killed process on :{{port}}" || echo "Nothing on :{{port}}"

# ── Development ───────────────────────────────────────

# Git commit and push to dev
push msg="update":
    cd {{root}} && git add -A && git commit -m "{{msg}}" && git push origin dev

# Run lint on dashboard
lint:
    cd {{dashboard}} && npx next lint

# Check TypeScript types
typecheck:
    cd {{dashboard}} && npx tsc --noEmit

# ── Logs ──────────────────────────────────────────────

# Tail bridge logs
logs-bridge:
    tail -f {{bridge}}/bridge.log 2>/dev/null || echo "No bridge log file found"

# Tail watchdog logs
logs-watchdog:
    tail -f /tmp/xmetav-watchdog.log 2>/dev/null || echo "No watchdog log found"

# ── Ollama ────────────────────────────────────────────

# List loaded Ollama models
models:
    @ollama list

# Pull a model
pull model:
    ollama pull {{model}}

# ── Revenue ───────────────────────────────────────────

# Check x402 payment revenue
revenue:
    @cd {{x402}} && source .env && curl -s "$SUPABASE_URL/rest/v1/x402_payments?select=endpoint,amount,status&order=created_at.desc" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | \
        python3 -c "import json,sys; rows=json.load(sys.stdin); total=sum(float(r['amount'].replace('\$$','')) for r in rows); print(f'Payments: {len(rows)} | Revenue: \$${total:.2f}')"

# ── Health ────────────────────────────────────────────

# Full health check (services + remote access + power)
health:
    @just status
    @echo ""
    @echo "── Power Settings ──"
    @sudo pmset -g | grep -E "sleep|autorestart|powernap" 2>/dev/null || echo "  (requires sudo)"
    @echo ""
    @echo "── Disk ──"
    @df -h / | tail -1 | awk '{print "  Used: " $3 " / " $2 " (" $5 " full)"}'
    @echo ""
    @echo "── Memory ──"
    @vm_stat | awk '/Pages free/ {free=$3} /Pages active/ {active=$3} END {printf "  Free: %.1f GB  Active: %.1f GB\n", free*4096/1073741824, active*4096/1073741824}'
