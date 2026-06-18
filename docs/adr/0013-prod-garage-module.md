# 0013. Production Garage = the one net-new NixOS module
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
taprunning runs the storage *code* but defers prod Garage *infra* (the box has a DUMMY `S3_*`). Trailmark needs durable, self-hosted S3 for emblem bytes in prod. This is the single net-new infrastructure piece vs. taprunning.

## Decision Drivers
- Self-hosted, $0, "storage I run myself" demo beat ([ADR-0007](./0007-storage-garage.md)).
- Garage is a local stateful daemon (like Postgres) — no per-instance settings needed.
- A fresh single instance has no quorum; a naive `/health` bootstrap gate self-deadlocks.

## Considered Options
- Plain `services.garage` NixOS module on machine `tap` (single instance).
- A clanService wrapper for Garage.
- A managed/3rd-party S3 (rejected: not self-hosted, not $0).

## Decision Outcome
Chosen: "plain `services.garage` module on `tap`", placed next to Postgres in the machine config (not a clanService — one box, no per-instance settings). Single instance, `replication_factor = 1`, ALL ports on `127.0.0.1` (s3 `3900`, rpc `3901`, admin `3903`), bucket `trailmark`, NO Garage port in the firewall (the same-box Effect server is the only client). Secrets via clan-vars (rpc-secret, admin-token, s3 key id/secret) rendered into ONE `garage-env` `environmentFile` — never into world-readable `/etc/garage.toml`. Data under `/var/lib/garage/{meta,data}` on the ext4 root, so it survives `clan machines update` and reboots.

Two verifier fixes are load-bearing:

- **Bootstrap gates on `garage status`, NOT `/health`.** A fresh single instance has no quorum → `/health` returns 503 until layout is applied → a `/health` gate self-deadlocks. The `garage-bootstrap` one-shot (`After=garage.service`, idempotent) waits on `status`, then assigns/applies layout → creates bucket → imports key → grants rw.
- **Bun's `S3Client` is path-style by default — there is NO `forcePathStyle` option.** Don't set it; just point `endpoint` at `http://127.0.0.1:3900`. Reuse taprunning's `ObjectStorage.ts` almost as-is.

### Consequences
- Good: durable buckets/objects/layout across redeploys (data lives outside `/nix/store`).
- Good: tight security posture — S3/admin/RPC all loopback; only Caddy 80/443 public; the browser never touches Garage (images stream through the Effect server).
- Trade-off: single instance, no replication — fine for a demo box, not HA. Round-trip a `put`/`get` against the live endpoint once before relying on it.

## Links
- relates to [ADR-0007](./0007-storage-garage.md), [ADR-0012](./0012-local-garage-process-compose.md), [ADR-0008](./0008-deploy-self-hosted-clan.md), [ADR-0009](./0009-second-app-on-tap.md); implemented in [prod Garage chunk](../plan/23-prod-garage.md)
