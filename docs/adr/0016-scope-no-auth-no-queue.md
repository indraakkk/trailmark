# 0016. Deliberate non-goals — no queue, no cross-store transactions
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted — auth non-goal **superseded in part by [ADR-0017](./0017-auth-magic-link-better-auth.md)**
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
This is a 7-8h take-home. The grade rewards a deliberate, defensible *small* surface (the "what you chose NOT to build" answer is ~20% of it). We record the non-goals so they read as choices, not omissions.

## Decision Drivers
- 7-8h timebox — every feature must earn graded value.
- A per-user gallery proves the end-to-end generate → store → display flow.
- Over-building reads as cargo-culting; honest limitations read as judgement.

## Considered Options
- A. Build the full production stack (auth, queue, transactional GC, resilience).
- B. Build the minimal flow + document the deferred concerns as known limitations.

## Decision Outcome
Chosen: **B**. We deliberately do NOT build:

- **A job queue / Redis** — `forkDaemon` + a status row covers async generation at this scale ([ADR-0005](./0005-async-poll-generation.md)).
- **Cross-store transactions / orphan GC** — a crash between the Garage PUT and the Postgres row leaves a harmless GC-able orphan; noted as a limitation instead of building a compensating delete ([ADR-0007](./0007-storage-garage.md)).
- **Multiple aspect ratios / non-square badges** — flux-schnell is natively square; out of scope ([ADR-0006](./0006-image-providers.md)).
- **The heavy taprunning resilience stack** (single-flight `Ref`, jitter + spaced-cap schedules, status state machine) — a 2-retry transient policy *plus* the provider fallback is the right amount; more would read as cargo-culting.
- **`@effect/sql-drizzle`, `HttpApiSwagger`/middleware/security for 4 endpoints, hand-rolled `HttpClientRequest`** when the derived client exists.

### Consequences
- Good: a tight, defensible surface that ships the graded flow within the timebox.
- Good: each non-goal is documented as a deliberate trade-off — strong scope-honesty material ([chunk 32](../plan/32-scope-honesty.md)).
- Trade-off: a crash window can orphan a Garage object (no GC) — accepted and disclosed.

## Links
- auth non-goal superseded in part by [ADR-0017](./0017-auth-magic-link-better-auth.md); relates to [ADR-0005](./0005-async-poll-generation.md), [ADR-0006](./0006-image-providers.md), [ADR-0007](./0007-storage-garage.md); documented in [chunk 32 scope honesty](../plan/32-scope-honesty.md).
