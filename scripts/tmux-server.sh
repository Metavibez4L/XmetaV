#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# XmetaV — tmux Headless Server Session
# Creates a persistent tmux session with all services in panes
# Usage: ./tmux-server.sh          (create/attach)
#        ./tmux-server.sh detach   (create in background)
#        ./tmux-server.sh kill     (tear down session)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin"

SESSION="xmetav"
REPO="/Users/akualabs/xmetav1/XmetaV"
ACTION="${1:-attach}"

# ── Kill ──
if [[ "$ACTION" == "kill" ]]; then
  tmux kill-session -t "$SESSION" 2>/dev/null && echo "Session '$SESSION' killed" || echo "No session to kill"
  exit 0
fi

# ── Already running? ──
if tmux has-session -t "$SESSION" 2>/dev/null; then
  if [[ "$ACTION" == "detach" ]]; then
    echo "Session '$SESSION' already running"
    tmux list-windows -t "$SESSION"
    exit 0
  fi
  echo "Attaching to existing session '$SESSION'..."
  exec tmux attach-session -t "$SESSION"
fi

echo "Creating tmux session '$SESSION'..."

# ── Window 0: Status / Control ──
tmux new-session -d -s "$SESSION" -n "control" -c "$REPO"
tmux send-keys -t "$SESSION:control" "echo '═══ XmetaV Control Pane ═══'; just status" Enter

# ── Window 1: Logs (split 3 panes) ──
tmux new-window -t "$SESSION" -n "logs" -c "$REPO"
tmux send-keys -t "$SESSION:logs" "tail -f /tmp/xmetav-bridge.log /tmp/xmetav-bridge.err" Enter
tmux split-window -t "$SESSION:logs" -v -c "$REPO"
tmux send-keys -t "$SESSION:logs.1" "tail -f /tmp/xmetav-dashboard.log /tmp/xmetav-dashboard.err 2>/dev/null || echo 'Waiting for dashboard logs...'" Enter
tmux split-window -t "$SESSION:logs" -v -c "$REPO"
tmux send-keys -t "$SESSION:logs.2" "tail -f /tmp/xmetav-watchdog.log" Enter
tmux select-layout -t "$SESSION:logs" even-vertical

# ── Window 2: htop ──
tmux new-window -t "$SESSION" -n "htop" -c "$REPO"
tmux send-keys -t "$SESSION:htop" "htop" Enter

# ── Window 3: Redis ──
tmux new-window -t "$SESSION" -n "redis" -c "$REPO"
tmux send-keys -t "$SESSION:redis" "redis-cli" Enter

# ── Window 4: Docker ──
tmux new-window -t "$SESSION" -n "docker" -c "$REPO"
tmux send-keys -t "$SESSION:docker" "docker ps -a 2>/dev/null || echo 'Docker starting...'" Enter

# ── Window 5: Dev (git, builds) ──
tmux new-window -t "$SESSION" -n "dev" -c "$REPO"
tmux send-keys -t "$SESSION:dev" "git log --oneline -5" Enter

# ── Window 6: Agents ──
tmux new-window -t "$SESSION" -n "agents" -c "$REPO"
tmux send-keys -t "$SESSION:agents" "openclaw agent list 2>/dev/null || echo 'Gateway not running'" Enter

# Go back to control window
tmux select-window -t "$SESSION:control"

if [[ "$ACTION" == "detach" ]]; then
  echo "Session '$SESSION' created in background"
  tmux list-windows -t "$SESSION"
else
  exec tmux attach-session -t "$SESSION"
fi
