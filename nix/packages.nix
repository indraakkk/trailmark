# nix/packages.nix — the prod app package, exposed per-system.
#
# `packages.trailmark` is the reproducible closure artifact the `tap` NixOS machine
# carries: the Bun server workspace (sources + node_modules, run interpreted) + the
# SPA static bundle. Built by nix/lib/mkBunApp.nix (PURE, input-addressed — bun
# install runs OFFLINE against the bun2nix-pinned bunDeps cache; no FOD hash to pin).
# Exposed on all systems so `nix flake check` evaluates it everywhere and a local
# `nix build .#trailmark` smoke works; it ships to an x86_64-linux box.
{
  perSystem =
    { pkgs, bunDeps, ... }:
    {
      packages.trailmark = pkgs.callPackage ./lib/mkBunApp.nix {
        rootSrc = ../.;
        inherit bunDeps;
      };
    };
}
