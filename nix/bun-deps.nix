# nix/bun-deps.nix — shared, DETERMINISTIC Bun dependencies (bun2nix).
#
# Pins every dependency by its npm sha512 integrity (from the committed bun.lock.nix)
# and stages them into a bun cache. mkBunApp then runs `bun install` OFFLINE from that
# cache — determinism by construction, no install-output blob to hash. Regenerate
# bun.lock.nix with `bun2nix -l bun.lock -o bun.lock.nix` whenever bun.lock changes.
{ inputs, ... }:
{
  perSystem =
    { system, pkgs, ... }:
    {
      # Flake-parts-wide pkgs WITH the bun2nix overlay (same nixpkgs as the machine
      # eval + devShell — inputs.nixpkgs follows clan-core/nixpkgs).
      _module.args.pkgs = import inputs.nixpkgs {
        inherit system;
        overlays = [ inputs.bun2nix.overlays.default ];
      };

      # The shared bun deps derivation: every dep from bun.lock.nix, staged into
      # ${bunDeps}/share/bun-cache. src must include every path bun.lock.nix
      # references (all workspace package dirs + root workspace config).
      _module.args.bunDeps = pkgs.bun2nix.fetchBunDeps {
        bunNix = ../bun.lock.nix;
        src = pkgs.lib.fileset.toSource {
          root = ../.;
          fileset = pkgs.lib.fileset.unions [
            ../apps/server
            ../apps/web
            ../packages/contract
            ../packages/db
            ../package.json
            ../bun.lock
            ../tsconfig.base.json
          ];
        };
      };
    };
}
