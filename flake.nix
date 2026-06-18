{
  description = "Trailmark — trail-running finisher-badge generator. Dev flake (devShell + process-compose) + clan.lol deploy as a 2nd app on `tap`.";

  inputs = {
    # clan.lol deploy framework. EXACT-rev pinned (no floating refs); the ref=main
    # only lets the git fetch locate the rev. clan-core transitively provides
    # disko + sops-nix — no separate inputs for those. (ADR-0008/0009/0014)
    clan-core.url = "git+https://git.clan.lol/clan/clan-core?ref=main&rev=f674474815e5719d8db2a3da78d47ab1587b888c";

    # One nixpkgs for BOTH the devShell and the prod machine eval (no two-nixpkgs
    # mismatch / duplicate closure). clan-core's nixpkgs tracks unstable, so
    # pkgs.bun / postgresql_16 / garage resolve. (ADR-0010)
    nixpkgs.follows = "clan-core/nixpkgs";
    flake-parts.follows = "clan-core/flake-parts";

    # Local dev process supervisor (Garage + server + web). Pinned by commit. (ADR-0012)
    process-compose-flake.url = "github:Platonic-Systems/process-compose-flake?rev=99bea96cf269cfd235833ebdf645b567069fd398";

    # Deterministic Bun dependency packaging for the prod closure. (ADR-0015)
    bun2nix.url = "github:nix-community/bun2nix/2.0.8";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    bun2nix.inputs.flake-parts.follows = "flake-parts";
    bun2nix.inputs.treefmt-nix.follows = "clan-core/treefmt-nix";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      imports = [
        ./nix/dev.nix # devShell: bun + pg client + process-compose + bun2nix
        ./nix/processes.nix # `nix run .#dev`: garage + garage-init + migrate + server + web
        ./nix/bun-deps.nix # bun2nix fetchBunDeps (deterministic prod deps) + overlaid pkgs
        ./nix/packages.nix # packages.<system>.trailmark (mkBunApp prod artifact)
      ];

      # The reusable clan service module taprunning imports to run trailmark as a 2nd
      # app on `tap` (systemd units + prod Garage + Caddy vhost + Postgres + secrets).
      flake.nixosModules.trailmark = import ./nix/trailmark-service.nix;
    };
}
