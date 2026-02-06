#!/usr/bin/env bash
# agent-task.sh — Run a single atomic task on an OpenClaw agent
#
# Anti-stall best practices baked in:
#   - Fresh session per task (no context pollution)
#   - --local mode (no gateway websocket issues)
#   - --thinking off (reduces token waste on Kimi K2.5)
#   - One task per invocation (atomic, completable)
#
# Usage:
#   ./scripts/agent-task.sh <agent> <task>
#   ./scripts/agent-task.sh basedintern "run /repo-health and report results"
#   ./scripts/agent-task.sh basedintern "run /repo-ops typecheck"
#
# Chain tasks:
#   ./scripts/agent-task.sh basedintern "typecheck" && \
#   ./scripts/agent-task.sh basedintern "fix errors" && \
#   ./scripts/agent-task.sh basedintern "commit changes"
#
set -euo pipefail

AGENT="${1:-basedintern}"
TASK="${2:?Usage: agent-task.sh <agent> <task>}"
SESSION="${AGENT}_$(date +%s)"

echo "=== Agent Task ==="
echo "Agent:   $AGENT"
echo "Session: $SESSION"
echo "Task:    $TASK"
echo "==================="
echo ""

openclaw agent --agent "$AGENT" \
  --local \
  --thinking off \
  --session-id "$SESSION" \
  --message "$TASK"

EXIT_CODE=$?

echo ""
echo "=== Task Complete (exit: $EXIT_CODE) ==="

exit $EXIT_CODE
