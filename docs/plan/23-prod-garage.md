# Prod Garage — the net-new infra piece

> part of the [Trailmark plan](../../PLAN.md)

The single genuinely new infra item. Everything else on machine `tap` is reused
from taprunning (Caddy vhost, Postgres, clan-vars/sops, CI). Trailmark is a
**second app on `tap`** that coexists with taprunning; its Garage daemon lives in
the `clanServices/trailmark` module, alongside the prod Postgres `trailmark`
db/user. See [deploy](./24-deploy.md) · [ADR-0013](../adr/0013-prod-garage-module.md).

## What we reuse vs. what is new

Reuse the *patterns* from taprunning (rename `taprunning`→`trailmark`, point DuckDNS + IP):
the `mkBunApp` / `systemdSecurity` libs, the `app` clanService shape, the Postgres
module, the CI workflows, the sops/clan-vars pattern.

> **Coexistence rule — Caddy & Postgres are single-owner, extend additively.**
> taprunning's `webserver` instance already owns `services.caddy.enable` / `.email`
> and firewall 80/443. Those are **non-merging single-value** options — re-declaring
> them (even to the *same* value) is a NixOS "conflicting definition" error that breaks
> the whole machine. So the trailmark module must **only** add
> `services.caddy.virtualHosts."trailmark.duckdns.org"` (a merging attrset) and must
> **not** re-set `enable` / `email` / firewall ports. Same for Postgres: **extend** the
> existing `ensureDatabases` / `ensureUsers` lists, don't redeclare the service. (If you
> ever must touch a single-value option, guard it with `lib.mkDefault`.) [24](./24-deploy.md) says the same.

- **Caddy**: ADD the `trailmark.duckdns.org` vhost only ([24 §5](./24-deploy.md)) — static
  `dist/` + `reverse_proxy /api/* → 127.0.0.1:3001`, Let's Encrypt HTTP-01 on a flat
  `trailmark.duckdns.org` record (NOT a sub-subdomain). **Do not** re-enable Caddy.
- **Postgres**: extend `ensureDatabases` / `ensureUsers` additively with `trailmark`
  (peer auth) — the daily `postgresqlBackup` already covers every db.
- **NEW: Garage** — the only net-new daemon, below.

## The Garage module

A **plain `services.garage`** declared by the `clanServices/trailmark` module on
machine `tap` (next to Postgres) — *not* a per-instance clanService setting.
Garage is a local stateful daemon like Postgres: single instance, no per-instance config.

```nix
# machines/trailmark/configuration.nix — alongside services.postgresql.
# Single-instance S3. All ports loopback-only; only Caddy 80/443 are public.
# Data under the module-default /var/lib/garage (ext4 root → survives redeploys).
# rpc_secret + admin_token come from a sops-decrypted EnvironmentFile, NEVER inlined
# into the world-readable /etc/garage.toml.
services.garage = {
  enable = true;
  package = pkgs.garage_1;                 # 1.x; verify the attr in your pinned nixpkgs
  environmentFile = config.clan.core.vars.generators.trailmark.files."garage-env".path;
  settings = {
    metadata_dir = "/var/lib/garage/meta";
    data_dir     = "/var/lib/garage/data";
    db_engine    = "lmdb";
    replication_factor = 1;                 # MUST equal the instance count (1)
    rpc_bind_addr   = "127.0.0.1:3901";
    rpc_public_addr = "127.0.0.1:3901";     # NO rpc_secret here — from env GARAGE_RPC_SECRET
    s3_api = { s3_region = "garage"; api_bind_addr = "127.0.0.1:3900"; };  # path-style; no root_domain needed
    admin  = { api_bind_addr = "127.0.0.1:3903"; };                        # NO admin_token here — from env
  };
};
# DO NOT open a Garage port in the firewall. The Effect server (same box) is the only client.
```

## Bootstrap one-shot

Idempotent. **Gate on `garage status`, NOT `/health`** — a fresh single instance has
no quorum, so `/health` returns 503 until layout is applied → a `/health` gate
self-deadlocks.

The bootstrap unit needs the secrets in **its own** environment — the `services.garage`
wrapper only injects the env file into the *daemon* subprocess, not into this unit's
shell. So `garage-bootstrap.service` must set its own `EnvironmentFile`:

```nix
systemd.services.garage-bootstrap.serviceConfig = {
  Type = "oneshot";
  After = [ "garage.service" ]; Requires = [ "garage.service" ];
  EnvironmentFile = config.clan.core.vars.generators.trailmark.files."garage-env".path; # same file as the daemon
};
```

```bash
# garage-bootstrap ExecStart. Each step is idempotent (a no-op on re-run).
g() { garage -c /etc/garage.toml "$@"; }
test -n "${GARAGE_RPC_SECRET:-}" || exit 1                                    # provided by EnvironmentFile above
for _ in $(seq 1 30); do g status >/dev/null 2>&1 && break; sleep 1; done     # RPC-ready, NOT /health (quorum deadlock)
GARAGE_ID="$(g node id -q 2>/dev/null | cut -d@ -f1)"                           # robust: purpose-built id, not table-parsing
g status 2>/dev/null | grep -q 'NO ROLE' && g layout assign -z dc1 -c 1G "$GARAGE_ID"
STAGED=$(g layout show 2>/dev/null | sed -n 's/.*--version \([0-9]\{1,\}\).*/\1/p' | tail -n1)
[ -n "$STAGED" ] && g layout apply --version "$STAGED"                        # derive the staged version, never hardcode 1
g bucket info trailmark >/dev/null 2>&1 || g bucket create trailmark
g key info "$S3_ACCESS_KEY_ID" >/dev/null 2>&1 || g key import --yes "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" -n trailmark-app
g bucket allow --read --write trailmark --key "$S3_ACCESS_KEY_ID"
```

## Secrets — one env file

Via clan-vars: one generator mints `garage-rpc-secret`, `garage-admin-token`,
`garage-s3-key-id`, `garage-s3-secret`, and renders a **single `garage-env`** file:

```
GARAGE_RPC_SECRET=…
GARAGE_ADMIN_TOKEN=…
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

It is the `environmentFile` for the `services.garage` **daemon** *and* the
`EnvironmentFile` for the **`garage-bootstrap`** unit (above) — so the bootstrap's
`test -n "$GARAGE_RPC_SECRET"` guard and `garage key import` see the same creds the
server later uses. One env file, not a separate `/run`-rendering unit — avoids a cold-boot race.

The **server** reads `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` /
`S3_ENDPOINT(=http://127.0.0.1:3900)` / `S3_BUCKET(=trailmark)` via systemd
`LoadCredential` → ExecStart wrapper → env → `Config.redacted`.

## S3 client — no forcePathStyle

Reuse taprunning's `ObjectStorage.ts` almost as-is (Bun's built-in `S3Client`).
**Bun `S3Client` has no `forcePathStyle`** — it is path-style by default. Don't set
it; just point `endpoint` at the Garage URL.

```ts
import { S3Client } from 'bun'
const s3 = new S3Client({ endpoint: S3_ENDPOINT, bucket: S3_BUCKET, accessKeyId, secretAccessKey, region: 'garage' })
// PUT emblems/<id>.jpg on success; GET + stream via /api/badges/:id/image (keeps S3 private + CORS-clean)
```

## Persistence & security

- **Persistence:** `/var/lib/garage/{meta,data}` is on the ext4 root, not
  `/nix/store` — `clan machines update` swaps the closure but never touches
  `/var/lib`, so buckets/objects/layout survive redeploys and reboots.
  Round-trip a `put`/`get` against the live endpoint once before relying on it.
- **Security posture (state it in the doc):** S3/admin/RPC all on `127.0.0.1`;
  only Caddy's 80/443 are public; the browser never touches Garage — images stream
  through the Effect server. Secrets live in sops, never in `/etc/garage.toml`.
