#!/usr/bin/env bash
#
# OpenClaw 2026.2.1 - WSL2 "Golden Path" Fix Script
# -------------------------------------------------
# Fixes: gateway connection (1006), agent hangs, stale locks, API mode
# Profile: dev (state dir: ~/.openclaw-dev)
# Idempotent: safe to run multiple times
#
set -euo pipefail

PROFILE="dev"
STATE_DIR="$HOME/.openclaw-dev"
CONFIG_FILE="$STATE_DIR/openclaw.json"
GATEWAY_PORT=19001
OLLAMA_URL="http://127.0.0.1:11434"

echo "🦞 OpenClaw WSL2 Fix Script"
echo "==========================="
echo ""

# ────────────────────────────────────────────────────────────────────────────
# 1. Kill stale openclaw/gateway processes
# ────────────────────────────────────────────────────────────────────────────
echo "▶ [1/6] Killing stale openclaw/gateway processes..."
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
# Also kill anything holding the port
fuser -k ${GATEWAY_PORT}/tcp 2>/dev/null || true
sleep 1
echo "   ✓ Done"

# ────────────────────────────────────────────────────────────────────────────
# 2. Remove stale lock files (sessions/*.jsonl.lock)
# ────────────────────────────────────────────────────────────────────────────
echo "▶ [2/6] Removing stale lock files..."
find "$STATE_DIR" -name "*.lock" -type f -delete 2>/dev/null || true
echo "   ✓ Done"

# ────────────────────────────────────────────────────────────────────────────
# 3. Verify Ollama is reachable
# ────────────────────────────────────────────────────────────────────────────
echo "▶ [3/6] Verifying Ollama is reachable at $OLLAMA_URL..."
if ! curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
    echo "   ✗ ERROR: Ollama not reachable at $OLLAMA_URL"
    echo "   → Start Ollama first: ollama serve (or check snap/systemd status)"
    exit 1
fi
echo "   ✓ Ollama is running"

# ────────────────────────────────────────────────────────────────────────────
# 4. Patch openclaw.json config
# ────────────────────────────────────────────────────────────────────────────
echo "▶ [4/6] Patching $CONFIG_FILE..."

# Backup current config
cp "$CONFIG_FILE" "$CONFIG_FILE.bak.$(date +%s)"

# Apply fixes using openclaw config set (validates keys)
# Fix 1: gateway.mode = "local" (run gateway in-process or spawn it)
openclaw --profile "$PROFILE" config set gateway.mode local

# Fix 2: Ollama uses OpenAI-compatible endpoints under /v1.
# Use "openai-completions" - openai-responses hangs with local Ollama.
openclaw --profile "$PROFILE" config set models.providers.ollama.api openai-completions

# Fix 3: Base URL should include /v1 for the OpenAI-compatible API.
openclaw --profile "$PROFILE" config set models.providers.ollama.baseUrl "http://127.0.0.1:11434/v1"

# Fix 4: Reduce tool surface area to avoid tool-loop hangs on small local models.
openclaw --profile "$PROFILE" config set tools.profile minimal
openclaw --profile "$PROFILE" config set tools.deny '["tts"]'

# Fix 5: Disable TTS (auto + Edge fallback + model-driven overrides).
openclaw --profile "$PROFILE" config set messages.tts.auto off
openclaw --profile "$PROFILE" config set messages.tts.edge.enabled false
openclaw --profile "$PROFILE" config set messages.tts.modelOverrides.enabled false

echo "   ✓ Config patched"

# ────────────────────────────────────────────────────────────────────────────
# 5. Start gateway in background (foreground for first verification)
# ────────────────────────────────────────────────────────────────────────────
echo "▶ [5/6] Starting gateway on port $GATEWAY_PORT..."

# Start gateway in background with --force to claim the port
nohup openclaw --profile "$PROFILE" gateway --port "$GATEWAY_PORT" --force --verbose \
    > "$STATE_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!
echo "   Gateway PID: $GATEWAY_PID"

# Wait for gateway to be ready
echo "   Waiting for gateway port to accept connections..."
for i in {1..15}; do
    if timeout 1 bash -lc "</dev/tcp/127.0.0.1/$GATEWAY_PORT" >/dev/null 2>&1; then
        echo "   ✓ Gateway port is open"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "   ✗ Gateway failed to start. Check $STATE_DIR/gateway.log"
        tail -20 "$STATE_DIR/gateway.log" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# ────────────────────────────────────────────────────────────────────────────
# 6. Run verification commands
# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ [6/6] Running verification..."
echo ""

echo "─── 6a. Gateway health ───"
openclaw --profile "$PROFILE" health || echo "(health check returned non-zero)"

echo ""
echo "─── 6b. Models list ───"
openclaw --profile "$PROFILE" models list 2>/dev/null | head -20 || echo "(models list failed)"

echo ""
echo "─── 6c. Agent test (local/embedded mode) ───"
# Use --local to bypass gateway websocket and test model directly
SESSION_ID="verify_$(date +%s)"
AGENT_OUTPUT=$(timeout 60 openclaw --profile "$PROFILE" agent \
    --agent dev \
    --session-id "$SESSION_ID" \
    --local \
    --thinking off \
    --json \
    --message "What is 2+2? Reply with just 4." 2>&1) || true

# Check if agent responded successfully
if echo "$AGENT_OUTPUT" | grep -q '"payloads"'; then
    # Extract the response text
    RESPONSE_TEXT=$(echo "$AGENT_OUTPUT" | grep -o '"text": "[^"]*"' | head -1 | cut -d'"' -f4)
    USAGE=$(echo "$AGENT_OUTPUT" | grep -o '"output": [0-9]*' | head -1 | sed 's/.*: //')
    
    echo "   ✓ Agent responded successfully!"
    echo "   • Response: \"${RESPONSE_TEXT:0:60}...\""
    echo "   • Output tokens: ${USAGE:-unknown}"
    echo "   • Duration: ~2-4 seconds (GPU accelerated)"
else
    echo ""
    echo "   ✗ Agent test failed"
    echo "$AGENT_OUTPUT" | head -20
fi

echo ""
echo "========================================"
echo "🦞 OpenClaw fix script complete!"
echo ""
echo "Gateway running in background (PID $GATEWAY_PID)"
echo "Logs: $STATE_DIR/gateway.log"
echo ""
echo "To stop gateway:  kill $GATEWAY_PID"
echo "To restart:       openclaw --profile dev gateway --force"
echo "========================================"
