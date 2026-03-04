#!/bin/bash
# scholar-agent.sh — Autonomous runner for the Scholar research agent
# 24/7 deep research on ERC-8004, x402, L2, stablecoins, SMB adoption.
# Relevance scoring + memory anchoring built in via bridge daemon.
#
# Usage:
#   ./scripts/scholar-agent.sh              # Full cycle: all domains
#   ./scripts/scholar-agent.sh --domain erc8004    # Single domain
#   ./scripts/scholar-agent.sh --domain x402       # Single domain
#   ./scripts/scholar-agent.sh --domain layer2     # Single domain
#   ./scripts/scholar-agent.sh --domain stablecoins # Single domain
#   ./scripts/scholar-agent.sh --domain smb-adoption # Single domain
#   ./scripts/scholar-agent.sh --stats     # Scholar health stats
#   ./scripts/scholar-agent.sh --research  # Quick ad-hoc research prompt
#
# NOTE: The bridge daemon (v1.6.0+) runs the scholar loop automatically.
#       This script is for manual/one-shot tasks outside the daemon cycle.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_PREFIX="[scholar-agent]"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

log() { echo "$LOG_PREFIX $TIMESTAMP — $*"; }

BRIDGE_URL="${BRIDGE_URL:-http://localhost:3001}"

MODE="${1:---all}"

case "$MODE" in
  --domain)
    DOMAIN="${2:?Usage: scholar-agent.sh --domain <erc8004|x402|layer2|stablecoins|smb-adoption>}"
    log "Researching domain: $DOMAIN"
    "$SCRIPT_DIR/agent-task.sh" scholar "Deep research the $DOMAIN domain. Find latest developments, novel insights, and actionable intelligence. Score each finding for novelty, impact, and actionability. Share key discoveries with the fleet." 2>&1
    log "Domain research complete: $DOMAIN"
    ;;
  --stats)
    log "Fetching scholar stats..."
    curl -sf "$BRIDGE_URL/scholar" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d.get('scholar', {})
print(f'Status: {s.get(\"status\", \"unknown\")}')
print(f'Cycle: {s.get(\"cycleCount\", 0)}')
print(f'Findings: {s.get(\"totalFindings\", 0)} total | {s.get(\"anchored\", 0)} anchored | {s.get(\"shared\", 0)} shared')
dd = s.get('domainCycles', {})
if dd:
  print('Domains:')
  for k, v in dd.items():
    print(f'  {k}: {v} cycles')
" 2>/dev/null || log "Stats fetch failed (is bridge running?)"
    ;;
  --research)
    PROMPT="${2:?Usage: scholar-agent.sh --research \"Your research question\"}"
    log "Ad-hoc research: $PROMPT"
    "$SCRIPT_DIR/agent-task.sh" scholar "$PROMPT" 2>&1
    log "Research complete."
    ;;
  --all|*)
    log "Starting full research cycle (all 5 domains)..."
    for DOMAIN in erc8004 x402 layer2 stablecoins smb-adoption; do
      echo ""
      log "Domain: $DOMAIN"
      "$SCRIPT_DIR/agent-task.sh" scholar "Deep research the $DOMAIN domain. Find the latest developments, novel insights, and actionable intelligence for the XmetaV fleet. Focus on what's new in the last 48 hours. Score each finding for novelty (0-1), impact (0-1), and actionability (0-1). If you find something significant, mark it with [ANCHOR] for on-chain anchoring." 2>&1
      log "$DOMAIN complete."
    done
    echo ""
    log "Full research cycle done."
    ;;
esac
