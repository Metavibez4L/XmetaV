#!/usr/bin/env bash
# Quick health check for OpenClaw + Ollama.
set -euo pipefail

PORT=18789
OLLAMA="http://127.0.0.1:11434"

fail() { echo "✗ $*"; exit 1; }

echo "▶ OpenClaw version"
openclaw --version

echo ""
echo "▶ Ollama reachable"
curl -sf "$OLLAMA/api/tags" >/dev/null || fail "Ollama not reachable at $OLLAMA"

echo ""
echo "▶ Gateway port"
if timeout 1 bash -lc "</dev/tcp/127.0.0.1/$PORT" >/dev/null 2>&1; then
  echo "✓ Port $PORT open"
else
  echo "✗ Port $PORT not open"
  echo "  Try: ./scripts/start-gateway.sh"
  exit 1
fi

echo ""
echo "▶ openclaw health"
openclaw health

echo ""
echo "▶ openclaw models status"
openclaw models status --plain

echo ""
echo "▶ Agent smoke test"
SESSION_ID="smoke_$(date +%s)"
OUT=$(timeout 60 openclaw agent --agent main --local --thinking off --session-id "$SESSION_ID" --message "Reply with OK" 2>&1) || true
printf "%s\n" "$OUT"
echo ""
echo "$OUT" | grep -qi "OK" || fail "Agent did not produce OK"

echo "✓ All checks passed"
