#!/usr/bin/env bash
# Stop OpenClaw gateway/CLI processes and clear stale lock files.
# Does NOT delete sessions/history; only deletes *.lock files.
set -euo pipefail

STATE_DIR="$HOME/.openclaw"
PORT=18789

echo "▶ Killing OpenClaw processes..."
pkill -9 -f "openclaw" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
fuser -k ${PORT}/tcp 2>/dev/null || true

echo "▶ Removing stale lock files under $STATE_DIR..."
find "$STATE_DIR" -name "*.lock" -type f -delete 2>/dev/null || true

echo "✓ Stopped."
