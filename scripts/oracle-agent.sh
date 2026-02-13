#!/bin/bash
# oracle-agent.sh — Autonomous runner for the oracle agent
# Monitors on-chain data, gas, prices, and sentiment on a schedule.
#
# Usage:
#   ./scripts/oracle-agent.sh              # Full cycle: alerts + report
#   ./scripts/oracle-agent.sh --alerts     # Quick alert check only
#   ./scripts/oracle-agent.sh --report     # Full report only
#
# Cron examples:
#   */15 * * * * /home/manifest/XmetaV/scripts/oracle-agent.sh --alerts >> /tmp/oracle-alerts.log 2>&1
#   0 * * * *    /home/manifest/XmetaV/scripts/oracle-agent.sh --report >> /tmp/oracle-report.log 2>&1
#
set -e

ORACLE="$HOME/.openclaw/workspace/skills/oracle/oracle.sh"
LOG_PREFIX="[oracle-agent]"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

log() { echo "$LOG_PREFIX $TIMESTAMP — $*"; }

if [ ! -x "$ORACLE" ]; then
  log "ERROR: oracle.sh not found at $ORACLE"
  exit 1
fi

MODE="${1:---all}"

case "$MODE" in
  --alerts)
    log "Running alert check..."
    "$ORACLE" alerts
    ;;
  --report)
    log "Generating full report..."
    "$ORACLE" report > /dev/null 2>&1
    log "ORACLE.md updated."
    ;;
  --all|*)
    log "Starting full cycle..."
    echo ""
    log "Alert check:"
    "$ORACLE" alerts
    echo ""
    log "Generating report..."
    "$ORACLE" report > /dev/null 2>&1
    log "ORACLE.md updated."
    log "Done."
    ;;
esac
