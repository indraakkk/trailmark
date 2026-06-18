# 0001. Runtime: Bun (latest)
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
We need one runtime + package manager + workspace tool for the monorepo. Which do we standardize on?

## Decision Drivers
- Parity with `taprunning` (Bun runtime, `@effect/platform-bun`; the clan box already builds and deploys Bun).
- Effect v3 runs cleanly on Bun.
- One JS toolchain — a single, unambiguous runtime in the README and the `shellHook`.
- npm-registry CLIs run under `bunx` (e.g. `bunx @better-auth/cli generate`); the `pg` driver is a JS library Bun executes directly.

## Considered Options
- **Bun, latest** (chosen) — runtime + package manager + workspaces.
- A second JS toolchain pinned alongside Bun — more surface, no benefit for this scope.

## Decision Outcome
Chosen: **Bun, latest.** Bun is the app runtime, the package manager, and the workspace driver — the only JS toolchain. `pkgs.bun` tracks a recent Bun (bump via `nix flake update`). Any npm-registry CLI runs under `bunx` (notably `bunx @better-auth/cli` for the [auth](../plan/15-auth.md) schema generation). This matches taprunning's devShell.

### Consequences
- Good, because we keep `@effect/platform-bun`, Bun workspaces, and the existing clan deploy path — matching taprunning exactly.
- Good, because a single runtime means nothing extra to document or police.
- Trade-off: a tool that requires something other than Bun would have to be added; none in this stack do (Vite, Effect, the `pg` driver, and the better-auth CLI all run under Bun/`bunx`).

## Links
- relates to [ADR-0010](./0010-devshell-nix-flake.md) (devShell), [ADR-0015](./0015-pinned-versions.md) (pins); implemented in [devshell chunk](../plan/20-devshell.md)
