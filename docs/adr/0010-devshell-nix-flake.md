# 0010. DevShell is a plain Nix flake (not devenv)
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Trailmark needs a reproducible local dev environment (latest Bun, Postgres client, a process supervisor for Garage/server/web). taprunning already solves this with a plain Nix flake; indra-nix-home uses devenv templates. Which shape do we adopt?

## Decision Drivers
- Parity with taprunning (the reference dev-env + deploy machinery).
- Reproducibility: one nixpkgs, pinned inputs, deterministic Bun deps.
- The flake must ALSO expose the prod app package + clan wiring — devenv would split env from deploy.

## Considered Options
- Plain Nix flake: `pkgs.mkShell` + `process-compose-flake` + `bun2nix` (taprunning shape).
- devenv (indra-nix-home template shape).

## Decision Outcome
Chosen: "plain Nix flake", because the same flake that defines the devShell also defines the app package and the reusable NixOS module consumed by taprunning's clan — keeping dev and deploy in one reproducible closure. Mirrors taprunning's `nix/dev.nix` (`pkgs.mkShell`, buildInputs `bun postgresql_16 git jq yq-go gh bun2nix`).

### Consequences
- Good: byte-level parity with taprunning's `flake.nix`/`nix/dev.nix`; the mentee already knows the controls.
- Good: `bun2nix` pins every dep by npm integrity → the prod closure is deterministic by construction (regenerate `bun.lock.nix` whenever `bun.lock` changes).
- Good: `process-compose-flake` gives `nix run .#dev` to start Garage + server + web together — see [process-compose](../plan/21-process-compose.md).
- Trade-off: more flake boilerplate than devenv; no auto-`enterShell` createdb (we add a shellHook guard instead — see [ADR-0011](./0011-local-postgres-indra-nix-home.md)).

## Links
- relates to [ADR-0001](./0001-runtime-bun.md), [ADR-0015](./0015-pinned-versions.md), [ADR-0012](./0012-local-garage-process-compose.md); implemented in [chunk](../plan/20-devshell.md)
