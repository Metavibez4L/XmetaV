#!/bin/bash
# midas-agent.sh — Autonomous runner for the Midas revenue agent
# Aggregates x402 revenue data, endpoint analytics, and growth metrics.
#
# Usage:
#   ./scripts/midas-agent.sh              # Full cycle: report + endpoints
#   ./scripts/midas-agent.sh --report     # Revenue snapshot only
#   ./scripts/midas-agent.sh --endpoints  # Endpoint analytics only
#   ./scripts/midas-agent.sh --pricing    # Pricing analysis
#   ./scripts/midas-agent.sh --growth     # Growth opportunity scan
#
# Cron examples:
#   0 6 * * *   /home/manifest/XmetaV/scripts/midas-agent.sh --report    >> /tmp/midas.log 2>&1
#   0 */12 * * * /home/manifest/XmetaV/scripts/midas-agent.sh --endpoints >> /tmp/midas.log 2>&1
#   0 8 * * 1   /home/manifest/XmetaV/scripts/midas-agent.sh --growth    >> /tmp/midas.log 2>&1
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/../dashboard"
LOG_PREFIX="[midas-agent]"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

log() { echo "$LOG_PREFIX $TIMESTAMP — $*"; }

# Use the API endpoint for simplicity
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"

MODE="${1:---all}"

case "$MODE" in
  --report)
    log "Generating revenue report..."
    curl -sf "$DASHBOARD_URL/api/midas?action=report" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d.get('overview', {})
print(f'Revenue: \${o.get(\"totalRevenue\", \"0\")} total | \${o.get(\"revenue7d\", \"0\")} 7d | \${o.get(\"revenue30d\", \"0\")} 30d')
print(f'Payments: {o.get(\"totalPayments\", 0)} total | {o.get(\"payments7d\", 0)} 7d')
top = o.get('topEndpoints', [])
if top: print(f'Top endpoint: {top[0][\"endpoint\"]} (\${top[0][\"revenue\"]:.6f})')
" 2>/dev/null || log "Revenue report fetch failed (is dashboard running?)"
    log "Revenue report complete."
    ;;
  --endpoints)
    log "Analyzing endpoints..."
    curl -sf "$DASHBOARD_URL/api/midas?action=endpoints" | python3 -c "
import sys, json
d = json.load(sys.stdin)
eps = d.get('endpoints', [])
print(f'{len(eps)} endpoints tracked')
for ep in eps[:5]:
  print(f'  {ep[\"endpoint_path\"]}: \${ep.get(\"revenue_30d\", 0):.6f} (30d) | {ep.get(\"growth_trend\", \"?\")}')
" 2>/dev/null || log "Endpoint analysis fetch failed"
    log "Endpoint analysis complete."
    ;;
  --pricing)
    log "Running pricing analysis..."
    curl -sf "$DASHBOARD_URL/api/midas?action=pricing" | python3 -c "
import sys, json
d = json.load(sys.stdin)
recs = d.get('recommendations', [])
print(f'{len(recs)} pricing recommendations')
for r in recs[:5]:
  print(f'  {r[\"endpoint_path\"]}: \${r.get(\"current_price_usd\", 0):.6f} → \${r.get(\"recommended_price_usd\", 0):.6f} ({r.get(\"reasoning\", \"\")})')
" 2>/dev/null || log "Pricing analysis fetch failed"
    log "Pricing analysis complete."
    ;;
  --growth)
    log "Scanning growth opportunities..."
    curl -sf "$DASHBOARD_URL/api/midas?action=opportunities" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ops = d.get('opportunities', [])
print(f'{len(ops)} growth opportunities')
for o in ops[:5]:
  print(f'  [{o.get(\"priority\", \"?\")}] {o[\"name\"]}: ROI {o.get(\"roi_score\", 0):.1f}% | \${o.get(\"expected_revenue_30d\", 0):.4f}/30d ({o.get(\"status\", \"?\")})')
" 2>/dev/null || log "Growth scan fetch failed"
    log "Growth scan complete."
    ;;
  --all|*)
    log "Starting full Midas cycle..."
    "$0" --report
    "$0" --endpoints
    log "Full cycle complete."
    ;;
esac
