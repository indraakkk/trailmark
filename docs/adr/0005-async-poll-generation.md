# 0005. Async + poll generation (forkDaemon + status row)
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Emblem generation is a real upstream FLUX call that takes 10–30s (sometimes longer). How does the HTTP layer wait for it without holding a request open for half a minute?

## Decision Drivers
- Bun's `idleTimeout` kills long-held connections — a 30s synchronous hold is fragile.
- Multiple concurrent users must not block on each other's requests.
- "Meaningful loading state" is graded; the data model already carries a `status` column.

## Considered Options
- **Sync hold-open** — POST blocks until the emblem is ready, then returns it.
- **Async + poll** — POST inserts a `generating` row, detaches the work, returns immediately; client polls.

## Decision Outcome
Chosen: **async + poll**. POST `generate` INSERTs a `generating` row and returns `BadgeView{ status:'generating' }` right away. The actual work runs on `Effect.forkDaemon` (detached, outlives the request, runs on the app layers so Db/Garage/Provider are available). The browser polls `GET /api/badges/:id` every ~2s until `ready`/`failed`.

### Consequences
- Good — sidesteps the Bun `idleTimeout` gotcha entirely; the POST is sub-second.
- Good — concurrent users each get their own fiber; no head-of-line blocking. The poll is a natural fit for a real loading UI.
- Good — eventual failures (`GenTimeout`/`BrokenResponse`) are recorded on the **row** (`status:'failed'`, `error_tag`) and surfaced via the poll, not lost in a dropped connection. See [ADR-0005's failure split in chunk](../plan/13-failure-handling.md).
- Trade-off — two round-trips (submit + poll) and a tiny client polling loop; `InvalidPrompt` stays synchronous (it's the POST's 422) so only eventual failures travel via the row.
- We keep `idleTimeout: 60` as harmless headroom even though we return fast.

## Links
- relates to [ADR-0006](./0006-image-providers.md), [ADR-0007](./0007-storage-garage.md); implemented in [async submit chunk](../plan/14-effect-layer.md) and [system design](../plan/11-system-design.md)
