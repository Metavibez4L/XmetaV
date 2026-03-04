#!/bin/zsh
# launchd-bridge.sh — Bridge daemon launcher with pre-start syntax validation
# Runs esbuild syntax check before starting tsx watch.
# If the check fails, logs the error and exits (launchd retries after ThrottleInterval).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/akualabs"
export NODE_ENV="development"
REPO="/Users/akualabs/xmetav1/XmetaV"
BRIDGE_DIR="${REPO}/dashboard/bridge"
export DOTENV_CONFIG_PATH="${BRIDGE_DIR}/.env"

# ── Pre-start syntax check ───────────────────────────────────────
ESBUILD="${BRIDGE_DIR}/node_modules/.bin/esbuild"
if [[ -x "$ESBUILD" ]]; then
  CHECK_OUT=$("$ESBUILD" "${BRIDGE_DIR}/src/index.ts" --bundle --platform=node --outfile=/dev/null 2>&1)
  if [[ $? -ne 0 ]]; then
    echo "[bridge-launcher] SYNTAX CHECK FAILED — refusing to start" >&2
    echo "$CHECK_OUT" >&2
    echo "[bridge-launcher] Fix the error in bridge/src/index.ts and launchd will retry in 10s" >&2
    exit 1
  fi
  echo "[bridge-launcher] Syntax check passed"
fi

cd /tmp
exec /opt/homebrew/bin/node "${BRIDGE_DIR}/node_modules/tsx/dist/cli.mjs" watch "${BRIDGE_DIR}/src/index.ts"
