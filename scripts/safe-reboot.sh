#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# XmetaV — Safe Remote Reboot
# Pre-checks before reboot, waits for services to come back
# Usage: ./safe-reboot.sh              (reboot now)
#        ./safe-reboot.sh --update     (install macOS update + reboot)
#        ./safe-reboot.sh --check      (pre-flight only, no reboot)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin"

REPO="/Users/akualabs/xmetav1/XmetaV"
LOG="/tmp/xmetav-reboot.log"
MODE="${1:-reboot}"

log() {
  local ts
  ts=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$ts] $1" | tee -a "$LOG"
}

FAIL=0

echo ""
echo "═══════════════════════════════════════════"
echo "  XmetaV Safe Remote Reboot — Pre-Flight"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. Auto-login ──
AUTOLOGIN=$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || echo "NONE")
if [[ "$AUTOLOGIN" == "akualabs" ]]; then
  echo "  ✅ Auto-login: $AUTOLOGIN"
else
  echo "  ❌ Auto-login: NOT SET — services won't start after reboot!"
  echo "     Fix: sudo defaults write /Library/Preferences/com.apple.loginwindow autoLoginUser akualabs"
  FAIL=1
fi

# ── 2. Auto-restart after power failure ──
AR=$(pmset -g | grep "autorestart" | awk '{print $2}')
if [[ "$AR" == "1" ]]; then
  echo "  ✅ Auto-restart on power failure: enabled"
else
  echo "  ❌ Auto-restart on power failure: DISABLED"
  echo "     Fix: sudo pmset -a autorestart 1"
  FAIL=1
fi

# ── 3. Sleep disabled ──
SLEEP=$(pmset -g | grep "^ sleep" | awk '{print $2}')
if [[ "$SLEEP" == "0" ]]; then
  echo "  ✅ Sleep: disabled"
else
  echo "  ⚠️  Sleep: $SLEEP min (should be 0)"
fi

# ── 4. SSH (system daemon, survives reboot) ──
if /usr/bin/nc -z 127.0.0.1 22 &>/dev/null; then
  echo "  ✅ SSH: listening on port 22 (system daemon)"
else
  echo "  ❌ SSH: NOT listening — you'll lose remote access!"
  FAIL=1
fi

# ── 5. Tailscale ──
if tailscale status &>/dev/null; then
  TS_IP=$(tailscale ip -4 2>/dev/null)
  echo "  ✅ Tailscale: connected ($TS_IP)"
else
  echo "  ⚠️  Tailscale: not connected (will reconnect after login)"
fi

# ── 6. LaunchAgents installed ──
LA_COUNT=$(ls ~/Library/LaunchAgents/com.xmetav.*.plist 2>/dev/null | wc -l | tr -d ' ')
echo "  ✅ LaunchAgents: $LA_COUNT xmetav plists installed"

# ── 7. Wake on LAN ──
WOMP=$(pmset -g | grep "womp" | awk '{print $2}')
if [[ "$WOMP" == "1" ]]; then
  echo "  ✅ Wake on LAN: enabled"
else
  echo "  ⚠️  Wake on LAN: disabled"
fi

echo ""

# ── Pre-flight result ──
if [[ $FAIL -gt 0 ]]; then
  echo "❌ PRE-FLIGHT FAILED — fix issues above before rebooting remotely"
  exit 1
fi

if [[ "$MODE" == "--check" ]]; then
  echo "✅ Pre-flight passed — safe to reboot remotely"
  exit 0
fi

# ── Graceful shutdown of services ──
log "═══ SAFE REBOOT INITIATED ═══"

echo "Stopping XmetaV services gracefully..."
log "Stopping bridge..."
launchctl bootout gui/$(id -u)/com.xmetav.bridge 2>/dev/null && log "  bridge stopped" || log "  bridge (not loaded)"
log "Stopping dashboard..."
launchctl bootout gui/$(id -u)/com.xmetav.dashboard 2>/dev/null && log "  dashboard stopped" || log "  dashboard (not loaded)"
log "Stopping x402..."
launchctl bootout gui/$(id -u)/com.xmetav.x402 2>/dev/null && log "  x402 stopped" || log "  x402 (not loaded)"

log "Stopping Redis..."
redis-cli shutdown 2>/dev/null && log "  redis stopped" || log "  redis (not running)"

log "Stopping Caddy..."
brew services stop caddy 2>/dev/null && log "  caddy stopped" || log "  caddy (not running)"

log "Killing tmux session..."
tmux kill-session -t xmetav 2>/dev/null && log "  tmux stopped" || log "  tmux (no session)"

echo ""

if [[ "$MODE" == "--update" ]]; then
  log "Installing macOS update and scheduling restart..."
  echo "⏳ Installing macOS update + restart (this will take a few minutes)..."
  echo "   Your SSH/Tailscale connection will drop."
  echo "   The Mac Studio will reboot, auto-login, and restart all services."
  echo "   Reconnect in ~5-10 min."
  echo ""
  log "Running: softwareupdate -ia --restart"
  sudo softwareupdate -ia --restart 2>&1 | tee -a "$LOG"
else
  log "Rebooting now..."
  echo "⏳ Rebooting..."
  echo "   Your SSH/Tailscale connection will drop."
  echo "   The Mac Studio will reboot, auto-login, and restart all services."
  echo "   Reconnect in ~2-3 min."
  echo ""
  sudo shutdown -r now
fi
