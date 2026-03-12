#!/usr/bin/env bash
# slack-announce.sh — Post a message to #akualabs-space via OpenClaw agent
# Usage: ./slack-announce.sh "Your message here"
# The message is delivered as the agent's response to the Slack channel.

set -euo pipefail

CHANNEL_ID="C0AKU813X0A"  # #akualabs-space
AGENT="main"
TIMEOUT=90

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 \"message text\""
  exit 1
fi

MSG="$1"

yes | openclaw agent \
  --agent "$AGENT" \
  --channel slack \
  --to "$CHANNEL_ID" \
  --deliver \
  --thinking off \
  --timeout "$TIMEOUT" \
  -m "Reply with ONLY the following text, nothing else. Do not add commentary or questions. Just output this text as your entire response: $MSG" 2>&1 | tail -5

echo ""
echo "[slack-announce] Delivered to #akualabs-space"
