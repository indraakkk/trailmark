# nix/lib/mkBunApp.nix — reproducibly package Trailmark for the prod closure.
#
# bun2nix-backed deterministic dependency packaging: `bunDeps` (built by
# nix/bun-deps.nix from the committed bun.lock.nix) pins EVERY dependency by its
# npm sha512 integrity and pre-populates a bun cache. This derivation runs
# `bun install` OFFLINE against that cache → a PURE, input-addressed derivation
# (no network, no fixed-output hash to pin/re-pin).
#
# Produces ONE package, `trailmark`, with:
#   * $out/app                 — the full workspace (sources + node_modules);
#                                the server runs interpreted via
#                                `bun run $out/app/apps/server/src/main.ts`.
#   * $out/web                 — the SPA static build (apps/web/dist) for Caddy.
#   * $out/bin/trailmark-migrate — wrapper running the Effect PgMigrator oneshot
#                                (apps/server/src/infra/migrate.ts) against the socket.
{
  lib,
  stdenv,
  bun,
  rootSrc, # repo root (from packages.nix), cleaned here
  bunDeps, # shared deterministic bun deps (bun2nix), from nix/bun-deps.nix
}:
let
  # Filter to the build-relevant tree so an unrelated edit doesn't bust the cache.
  src = lib.cleanSourceWith {
    src = rootSrc;
    filter =
      path: type:
      let
        rel = lib.removePrefix (toString rootSrc + "/") (toString path);
        firstSeg = lib.head (lib.splitString "/" rel);
      in
      !(builtins.elem firstSeg [
        ".git"
        ".data"
        ".claude"
        "docs"
        "scripts"
        "node_modules"
        "result"
      ])
      && !(lib.hasInfix "/node_modules/" "/${rel}")
      && !(lib.hasInfix "/dist/" "/${rel}")
      && (lib.cleanSourceFilter path type);
  };
in
stdenv.mkDerivation {
  pname = "trailmark";
  version = "0.0.0";
  inherit src;
  nativeBuildInputs = [ bun ];
  dontConfigure = true;
  dontStrip = true;
  dontPatchELF = true;

  buildPhase = ''
    runHook preBuild
    export HOME=$(mktemp -d)

    # Offline bun install from the bun2nix cache (deterministic, no network).
    export BUN_INSTALL_CACHE_DIR=$(mktemp -d)
    cp -r ${bunDeps}/share/bun-cache/. $BUN_INSTALL_CACHE_DIR
    chmod -R u+w $BUN_INSTALL_CACHE_DIR
    # isolated linker + symlink backend = the bun2nix-compatible layout (resolves the
    # @trailmark/* workspaces + every dep from the cache offline). --ignore-scripts:
    # no lifecycle scripts run in the sandbox (trailmark has no root prepare script).
    bun install --linker=isolated --backend=symlink --ignore-scripts

    # SPA static build (apps/web → apps/web/dist). Same-origin /api ⇒ no VITE_ env needed.
    export NODE_ENV=production
    export SOURCE_DATE_EPOCH="''${SOURCE_DATE_EPOCH:-1}"
    export VITE_CJS_IGNORE_WARNING=true
    (cd apps/web && bun run build)

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin $out/app

    # Server: ship the whole workspace (interpreted — no server build step).
    cp -R apps $out/app/apps
    cp -R packages $out/app/packages
    cp -R node_modules $out/app/node_modules
    cp package.json bun.lock tsconfig.base.json tsconfig.json $out/app/

    # SPA static bundle for Caddy's file_server.
    cp -R apps/web/dist $out/web

    # PgMigrator oneshot wrapper (the migration chain travels in the closure under
    # $out/app/apps/server/migrations; import.meta.dir resolves it). `cd`-then-run so
    # @trailmark/* + node_modules resolve.
    cat > $out/bin/trailmark-migrate <<EOF
    #!${stdenv.shell}
    cd $out/app/apps/server && exec ${bun}/bin/bun run src/infra/migrate.ts "\$@"
    EOF
    chmod +x $out/bin/trailmark-migrate

    runHook postInstall
  '';

  meta = {
    description = "Trailmark — server workspace + SPA static bundle (prod closure artifact)";
    mainProgram = "trailmark-migrate";
  };
}
