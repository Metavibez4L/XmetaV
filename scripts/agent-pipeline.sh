#!/usr/bin/env bash
# agent-pipeline.sh — Multi-step agent workflows using atomic tasks
#
# Each step is a separate agent invocation (fresh session, no stalling).
# Pipeline stops on first failure.
#
# Usage:
#   ./scripts/agent-pipeline.sh health              — typecheck + test + report
#   ./scripts/agent-pipeline.sh ship "commit msg"   — typecheck + test + commit + push
#   ./scripts/agent-pipeline.sh fix                 — typecheck, if errors: fix + recheck
#   ./scripts/agent-pipeline.sh evolve "task"       — health check + implement task + health check + commit
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT="${AGENT:-basedintern}"

run_task() {
  local task="$1"
  local label="${2:-$task}"
  echo ""
  echo "━━━ Pipeline Step: $label ━━━"
  "$SCRIPT_DIR/agent-task.sh" "$AGENT" "$task"
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "━━━ PIPELINE FAILED at: $label (exit $rc) ━━━"
    exit $rc
  fi
  echo "━━━ Step OK: $label ━━━"
  return 0
}

PIPELINE="${1:?Usage: agent-pipeline.sh <health|ship|fix|evolve> [args...]}"
shift 2>/dev/null || true

case "$PIPELINE" in

  health)
    echo "=== Pipeline: HEALTH CHECK ==="
    run_task "Run /repo-health and report the results" "Health Check"
    echo ""
    echo "=== Pipeline: HEALTH CHECK COMPLETE ==="
    ;;

  ship)
    MSG="${1:-auto: agent pipeline ship}"
    echo "=== Pipeline: SHIP ($MSG) ==="
    run_task "Run /repo-ops typecheck" "Typecheck"
    run_task "Run /repo-ops test" "Test"
    run_task "Run /repo-ops commit \"$MSG\"" "Commit"
    run_task "Run /repo-ops push" "Push"
    echo ""
    echo "=== Pipeline: SHIP COMPLETE ==="
    ;;

  fix)
    echo "=== Pipeline: FIX ==="
    run_task "Run /repo-ops typecheck. If there are errors, list them clearly." "Typecheck (check)"

    # The agent will report errors; user can chain with another fix step
    echo ""
    echo "If errors were reported, run:"
    echo "  ./scripts/agent-task.sh $AGENT 'Fix the typecheck errors you found, then run /repo-ops typecheck to verify'"
    echo ""
    echo "=== Pipeline: FIX CHECK COMPLETE ==="
    ;;

  evolve)
    TASK="${1:?Usage: agent-pipeline.sh evolve \"task description\"}"
    echo "=== Pipeline: EVOLVE ==="
    echo "Task: $TASK"
    echo ""

    run_task "Run /repo-health and report the results" "Pre-check"
    run_task "$TASK" "Implement"
    run_task "Run /repo-health and report the results" "Post-check"

    echo ""
    echo "Post-check passed. To commit and push:"
    echo "  ./scripts/agent-pipeline.sh ship \"$TASK\""
    echo ""
    echo "=== Pipeline: EVOLVE COMPLETE ==="
    ;;

  *)
    echo "agent-pipeline.sh — Multi-step agent workflows"
    echo ""
    echo "Pipelines:"
    echo "  health                Run health check (typecheck + test + git status)"
    echo "  ship \"message\"        Typecheck + test + commit + push"
    echo "  fix                   Typecheck and report errors for fixing"
    echo "  evolve \"task\"         Health check + implement + health check"
    echo ""
    echo "Environment:"
    echo "  AGENT=basedintern     Which agent to use (default: basedintern)"
    echo ""
    echo "Examples:"
    echo "  ./scripts/agent-pipeline.sh health"
    echo "  ./scripts/agent-pipeline.sh ship 'feat: add LP support'"
    echo "  AGENT=basedintern_web ./scripts/agent-pipeline.sh health"
    echo "  ./scripts/agent-pipeline.sh evolve 'add retry logic to moltbook posting'"
    ;;
esac
