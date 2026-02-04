#!/bin/bash
# Self-evolving script: can edit itself and its README
SCRIPT="$(realpath "$0")"
README="$(dirname "$0")/README.md"
BACKUP="$SCRIPT.bak"
TS="$(date +%Y%m%d_%H%M%S)"
VBK="$SCRIPT.bak.$TS"


if [[ "$1" == "backup" ]]; then
  cp "$SCRIPT" "$BACKUP"
  cp "$SCRIPT" "$VBK"
  echo "Backup saved to $BACKUP and $VBK."
  echo "RESULT: Backup completed."
  exit 0
fi

if [[ "$1" == "list-backups" ]]; then
  ls -1 "$SCRIPT.bak"* 2>/dev/null | sort
  echo "RESULT: Listed backups."
  exit 0
fi

if [[ "$1" == "restore-backup" ]]; then
  if [[ -z "$2" ]]; then
    echo "Usage: $0 restore-backup <timestamp>"
    echo "RESULT: Restore failed (no timestamp)."
    exit 1
  fi
  BKFILE="$SCRIPT.bak.$2"
  if [[ -f "$BKFILE" ]]; then
    cp "$BKFILE" "$SCRIPT"
    echo "Restored from $BKFILE."
    echo "RESULT: Restore completed."
    exit 0
  else
    echo "Backup $BKFILE not found."
    echo "RESULT: Restore failed (backup not found)."
    exit 1
  fi
fi

case "$1" in
  append)
    cp "$SCRIPT" "$BACKUP"
    cp "$SCRIPT" "$VBK"
    shift
    echo "$*" >> "$SCRIPT"
    echo "Appended to self_evolve.sh. Backup saved to $BACKUP and $VBK."
    echo "RESULT: Append completed."
    ;;
  replace)
    cp "$SCRIPT" "$BACKUP"
    cp "$SCRIPT" "$VBK"
    old="$2"; new="$3"
    sed -i "s/${old}/${new}/g" "$SCRIPT"
    echo "Replaced '$old' with '$new' in self_evolve.sh. Backup saved to $BACKUP and $VBK."
    echo "RESULT: Replace completed."
    ;;
  doc-append)
    shift
    echo "$*" >> "$README"
    echo "Appended to README.md."
    echo "RESULT: Doc append completed."
    ;;
  doc-replace)
    old="$2"; new="$3"
    sed -i "s/${old}/${new}/g" "$README"
    echo "Replaced '$old' with '$new' in README.md."
    echo "RESULT: Doc replace completed."
    ;;
  *)
    echo "Usage: $0 append <text> | replace <old> <new> | doc-append <text> | doc-replace <old> <new> | backup | restore | list-backups | restore-backup <timestamp> | show"
    echo "RESULT: Invalid command."
    exit 1
    ;;
esac

if [[ "$1" == "show" ]]; then
  cat "$SCRIPT"
  echo "RESULT: Show completed."
  exit 0
fi

# versioned backup test
