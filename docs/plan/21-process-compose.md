# 21 · Process-compose: run everything together

> part of the [Trailmark plan](../../PLAN.md)

Mentee step **5** (run everything together) plus **2** (Garage reachable from the project). One command — `nix run .#dev` — brings up Garage + the migrate oneshot + server + web.

> **Two-pass ordering (avoids a chicken-and-egg):** `garage` + `garage-init` are **scaffold-independent** and come up as soon as the devShell exists ([20-devshell](./20-devshell.md)). The `migrate` / `server` / `web` processes run app code that doesn't exist until the [scaffold (22)](./22-scaffold.md), so the **full** `nix run .#dev` stack is first validated *after* the scaffold lands. Sequence: devShell → Garage up → scaffold → full stack. This chunk is therefore exercised twice: Garage-only first, end-to-end second.

Copied near-verbatim from taprunning's `nix/processes.nix` ([ADR-0012](../adr/0012-local-garage-process-compose.md)). Changes: bucket `taprunning-gpx` → **`trailmark`**, drop the `dashboard` process, add a **`migrate`** oneshot. See [ADR-0006 providers](../adr/0006-image-providers.md) · [ADR-0007 storage](../adr/0007-storage-garage.md).

## Postgres is NOT a process here

Postgres is the **shared indra-nix-home server** (socket `$HOME/.local/state/postgresql/run`, user `indra`, db `trailmark`) — see [ADR-0011](../adr/0011-local-postgres-indra-nix-home.md). The devShell `shellHook` runs the `createdb trailmark` guard ([20-devshell](./20-devshell.md)) **before** `nix run .#dev`. Only Garage + the Bun apps are supervised below.

## Process graph

| process | kind | command | depends_on | ready when |
|---|---|---|---|---|
| `garage` | daemon | `garage … server` | — | `curl :3903/health` |
| `garage-init` | oneshot | bootstrap layout/bucket/key | garage `process_healthy` | exits 0 |
| `migrate` | oneshot | `bun run --cwd apps/server migrate` (PgMigrator over the indra-nix-home socket) | garage-init `process_completed_successfully` | exits 0 |
| `server` | daemon | `bun run --cwd apps/server dev` | migrate `process_completed_successfully` | `curl :3000/api/healthz` |
| `web` | daemon | `bun run --cwd apps/web dev` | server `process_healthy` | — |

## `nix/processes.nix`

Dev-only fixed creds + Garage daemon config (single-instance, `replication_factor=1`, sqlite, ports 3900/3901/3903):

```nix
{ inputs, ... }:
{
  imports = [ inputs.process-compose-flake.flakeModule ];
  perSystem = { pkgs, ... }:
    let
      garageBucket = "trailmark";
      garageAccessKeyId = "GK31c2f218a2e44341e0ffc5dd";
      garageSecretAccessKey =
        "b9c2e7a14d6f08e35a9b1c4d7e2f60a8c3b5d9e1f4a7c0b2d6e8f1a3c5b7d9e0";
      garageRpcSecret =
        "0000000000000000000000000000000000000000000000000000000000000000";
      garageAdminToken = "trailmark-dev-admin-token";
      garageS3Region = "garage";
      garageApiBindAddr = "127.0.0.1:3900";

      garageConfig = pkgs.writeText "garage.toml" ''
        metadata_dir = ".data/garage/meta"
        data_dir = ".data/garage/data"
        db_engine = "sqlite"

        replication_factor = 1

        rpc_secret = "${garageRpcSecret}"
        rpc_bind_addr = "127.0.0.1:3901"
        rpc_public_addr = "127.0.0.1:3901"

        [s3_api]
        s3_region = "${garageS3Region}"
        api_bind_addr = "${garageApiBindAddr}"
        root_domain = ".s3.garage.localhost"

        [admin]
        api_bind_addr = "127.0.0.1:3903"
        admin_token = "${garageAdminToken}"
      '';

      # Idempotent bootstrap: layout -> bucket -> fixed key -> grant.
      garageInit = pkgs.writeShellApplication {
        name = "garage-init";
        runtimeInputs = [ pkgs.garage ];
        text = ''
          CFG=".data/garage/garage.toml"
          BUCKET="${garageBucket}"
          KEY_ID="${garageAccessKeyId}"
          KEY_SECRET="${garageSecretAccessKey}"
          ZONE="dev"
          CAPACITY="1G"

          g() { garage -c "$CFG" "$@"; }

          echo "[garage-init] waiting for garage to be reachable..."
          for _ in $(seq 1 30); do
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
          echo "[garage-init] done."
        '';
      };
    in
    {
      process-compose.dev = { config, ... }: {
        settings.processes = {
          garage = {
            command = ''
              mkdir -p .data/garage
              install -m 0644 ${garageConfig} .data/garage/garage.toml
              exec ${pkgs.garage}/bin/garage -c .data/garage/garage.toml server
            '';
            readiness_probe = {
              exec.command = "curl -fsS http://127.0.0.1:3903/health";
              initial_delay_seconds = 2;
              period_seconds = 3;
              timeout_seconds = 2;
              success_threshold = 1;
              failure_threshold = 10;
            };
          };

          garage-init = {
            command = "${garageInit}/bin/garage-init";
            depends_on."garage".condition = "process_healthy";
            availability.restart = "no";
          };

          # PgMigrator oneshot against the shared indra-nix-home socket.
          # DATABASE via PG* env so the pg driver hits the socket dir (peer auth).
          migrate = {
            command = "bun run --cwd apps/server migrate";
            depends_on."garage-init".condition = "process_completed_successfully";
            availability.restart = "no";
          };

          server = {
            command = "bun run --cwd apps/server dev";
            depends_on."migrate".condition = "process_completed_successfully";
            environment = [
              "TZ=UTC"
              "S3_ENDPOINT=http://${garageApiBindAddr}"
              "S3_REGION=${garageS3Region}"
              "S3_BUCKET=${garageBucket}"
              "S3_ACCESS_KEY_ID=${garageAccessKeyId}"
              "S3_SECRET_ACCESS_KEY=${garageSecretAccessKey}"
            ];
            readiness_probe = {
              exec.command = "curl -fsS http://127.0.0.1:3000/api/healthz";
              initial_delay_seconds = 2;
              period_seconds = 3;
              timeout_seconds = 2;
              success_threshold = 1;
              failure_threshold = 5;
            };
          };

          web = {
            command = "bun run --cwd apps/web dev";
            depends_on."server".condition = "process_healthy";
          };
        };
      };
    };
}
```

### Notes

- **`migrate` reads the DB from env/config**, not a hardcoded path. The shellHook ([20-devshell](./20-devshell.md)) exports `PGHOST=$HOME/.local/state/postgresql/run`, `PGUSER=indra`, `PGDATABASE=trailmark` — so the same PgMigrator code works in prod (`host=/run/postgresql`, user `trailmark`). See the [Effect DB layer](./14-effect-layer.md).
- `process-compose` merges `environment` on top of the inherited OS env, so the shellHook's discrete `PG*` (`PGHOST`/`PGUSER`/`PGDATABASE`) — and the `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` the shellHook also exports ([20-devshell](./20-devshell.md)) — still reach `migrate`/`server`. (We don't use `DATABASE_URL` — the DB layer reads `PG*`; see [14 · Effect layer](./14-effect-layer.md).)
- Bun's `S3Client` is **path-style** by default — `S3_ENDPOINT` is the full `http://127.0.0.1:3900` URL, no `forcePathStyle` ([ADR-0013](../adr/0013-prod-garage-module.md)).
- `.data/garage/` is gitignored (metadata + data live there).

## Acceptance check

1. `pg-shared status` shows "accepting connections"; `createdb trailmark` guard has run.
2. `nix run .#dev` — `garage` goes healthy → `garage-init` exits 0 → `migrate` exits 0 → `server` goes healthy → `web` starts. One command, full stack.
3. Trigger a local generate (POST then poll, [system design](./11-system-design.md)): the emblem bytes **round-trip into the local `trailmark` Garage bucket** and the gallery row appears in the shared Postgres `trailmark` db.
