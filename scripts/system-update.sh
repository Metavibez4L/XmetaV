#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# XmetaV System Update — Mac Studio
# Runs: macOS updates, Homebrew, Ollama models, npm deps, git pull
# Usage: ./system-update.sh          (run now)
#        ./system-update.sh --delay 5 (run after 5 min delay)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin"

REPO="/Users/akualabs/xmetav1/XmetaV"
LOG="/tmp/xmetav-system-update.log"
LOCK="/tmp/xmetav-system-update.lock"
DELAY_MIN=0

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --delay) DELAY_MIN="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--delay MINUTES]"
      echo "  --delay N   Wait N minutes before starting"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Logging ──
log() {
  local ts
  ts=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$ts] $1" | tee -a "$LOG"
}

log_section() {
  echo "" >> "$LOG"
  log "═══ $1 ═══"
}

# ── Lock (only one update at a time) ──
if [[ -f "$LOCK" ]]; then
  LOCK_PID=$(cat "$LOCK" 2>/dev/null)
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    log "SKIP: System update already running (PID $LOCK_PID)"
    exit 0
  else
    log "WARN: Stale lock file (PID $LOCK_PID dead) — removing"
    rm -f "$LOCK"
  fi
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# ── Delay ──
if [[ "$DELAY_MIN" -gt 0 ]]; then
  DELAY_SEC=$((DELAY_MIN * 60))
  FIRE_AT=$(date -v "+${DELAY_MIN}M" "+%H:%M:%S" 2>/dev/null || date -d "+${DELAY_MIN} minutes" "+%H:%M:%S" 2>/dev/null || echo "~${DELAY_MIN}m")
  log "⏳ System update scheduled — firing at $FIRE_AT (${DELAY_MIN}m delay)"
  sleep "$DELAY_SEC"
fi

log_section "SYSTEM UPDATE STARTING"
STARTED=$(date +%s)
ERRORS=0

# ── 1. macOS Software Update (check only, install if available) ──
log_section "macOS Software Update"
if command -v softwareupdate &>/dev/null; then
  UPDATES=$(softwareupdate -l 2>&1) || true
  if echo "$UPDATES" | grep -q "No new software available"; then
    log "OK: macOS is up to date"
  else
    log "Found macOS updates:"
    echo "$UPDATES" | grep -E "^\*|Label:|Title:" >> "$LOG" 2>/dev/null || true
    # Install recommended updates (non-restart ones)
    log "Installing recommended updates (no restart)..."
    softwareupdate -ia --no-scan 2>>"$LOG" && log "OK: macOS updates installed" || {
      log "WARN: Some macOS updates failed (may need restart)"
      ERRORS=$((ERRORS + 1))
    }
  fi
else
  log "SKIP: softwareupdate not found"
fi

# ── 2. Homebrew ──
log_section "Homebrew Update"
if command -v brew &>/dev/null; then
  log "Updating Homebrew index..."
  brew update 2>>"$LOG" && log "OK: Homebrew updated" || {
    log "WARN: brew update failed"
    ERRORS=$((ERRORS + 1))
  }

  OUTDATED=$(brew outdated --quiet 2>/dev/null)
  if [[ -n "$OUTDATED" ]]; then
    COUNT=$(echo "$OUTDATED" | wc -l | tr -d ' ')
    log "Upgrading $COUNT outdated packages: $(echo "$OUTDATED" | tr '\n' ' ')"
    brew upgrade 2>>"$LOG" && log "OK: Homebrew packages upgraded" || {
      log "WARN: Some brew upgrades failed"
      ERRORS=$((ERRORS + 1))
    }
  else
    log "OK: All Homebrew packages up to date"
  fi

  log "Cleaning up..."
  brew cleanup -s 2>>"$LOG" && log "OK: Homebrew cleanup done" || true
else
  log "SKIP: Homebrew not found"
fi

# ── 3. Ollama Models ──
log_section "Ollama Model Updates"
if command -v ollama &>/dev/null && curl -sf --max-time 3 http://localhost:11434/api/tags &>/dev/null; then
  MODELS=$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}')
  if [[ -n "$MODELS" ]]; then
    while IFS= read -r model; do
      log "Pulling latest: $model"
      ollama pull "$model" 2>>"$LOG" && log "OK: $model updated" || {
        log "WARN: Failed to pull $model"
        ERRORS=$((ERRORS + 1))
      }
    done <<< "$MODELS"
  else
    log "No Ollama models installed"
  fi
else
  log "SKIP: Ollama not running or not installed"
fi

# ── 4. Git Pull (repo) ──
log_section "Git Pull"
if [[ -d "$REPO/.git" ]]; then
  cd "$REPO"
  BRANCH=$(git branch --show-current)
  log "Pulling $BRANCH..."
  git pull --ff-only 2>>"$LOG" && log "OK: Git pull complete ($BRANCH)" || {
    log "WARN: Git pull failed (conflicts?)"
    ERRORS=$((ERRORS + 1))
  }
else
  log "SKIP: $REPO is not a git repo"
fi

# ── 5. npm Dependencies ──
log_section "npm Dependencies"
if command -v npm &>/dev/null; then
  # Dashboard
  if [[ -f "$REPO/dashboard/package.json" ]]; then
    cd "$REPO/dashboard"
    log "Installing dashboard deps..."
    npm install --silent 2>>"$LOG" && log "OK: Dashboard deps installed" || {
      log "WARN: Dashboard npm install failed"
      ERRORS=$((ERRORS + 1))
    }
  fi

  # Bridge
  if [[ -f "$REPO/dashboard/bridge/package.json" ]]; then
    cd "$REPO/dashboard/bridge"
    log "Installing bridge deps..."
    npm install --silent 2>>"$LOG" && log "OK: Bridge deps installed" || {
      log "WARN: Bridge npm install failed"
      ERRORS=$((ERRORS + 1))
    }
  fi

  # x402-server
  if [[ -f "$REPO/dashboard/x402-server/package.json" ]]; then
    cd "$REPO/dashboard/x402-server"
    log "Installing x402-server deps..."
    npm install --silent 2>>"$LOG" && log "OK: x402-server deps installed" || {
      log "WARN: x402-server npm install failed"
      ERRORS=$((ERRORS + 1))
    }
  fi
else
  log "SKIP: npm not found"
fi

# ── 6. Disk & Memory Report ──
log_section "System Health Snapshot"
DISK_AVAIL=$(df -h / | tail -1 | awk '{print $4}')
MEM_PRESSURE=$(memory_pressure 2>/dev/null | grep "System-wide" | head -1 || echo "unknown")
UPTIME_STR=$(uptime | sed 's/.*up /up /' | sed 's/,.*//')
log "Disk available: $DISK_AVAIL"
log "Memory: $MEM_PRESSURE"
log "Uptime: $UPTIME_STR"

# ── Summary ──
ENDED=$(date +%s)
DURATION=$(( ENDED - STARTED ))

log_section "SYSTEM UPDATE COMPLETE"
log "Duration: ${DURATION}s | Errors: $ERRORS"

if [[ $ERRORS -eq 0 ]]; then
  log "✅ All updates successful"
else
  log "⚠️  Completed with $ERRORS error(s) — check $LOG for details"
fi

# Trim log to last 1000 lines
tail -1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
