# 24 · Deploy — Trailmark as a SECOND app on `tap`

> part of the [Trailmark plan](../../PLAN.md)

Mentee **steps 6 & 8**: ship to the live `tap` box (root@43.133.128.143) where **taprunning already runs**, then prove both sites coexist over TLS. We do **not** spin up a new box — we add a second app to the existing clan-managed machine. See [ADR-0009 second app on tap](../adr/0009-second-app-on-tap.md).

The wiring is **cross-repo**: the trailmark repo exposes its app + a NixOS module; the **taprunning** repo (the clan that owns `tap`) consumes them. Mirror taprunning's `clanServices/app` + `clanServices/webserver` + `machines/tap/configuration.nix` patterns exactly — only the names, ports, secrets, and the Effect `PgMigrator` (not drizzle-kit) differ.

---

## What's net-new on the box

| Resource | taprunning (exists) | trailmark (add) |
|---|---|---|
| systemd server | `taprunning-server` :3000 | `trailmark-server` :3001 |
| systemd migrate | drizzle-kit oneshot | **PgMigrator** oneshot (Effect-native) |
| Caddy vhost | `taprunning.duckdns.org` | `trailmark.duckdns.org` |
| Postgres db / role | `taprunning` | `trailmark` |
| Object store | (deferred dummy S3) | **prod Garage** loopback → see [23 · prod Garage](./23-prod-garage.md) |
| clan vars | strava + session secrets | `CF_API_TOKEN`, `CF_ACCOUNT_ID`, garage key/secret, `BETTER_AUTH_SECRET`, `RESEND_API_KEY` |

Both server units bind `127.0.0.1` themselves; Caddy is the only thing on 80/443.

---

## 1 · trailmark repo exposes the package + module

Trailmark is its own Bun monorepo + nix flake. Its `flake.nix` exports:

- `packages.<system>.trailmark` — the built app (bun2nix; server + `apps/web/dist`, same `mkBunApp` shape as taprunning).
- `nixosModules.trailmark` (a `clan.service`) — the reusable unit definitions, parameterised by `port` / `domain` / `stateDirectory`. This is the module taprunning imports.

The clan that owns `tap` lives in **taprunning's** repo, so trailmark ships the *module*, not an inventory entry.

## 2 · taprunning's flake consumes trailmark

Two edits in the taprunning repo:

```nix
# flake.nix — add the input
inputs.trailmark.url = "github:.../trailmark";    # pin a rev (supply-chain policy: no floating ref)
inputs.trailmark.inputs.nixpkgs.follows = "clan-core/nixpkgs";   # the nixpkgs input, not the clan-core flake — one nixpkgs evals devShell + machine
```

```nix
# nix/infra.nix — register the module + an instance on `tap`
clan.modules.trailmark = inputs.trailmark.nixosModules.trailmark;  # or import its default.nix

inventory.instances.trailmark = {
  module = { name = "trailmark"; input = "self"; };
  roles.default.machines.tap.settings = {
    port = 3001;
    domain = "trailmark.duckdns.org";
    acmeEmail = "indrakoslab@gmail.com";
  };
};
```

`clan.specialArgs = { inherit inputs; }` already lets the module reach `inputs.trailmark.packages.<system>.trailmark` for `appPkg` + `webRoot`. Existing taprunning instances are untouched → coexistence.

## 3 · systemd `trailmark-server` + `trailmark-migrate`

Mirror `clanServices/app/default.nix`. Key deltas:

```nix
User = "trailmark"; Group = "trailmark";
environment.PORT = "3001";
environment.TZ   = "UTC";
# peer auth over the prod socket — discrete PG* env (NOT a DATABASE_URL; the pg driver
# mis-parses postgres:///…?host= socket URLs → TCP fallback). DbLive reads these via Config:
environment.PGHOST     = "/run/postgresql";
environment.PGUSER     = "trailmark";
environment.PGDATABASE = "trailmark";

# prod Garage on loopback (see 23-prod-garage.md). Bun S3Client is path-style by
# default — no forcePathStyle option. NON-secret endpoint → plain env:
environment.S3_ENDPOINT = "http://127.0.0.1:3900";
environment.S3_REGION   = "garage";
environment.S3_BUCKET   = "trailmark";
# Auth (15-auth.md). NON-secret URL → plain env; better-auth reads it automatically:
environment.BETTER_AUTH_URL = "https://trailmark.duckdns.org";
# S3 key/secret + CF token + BETTER_AUTH_SECRET + RESEND_API_KEY come via LoadCredential,
# exported in the ExecStart wrapper (never environment=).
```

- **Migrate oneshot** runs **before** the server (`Before=trailmark-server.service`, server `Requires=trailmark-migrate.service` → a failed migration blocks the new server, the safe failure mode). It is the Effect **`PgMigrator`** ([14 · Effect layer](./14-effect-layer.md)), invoked via a packaged wrapper (`${appPkg}/bin/...` or `bun run …/migrate.ts`), reading the same `PGHOST`/`PGUSER`/`PGDATABASE` env as the server. Order `After=`/`Requires=` **both** `postgresql.service` and `postgresql-setup.service` (the latter is the separate nixpkgs oneshot that runs `ensureUsers`/`ensureDatabases` — ordering on `postgresql.service` alone races first boot → `role "trailmark" does not exist`).
- Reuse taprunning's `commonSecurityConfig` hardening floor; `ReadWritePaths = [ stateDir ]` only. `LoadCredential` copies each sops-decrypted secret into `$CREDENTIALS_DIRECTORY/<id>`; the `ExecStart` shell wrapper `cat`s them into the env keys Config reads, then `exec`s bun.

## 4 · Postgres — add the trailmark db + role

`machines/tap/configuration.nix` already declares `services.postgresql` (pg16, unix socket, peer auth). Extend its lists **additively** — both apps share the one Postgres:

```nix
services.postgresql.ensureDatabases = [ "taprunning" "trailmark" ];
services.postgresql.ensureUsers = [
  { name = "taprunning"; ensureDBOwnership = true; }
  { name = "trailmark";  ensureDBOwnership = true; }   # peer-auth owner so PgMigrator can DDL
];
```

`User=trailmark` (declare `users.users.trailmark` in the module, system user) maps to the `trailmark` role via local peer auth — **no password secret**.

## 5 · Caddy — a NEW vhost

`services.caddy` is one service with many `virtualHosts`. The trailmark webserver role **adds** its host alongside taprunning's (does not replace it). Same shape as `clanServices/webserver/default.nix`:

```nix
services.caddy.virtualHosts."trailmark.duckdns.org".extraConfig = ''
  @api path /api/*
  handle @api { reverse_proxy 127.0.0.1:3001 }
  handle {
    root * ${webRoot}          # ${appPkg}/web = apps/web/dist
    encode gzip zstd
    try_files {path} /index.html
    file_server
  }
'';
```

ACME HTTP-01 issues a separate Let's Encrypt cert for the new host automatically; 80/443 are already open. **Flat DuckDNS namespace** — `trailmark.duckdns.org` is its own record, **not** a `*.taprunning.duckdns.org` sub-subdomain ([ADR-0009](../adr/0009-second-app-on-tap.md)).

## 6 · clan vars — mint the trailmark secrets

A `clan.core.vars.generators.trailmark` block (sops-nix), mirroring taprunning's generator:

```nix
prompts.cf-api-token  = { type = "hidden"; persist = true; };   # Cloudflare Workers AI token
prompts.cf-account-id = { type = "line";   persist = true; };   # CF account id
files.garage-s3-key-id     = { };   # generated → must match the prod Garage bucket key (23-prod-garage.md)
files.garage-s3-secret-key = { };
files.better-auth-secret   = { };   # generated ≥32-char session signing secret (15-auth.md)
prompts.resend-api-key     = { type = "hidden"; persist = true; };   # Resend send key (sandbox from-addr only emails the account owner; logged link is the demo path)
```

Each lands as a root-owned `0400` sops file; the server unit reads them **only** via `LoadCredential` (never `environment=`). The Garage key pair is the fixed credential the clan-vars generator mints and the [prod Garage](./23-prod-garage.md) bootstrap `garage key import`s (the daemon never mints its own — same id/secret on both sides).

---

## Deploy command (step 6)

Manual DuckDNS step **first**: point `trailmark.duckdns.org` → `43.133.128.143`, else ACME HTTP-01 fails. Then, **from inside the taprunning repo** on the laptop:

```bash
nix run .#clan-cli -- machines update tap
```

This builds the new closure (incl. the trailmark input) and activates it over SSH to `root@43.133.128.143`. CI fallback (a GitHub Actions workflow mirroring taprunning's `deploy.yml`) is in [25 · CI fallback](./25-ci-fallback.md).

## Acceptance (step 8) — coexistence

```bash
curl -fsS https://trailmark.duckdns.org/api/healthz     # → 200, valid TLS
curl -fsS https://taprunning.duckdns.org/                # → 200, STILL works
```

Both green = the second app landed without regressing the first.

## Fallback

If the cross-repo input/instance wiring proves fiddly inside the 7–8h timebox, deploy trailmark to a **separate second VPS/machine** instead — its own one-machine clan, own Caddy + Postgres + Garage, same module. Slower (new box bring-up) but decoupled from taprunning's clan. Note this trade-off in the README rather than burning the budget on cross-repo debugging.

---

**Links:** [ADR-0009 second app on tap](../adr/0009-second-app-on-tap.md) · [23 · prod Garage](./23-prod-garage.md) · [25 · CI fallback](./25-ci-fallback.md) · [14 · Effect layer (PgMigrator)](./14-effect-layer.md) · [15 · auth](./15-auth.md) · [ADR-0017 auth](../adr/0017-auth-magic-link-better-auth.md)
