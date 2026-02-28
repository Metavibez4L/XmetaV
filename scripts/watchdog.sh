#!/bin/bash
# XmetaV Service Watchdog
# Monitors Tailscale, SSH, and Screen Sharing — restarts if down
# Runs every 5 minutes via launchd

LOG="/tmp/xmetav-watchdog.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

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

# ── Summary ──
if [[ $ISSUES -eq 0 ]]; then
  log "ALL OK — no issues"
else
  log "FIXED $ISSUES issue(s)"
fi

# Trim log to last 500 lines
tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
