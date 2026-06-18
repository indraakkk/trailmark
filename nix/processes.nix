{ inputs, ... }:
{
  imports = [ inputs.process-compose-flake.flakeModule ];
  perSystem =
    { pkgs, ... }:
    let
      # Dev-only fixed creds (loopback Garage; never firewall-open). Prod uses
      # clan-vars secrets (ADR-0013).
      garageBucket = "trailmark";
      garageAccessKeyId = "GK31c2f218a2e44341e0ffc5dd";
      garageSecretAccessKey = "b9c2e7a14d6f08e35a9b1c4d7e2f60a8c3b5d9e1f4a7c0b2d6e8f1a3c5b7d9e0";
      garageRpcSecret = "0000000000000000000000000000000000000000000000000000000000000000";
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
      # Gates on `garage status` (RPC-ready), NOT /health — a fresh single instance
      # has no quorum so /health 503s and a /health gate self-deadlocks (ADR-0013).
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
      process-compose.dev =
        { ... }:
        {
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
            # DB via PG* env (shellHook), so the pg driver hits the socket dir (peer auth).
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
