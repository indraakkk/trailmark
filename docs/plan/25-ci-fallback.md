# 25 · CI deploy fallback (GitHub Actions)

> part of the [Trailmark plan](../../PLAN.md)

Mentee step 7: *"if failed deploy from local machine here, use github action."*
Primary deploy is `nix run .#clan-cli -- machines update tap` from your laptop
([24-deploy](./24-deploy.md)). This chunk is the CI **fallback** — same closure,
same activation, driven by Actions when local deploy is blocked.

## The cross-repo subtlety (read first)

Trailmark is a **second app inside taprunning's clan flake**
([ADR-0009](../adr/0009-second-app-on-tap.md)). `clan machines update tap` only
exists where the clan inventory lives — **taprunning**, not trailmark. So:

| Path | Where CI runs | What it does | Verdict |
|---|---|---|---|
| **A — bump + reuse** | trailmark CI bumps the `trailmark` flake input in taprunning, opens/merges a PR there; **taprunning's own `deploy.yml` activates** | one source of truth for the box | **simplest, chosen** |
| B — mirror | trailmark CI checks out taprunning, runs `clan machines update tap` itself | needs taprunning's `SOPS_AGE_KEY` + `DEPLOY_SSH_KEY` copied into trailmark secrets | duplicate, drift-prone |

**Chosen: A.** Trailmark CI's job is to (1) prove its own closure builds, then
(2) trigger taprunning's deploy by advancing the `trailmark` input. Activation
secrets stay in taprunning only.

## A — trailmark `.github/workflows/deploy.yml`

```yaml
name: Deploy (trailmark)
# Fallback for `nix run .#clan-cli -- machines update tap` from local (step 7).
# Trailmark ships as a 2nd app inside TAPRUNNING's clan flake (ADR 0009), so this
# workflow proves the trailmark closure builds, then bumps the `trailmark` input
# in taprunning and lets taprunning's deploy.yml activate the box.
on:
  push:
    branches: [release]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-tap        # share the lane with taprunning — never two activations
  cancel-in-progress: false

jobs:
  proof:
    name: Build trailmark closure (proof)
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1

      - name: Install Nix
        uses: DeterminateSystems/nix-installer-action@ef8a148080ab6020fd15196c2084a2eea5ff2d25 # v22
        with:
          determinate: false
          github-token: ${{ secrets.GITHUB_TOKEN }}
          extra-conf: |
            experimental-features = nix-command flakes
            extra-substituters = https://cache.clan.lol
            extra-trusted-public-keys = cache.clan.lol-1:3KztgSAB5R1M+Dz7vzkBGzXdodizbgLXGXKXlcQLA28=

      # Fail-fast: realise the x86_64-linux app closure (bun2nix IFD) before
      # asking taprunning to deploy. `nix build`, NOT `flake check` — IFD won't
      # eval-check. Same gate taprunning's pre-deploy proof uses.
      - name: Pre-deploy build proof (app closure)
        run: nix build .#packages.x86_64-linux.trailmark -L

  trigger:
    name: Bump trailmark input in taprunning + deploy
    needs: proof
    runs-on: ubuntu-latest
    steps:
      # PAT (TAPRUNNING_DISPATCH) with `repo`+`workflow` scope on taprunning.
      # Advances the trailmark input to this commit and dispatches taprunning's
      # deploy.yml on its `release` branch.
      - name: Dispatch taprunning deploy
        env:
          GH_TOKEN: ${{ secrets.TAPRUNNING_DISPATCH }}
        run: |
          gh workflow run deploy.yml \
            --repo indrakoslab/taprunning \
            --ref release \
            -f trailmark_ref="${{ github.sha }}"
```

`taprunning`'s `deploy.yml` gains a `workflow_dispatch` input `trailmark_ref`; a
step runs `nix flake lock --update-input trailmark` (or pins the rev) before the
existing `clan machines update tap` activation already documented in
[24-deploy](./24-deploy.md).

## B — self-contained mirror (only if A's wiring is fiddly in the timebox)

If you cannot get cross-repo dispatch working, trailmark CI can check out
taprunning and run the activation directly — a near byte-for-byte copy of
taprunning's `deploy.yml` deploy step:

```yaml
      - name: Set up deploy SSH key
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          cat > ~/.ssh/config <<'EOF'
          Host 43.133.128.143
            StrictHostKeyChecking accept-new
            UserKnownHostsFile ~/.ssh/known_hosts
          EOF
          chmod 600 ~/.ssh/config

      - name: Deploy (clan machines update tap)
        env:
          SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
        run: |
          nix shell --inputs-from . nixpkgs#nixos-rebuild --command \
            nix run .#clan-cli -- machines update tap \
              --build-host localhost \
              --host-key-check none
```

This requires copying three secrets into trailmark (`DEPLOY_SSH_KEY`,
`SOPS_AGE_KEY`, and a git identity step) — hence it's the fallback, not default.

## Gotchas (inherited from taprunning's deploy.yml)

- **git identity** — `clan machines update` commits `inventory.json` in the
  runner checkout; a fresh runner has no `user.email`, so the commit fails with
  exit 128 and turns a green deploy red. Set `git config --global user.{email,name}`.
- **`nixos-rebuild` on PATH** — clan execs a bare `nixos-rebuild switch` on the
  build host; `ubuntu-latest` lacks it. Wrap activation in
  `nix shell --inputs-from . nixpkgs#nixos-rebuild` (locked nixpkgs, no new input).
- **cache.clan.lol** — added via `extra-conf` so the heavy clan/NixOS closure
  substitutes instead of building from source. `accept-flake-config` not needed.
- **no FOD re-pin** — bun deps are deterministic via bun2nix
  ([ADR-0015](../adr/0015-pinned-versions.md)); any failure is a *real* error
  (build / SSH / sops / activation), never a hash mismatch.
- **concurrency** — `group: deploy-tap`, `cancel-in-progress: false`: never
  cancel an activation, never run two against one box.

## Acceptance

A push to `release` (or a manual `workflow_dispatch`) → trailmark closure builds
green in CI → taprunning activates `tap` → **https://trailmark.duckdns.org** is
live and serves a freshly generated badge. See [31-proof](./31-proof.md) for the
end-to-end demo evidence.

## Links

- promote/deploy mechanics: [24-deploy](./24-deploy.md)
- ADRs: [0008 self-hosted clan deploy](../adr/0008-deploy-self-hosted-clan.md) ·
  [0009 second app on tap](../adr/0009-second-app-on-tap.md) ·
  [0014 CI deploy fallback](../adr/0014-ci-deploy-fallback.md)
- mirror source: `taprunning/.github/workflows/deploy.yml`
