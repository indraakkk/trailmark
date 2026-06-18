# 0007. Storage — self-hosted Garage (S3) for bytes, Postgres for rows
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Generated emblems are binary blobs; gallery entries are structured rows. Where do the bytes live so they persist server-side at $0 with no managed cloud account?

## Decision Drivers
- $0, no card, no reimbursement — storage I run myself.
- Bytes are large/binary; rows are small/queryable — different stores fit each.
- Server-side persistence: refresh the page and the badge is still there.

## Considered Options
- Blobs in Postgres (`bytea`).
- Managed S3 (AWS/Cloudflare R2) — needs an account/card.
- **Self-hosted Garage (S3-compatible)** for emblem bytes + **Postgres** for gallery rows.

## Decision Outcome
Chosen: **Garage for emblem bytes, Postgres for gallery rows.** Garage is an S3-compatible daemon I run on the box; emblems are written as `emblems/<id>.jpg` keyed by **server-generated uuid** (never user input → no collisions). Postgres (Nix, unix socket) holds the `badges` rows; `inputs` jsonb is the source of truth for re-typeset/re-generate.

**Two-store write order:** generate uuid key → **PUT to Garage first** (idempotent by key) → **then** INSERT/UPDATE the Postgres row. The browser never touches Garage: images stream through the Effect server's `GET /api/badges/:id/image` proxy (keeps S3 private + CORS-clean).

### Consequences
- Good — $0, server-side, persistent, fully under my control; clean separation of blobs vs. queryable rows.
- Good — the proxy keeps Garage private (loopback only) and avoids canvas-taint on export.
- Trade-off — a crash between the Garage PUT and the Postgres write leaves a harmless orphan object (GC-able). We deliberately do **not** attempt a cross-store transaction or compensating delete — over-engineering for 7–8h; noted as a known limitation.

## Links
- relates to [ADR-0008](./0008-deploy-self-hosted-clan.md), [ADR-0013](./0013-prod-garage-module.md), [ADR-0012](./0012-local-garage-process-compose.md); detailed in [prod Garage chunk](../plan/23-prod-garage.md)
