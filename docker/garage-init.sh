#!/usr/bin/env bash
# docker/garage-init.sh — idempotent Garage bootstrap for the Docker stack.
# A direct port of nix/processes.nix's `garage-init` (and scripts/verify-roundtrip.sh):
# wait for RPC → assign+apply a layout → create the bucket → import the FIXED dev key
# → grant it read/write. Runs as a oneshot `garage-init` service, then exits 0.
#
# Gates on `garage status` (RPC ready), NOT the admin /health — a fresh single
# instance has no quorum, so /health 503s and a /health gate self-deadlocks (ADR-0013).
# The garage CLI talks to the `garage` container over RPC using rpc_secret +
# rpc_public_addr from the SAME config file mounted at /etc/garage.toml.
set -uo pipefail

CFG=/etc/garage.toml
BUCKET="trailmark"
KEY_ID="GK31c2f218a2e44341e0ffc5dd"
KEY_SECRET="b9c2e7a14d6f08e35a9b1c4d7e2f60a8c3b5d9e1f4a7c0b2d6e8f1a3c5b7d9e0"
ZONE="dev"
CAPACITY="1G"

g() { garage -c "$CFG" "$@"; }

echo "[garage-init] waiting for garage RPC to be reachable..."
for _ in $(seq 1 60); do
  if g status >/dev/null 2>&1; then break; fi
  sleep 1
done

GARAGE_ID="$(garage -c "$CFG" node id -q 2>/dev/null | cut -d@ -f1)"
if g status 2>/dev/null | grep -q "NO ROLE"; then
  g layout assign -z "$ZONE" -c "$CAPACITY" "$GARAGE_ID"
fi
STAGED_VERSION="$(g layout show 2>/dev/null \
  | sed -n 's/.*--version \([0-9]\{1,\}\).*/\1/p' | tail -n1)"
if [ -n "$STAGED_VERSION" ]; then
  g layout apply --version "$STAGED_VERSION"
fi

if ! g bucket info "$BUCKET" >/dev/null 2>&1; then
  g bucket create "$BUCKET"
fi
if ! g key info "$KEY_ID" >/dev/null 2>&1; then
  g key import --yes "$KEY_ID" "$KEY_SECRET"
  g key rename "$KEY_ID" trailmark-dev
fi
g bucket allow --read --write "$BUCKET" --key "$KEY_ID"

# Fail LOUDLY rather than reporting a false success: assert the bucket + key really
# exist before exiting 0. (The guarded commands above swallow their own errors, so
# without this a broken bootstrap — e.g. a missing node key — would still exit 0 and
# let the server boot against an empty store, surfacing only later as an S3 "No such
# key" on the first PUT. This makes `garage-init` the failure point instead.)
if ! g bucket info "$BUCKET" >/dev/null 2>&1 || ! g key info "$KEY_ID" >/dev/null 2>&1; then
  echo "[garage-init] FATAL: bucket '$BUCKET' or key '$KEY_ID' missing after bootstrap." >&2
  g status >&2 || true
  exit 1
fi
echo "[garage-init] done. bucket '$BUCKET' ready, key '$KEY_ID' granted r/w."
