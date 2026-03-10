#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# screen-record.sh — Screen Studio recording automation for agents
#
# Commands:
#   start                  Start recording
#   stop                   Stop recording
#   export [name]          Export current recording
#   status                 Check if recording
#   demo <script.json>     Run a scripted demo sequence
# ────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RECORDINGS_DIR="$HOME/XmetaV/recordings"
DIAGRAMS_DIR="$HOME/XmetaV/diagrams"
STATE_FILE="/tmp/xmetav-recording-state"
MAC_AUTO="$SCRIPT_DIR/mac-automate.sh"

mkdir -p "$RECORDINGS_DIR"

log() { echo "[screen-rec] $(date +%H:%M:%S) $*"; }
err() { echo "[screen-rec] ERROR: $*" >&2; exit 1; }

# ── Screen Studio Control ────────────────────────────────────────

is_screen_studio_running() {
  pgrep -x "Screen Studio" >/dev/null 2>&1
}

ensure_screen_studio() {
  if ! is_screen_studio_running; then
    log "Starting Screen Studio..."
    open -a "Screen Studio" 2>/dev/null || err "Screen Studio not installed"
    sleep 2
  fi
}

cmd_start() {
  ensure_screen_studio

  log "Starting recording..."
  # Screen Studio uses ⌘⇧2 to start recording (default hotkey)
  osascript -e '
    tell application "Screen Studio" to activate
    delay 0.5
    tell application "System Events"
      keystroke "2" using {command down, shift down}
    end tell
  '
  
  echo "recording" > "$STATE_FILE"
  echo "$(date +%s)" >> "$STATE_FILE"
  log "Recording started"
  
  # Notification
  osascript -e 'display notification "Recording started" with title "XmetaV Screen Record" subtitle "Screen Studio recording..."'
}

cmd_stop() {
  if [[ ! -f "$STATE_FILE" ]]; then
    log "No active recording"
    return
  fi
  
  log "Stopping recording..."
  # Screen Studio uses ⌘⇧2 to stop recording (toggle)
  osascript -e '
    tell application "System Events"
      keystroke "2" using {command down, shift down}
    end tell
  '
  
  local start_time
  start_time=$(tail -1 "$STATE_FILE")
  local duration=$(( $(date +%s) - start_time ))
  rm -f "$STATE_FILE"
  
  log "Recording stopped (${duration}s)"
  osascript -e "display notification \"Recording stopped (${duration}s)\" with title \"XmetaV Screen Record\""
}

cmd_export() {
  local name="${1:-xmetav_$(date +%Y%m%d_%H%M%S)}"
  local output="$RECORDINGS_DIR/${name}.mp4"
  
  log "Exporting recording as: $name"
  
  # Screen Studio export via menu automation
  osascript -e '
    tell application "Screen Studio" to activate
    delay 0.5
    tell application "System Events"
      -- ⌘E to export (common shortcut)
      keystroke "e" using {command down}
      delay 1
    end tell
  '
  
  log "Export initiated — check Screen Studio for progress"
  log "Output directory: $RECORDINGS_DIR/"
  echo "$output"
}

cmd_status() {
  if [[ -f "$STATE_FILE" ]]; then
    local state
    state=$(head -1 "$STATE_FILE")
    local start_time
    start_time=$(tail -1 "$STATE_FILE")
    local duration=$(( $(date +%s) - start_time ))
    echo "Recording: YES (${duration}s elapsed)"
  else
    echo "Recording: NO"
  fi
  
  if is_screen_studio_running; then
    echo "Screen Studio: RUNNING"
  else
    echo "Screen Studio: NOT RUNNING"
  fi
}

# ── Scripted Demo Sequences ──────────────────────────────────────
# JSON format:
# {
#   "name": "fleet-demo",
#   "steps": [
#     { "action": "start-recording" },
#     { "action": "wait", "seconds": 2 },
#     { "action": "switch-app", "app": "Safari" },
#     { "action": "open-file", "path": "~/XmetaV/diagrams/fleet.svg" },
#     { "action": "wait", "seconds": 3 },
#     { "action": "screenshot", "name": "fleet-shot" },
#     { "action": "notify", "title": "Demo", "message": "Step complete" },
#     { "action": "stop-recording" }
#   ]
# }

cmd_demo() {
  local script_file="${1:?Usage: demo <script.json>}"
  [[ -f "$script_file" ]] || err "Script not found: $script_file"
  
  # Requires jq
  command -v jq >/dev/null || err "jq required: brew install jq"
  
  local demo_name
  demo_name=$(jq -r '.name // "unnamed"' "$script_file")
  local step_count
  step_count=$(jq '.steps | length' "$script_file")
  
  log "Running demo: $demo_name ($step_count steps)"
  osascript -e "display notification \"Starting: $demo_name\" with title \"XmetaV Demo\" subtitle \"$step_count steps\""
  
  for i in $(seq 0 $((step_count - 1))); do
    local action
    action=$(jq -r ".steps[$i].action" "$script_file")
    log "Step $((i+1))/$step_count: $action"
    
    case "$action" in
      start-recording)
        cmd_start
        ;;
      stop-recording)
        cmd_stop
        ;;
      wait)
        local secs
        secs=$(jq -r ".steps[$i].seconds // 1" "$script_file")
        sleep "$secs"
        ;;
      switch-app)
        local app
        app=$(jq -r ".steps[$i].app" "$script_file")
        "$MAC_AUTO" switch-app "$app"
        ;;
      open-file)
        local path
        path=$(jq -r ".steps[$i].path" "$script_file")
        path="${path/#\~/$HOME}"
        "$MAC_AUTO" open-file "$path"
        ;;
      open-svg)
        local path
        path=$(jq -r ".steps[$i].path" "$script_file")
        path="${path/#\~/$HOME}"
        "$MAC_AUTO" open-svg "$path"
        ;;
      open-excalidraw)
        local path
        path=$(jq -r ".steps[$i].path" "$script_file")
        path="${path/#\~/$HOME}"
        "$MAC_AUTO" open-excalidraw "$path"
        ;;
      open-url)
        local url
        url=$(jq -r ".steps[$i].url" "$script_file")
        "$MAC_AUTO" open-url "$url"
        ;;
      screenshot)
        local sname
        sname=$(jq -r ".steps[$i].name // \"demo_shot\"" "$script_file")
        "$MAC_AUTO" screenshot "$RECORDINGS_DIR/${sname}.png"
        ;;
      type-text)
        local text
        text=$(jq -r ".steps[$i].text" "$script_file")
        "$MAC_AUTO" type-text "$text"
        ;;
      notify)
        local title message
        title=$(jq -r ".steps[$i].title // \"Demo\"" "$script_file")
        message=$(jq -r ".steps[$i].message // \"\"" "$script_file")
        "$MAC_AUTO" notify "$title" "$message"
        ;;
      arrange-split)
        "$MAC_AUTO" arrange-split
        ;;
      full-screen)
        "$MAC_AUTO" full-screen
        ;;
      *)
        log "Unknown action: $action — skipping"
        ;;
    esac
    
    # Small delay between steps for visual clarity
    sleep 0.3
  done
  
  log "Demo complete: $demo_name"
  osascript -e "display notification \"Demo complete\" with title \"XmetaV Demo\" subtitle \"$demo_name\""
}

# ── Dispatcher ────────────────────────────────────────────────────

case "${1:-help}" in
  start)   shift; cmd_start ;;
  stop)    shift; cmd_stop ;;
  export)  shift; cmd_export "$@" ;;
  status)  shift; cmd_status ;;
  demo)    shift; cmd_demo "$@" ;;
  help|--help|-h)
    echo "Usage: screen-record.sh <command> [args...]"
    echo ""
    echo "Commands:"
    echo "  start              Start Screen Studio recording"
    echo "  stop               Stop recording"
    echo "  export [name]      Export current recording"
    echo "  status             Check recording status"
    echo "  demo <script.json> Run scripted demo sequence"
    ;;
  *) err "Unknown command: $1 — run with --help" ;;
esac
