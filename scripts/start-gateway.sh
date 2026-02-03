#!/usr/bin/env bash
# Start OpenClaw Gateway (dev profile) in the background.
# Safe to re-run: kills anything on the target port and restarts.
set -euo pipefail

PROFILE="dev"
STATE_DIR="$HOME/.openclaw-dev"
PORT=19001

mkdir -p "$STATE_DIR"

echo "▶ Stopping any existing gateway listeners on port $PORT..."
# Kill openclaw gateway processes and anything holding the port
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
fuser -k ${PORT}/tcp 2>/dev/null || true
sleep 1

echo "▶ Ensuring gateway.mode=local (recommended for WSL2 dev)..."
openclaw --profile "$PROFILE" config set gateway.mode local >/dev/null

echo "▶ Starting gateway (ws://127.0.0.1:$PORT)..."
nohup openclaw --profile "$PROFILE" gateway --port "$PORT" --force --verbose \
  > "$STATE_DIR/gateway.log" 2>&1 &
PID=$!

echo "$PID" > "$STATE_DIR/gateway.pid"
echo "✓ Gateway started (PID $PID)"
echo "  Logs: $STATE_DIR/gateway.log"

echo "▶ Verifying port open..."
for i in {1..20}; do
  if timeout 1 bash -lc "</dev/tcp/127.0.0.1/$PORT" >/dev/null 2>&1; then
    echo "✓ Port $PORT is accepting connections"
    exit 0
  fi
  sleep 0.5
done

echo "✗ Gateway did not open port $PORT in time"
echo "  Tail logs:"
tail -50 "$STATE_DIR/gateway.log" 2>/dev/null || true
exit 1
