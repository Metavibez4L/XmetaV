#!/bin/bash
# web3dev-agent.sh — Autonomous runner for the web3dev agent
# Compiles, audits, and reports on all Hardhat projects.
#
# Usage:
#   ./scripts/web3dev-agent.sh              # Full cycle: status + audit + report
#   ./scripts/web3dev-agent.sh --status     # Quick status check only
#   ./scripts/web3dev-agent.sh --audit      # Security audit only
#   ./scripts/web3dev-agent.sh --report     # Full report
#
# Cron examples:
#   0 */12 * * * /home/manifest/XmetaV/scripts/web3dev-agent.sh --status >> /tmp/web3dev.log 2>&1
#   0 6 * * 1    /home/manifest/XmetaV/scripts/web3dev-agent.sh --report >> /tmp/web3dev.log 2>&1
#
set -e

WEB3DEV="$HOME/.openclaw/workspace/skills/web3dev/web3dev.sh"
LOG_PREFIX="[web3dev-agent]"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

log() { echo "$LOG_PREFIX $TIMESTAMP — $*"; }

if [ ! -x "$WEB3DEV" ]; then
  log "ERROR: web3dev.sh not found at $WEB3DEV"
  exit 1
fi

MODE="${1:---all}"

case "$MODE" in
  --status)
    log "Running status check..."
    "$WEB3DEV" status
    ;;
  --audit)
    log "Running security audit..."
    "$WEB3DEV" audit all
    ;;
  --report)
    log "Generating full report..."
    "$WEB3DEV" report > /dev/null 2>&1
    log "WEB3DEV.md updated."
    ;;
  --all|*)
    log "Starting full cycle..."
    echo ""
    log "Status check:"
    "$WEB3DEV" status
    echo ""
    log "Generating report (includes audit + gas)..."
    "$WEB3DEV" report > /dev/null 2>&1
    log "WEB3DEV.md updated."
    log "Done."
    ;;
esac
