# 0011. Local Postgres = the shared indra-nix-home server
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Trailmark stores gallery rows in Postgres. For local dev we can either spin a per-project Postgres (process-compose / docker) or reuse the always-on shared server from indra-nix-home. Which backs `nix run .#dev`?

## Decision Drivers
- One running Postgres on the dev box, not one per project (the indra-nix-home `postgresShared` server already runs on macos + linux).
- The server's DB layer must work UNCHANGED in prod (peer auth, different socket/user/db).
- Minimal ceremony: no extra supervised process, no extra port.

## Considered Options
- Shared indra-nix-home server: socket `$HOME/.local/state/postgresql/run`, user `indra`, db `trailmark` (peer auth over the unix socket).
- A per-project Postgres process inside process-compose (like Garage).

## Decision Outcome
Chosen: "shared indra-nix-home server", because it already runs (launchd on macos / systemd-user on linux, peer auth via `pg_hba` `local all all peer`) and per-project ceremony buys nothing for a 7-8h scope. Postgres is therefore NOT a process-compose service. The devShell `shellHook` ensures the db exists with a createdb guard against the shared socket (mirroring indra-nix-home's `devenv-pg-shared.nix` `enterShell`):

```sh
if ! psql -lqt | cut -d \| -f 1 | grep -qw trailmark; then createdb trailmark; fi
```

Env for local (discrete `PG*` — `DbLive` reads these via Effect `Config`; we do **not** set a `DATABASE_URL` socket URL, which the `pg` driver mis-parses): `PGHOST=$HOME/.local/state/postgresql/run`, `PGUSER=indra`, `PGDATABASE=trailmark`.

### Consequences
- Good: zero extra processes/ports; reuses an initdb'd, auth-configured server.
- Implication: the DB layer reads host/database/username from CONFIG/env so LOCAL (host `$HOME/.local/state/postgresql/run`, user `indra`, db `trailmark`) and PROD (host `/run/postgresql`, user `trailmark`, db `trailmark`, peer auth) both work — **never hardcode `/run/postgresql`**. See [Effect layer](../plan/14-effect-layer.md).
- Trade-off: dev depends on indra-nix-home being installed; a reviewer without it uses the docker fallback noted in the plan.

## Links
- relates to [ADR-0010](./0010-devshell-nix-flake.md), [ADR-0002](./0002-fully-effect-native-backend.md); implemented in [devshell chunk](../plan/20-devshell.md), [Effect layer chunk](../plan/14-effect-layer.md)
