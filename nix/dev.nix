{ inputs, ... }:
{
  perSystem =
    { pkgs, inputs', ... }:
    {
      devShells.default = pkgs.mkShell {
        name = "trailmark-dev";

        buildInputs = with pkgs; [
          bun # latest Bun — runtime + package manager + workspaces (only JS toolchain)
          postgresql_16 # psql client for the shared indra-nix-home server
          git
          jq
          yq-go
          gh
          curl # used by the process-compose readiness probes (garage/server health)
          process-compose # `nix run .#dev` supervisor (Garage + server + web)
          inputs'.bun2nix.packages.bun2nix # regen bun.lock.nix on bun.lock change
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
