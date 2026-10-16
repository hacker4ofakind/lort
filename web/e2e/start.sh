#!/bin/sh
# Builds the Go server and this app, then starts the server on a fresh data dir with a known admin.
set -e
cd "$(dirname "$0")/.."
WEB=$(pwd)
OUT=$(mktemp -d)
(cd ../server && CGO_ENABLED=0 go build -o "$OUT/lort" .)
pnpm build > "$OUT/next-build.log"
cp -r public .next/standalone/ 2>/dev/null || true
cp -r .next/static .next/standalone/.next/
export LORT_DATA="$OUT/pb_data"
export LORT_URL=http://localhost:4052
export LORT_ADMIN_EMAIL=admin@example.com
export LORT_ADMIN_PASSWORD=correcthorse
export LORT_WEB_CMD="node $WEB/.next/standalone/server.js"
exec "$OUT/lort"
