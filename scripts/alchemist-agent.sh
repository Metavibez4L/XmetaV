#!/bin/bash
# alchemist-agent.sh — Autonomous runner for the alchemist agent
# Monitors $XMETAV tokenomics on a schedule.
#
# Usage:
#   ./scripts/alchemist-agent.sh              # Full cycle: health + report
#   ./scripts/alchemist-agent.sh --health     # Quick health check only
#   ./scripts/alchemist-agent.sh --report     # Full report only
#
# Cron examples:
#   0 */6 * * * /home/manifest/XmetaV/scripts/alchemist-agent.sh --health >> /tmp/alchemist.log 2>&1
#   0 8 * * *   /home/manifest/XmetaV/scripts/alchemist-agent.sh --report >> /tmp/alchemist.log 2>&1
#
set -e

ALCHEMIST="$HOME/.openclaw/workspace/skills/alchemist/alchemist.sh"
LOG_PREFIX="[alchemist-agent]"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

log() { echo "$LOG_PREFIX $TIMESTAMP — $*"; }

if [ ! -x "$ALCHEMIST" ]; then
  log "ERROR: alchemist.sh not found at $ALCHEMIST"
  exit 1
fi

MODE="${1:---all}"

case "$MODE" in
  --health)
    log "Running health check..."
    "$ALCHEMIST" health
    ;;
  --report)
    log "Generating full tokenomics report..."
    "$ALCHEMIST" report > /dev/null 2>&1
    log "TOKENOMICS.md updated."
    ;;
  --all|*)
    log "Starting full cycle..."
    echo ""
    log "Health check:"
    "$ALCHEMIST" health
    echo ""
    log "Generating report..."
    "$ALCHEMIST" report > /dev/null 2>&1
    log "TOKENOMICS.md updated."
    log "Done."
    ;;
esac
