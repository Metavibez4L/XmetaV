#!/bin/bash
# distill.sh — Memory consolidation & SITREP refresh
# Designed to run as a cron job (e.g. every 4 hours) or manually.
# Burns zero LLM tokens — pure bash + git + curl.
#
# Usage:
#   ./scripts/distill.sh              # Run full distill + sitrep refresh
#   ./scripts/distill.sh --sitrep     # Only refresh SITREP.md
#   ./scripts/distill.sh --memory     # Only distill to MEMORY.md
#
# Cron example (every 4 hours):
#   0 */4 * * * /home/manifest/XmetaV/scripts/distill.sh >> /tmp/distill.log 2>&1
#
set -e

WORKSPACE="$HOME/.openclaw/workspace"
BRIEFING="$WORKSPACE/skills/briefing/briefing.sh"

# Ensure briefing skill exists
if [ ! -x "$BRIEFING" ]; then
  echo "[distill] ERROR: briefing skill not found at $BRIEFING" >&2
  exit 1
fi

MODE="${1:---all}"

case "$MODE" in
  --sitrep)
    echo "[distill] $(date -u '+%Y-%m-%d %H:%M UTC') — Refreshing SITREP..."
    "$BRIEFING" sitrep > /dev/null 2>&1
    echo "[distill] SITREP.md updated."
    ;;
  --memory)
    echo "[distill] $(date -u '+%Y-%m-%d %H:%M UTC') — Distilling memory..."
    "$BRIEFING" distill
    ;;
  --all|*)
    echo "[distill] $(date -u '+%Y-%m-%d %H:%M UTC') — Full distill cycle..."
    echo ""
    "$BRIEFING" distill
    echo ""
    echo "[distill] Refreshing SITREP..."
    "$BRIEFING" sitrep > /dev/null 2>&1
    echo "[distill] Done. SITREP.md and MEMORY.md updated."
    ;;
esac
