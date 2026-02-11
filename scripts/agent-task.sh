#!/usr/bin/env bash
# agent-task.sh — Run a single atomic task on an OpenClaw agent
#
# Anti-stall best practices baked in:
#   - Fresh session per task (no context pollution)
#   - --local mode (no gateway websocket issues)
#   - --thinking off (reduces token waste on Kimi K2.5)
#   - One task per invocation (atomic, completable)
#   - Hard timeout (default 90s) prevents infinite hangs
#
# Usage:
#   ./scripts/agent-task.sh <agent> <task>
#   ./scripts/agent-task.sh basedintern "run /repo-health and report results"
#   AGENT_TIMEOUT=120 ./scripts/agent-task.sh akua "deploy contracts"
#
# Chain tasks:
#   ./scripts/agent-task.sh basedintern "typecheck" && \
#   ./scripts/agent-task.sh basedintern "fix errors" && \
#   ./scripts/agent-task.sh basedintern "commit changes"
#
set -euo pipefail

# Ensure Node.js 22+ is available (openclaw is installed under nvm node 22)
if ! command -v openclaw &>/dev/null || [[ "$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)" -lt 16 ]] 2>/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    nvm use 22 --silent 2>/dev/null || nvm use default --silent 2>/dev/null || true
  fi
fi

AGENT="${1:-basedintern}"
TASK="${2:?Usage: agent-task.sh <agent> <task>}"
SESSION="${AGENT}_$(date +%s)"
TIMEOUT="${AGENT_TIMEOUT:-90}"

echo "=== Agent Task ==="
echo "Agent:   $AGENT"
echo "Session: $SESSION"
echo "Timeout: ${TIMEOUT}s"
echo "Task:    $TASK"
echo "==================="
echo ""

EXIT_CODE=0
if command -v timeout &>/dev/null; then
  timeout "$TIMEOUT" openclaw agent --agent "$AGENT" \
    --local \
    --thinking off \
    --session-id "$SESSION" \
    --message "$TASK" || EXIT_CODE=$?
else
  openclaw agent --agent "$AGENT" \
    --local \
    --thinking off \
    --session-id "$SESSION" \
    --message "$TASK" || EXIT_CODE=$?
fi

echo ""
if [[ $EXIT_CODE -eq 124 ]]; then
  echo "=== Task TIMED OUT after ${TIMEOUT}s (exit: 124) ==="
else
  echo "=== Task Complete (exit: $EXIT_CODE) ==="
fi

exit $EXIT_CODE
