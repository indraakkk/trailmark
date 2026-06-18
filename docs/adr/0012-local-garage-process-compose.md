# 0012. Local Garage = copied from taprunning's process-compose
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Local dev needs an S3 endpoint for emblem bytes ([ADR-0007](./0007-storage-garage.md)). indra-nix-home has NO Garage. taprunning's `nix/processes.nix` already runs a single-instance dev Garage + an idempotent bootstrap. Build new, or reuse?

## Decision Drivers
- Don't re-derive a Garage dev rig from scratch — taprunning's is verified (garage 1.3.1 CLI shapes, fixed dev creds, gitignored `.data/`).
- The emblem store should behave the same in dev and prod (S3 path-style, loopback).
- Keep `nix run .#dev` one command (garage + garage-init + migrate + server + web).

## Considered Options
- Reuse taprunning's `garage` + `garage-init` process-compose definitions near-verbatim (rename bucket to `trailmark`).
- A net-new local Garage rig, or MinIO/docker as a stand-in.

## Decision Outcome
Chosen: "reuse taprunning's process-compose Garage", because "Garage in the devshell" is then REUSE, not net-new work. We copy the `garage` daemon process (renders `.data/garage/garage.toml`, `db_engine=sqlite`, `replication_factor=1`, rpc `127.0.0.1:3901`, s3 api `127.0.0.1:3900`, admin `127.0.0.1:3903`, `root_domain ".s3.garage.localhost"`, readiness `curl :3903/health`) and the `garage-init` one-shot (`availability.restart = "no"`, `depends_on garage process_healthy`; layout → bucket → fixed key import → grant, every step idempotent). The server process depends on `garage-init process_completed_successfully` and receives `S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY`. The only net-new Garage infra is PROD — see [ADR-0013](./0013-prod-garage-module.md).

### Consequences
- Good: inherits taprunning's verified bootstrap (idempotent, restart-safe), fixed dev creds so `.env.example` never churns.
- Good: local dev S3 semantics match prod (single instance, replication_factor 1, loopback, path-style).
- Trade-off: in DEV the `/health` readiness gate is fine because `garage-init` waits on `garage status` internally; in PROD a `/health` gate would self-deadlock, so prod bootstrap diverges — see [ADR-0013](./0013-prod-garage-module.md).

## Links
- relates to [ADR-0007](./0007-storage-garage.md), [ADR-0010](./0010-devshell-nix-flake.md), [ADR-0013](./0013-prod-garage-module.md); implemented in [process-compose chunk](../plan/21-process-compose.md)
