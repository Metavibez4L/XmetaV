#!/bin/zsh
# ─────────────────────────────────────────────────────────
# Tailscale Funnel Setup — x402 Server Public HTTPS
#
# Exposes x402-server (port 4021) at:
#   https://abrahams-mac-studio.tail41b524.ts.net/
#
# This gives free HTTPS + auto-TLS cert from Let's Encrypt
# via Tailscale's infrastructure. No domain purchase needed.
#
# Prerequisites:
#   - Tailscale installed & authenticated
#   - HTTPS enabled in Tailscale admin (admin.tailscale.com)
#   - Funnel enabled in ACL policy
#
# Usage:
#   ./scripts/setup-funnel.sh          # Start funnel (foreground)
#   ./scripts/setup-funnel.sh status   # Check current config
#   ./scripts/setup-funnel.sh stop     # Reset/stop funnel
# ─────────────────────────────────────────────────────────

set -euo pipefail

X402_PORT="${X402_PORT:-4021}"
TS_HOSTNAME="abrahams-mac-studio.tail41b524.ts.net"

case "${1:-start}" in
  status)
    echo "=== Tailscale Funnel Status ==="
    tailscale funnel status
    echo ""
    echo "Public URL: https://${TS_HOSTNAME}/"
    echo "Health:     https://${TS_HOSTNAME}/health"
    ;;

  stop)
    echo "Stopping Tailscale Funnel..."
    tailscale funnel reset
    echo "Funnel stopped."
    ;;

  start|"")
    echo "=== Starting Tailscale Funnel ==="
    echo "Exposing localhost:${X402_PORT} → https://${TS_HOSTNAME}/"
    echo ""
    echo "Public endpoints:"
    echo "  Health:     https://${TS_HOSTNAME}/health"
    echo "  Queue:      https://${TS_HOSTNAME}/cross-chain/queue"
    echo "  Pricing:    https://${TS_HOSTNAME}/pricing"
    echo "  Token Info: https://${TS_HOSTNAME}/token-info"
    echo ""
    echo "Rate limits active: 100 req/min global, 10 req/min on expensive ops"
    echo "Press Ctrl+C to stop."
    echo ""

    # Enable HTTPS funnel — routes internet traffic to local x402 server
    # --bg runs in background; remove for foreground
    tailscale funnel "${X402_PORT}"
    ;;

  *)
    echo "Usage: $0 [start|status|stop]"
    exit 1
    ;;
esac
