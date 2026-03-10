#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/akualabs"
export NODE_ENV="development"
REPO="/Users/akualabs/xmetav1/XmetaV"
cd "${REPO}/dashboard"
exec /opt/homebrew/bin/node "${REPO}/dashboard/node_modules/next/dist/bin/next" dev
