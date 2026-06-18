# 0015. Pin the effect + platform/sql version set together
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Trailmark is fully Effect-native ([ADR-0002](./0002-fully-effect-native-backend.md)): `@effect/platform` `HttpApi` + `@effect/sql-pg`, sharing one Schema contract. These packages have tight inter-version peer expectations, and `effect` itself is approaching a 4.0 beta. An accidental partial bump is an unforced failure mode for a 7-8h build.

## Decision Drivers
- The platform/sql packages peer-depend on a specific `effect` minor; mixing (e.g. `effect@3.21.3` with this set) is an unforced risk.
- These are the exact versions taprunning's `apps/server/package.json` pins, confirmed against installed `.d.ts` — a known-good set.
- Avoid the churn/surface of the `effect` 4.0 beta during a timeboxed assessment.

## Considered Options
- A. Pin the whole set at known-good versions; never bump `effect` alone.
- B. Float `effect` to `latest` / opt into the 4.0 beta.

## Decision Outcome
Chosen: **A**. Pin the full set:

```
effect@3.21.2
@effect/platform@0.96.1
@effect/platform-bun@0.89.0
@effect/sql@0.51.1
@effect/sql-pg@0.52.1
# @effect/experimental (^0.60.0) comes in transitively via @effect/sql-pg — keep it in the lockfile
# DROP: hono, drizzle-orm, @effect/sql-drizzle
# auth additions ([ADR-0017]) — runtime/dev, OUTSIDE the effect peer-locked set above:
better-auth@1.6.19         # magic-link auth; pin >=1.6.19 / newest 1.6.x
resend@6.14.0              # email
@better-auth/cli           # dev-only, tracks better-auth 1.6.x
# pg arrives transitively via @effect/sql-pg — Better Auth reuses it (the pg driver)
```

If a bump is ever necessary, bump the *whole* platform/sql set together and typecheck — never `effect` alone.

### Consequences
- Good: a known-good, taprunning-parity set verified against `.d.ts`; no peer-version surprises.
- Good: dropping `hono`, `drizzle-orm`, `@effect/sql-drizzle` keeps the dependency surface minimal and matches the architecture decisions.
- Trade-off: we forgo the latest `effect` features / 4.0 beta for the assessment window — a deliberate stability-over-novelty choice.

## Links
- relates to [ADR-0002](./0002-fully-effect-native-backend.md), [ADR-0017](./0017-auth-magic-link-better-auth.md); applied in [chunk 22 scaffold](../plan/22-scaffold.md) and [chunk 33 gotchas](../plan/33-gotchas.md).
