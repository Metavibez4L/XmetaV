#!/usr/bin/env bash
# rotate-sessions.sh — Rotate bloated OpenClaw agent sessions
# Moves session files over SIZE_LIMIT to archive/ and purges old .deleted files.
# Run manually or via cron: 0 */6 * * * /path/to/rotate-sessions.sh
set -euo pipefail

AGENTS_DIR="${OPENCLAW_AGENTS_DIR:-$HOME/.openclaw/agents}"
SIZE_LIMIT_KB="${SESSION_SIZE_LIMIT_KB:-5120}"   # 5MB default
ARCHIVE_DAYS="${SESSION_ARCHIVE_DAYS:-7}"        # purge archives older than 7d
DRY_RUN="${DRY_RUN:-false}"

log() { printf "[rotate-sessions] %s %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

rotated=0
purged=0
freed_bytes=0

# --- Rotate oversized session files ---
for agent_dir in "$AGENTS_DIR"/*/; do
  sessions_dir="$agent_dir/sessions"
  [[ -d "$sessions_dir" ]] || continue
  agent_name="$(basename "$agent_dir")"

  # Find .jsonl files over the size limit (excluding archive/)
  while IFS= read -r -d '' file; do
    size_kb=$(( $(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null) / 1024 ))
    archive_dir="$sessions_dir/archive"

    if [[ "$DRY_RUN" == "true" ]]; then
      log "DRY-RUN: would rotate $agent_name/$(basename "$file") (${size_kb}KB)"
    else
      mkdir -p "$archive_dir"
      dest="$archive_dir/$(basename "$file").$(date +%Y%m%d_%H%M%S)"
      mv "$file" "$dest"
      log "rotated $agent_name/$(basename "$file") → archive/ (${size_kb}KB)"
    fi
    rotated=$((rotated + 1))
    freed_bytes=$((freed_bytes + size_kb * 1024))
  done < <(find "$sessions_dir" -maxdepth 1 -name "*.jsonl" -size +"${SIZE_LIMIT_KB}k" -print0 2>/dev/null)
done

# --- Purge old .deleted files ---
while IFS= read -r -d '' file; do
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: would purge $(basename "$file") ($((size/1024))KB)"
  else
    rm -f "$file"
    log "purged $(basename "$file") ($((size/1024))KB)"
  fi
  purged=$((purged + 1))
  freed_bytes=$((freed_bytes + size))
done < <(find "$AGENTS_DIR" -name "*.deleted.*" -mtime +1 -print0 2>/dev/null)

# --- Purge old archives ---
while IFS= read -r -d '' file; do
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: would purge archive $(basename "$file") ($((size/1024))KB)"
  else
    rm -f "$file"
    log "purged archive $(basename "$file") ($((size/1024))KB)"
  fi
  purged=$((purged + 1))
  freed_bytes=$((freed_bytes + size))
done < <(find "$AGENTS_DIR" -path "*/sessions/archive/*" -mtime +"$ARCHIVE_DAYS" -print0 2>/dev/null)

freed_mb=$((freed_bytes / 1048576))
log "done: rotated=$rotated purged=$purged freed=${freed_mb}MB"
