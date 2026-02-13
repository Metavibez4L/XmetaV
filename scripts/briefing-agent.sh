#!/bin/bash
# briefing-agent.sh — Autonomous agent runner for the briefing agent
# Runs health checks with auto-fix, then refreshes SITREP + memory.
#
# Designed for cron (every 1h) or manual invocation.
# Burns zero LLM tokens — pure bash.
#
# Usage:
#   ./scripts/briefing-agent.sh              # Full cycle: health + fix + distill + sitrep
#   ./scripts/briefing-agent.sh --health     # Health check + auto-fix only
#   ./scripts/briefing-agent.sh --distill    # Distill + sitrep only
#
# Cron (every hour):
#   0 * * * * /home/manifest/XmetaV/scripts/briefing-agent.sh >> /tmp/briefing-agent.log 2>&1
#
set -e

BRIEFING="$HOME/.openclaw/workspace/skills/briefing/briefing.sh"
XMETAV="$HOME/XmetaV"
LOG_PREFIX="[briefing-agent]"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

log() { echo "$LOG_PREFIX $TIMESTAMP — $*"; }
warn() { echo "$LOG_PREFIX $TIMESTAMP — WARNING: $*" >&2; }

# ── Health Sentinel ────────────────────────────────────────────────
do_health() {
  log "Running health checks..."
  local issues=0

  # 1. Ollama
  if curl -sS --max-time 5 http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    log "[OK] Ollama running"
  else
    warn "Ollama not responding — attempting restart..."
    # Try to start ollama serve in background
    if command -v ollama &>/dev/null; then
      nohup ollama serve > /tmp/ollama-restart.log 2>&1 &
      sleep 3
      if curl -sS --max-time 5 http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
        log "[FIXED] Ollama restarted successfully"
      else
        warn "Ollama restart failed — manual intervention needed"
        issues=$((issues + 1))
      fi
    else
      warn "ollama command not found"
      issues=$((issues + 1))
    fi
  fi

  # 2. Gateway
  if command -v openclaw &>/dev/null && openclaw health > /dev/null 2>&1; then
    log "[OK] Gateway healthy"
  else
    warn "Gateway not healthy — attempting fix..."
    if [ -x "$XMETAV/scripts/start-gateway.sh" ]; then
      "$XMETAV/scripts/start-gateway.sh" > /dev/null 2>&1 || true
      sleep 2
      if openclaw health > /dev/null 2>&1; then
        log "[FIXED] Gateway restarted successfully"
      else
        warn "Gateway fix failed — try: ./scripts/openclaw-fix.sh"
        issues=$((issues + 1))
      fi
    else
      warn "start-gateway.sh not found"
      issues=$((issues + 1))
    fi
  fi

  # 3. Dashboard
  if curl -sS --max-time 3 http://localhost:3000 > /dev/null 2>&1; then
    log "[OK] Dashboard running on :3000"
  else
    log "[--] Dashboard not running (non-critical — start manually if needed)"
  fi

  # 4. Supabase connectivity
  local ENV_FILE="$XMETAV/dashboard/bridge/.env"
  if [ -f "$ENV_FILE" ]; then
    local SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    eval "$(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' "$ENV_FILE")"
    if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
      local test_result
      test_result=$(curl -sS --max-time 5 \
        "$SUPABASE_URL/rest/v1/agent_sessions?select=agent_id&limit=1" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" 2>/dev/null || echo "FAIL")
      if [ "$test_result" != "FAIL" ] && [ "$test_result" != "" ]; then
        log "[OK] Supabase connected"
      else
        warn "Supabase not responding"
        issues=$((issues + 1))
      fi
    else
      log "[--] Supabase credentials not configured"
    fi
  else
    log "[--] Bridge .env not found"
  fi

  # 5. Stale session locks
  local stale_locks
  stale_locks=$(find "$HOME/.openclaw" -name "*.lock" -type f -mmin +30 2>/dev/null | wc -l | tr -d ' ')
  if [ "$stale_locks" -gt 0 ]; then
    warn "Found $stale_locks stale lock files (>30min) — cleaning..."
    find "$HOME/.openclaw" -name "*.lock" -type f -mmin +30 -delete 2>/dev/null || true
    log "[FIXED] Cleaned $stale_locks stale locks"
  fi

  if [ "$issues" -eq 0 ]; then
    log "All health checks passed"
  else
    warn "$issues issue(s) need attention"
  fi

  return $issues
}

# ── Distill + SITREP ──────────────────────────────────────────────
do_distill() {
  log "Running distill + SITREP refresh..."

  if [ ! -x "$BRIEFING" ]; then
    warn "briefing.sh not found at $BRIEFING"
    return 1
  fi

  "$BRIEFING" distill 2>&1 | while IFS= read -r line; do
    echo "$LOG_PREFIX   $line"
  done

  "$BRIEFING" sitrep > /dev/null 2>&1
  log "SITREP.md refreshed"
}

# ── Main ──────────────────────────────────────────────────────────
MODE="${1:---all}"

log "Starting (mode: $MODE)"

case "$MODE" in
  --health)
    do_health
    ;;
  --distill)
    do_distill
    ;;
  --all|*)
    do_health || true  # Don't exit on health failures
    echo ""
    do_distill
    ;;
esac

log "Done."
