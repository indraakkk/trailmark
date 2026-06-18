# 20 · Local Dev Environment

> part of the [Trailmark plan](../../PLAN.md)

Covers mentee **steps 2 & 3**: a working devShell with latest Bun, the shared
indra-nix-home Postgres, Garage in the devShell, and `nix flake` builds.

| Decision | ADR |
|---|---|
| Plain nix-flake devShell (not devenv), pins bun + pg16 | [ADR-0010](../adr/0010-devshell-nix-flake.md) |
| **Bun** (latest); npm CLIs via `bunx` | [ADR-0001](../adr/0001-runtime-bun.md) |
| Postgres = shared indra-nix-home server (NOT a process-compose service) | [ADR-0011](../adr/0011-local-postgres-indra-nix-home.md) |
| Garage runs inside `nix run .#dev` | [ADR-0012](../adr/0012-local-garage-process-compose.md) · [chunk 21](./21-process-compose.md) |

## `flake.nix` inputs (copied from taprunning)

Drop `llms-agents`/`rtk`. Keep clan-core (deploy machinery, [chunk 24](./24-deploy.md)),
process-compose-flake (Garage supervisor, [chunk 21](./21-process-compose.md)), bun2nix
([chunk 22](./22-scaffold.md)). `nixpkgs` **follows clan-core** so one nixpkgs evals the
devShell AND the prod machine.

```nix
inputs = {
  clan-core.url = "git+https://git.clan.lol/clan/clan-core?ref=main&rev=f674474815e5719d8db2a3da78d47ab1587b888c";
  nixpkgs.follows = "clan-core/nixpkgs";
  flake-parts.follows = "clan-core/flake-parts";

  process-compose-flake.url = "github:Platonic-Systems/process-compose-flake?rev=99bea96cf269cfd235833ebdf645b567069fd398";

  bun2nix.url = "github:nix-community/bun2nix/2.0.8";
  bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  bun2nix.inputs.flake-parts.follows = "flake-parts";
  bun2nix.inputs.treefmt-nix.follows = "clan-core/treefmt-nix";
};
```

`outputs` is `flake-parts.lib.mkFlake` importing `./nix/{dev,processes,infra,bun-deps,packages}.nix`
over systems `aarch64-darwin x86_64-darwin aarch64-linux x86_64-linux`.

## `nix/dev.nix`

```nix
{ inputs, ... }:
{
  perSystem =
    { pkgs, inputs', ... }:
    {
      devShells.default = pkgs.mkShell {
        name = "trailmark-dev";

        buildInputs = with pkgs; [
          bun                # latest Bun — runtime + package manager + workspaces (only JS toolchain)
          postgresql_16      # psql client for the shared indra-nix-home server
          git
          jq
          gh
          process-compose    # `nix run .#dev` supervisor (Garage + server + web)
          inputs'.bun2nix.packages.bun2nix  # regen bun.lock.nix on bun.lock change
        ];

        shellHook = ''
          echo "trailmark devshell"
          echo "  bun     $(bun --version 2>/dev/null || echo missing)"
          echo "  psql    $(psql --version 2>/dev/null | awk '{print $3}' || echo missing)"

          # Shared indra-nix-home Postgres (peer auth over unix socket).
          # Discrete PG* only — DbLive reads these via Config; we do NOT export a
          # DATABASE_URL socket URL (the pg driver mis-parses postgres:///…?host= → TCP fallback).
          export PGHOST="$HOME/.local/state/postgresql/run"
          export PGUSER="indra"
          export PGDATABASE="trailmark"

          # Auth (Better Auth) reads these automatically — mirrors the PG* pattern so both a
          # standalone `bun run --cwd apps/server dev` and `nix run .#dev` have them. RESEND_API_KEY
          # stays UNSET locally → auth.ts skips the email send and uses the logged magic link.
          export BETTER_AUTH_SECRET="trailmark-dev-secret-please-change-0123456789abcdef"
          export BETTER_AUTH_URL="http://localhost:3000"

          # Idempotent: create the db once if the shared server lacks it.
          if ! psql -lqt | cut -d \| -f 1 | grep -qw trailmark; then
            createdb trailmark && echo "  created database trailmark"
          fi
        '';
      };
    };
}
```

### Why these choices
- **Bun (latest)**: clan-core's nixpkgs tracks unstable, so `pkgs.bun` already
  resolves to a recent Bun; bump via `nix flake update nixpkgs`. npm CLIs run under
  `bunx` (e.g. `bunx @better-auth/cli`) ([ADR-0001](../adr/0001-runtime-bun.md)).
- **Postgres via env, never hardcoded**: the server reads host/db/user from discrete
  `PG*` (`PGHOST`/`PGUSER`/`PGDATABASE`) — **not** a `DATABASE_URL` socket URL — so LOCAL
  (`host=$HOME/.local/state/postgresql/run`, user `indra`) and PROD
  (`host=/run/postgresql`, user `trailmark`) both work unchanged. See the
  [Effect SQL layer](./14-effect-layer.md).
- **`createdb` guard**: `psql -lqt | cut | grep -qw` matches the
  indra-nix-home client contract — runs at most once, safe on every `nix develop`.

## Acceptance check

```bash
nix develop          # enters shell; prints bun / psql versions
psql -l | grep trailmark   # db exists after the guarded createdb ran once
nix flake check      # devShell + flake eval cleanly across systems
```

`nix develop` must enter the shell with **all** tools present (no `missing`), and the
`createdb` guard must create `trailmark` exactly once (re-entering is a no-op).

→ Next: [Garage + process-compose](./21-process-compose.md) · [scaffold & bun2nix](./22-scaffold.md)
