# XmetaV — Mac Studio Command Runner (launchd-native)
# Usage: just <command>
# All services managed by LaunchAgents (KeepAlive + RunAtLoad)

set dotenv-load := false
root := justfile_directory()
dashboard := root / "dashboard"
bridge := dashboard / "bridge"
x402 := dashboard / "x402-server"
uid := `id -u`

# List all available commands
default:
    @just --list

# ── Services (launchd) ───────────────────────────────

# Start all services via launchd
all:
    @launchctl kickstart -k gui/{{uid}}/com.xmetav.dashboard
    @launchctl kickstart -k gui/{{uid}}/com.xmetav.bridge
    @launchctl kickstart -k gui/{{uid}}/com.xmetav.x402
    @echo "✅ All services started (launchd)"

# Restart all services
restart: all

# Restart a single service (dashboard|bridge|x402)
restart-one svc:
    launchctl kickstart -k gui/{{uid}}/com.xmetav.{{svc}}

# Start OpenClaw gateway (port 18789)
gateway:
    openclaw gateway start

# Stop all services (launchd bootout — they won't restart until bootstrap)
stop:
    @echo "Stopping services (bootout)..."
    -@launchctl bootout gui/{{uid}}/com.xmetav.dashboard 2>/dev/null
    -@launchctl bootout gui/{{uid}}/com.xmetav.bridge 2>/dev/null
    -@launchctl bootout gui/{{uid}}/com.xmetav.x402 2>/dev/null
    @sleep 1
    @just status

# Re-bootstrap services after stop
start:
    @launchctl bootstrap gui/{{uid}} ~/Library/LaunchAgents/com.xmetav.dashboard.plist
    @launchctl bootstrap gui/{{uid}} ~/Library/LaunchAgents/com.xmetav.bridge.plist
    @launchctl bootstrap gui/{{uid}} ~/Library/LaunchAgents/com.xmetav.x402.plist
    @echo "✅ All services bootstrapped"

# Kill a specific service by port (one-off, launchd will restart it)
kill port:
    @lsof -iTCP:{{port}} -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null && echo "Killed on :{{port}} (launchd will restart)" || echo "Nothing on :{{port}}"

# ── Status ────────────────────────────────────────────

# Check all service health
status:
    @echo "── Service Status ──"
    @lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && echo "  Dashboard  :3000  ✅ UP" || echo "  Dashboard  :3000  ❌ DOWN"
    @lsof -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1 && echo "  Bridge     :3001  ✅ UP" || echo "  Bridge     :3001  ❌ DOWN"
    @lsof -iTCP:4021 -sTCP:LISTEN >/dev/null 2>&1 && echo "  x402       :4021  ✅ UP" || echo "  x402       :4021  ❌ DOWN"
    @lsof -iTCP:18789 -sTCP:LISTEN >/dev/null 2>&1 && echo "  Gateway    :18789 ✅ UP" || echo "  Gateway    :18789 ❌ DOWN"
    @curl -s http://localhost:11434/api/tags >/dev/null 2>&1 && echo "  Ollama     :11434 ✅ UP" || echo "  Ollama     :11434 ❌ DOWN"
    @echo ""
    @echo "── LaunchAgent Status ──"
    @launchctl list com.xmetav.dashboard >/dev/null 2>&1 && echo "  dashboard: ✅ loaded" || echo "  dashboard: ❌ not loaded"
    @launchctl list com.xmetav.bridge >/dev/null 2>&1 && echo "  bridge:    ✅ loaded" || echo "  bridge:    ❌ not loaded"
    @launchctl list com.xmetav.x402 >/dev/null 2>&1 && echo "  x402:      ✅ loaded" || echo "  x402:      ❌ not loaded"
    @echo ""
    @echo "── Tailscale ──"
    @tailscale status --peers=false 2>/dev/null || echo "  Tailscale  ❌ Not connected"

# Check for cold starts (Ollama model status)
cold-check:
    @echo "── Ollama Models Loaded ──"
    @curl -s http://localhost:11434/api/ps | python3 -c "import sys,json; d=json.load(sys.stdin); models=d.get('models',[]); print(f'  Loaded: {len(models)} model(s)') if models else print('  ⚠️  NONE loaded — cold start risk!'); [print(f'  {m[\"name\"]}  VRAM={m[\"size\"]/1e9:.1f}GB  expires={m.get(\"expires_at\",\"?\")[:10]}') for m in models]"

# Pin models in memory (keep_alive=-1)
warm:
    @echo "Warming models..."
    @curl -s http://localhost:11434/api/generate -d '{"model":"qwen2.5:7b-instruct","prompt":"","keep_alive":-1,"stream":false,"options":{"num_predict":0}}' > /dev/null
    @curl -s http://localhost:11434/api/generate -d '{"model":"kimi-k2.5:cloud","prompt":"","keep_alive":-1,"stream":false,"options":{"num_predict":0}}' > /dev/null
    @echo "✅ Models pinned (keep_alive=-1)"
    @just cold-check

# ── Logs ──────────────────────────────────────────────

# Tail dashboard logs
logs-dashboard:
    tail -f /tmp/xmetav-dashboard.log /tmp/xmetav-dashboard.err

# Tail bridge logs
logs-bridge:
    tail -f /tmp/xmetav-bridge.log /tmp/xmetav-bridge.err

# Tail x402 logs
logs-x402:
    tail -f /tmp/xmetav-x402.log /tmp/xmetav-x402.err

# Tail watchdog logs
logs-watchdog:
    tail -f /tmp/xmetav-watchdog.log

# Tail all service logs
logs:
    tail -f /tmp/xmetav-*.log /tmp/xmetav-*.err

# ── Agents ────────────────────────────────────────────

# List all OpenClaw agents
agents:
    @openclaw agent list 2>/dev/null || echo "Gateway not running"

# Run an agent task
agent-task agent msg:
    openclaw agent --agent {{agent}} -m "{{msg}}"

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

# ── Ollama ────────────────────────────────────────────

# List available Ollama models
models:
    @ollama list

# List loaded (hot) Ollama models
models-hot:
    @curl -s http://localhost:11434/api/ps | python3 -m json.tool

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

# Full health check (services + remote access + power + models)
health:
    @just status
    @echo ""
    @just cold-check
    @echo ""
    @echo "── Power Settings ──"
    @sudo pmset -g 2>/dev/null | grep -E "sleep|autorestart|powernap" || echo "  (requires sudo)"
    @echo ""
    @echo "── Disk ──"
    @df -h / | tail -1 | awk '{print "  Used: " $3 " / " $2 " (" $5 " full)"}'
    @echo ""
    @echo "── Memory ──"
    @vm_stat | awk '/Pages free/ {free=$3} /Pages active/ {active=$3} END {printf "  Free: %.1f GB  Active: %.1f GB\n", free*4096/1073741824, active*4096/1073741824}'
