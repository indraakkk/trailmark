# 0009. Trailmark as a second app on machine `tap`
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
[ADR-0008](./0008-deploy-self-hosted-clan.md) deploys to the clan.lol box. That box (`tap`, `root@43.133.128.143`) already runs taprunning. Does Trailmark get a new VPS, or coexist on `tap`?

## Decision Drivers
- $0, no new VPS to provision/secure.
- taprunning's stack (Caddy, Postgres, sops, systemd) is already on `tap` and reusable.
- Both apps must stay isolated — own port, own DB/user, own domain, own bucket.

## Considered Options
- **New VPS** — a clean second machine, no coexistence concerns.
- **Second app on `tap`** — Trailmark coexists with taprunning on the same box.

## Decision Outcome
Chosen: **second app on `tap`**. Trailmark is its own Bun monorepo + nix flake exposing (a) the app package and (b) a reusable NixOS module. taprunning's flake gains a `trailmark` input and a `clanServices/trailmark` instance on `tap`. Net-new on the box, all isolated:

| Concern | Trailmark | taprunning |
| --- | --- | --- |
| systemd unit | `trailmark-server` on `127.0.0.1:3001` | `:3000` |
| Caddy vhost | `trailmark.duckdns.org` (own **flat** DuckDNS record, NOT a sub-subdomain) | `taprunning.duckdns.org` |
| Postgres | db `trailmark` + user `trailmark` (peer) | db/user `taprunning` |
| Garage | net-new single-instance prod Garage, bucket `trailmark` | (taprunning defers prod Garage) |

Deploy from local: `nix run .#clan-cli -- machines update tap`.

### Consequences
- Good — $0, reuses the whole proven stack; Caddy multiplexes both vhosts on 80/443. Flat domain namespace (no sub-subdomain).
- Good — isolation via separate unit/port/DB/user/bucket; a Trailmark fault doesn't touch taprunning.
- Trade-off — cross-repo wiring (Trailmark flake input into taprunning's clan) is the fiddly bit. **Fallback:** if wiring proves too fiddly within the timebox, provision a separate second VPS/machine and deploy Trailmark standalone.

## Links
- relates to [ADR-0008](./0008-deploy-self-hosted-clan.md), [ADR-0013](./0013-prod-garage-module.md), [ADR-0014](./0014-ci-deploy-fallback.md); detailed in [deploy chunk](../plan/24-deploy.md)
