# nix/trailmark-service.nix — the reusable clan.service module that runs Trailmark as
# a SECOND app on machine `tap`, coexisting with taprunning (ADR-0009). Exposed as
# flake.nixosModules.trailmark; taprunning's clan inventory imports it and adds an
# instance on `tap` (docs/plan/24-deploy.md §2). It defines, all bound to 127.0.0.1
# (only Caddy's 80/443 are public):
#   • trailmark user/group + clan-vars secrets (sops)
#   • prod Garage daemon + idempotent bootstrap oneshot (ADR-0013 / docs/plan/23)
#   • trailmark-migrate (Effect PgMigrator) oneshot, BEFORE the server
#   • trailmark-server (Bun, PORT-driven, hardened)
#   • Caddy vhost (ADDITIVE — never re-enables Caddy) + Postgres db/role (ADDITIVE)
#
# Coexistence rule: Caddy enable/email/firewall + the Postgres service are
# single-owner (taprunning sets them); this module only ADDS merging attrs/list
# entries, never re-declares single-value options.
{ lib, ... }:
{
  _class = "clan.service";

  manifest = {
    name = "trailmark";
    description = "Trailmark finisher-badge app — Bun server + prod Garage + Caddy vhost on tap";
    categories = [ "Web Application" ];
    readme = "Trailmark — a second app on `tap`, coexisting with taprunning. Adds trailmark-server (127.0.0.1:3001) + trailmark-migrate + a prod Garage daemon/bootstrap + an additive Caddy vhost and Postgres db/role. See the trailmark repo's docs/plan/24-deploy.md.";
  };

  roles.default = {
    description = "The Trailmark app (server + Garage + vhost) on the tap machine";

    interface.options = {
      port = lib.mkOption {
        type = lib.types.port;
        default = 3001; # taprunning uses 3000; Caddy reverse-proxies here
        description = "Localhost port the Bun server binds (it sets hostname 127.0.0.1 itself).";
      };
      domain = lib.mkOption {
        type = lib.types.str;
        example = "trailmark.duckdns.org";
        description = "Public FQDN Caddy serves + obtains a Let's Encrypt cert for (flat DuckDNS record).";
      };
      acmeEmail = lib.mkOption {
        type = lib.types.str;
        example = "indrakoslab@gmail.com";
        description = "ACME / Let's Encrypt account email (already set by taprunning's webserver; harmless to repeat as a vhost-level concern).";
      };
      stateDirectory = lib.mkOption {
        type = lib.types.str;
        default = "trailmark";
        description = "systemd StateDirectory (→ /var/lib/<name>).";
      };
    };

    perInstance =
      { settings, ... }:
      {
        nixosModule =
          {
            config,
            lib,
            pkgs,
            inputs,
            ...
          }:
          let
            # The prod artifact (server workspace + SPA dist) from the trailmark flake input.
            # Reaches the module via clan.specialArgs = { inherit inputs; } in taprunning.
            appPkg = inputs.trailmark.packages.${pkgs.stdenv.hostPlatform.system}.trailmark;
            webRoot = "${appPkg}/web";

            inherit (import ./lib/systemdSecurity.nix) commonSecurityConfig;
            stateDir = "/var/lib/${settings.stateDirectory}";
            vars = config.clan.core.vars.generators.trailmark.files;
            garageEnv = vars."garage-env".path;
            upstream = "127.0.0.1:${toString settings.port}";

            # Idempotent Garage bootstrap. Gates on `garage status` (RPC-ready), NOT
            # /health (a fresh single instance has no quorum → /health 503 → self-deadlock).
            garageBootstrap = pkgs.writeShellApplication {
              name = "trailmark-garage-bootstrap";
              runtimeInputs = [ pkgs.garage_1 ];
              text = ''
                g() { garage -c /etc/garage.toml "$@"; }
                test -n "''${GARAGE_RPC_SECRET:-}" || { echo "GARAGE_RPC_SECRET missing" >&2; exit 1; }
                for _ in $(seq 1 30); do g status >/dev/null 2>&1 && break; sleep 1; done
                GARAGE_ID="$(g node id -q 2>/dev/null | cut -d@ -f1)"
                g status 2>/dev/null | grep -q 'NO ROLE' && g layout assign -z dc1 -c 1G "$GARAGE_ID"
                STAGED=$(g layout show 2>/dev/null | sed -n 's/.*--version \([0-9]\{1,\}\).*/\1/p' | tail -n1)
                [ -n "$STAGED" ] && g layout apply --version "$STAGED"
                g bucket info trailmark >/dev/null 2>&1 || g bucket create trailmark
                g key info "$S3_ACCESS_KEY_ID" >/dev/null 2>&1 \
                  || g key import --yes "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" -n trailmark-app
                g bucket allow --read --write trailmark --key "$S3_ACCESS_KEY_ID"
                echo "[garage-bootstrap] done."
              '';
            };
          in
          {
            # ── Service user / group ───────────────────────────────────────────
            users.users.trailmark = {
              isSystemUser = true;
              description = "Trailmark app service user";
              group = "trailmark";
              home = stateDir;
            };
            users.groups.trailmark = { };

            # ── Postgres: ADD the trailmark db + role (peer auth, no password) ──
            # Lists merge with taprunning's existing entries — both apps share one Postgres.
            services.postgresql.ensureDatabases = [ "trailmark" ];
            services.postgresql.ensureUsers = [
              {
                name = "trailmark";
                ensureDBOwnership = true; # owner so PgMigrator can DDL
              }
            ];

            # ── clan vars (sops) — secrets reach units ONLY via LoadCredential ─
            # Fully GENERATED (no interactive prompts) so `clan vars generate tap` is
            # non-interactive and the first deploy is automatable. The server runs on the
            # Pollinations fallback (no CF token) + the logged magic link (no Resend send).
            # To add the Cloudflare primary / Resend later: add prompts here
            # (cf-api-token/cf-account-id/resend-api-key, type hidden|line, persist), wire
            # them via LoadCredential + the ExecStart wrapper below, re-run
            # `clan vars generate tap`, and redeploy.
            clan.core.vars.generators.trailmark = {
              runtimeInputs = [ pkgs.openssl ];
              files.better-auth-secret = { };
              # Single env file consumed by the Garage DAEMON (environmentFile) AND the
              # bootstrap unit AND the server (S3 creds) — one source of truth, no cold-boot race.
              files.garage-env = { };
              script = ''
                openssl rand -hex 32 > "$out/better-auth-secret"
                RPC=$(openssl rand -hex 32)
                ADMIN=$(openssl rand -hex 32)
                KEYID="GK$(openssl rand -hex 12)"        # garage key id = GK + 24 hex
                SECRET=$(openssl rand -hex 32)
                {
                  echo "GARAGE_RPC_SECRET=$RPC"
                  echo "GARAGE_ADMIN_TOKEN=$ADMIN"
                  echo "S3_ACCESS_KEY_ID=$KEYID"
                  echo "S3_SECRET_ACCESS_KEY=$SECRET"
                } > "$out/garage-env"
              '';
            };

            # ── Prod Garage daemon (single-instance, lmdb, loopback only) ──────
            services.garage = {
              enable = true;
              package = pkgs.garage_1;
              environmentFile = garageEnv; # injects GARAGE_RPC_SECRET/ADMIN_TOKEN into the daemon
              settings = {
                metadata_dir = "/var/lib/garage/meta";
                data_dir = "/var/lib/garage/data";
                db_engine = "lmdb";
                replication_factor = 1;
                rpc_bind_addr = "127.0.0.1:3901";
                rpc_public_addr = "127.0.0.1:3901";
                s3_api = {
                  s3_region = "garage";
                  api_bind_addr = "127.0.0.1:3900";
                };
                admin.api_bind_addr = "127.0.0.1:3903";
              };
            };
            # Do NOT open any Garage port — the Effect server (same box) is the only client.

            systemd.services.garage-bootstrap = {
              description = "Trailmark Garage bootstrap (layout/bucket/key) — idempotent";
              after = [ "garage.service" ];
              requires = [ "garage.service" ];
              wantedBy = [ "multi-user.target" ];
              serviceConfig = {
                Type = "oneshot";
                RemainAfterExit = true;
                EnvironmentFile = garageEnv; # same creds the daemon uses (its own env, not the daemon's)
                ExecStart = lib.getExe garageBootstrap;
              };
            };

            # ── Migrate oneshot (Effect PgMigrator), BEFORE the server ─────────
            systemd.services.trailmark-migrate = {
              description = "Trailmark PgMigrator (deploy-time, before the server)";
              after = [
                "network.target"
                "postgresql.service"
                "postgresql-setup.service" # creates the role/DB via ensureUsers/ensureDatabases
              ];
              requires = [
                "postgresql.service"
                "postgresql-setup.service"
              ];
              before = [ "trailmark-server.service" ];
              wantedBy = [ "multi-user.target" ];
              environment = {
                TZ = "UTC";
                PGHOST = "/run/postgresql";
                PGUSER = "trailmark";
                PGDATABASE = "trailmark";
              };
              path = [ pkgs.bun ];
              serviceConfig = commonSecurityConfig // {
                Type = "oneshot";
                User = "trailmark";
                Group = "trailmark";
                ExecStart = "${appPkg}/bin/trailmark-migrate";
              };
            };

            # ── The Bun server unit ────────────────────────────────────────────
            systemd.services.trailmark-server = {
              description = "Trailmark Bun server";
              after = [
                "network-online.target"
                "postgresql.service"
                "postgresql-setup.service"
                "trailmark-migrate.service"
                "garage-bootstrap.service"
              ];
              requires = [
                "trailmark-migrate.service" # a failed migration blocks the new server (safe failure mode)
                "garage-bootstrap.service"
              ];
              wants = [ "network-online.target" ];
              wantedBy = [ "multi-user.target" ];
              environment = {
                NODE_ENV = "production";
                PORT = toString settings.port;
                TZ = "UTC";
                # Discrete PG* (peer auth, no password) — never a postgres:// socket URL.
                PGHOST = "/run/postgresql";
                PGUSER = "trailmark";
                PGDATABASE = "trailmark";
                # Prod Garage on loopback (Bun S3Client is path-style by default).
                S3_ENDPOINT = "http://127.0.0.1:3900";
                S3_REGION = "garage";
                S3_BUCKET = "trailmark";
                # better-auth reads BETTER_AUTH_URL automatically (non-secret → plain env).
                BETTER_AUTH_URL = "https://${settings.domain}";
                # Secrets (S3 keys via garage-env, CF token/account, BETTER_AUTH_SECRET,
                # RESEND_API_KEY) arrive via LoadCredential + the ExecStart wrapper below.
              };
              path = [ pkgs.bun ];
              serviceConfig = commonSecurityConfig // {
                Type = "simple";
                User = "trailmark";
                Group = "trailmark";
                StateDirectory = settings.stateDirectory;
                StateDirectoryMode = "0750";
                WorkingDirectory = "${appPkg}/app";
                Restart = "on-failure";
                RestartSec = 5;
                ReadWritePaths = [ stateDir ];
                LoadCredential = [
                  "garage-env:${garageEnv}" # carries S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY
                  "better-auth-secret:${vars.better-auth-secret.path}"
                ];
                ExecStart = lib.getExe (
                  pkgs.writeShellApplication {
                    name = "trailmark-server-start";
                    runtimeInputs = [ pkgs.bun ];
                    text = ''
                      set -euo pipefail
                      # garage-env (LoadCredential) carries S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY
                      # (+ harmless GARAGE_*). It is a RUNTIME file, absent at build → disable SC1091
                      # (writeShellApplication fails the build on it otherwise). set -a exports the
                      # sourced vars so bun sees them.
                      set -a
                      # shellcheck disable=SC1091
                      . "$CREDENTIALS_DIRECTORY/garage-env"
                      set +a
                      BETTER_AUTH_SECRET=$(cat "$CREDENTIALS_DIRECTORY/better-auth-secret"); export BETTER_AUTH_SECRET
                      # No CF_API_TOKEN ⇒ provider uses Pollinations; no RESEND_API_KEY ⇒ logged magic link.
                      exec bun run ${appPkg}/app/apps/server/src/main.ts
                    '';
                  }
                );
              };
            };

            # ── Caddy: ADD the trailmark vhost only (never re-enable Caddy) ─────
            services.caddy.virtualHosts.${settings.domain}.extraConfig = ''
              @api path /api/*
              handle @api { reverse_proxy ${upstream} }
              handle {
                root * ${webRoot}
                encode gzip zstd
                try_files {path} /index.html
                file_server
              }
            '';
          };
      };
  };
}
