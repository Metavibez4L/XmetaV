#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# mac-automate.sh — Mac desktop automation for XmetaV agents
#
# Commands:
#   open-file <path>           Open a file in the default app
#   open-excalidraw <path>     Open .excalidraw in browser (excalidraw.com)
#   open-svg <path>            Open SVG in Preview / browser
#   switch-app <name>          Bring app to front (Terminal, Safari, etc.)
#   screenshot <output.png>    Capture full screen
#   screenshot-window <out>    Capture frontmost window
#   type-text <text>           Type text into frontmost app
#   notify <title> <message>   macOS notification
#   open-url <url>             Open URL in default browser
#   list-windows               List all visible windows
#   arrange-split              Split screen: left half + right half
#   full-screen                Make frontmost window full screen
# ────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIAGRAMS_DIR="$HOME/XmetaV/diagrams"

log() { echo "[mac-auto] $(date +%H:%M:%S) $*"; }
err() { echo "[mac-auto] ERROR: $*" >&2; exit 1; }

# ── Commands ──────────────────────────────────────────────────────

cmd_open_file() {
  local file="${1:?Usage: open-file <path>}"
  [[ -f "$file" ]] || err "File not found: $file"
  log "Opening: $file"
  open "$file"
}

cmd_open_excalidraw() {
  local file="${1:?Usage: open-excalidraw <path>}"
  [[ -f "$file" ]] || err "File not found: $file"
  
  # Excalidraw.com can open .excalidraw files via the file picker
  # But the fastest path is to use the local Excalidraw desktop app if installed,
  # or serve it locally and open in browser
  log "Opening Excalidraw: $file"
  
  # Check for Excalidraw desktop app
  if [[ -d "/Applications/Excalidraw.app" ]]; then
    open -a "Excalidraw" "$file"
  else
    # Fallback: open excalidraw.com and notify user to load file
    open "https://excalidraw.com"
    sleep 1.5
    osascript -e "display notification \"Load file: $(basename "$file")\" with title \"Excalidraw\" subtitle \"File ready in ~/XmetaV/diagrams/\""
    log "Opened excalidraw.com — load file manually: $file"
  fi
}

cmd_open_svg() {
  local file="${1:?Usage: open-svg <path>}"
  [[ -f "$file" ]] || err "File not found: $file"
  log "Opening SVG: $file"
  
  # Open in browser for best rendering
  open -a "Safari" "$file" 2>/dev/null || open "$file"
}

cmd_switch_app() {
  local app="${1:?Usage: switch-app <app-name>}"
  log "Switching to: $app"
  osascript -e "tell application \"$app\" to activate" 2>/dev/null || {
    # Try case-insensitive search
    osascript -e "
      tell application \"System Events\"
        set appList to name of every process whose background only is false
        repeat with appName in appList
          if appName contains \"$app\" then
            tell application appName to activate
            return
          end if
        end repeat
      end tell
    "
  }
}

cmd_screenshot() {
  local output="${1:-$DIAGRAMS_DIR/screenshot_$(date +%Y%m%d_%H%M%S).png}"
  mkdir -p "$(dirname "$output")"
  log "Screenshot → $output"
  screencapture -x "$output"
  log "Saved: $output"
  echo "$output"
}

cmd_screenshot_window() {
  local output="${1:-$DIAGRAMS_DIR/screenshot_win_$(date +%Y%m%d_%H%M%S).png}"
  mkdir -p "$(dirname "$output")"
  log "Window screenshot → $output"
  screencapture -x -w "$output"
  log "Saved: $output"
  echo "$output"
}

cmd_type_text() {
  local text="${1:?Usage: type-text <text>}"
  log "Typing: ${text:0:40}..."
  osascript -e "
    tell application \"System Events\"
      keystroke \"$text\"
    end tell
  "
}

cmd_notify() {
  local title="${1:?Usage: notify <title> <message>}"
  local message="${2:-}"
  osascript -e "display notification \"$message\" with title \"$title\" subtitle \"XmetaV Agent\""
}

cmd_open_url() {
  local url="${1:?Usage: open-url <url>}"
  log "Opening URL: $url"
  open "$url"
}

cmd_list_windows() {
  osascript -e '
    tell application "System Events"
      set output to ""
      set procs to every process whose background only is false
      repeat with proc in procs
        try
          set wins to every window of proc
          repeat with win in wins
            set output to output & (name of proc) & " | " & (name of win) & linefeed
          end repeat
        end try
      end repeat
      return output
    end tell
  '
}

cmd_arrange_split() {
  osascript -e '
    tell application "System Events"
      set screenWidth to (do shell script "system_profiler SPDisplaysDataType | grep Resolution | head -1 | awk \"{print \\$2}\"") as integer
      set screenHeight to (do shell script "system_profiler SPDisplaysDataType | grep Resolution | head -1 | awk \"{print \\$4}\"") as integer
      
      -- Get the two frontmost apps
      set frontApp to name of first application process whose frontmost is true
      
      -- Make frontmost window left half
      tell process frontApp
        set position of window 1 to {0, 25}
        set size of window 1 to {screenWidth / 2, screenHeight - 25}
      end tell
    end tell
  '
  log "Arranged frontmost window to left half"
}

cmd_full_screen() {
  osascript -e '
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      tell process frontApp
        -- Toggle full screen via menu or keystroke
        keystroke "f" using {control down, command down}
      end tell
    end tell
  '
  log "Toggled full screen"
}

# ── Dispatcher ────────────────────────────────────────────────────

case "${1:-help}" in
  open-file)          shift; cmd_open_file "$@" ;;
  open-excalidraw)    shift; cmd_open_excalidraw "$@" ;;
  open-svg)           shift; cmd_open_svg "$@" ;;
  switch-app)         shift; cmd_switch_app "$@" ;;
  screenshot)         shift; cmd_screenshot "$@" ;;
  screenshot-window)  shift; cmd_screenshot_window "$@" ;;
  type-text)          shift; cmd_type_text "$@" ;;
  notify)             shift; cmd_notify "$@" ;;
  open-url)           shift; cmd_open_url "$@" ;;
  list-windows)       shift; cmd_list_windows ;;
  arrange-split)      shift; cmd_arrange_split ;;
  full-screen)        shift; cmd_full_screen ;;
  help|--help|-h)
    echo "Usage: mac-automate.sh <command> [args...]"
    echo ""
    echo "Commands:"
    echo "  open-file <path>           Open a file in default app"
    echo "  open-excalidraw <path>     Open .excalidraw in browser"
    echo "  open-svg <path>            Open SVG in Preview/browser"
    echo "  switch-app <name>          Bring app to front"
    echo "  screenshot [output.png]    Capture full screen"
    echo "  screenshot-window [out]    Capture frontmost window"
    echo "  type-text <text>           Type into frontmost app"
    echo "  notify <title> [message]   macOS notification"
    echo "  open-url <url>             Open URL in browser"
    echo "  list-windows               List all visible windows"
    echo "  arrange-split              Left-half current window"
    echo "  full-screen                Toggle full screen"
    ;;
  *) err "Unknown command: $1 — run with --help" ;;
esac
