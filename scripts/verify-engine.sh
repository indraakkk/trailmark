#!/usr/bin/env bash
# Local end-to-end verification of the auth + async-poll + failure-state engine.
# Uses DEMO_HOOKS so the 3 failure states settle deterministically WITHOUT a real
# provider or Garage. Run from repo root: bash scripts/verify-engine.sh
set -uo pipefail
cd "$(dirname "$0")/.."

export PGHOST="$HOME/.local/state/postgresql/run" PGUSER=indra PGDATABASE=trailmark TZ=UTC PORT=3000
export S3_ENDPOINT="http://127.0.0.1:3900" S3_REGION=garage S3_BUCKET=trailmark
export S3_ACCESS_KEY_ID="GK31c2f218a2e44341e0ffc5dd"
export S3_SECRET_ACCESS_KEY="b9c2e7a14d6f08e35a9b1c4d7e2f60a8c3b5d9e1f4a7c0b2d6e8f1a3c5b7d9e0"
export BETTER_AUTH_SECRET="trailmark-dev-secret-please-change-0123456789abcdef"
# Use 127.0.0.1 consistently so the session cookie's domain matches every curl below
# (a localhost-vs-127.0.0.1 mismatch would drop the cookie). The real app uses localhost.
export BETTER_AUTH_URL="http://127.0.0.1:3000"
export DEMO_HOOKS=true

LOG=/tmp/trailmark-verify.log
rm -f /tmp/alice.jar /tmp/bob.jar "$LOG"

bun run --cwd apps/server start >"$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for _ in $(seq 1 40); do curl -fsS 127.0.0.1:3000/api/healthz >/dev/null 2>&1 && break; sleep 0.5; done

say() { printf '\n=== %s ===\n' "$1"; }

BODY='{"inputs":{"raceName":"Broken Arrow 26K","distance":"Marathon","finishTime":"03:42:11","date":"2026-06-18","motif":"mountain","style":"enamel_pin","palette":"alpine"},"seed":null}'

signin() { # $1=email $2=jar
  curl -s -X POST 127.0.0.1:3000/api/auth/sign-in/magic-link \
    -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3000' \
    -d "{\"email\":\"$1\",\"callbackURL\":\"/\"}" >/dev/null
  local link; link=$(grep -oE 'url=http[^ ]+' "$LOG" | tail -1 | sed 's/^url=//')
  curl -s -c "$2" -b "$2" -L "$link" -o /dev/null
  echo "$link"
}

say "1. unauthenticated GET /api/badges → expect 401"
curl -s -o /dev/null -w "  status=%{http_code}\n" 127.0.0.1:3000/api/badges

say "2. alice signs in via magic link"
L=$(signin alice@example.com /tmp/alice.jar); echo "  link: ${L:0:70}..."
curl -s -o /dev/null -w "  authed GET /api/badges status=%{http_code}\n" -b /tmp/alice.jar 127.0.0.1:3000/api/badges
echo "  gallery: $(curl -s -b /tmp/alice.jar 127.0.0.1:3000/api/badges)"

for force in invalid timeout broken; do
  say "3.$force POST /api/badges?force=$force → generating → poll failed"
  RESP=$(curl -s -b /tmp/alice.jar -X POST "127.0.0.1:3000/api/badges?force=$force" -H 'content-type: application/json' -d "$BODY")
  ID=$(echo "$RESP" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
  STATUS0=$(echo "$RESP" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  echo "  submit: id=${ID:0:8} status=$STATUS0"
  for _ in $(seq 1 20); do
    P=$(curl -s -b /tmp/alice.jar "127.0.0.1:3000/api/badges/$ID")
    ST=$(echo "$P" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
    [ "$ST" != "generating" ] && break; sleep 0.3
  done
  echo "  poll: status=$ST errorTag=$(echo "$P" | grep -oE '"errorTag":("[^"]*"|null)' | head -1)"
  LAST_ID=$ID
done

say "4. data isolation: bob cannot read alice's badge → expect 404"
signin bob@example.com /tmp/bob.jar >/dev/null
curl -s -o /dev/null -w "  bob GET alice badge status=%{http_code}\n" -b /tmp/bob.jar "127.0.0.1:3000/api/badges/$LAST_ID"
curl -s -o /dev/null -w "  bob GET alice image status=%{http_code}\n" -b /tmp/bob.jar "127.0.0.1:3000/api/badges/$LAST_ID/image"

say "5. built_prompt persisted (demo gold) — DB check"
bun -e "import {Pool} from 'pg'; const p=new Pool(); const r=await p.query(\"select status,error_tag,left(built_prompt,55) bp from badges order by created_at desc limit 4\"); console.table(r.rows); await p.end()" 2>/dev/null || true

echo; echo "=== server log tail ==="; tail -6 "$LOG"
