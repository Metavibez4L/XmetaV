#!/bin/bash
# XmetaV Service Watchdog
# Monitors Tailscale, SSH, Screen Sharing, and XmetaV services
# Detects crash loops, checks bridge/dashboard/x402 health
# Runs every 5 minutes via launchd

LOG="/tmp/xmetav-watchdog.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
CRASH_LOG="/tmp/xmetav-crash-tracker.json"

log() { echo "[$TIMESTAMP] $1" >> "$LOG"; }

ISSUES=0

# ── Check Tailscale ──
if ! tailscale status &>/dev/null; then
  log "WARN: Tailscale not connected — attempting reconnect"
  tailscale up 2>>"$LOG"
  ISSUES=$((ISSUES + 1))
else
  TS_IP=$(tailscale ip -4 2>/dev/null)
  log "OK: Tailscale connected ($TS_IP)"
fi

# ── Check SSH (port 22) ──
if ! /usr/bin/nc -z 127.0.0.1 22 &>/dev/null; then
  log "WARN: SSH not listening — reloading"
  sudo launchctl load -w /System/Library/LaunchDaemons/ssh.plist 2>>"$LOG"
  ISSUES=$((ISSUES + 1))
else
  log "OK: SSH listening on port 22"
fi

# ── Check Screen Sharing (port 5900) ──
if ! /usr/bin/nc -z 127.0.0.1 5900 &>/dev/null; then
  log "WARN: Screen Sharing not listening — reloading"
  sudo launchctl kickstart -k system/com.apple.screensharing 2>>"$LOG"
  ISSUES=$((ISSUES + 1))
else
  log "OK: Screen Sharing listening on port 5900"
fi

# ── Check sleep settings haven't reverted ──
SLEEP_VAL=$(pmset -g | grep "^ sleep" | awk '{print $2}')
if [[ "$SLEEP_VAL" != "0" ]]; then
  log "WARN: Sleep is set to $SLEEP_VAL — resetting to 0"
  sudo pmset -a sleep 0 2>>"$LOG"
  ISSUES=$((ISSUES + 1))
fi

# ── XmetaV Service Health Checks ─────────────────────────────────

# Helper: check HTTP endpoint, detect crash loops, kickstart if needed
check_service() {
  local NAME="$1"
  local URL="$2"
  local LABEL="$3"
  local PORT="$4"

  RESP=$(curl -sf --max-time 5 "$URL" 2>/dev/null)
  if [[ $? -ne 0 ]]; then
    log "WARN: $NAME not responding at $URL"

    # Track consecutive failures for crash-loop detection
    if [[ -f "$CRASH_LOG" ]]; then
      PREV=$(python3 -c "import json; d=json.load(open('$CRASH_LOG')); print(d.get('$NAME', 0))" 2>/dev/null || echo 0)
    else
      PREV=0
    fi
    COUNT=$((PREV + 1))

    # Update crash tracker
    if [[ -f "$CRASH_LOG" ]]; then
      python3 -c "
import json
try:
    d = json.load(open('$CRASH_LOG'))
except:
    d = {}
d['$NAME'] = $COUNT
json.dump(d, open('$CRASH_LOG', 'w'))
" 2>/dev/null
    else
      echo "{\"$NAME\": $COUNT}" > "$CRASH_LOG"
    fi

    if [[ $COUNT -ge 6 ]]; then
      # 6 consecutive failures = 30 min of downtime — crash loop
      log "CRITICAL: $NAME crash loop detected ($COUNT consecutive failures over ~${COUNT}×5min)"
      log "CRITICAL: Check /tmp/xmetav-${NAME}.err for root cause"
      # Don't keep kickstarting — something is fundamentally broken
      # Just log the alert so operator sees it
    elif [[ -n "$LABEL" ]]; then
      log "WARN: Kickstarting $NAME via launchd ($LABEL)"
      launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>>"$LOG"
    fi
    ISSUES=$((ISSUES + 1))
  else
    # Service is healthy — reset crash counter
    if [[ -f "$CRASH_LOG" ]]; then
      python3 -c "
import json
try:
    d = json.load(open('$CRASH_LOG'))
except:
    d = {}
d['$NAME'] = 0
json.dump(d, open('$CRASH_LOG', 'w'))
" 2>/dev/null
    fi
    # Extract version if present
    VER=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")
    log "OK: $NAME healthy (v$VER, port $PORT)"
  fi
}

# Bridge (port 3001)
check_service "bridge" "http://localhost:3001/health" "com.xmetav.bridge" "3001"

# Dashboard (port 3000)
check_service "dashboard" "http://localhost:3000" "com.xmetav.dashboard" "3000"

# x402 server (port 4021)
check_service "x402" "http://localhost:4021/health" "com.xmetav.x402" "4021"

# ── Bridge Error Log Check (syntax errors) ───────────────────────
if [[ -f /tmp/xmetav-bridge.err ]]; then
  LAST_ERR=$(tail -5 /tmp/xmetav-bridge.err 2>/dev/null)
  if echo "$LAST_ERR" | grep -q "TransformError\|SyntaxError\|Expected.*but found"; then
    log "ALERT: Bridge has syntax/transform errors in /tmp/xmetav-bridge.err"
    ISSUES=$((ISSUES + 1))
  fi
fi

# ── Summary ──
if [[ $ISSUES -eq 0 ]]; then
  log "ALL OK — no issues"
else
  log "FOUND $ISSUES issue(s)"
fi

# Trim log to last 500 lines
tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
