# 0014. CI deploy as a fallback to local `clan machines update`
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Trailmark deploys as a second app on the `tap` box ([ADR-0009](./0009-second-app-on-tap.md)) via clan. The closure is `x86_64-linux`; the mentee's machine is an Apple-silicon mac, so a local cross-build can be slow or unreliable. We need a primary deploy path and a robust fallback.

## Decision Drivers
- Local `x86_64-linux` nix build may be slow/unreliable on the mentee's mac.
- A red CI run must mean a *real* error, not flake (bun2nix deps are deterministic — [ADR-0014 origin in taprunning ADR 0032]).
- Reuse taprunning's proven pipeline shape; minimise net-new machinery.

## Considered Options
- A. Local `clan machines update tap` only.
- B. CI-only (GitHub Actions builds + activates).
- C. Local primary, CI fallback mirroring taprunning's `deploy.yml`.

## Decision Outcome
Chosen: **C**. Primary deploy is `nix run .#clan-cli -- machines update tap` from local (fast when the mac cooperates, no CI round-trip). The fallback is a GitHub Actions workflow that mirrors `taprunning/.github/workflows/deploy.yml`: install Nix + the `cache.clan.lol` substituter, write `DEPLOY_SSH_KEY`, pre-deploy build proof (`nix build .#packages.x86_64-linux.trailmark -L`), then build-closure-in-CI + activate-over-SSH via `clan machines update tap --build-host localhost --host-key-check none`, with `SOPS_AGE_KEY` decrypting clan vars.

### Consequences
- Good: an `ubuntu-latest` runner builds `x86_64-linux` natively — no mac cross-build bottleneck; activation never blocks on local hardware.
- Good: identical secret model to taprunning (`DEPLOY_SSH_KEY` ed25519 whose public half is in the box's `root authorized_keys`; `SOPS_AGE_KEY` in the sops ci group), so the fallback is well-trodden.
- Trade-off: two deploy entry points to keep in sync; the CI path is the *fallback*, run on demand (`workflow_dispatch` / push to a release branch), not every PR.
- Trade-off: first uncached CI build is heavy (full NixOS toplevel + Bun app FOD) — budget ~45 min timeout on the cold path.

## Links
- relates to [ADR-0008](./0008-deploy-self-hosted-clan.md), [ADR-0009](./0009-second-app-on-tap.md), [ADR-0013](./0013-prod-garage-module.md); implemented in [chunk 24 deploy](../plan/24-deploy.md) and [chunk 25 CI fallback](../plan/25-ci-fallback.md). Mirror source: `taprunning/.github/workflows/deploy.yml`.
