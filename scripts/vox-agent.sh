#!/bin/bash
# vox-agent.sh — Autonomous runner for the Vox branding agent
# Generates campaigns, audits voice, monitors competitors, and plans content.
#
# Usage:
#   ./scripts/vox-agent.sh              # Full cycle: campaign + voice audit
#   ./scripts/vox-agent.sh --campaign   # Generate daily campaign suggestions
#   ./scripts/vox-agent.sh --voice      # Voice consistency audit
#   ./scripts/vox-agent.sh --calendar   # Weekly content calendar
#   ./scripts/vox-agent.sh --competitor # Competitor analysis
#
# Cron examples:
#   0 9 * * *  ~/xmetav1/XmetaV/scripts/vox-agent.sh --campaign   >> /tmp/vox.log 2>&1
#   0 17 * * 5 ~/xmetav1/XmetaV/scripts/vox-agent.sh --voice      >> /tmp/vox.log 2>&1
#   0 8 * * 1  ~/xmetav1/XmetaV/scripts/vox-agent.sh --calendar   >> /tmp/vox.log 2>&1
#   0 10 1,15 * * ~/xmetav1/XmetaV/scripts/vox-agent.sh --competitor >> /tmp/vox.log 2>&1
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/../dashboard"
LOG_PREFIX="[vox-agent]"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

log() { echo "$LOG_PREFIX $TIMESTAMP — $*"; }

MODE="${1:---all}"

# Vox uses the agent-task dispatch pattern
run_vox() {
  local message="$1"
  log "Dispatching to vox: $message"
  "$SCRIPT_DIR/agent-task.sh" vox "$message" 2>&1 || log "Vox dispatch failed"
}

case "$MODE" in
  --campaign)
    log "Generating campaign suggestions..."
    run_vox "Generate 3 tweet campaign ideas based on recent XmetaV milestones. Include hashtags and optimal posting times. Focus on build-in-public and technical achievement angles."
    log "Campaign generation complete."
    ;;
  --voice)
    log "Running voice consistency audit..."
    run_vox "Audit the XmetaV brand voice. Analyze tone consistency, vocabulary repetition, and sentiment balance. Provide specific recommendations for improvement."
    log "Voice audit complete."
    ;;
  --calendar)
    log "Generating weekly content calendar..."
    run_vox "Create a 7-day content calendar for XmetaV's X account. Monday: technical deep-dive, Wednesday: milestone celebration, Friday: founder story, Saturday: community engagement. Include specific topics from recent progress."
    log "Content calendar complete."
    ;;
  --competitor)
    log "Running competitor analysis..."
    run_vox "Analyze the competitive landscape for AI agent platforms. Identify 3 key competitors, their recent messaging, and XmetaV's differentiation points. Suggest counter-narrative opportunities."
    log "Competitor analysis complete."
    ;;
  --all|*)
    log "Starting full Vox cycle..."
    "$0" --campaign
    "$0" --voice
    log "Full cycle complete."
    ;;
esac
