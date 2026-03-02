#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/akualabs"
export NODE_ENV="development"
REPO="/Users/akualabs/xmetav1/XmetaV"
export DOTENV_CONFIG_PATH="${REPO}/dashboard/x402-server/.env"
cd /tmp
exec /opt/homebrew/bin/node "${REPO}/dashboard/x402-server/node_modules/tsx/dist/cli.mjs" watch "${REPO}/dashboard/x402-server/index.ts"
