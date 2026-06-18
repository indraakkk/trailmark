#!/usr/bin/env bash
# Happy-path round-trip: real Garage + real Pollinations generation → ready → image
# proxy. Run via:  nix shell nixpkgs#garage --command bash scripts/verify-roundtrip.sh
set -uo pipefail
cd "$(dirname "$0")/.."

CFG=.data/garage/garage.toml
KEY_ID="GK31c2f218a2e44341e0ffc5dd"
KEY_SECRET="b9c2e7a14d6f08e35a9b1c4d7e2f60a8c3b5d9e1f4a7c0b2d6e8f1a3c5b7d9e0"

rm -rf .data/garage && mkdir -p .data/garage
cat > "$CFG" <<TOML
metadata_dir = ".data/garage/meta"
data_dir = ".data/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_secret = "0000000000000000000000000000000000000000000000000000000000000000"
rpc_bind_addr = "127.0.0.1:3901"
rpc_public_addr = "127.0.0.1:3901"
[s3_api]
s3_region = "garage"
api_bind_addr = "127.0.0.1:3900"
root_domain = ".s3.garage.localhost"
[admin]
api_bind_addr = "127.0.0.1:3903"
admin_token = "trailmark-dev-admin-token"
TOML

g() { garage -c "$CFG" "$@"; }
garage -c "$CFG" server >/tmp/garage.log 2>&1 &
GPID=$!
trap 'kill $GPID $SRV 2>/dev/null' EXIT

echo "=== waiting for garage status (RPC ready, NOT /health) ==="
for _ in $(seq 1 30); do g status >/dev/null 2>&1 && break; sleep 1; done
ID=$(garage -c "$CFG" node id -q 2>/dev/null | cut -d@ -f1)
g status 2>/dev/null | grep -q "NO ROLE" && g layout assign -z dev -c 1G "$ID"
V=$(g layout show 2>/dev/null | sed -n 's/.*--version \([0-9]\{1,\}\).*/\1/p' | tail -n1)
[ -n "$V" ] && g layout apply --version "$V"
g bucket info trailmark >/dev/null 2>&1 || g bucket create trailmark
g key info "$KEY_ID" >/dev/null 2>&1 || g key import --yes "$KEY_ID" "$KEY_SECRET"
g bucket allow --read --write trailmark --key "$KEY_ID"
echo "  garage ready: $(g bucket info trailmark 2>/dev/null | head -1)"

export PGHOST="$HOME/.local/state/postgresql/run" PGUSER=indra PGDATABASE=trailmark TZ=UTC PORT=3000
export S3_ENDPOINT="http://127.0.0.1:3900" S3_REGION=garage S3_BUCKET=trailmark
export S3_ACCESS_KEY_ID="$KEY_ID" S3_SECRET_ACCESS_KEY="$KEY_SECRET"
export BETTER_AUTH_SECRET="trailmark-dev-secret-please-change-0123456789abcdef"
export BETTER_AUTH_URL="http://127.0.0.1:3000"
# No CF_API_TOKEN → provider goes straight to Pollinations. No DEMO_HOOKS → real gen.

LOG=/tmp/trailmark-roundtrip.log; rm -f /tmp/rt.jar "$LOG"
bun run --cwd apps/server start >"$LOG" 2>&1 &
SRV=$!
for _ in $(seq 1 40); do curl -fsS 127.0.0.1:3000/api/healthz >/dev/null 2>&1 && break; sleep 0.5; done

echo "=== sign in ==="
curl -s -X POST 127.0.0.1:3000/api/auth/sign-in/magic-link -H 'content-type: application/json' \
  -H 'origin: http://127.0.0.1:3000' -d '{"email":"runner@example.com","callbackURL":"/"}' >/dev/null
LINK=$(grep -oE 'url=http[^ ]+' "$LOG" | tail -1 | sed 's/^url=//')
curl -s -c /tmp/rt.jar -b /tmp/rt.jar -L "$LINK" -o /dev/null
echo "  signed in: $(curl -s -o /dev/null -w '%{http_code}' -b /tmp/rt.jar 127.0.0.1:3000/api/badges)"

echo "=== POST real generate (Pollinations) ==="
BODY='{"inputs":{"raceName":"Broken Arrow 26K","distance":"50K","finishTime":"05:12:44","date":"2026-06-18","motif":"compass","style":"woodcut_seal","palette":"forest"},"seed":12345}'
RESP=$(curl -s -b /tmp/rt.jar -X POST 127.0.0.1:3000/api/badges -H 'content-type: application/json' -d "$BODY")
BID=$(echo "$RESP" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "  id=$BID status=$(echo "$RESP" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)"

echo "=== poll until ready/failed (real gen, up to ~50s) ==="
for i in $(seq 1 50); do
  P=$(curl -s -b /tmp/rt.jar "127.0.0.1:3000/api/badges/$BID")
  ST=$(echo "$P" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  [ "$ST" != "generating" ] && break; sleep 1
done
echo "  final status=$ST provider=$(echo "$P" | grep -oE '"provider":"[^"]+"' | head -1 | cut -d'"' -f4) imageKey=$(echo "$P" | grep -oE '"imageKey":("[^"]*"|null)' | head -1)"

echo "=== fetch image via proxy + verify magic bytes ==="
curl -s -b /tmp/rt.jar "127.0.0.1:3000/api/badges/$BID/image" -o /tmp/emblem.out
SZ=$(wc -c < /tmp/emblem.out | tr -d ' ')
MAGIC=$(xxd -p -l 4 /tmp/emblem.out 2>/dev/null)
echo "  image bytes=$SZ magic=$MAGIC  (PNG=89504e47 / JPEG=ffd8ff..)"
file /tmp/emblem.out 2>/dev/null || true

echo "=== confirm object in Garage bucket ==="
g bucket info trailmark 2>/dev/null | grep -iE "objects|size" | head -3
echo "=== server log tail ==="; grep -iE "magic-link|warn|error|provider" "$LOG" | tail -5