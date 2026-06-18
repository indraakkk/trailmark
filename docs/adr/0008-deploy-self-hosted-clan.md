# 0008. Deploy — self-hosted clan.lol / NixOS box
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
The submission needs a working live URL. Where does it run, and how is it deployed, at $0 with no card and a credible "systems I operate" story?

## Decision Drivers
- $0, no card, no reimbursement.
- A rich "infrastructure I control" narrative is graded.
- The mentee already owns a clan.lol / NixOS box that builds and deploys taprunning (Bun).

## Considered Options
- Managed PaaS (Vercel/Fly/Render) — fast, but a card/account and a thinner ops story.
- **Self-hosted clan.lol / NixOS box** reusing taprunning's machinery (Caddy + DuckDNS + sops + systemd).

## Decision Outcome
Chosen: **self-hosted clan.lol / NixOS**. Reuse taprunning's pattern almost verbatim — `flake.nix`, the `webserver` + `app` clanServices, the Postgres module, the sops/clan-vars secret pattern. Caddy serves the Vite `dist/` statically and `reverse_proxy /api/* → 127.0.0.1`, with auto-HTTPS via Let's Encrypt HTTP-01 on a `*.duckdns.org` record. The app runs as a systemd unit; secrets are sops-decrypted via clan-vars and `LoadCredential`. Deploy: `nix run .#clan-cli -- machines update tap`.

### Consequences
- Good — $0, full control, and a genuine "Caddy + systemd + Postgres + sops, all systems I run" story to narrate.
- Good — declarative/reproducible: the box state is the flake; redeploys swap the closure, never `/var/lib`.
- Trade-off — more moving parts than a PaaS one-click; cross-repo wiring into taprunning's clan (see [ADR-0009](./0009-second-app-on-tap.md)).

## Links
- relates to [ADR-0009](./0009-second-app-on-tap.md), [ADR-0007](./0007-storage-garage.md), [ADR-0014](./0014-ci-deploy-fallback.md); detailed in [deploy chunk](../plan/24-deploy.md)
