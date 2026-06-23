#!/usr/bin/env bash
# verify-docker.sh — prove the Docker stack works end-to-end, the same way
# scripts/verify-roundtrip.sh does for Nix. Brings the stack up, signs in through the
# Vite proxy (the browser path), runs a REAL generation, polls to ready, fetches the
# emblem through the same-origin proxy and checks its magic bytes, then confirms the
# bytes live in Garage while Postgres holds only the key.
#
#   bash scripts/verify-docker.sh            # uses whatever provider your env selects
#   (no .env / no keys ⇒ Pollinations, the free default)
set -uo pipefail
cd "$(dirname "$0")/.."

B=http://localhost:5173
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

echo "=== up (build if needed) ==="
docker compose up -d --build 2>&1 | tail -4

echo "=== wait for server health ==="
for _ in $(seq 1 90); do
  curl -fsS http://localhost:3000/api/healthz >/dev/null 2>&1 && break
  sleep 1
done
echo "  healthz: $(curl -s http://localhost:3000/api/healthz)"

echo "=== garage bucket BEFORE ==="
docker compose exec -T garage /garage -c /etc/garage.toml bucket info trailmark 2>/dev/null \
  | grep -iE 'objects|size' | head -3

echo "=== sign in (magic-link through the Vite proxy) ==="
curl -s -X POST "$B/api/auth/sign-in/magic-link" -H 'content-type: application/json' \
  -H "origin: $B" -d '{"email":"reviewer@example.com","callbackURL":"/"}' >/dev/null
sleep 1
LINK=$(docker compose logs server 2>/dev/null | grep -oE 'url=http[^ ]+' | tail -1 | sed 's/^url=//')
curl -s -c "$JAR" -b "$JAR" -L "$LINK" -o /dev/null
echo "  GET /api/badges → HTTP $(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$B/api/badges") (expect 200)"

echo "=== POST a real generation ==="
BODY='{"inputs":{"raceName":"Docker Trail 50K","distance":"50K","finishTime":"05:12:44","date":"2026-06-23","motif":"compass","style":"woodcut_seal","palette":"forest"},"seed":4242}'
BID=$(curl -s -b "$JAR" -X POST "$B/api/badges" -H 'content-type: application/json' -H "origin: $B" \
  -d "$BODY" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "  id=$BID"

echo "=== poll to ready/failed (real gen, up to ~60s) ==="
ST=generating
for _ in $(seq 1 60); do
  P=$(curl -s -b "$JAR" "$B/api/badges/$BID")
  ST=$(echo "$P" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  [ "$ST" != "generating" ] && break
  sleep 1
done
echo "  final: status=$ST $(echo "$P" | grep -oE '"provider":"[^"]+"' | head -1)"

echo "=== fetch emblem through the proxy + magic bytes ==="
OUT=$(mktemp)
curl -s -b "$JAR" "$B/api/badges/$BID/image" -o "$OUT"
echo "  bytes=$(wc -c <"$OUT" | tr -d ' ')  magic=$(xxd -p -l 4 "$OUT" 2>/dev/null)  (PNG=89504e47 JPEG=ffd8ff)"
file -b "$OUT"; rm -f "$OUT"

echo "=== garage bucket AFTER (bytes landed in S3) ==="
docker compose exec -T garage /garage -c /etc/garage.toml bucket info trailmark 2>/dev/null \
  | grep -iE 'objects|size' | head -3

echo "=== postgres row holds the KEY, not the bytes ==="
docker compose exec -T db psql -U trailmark -d trailmark \
  -c "select status, provider, image_key from badges order by created_at desc limit 3;" 2>/dev/null

echo "=== done.  tear down with:  docker compose down -v ==="
