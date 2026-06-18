# 0002. Fully Effect-native backend
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
Trailmark is a failure-handling + product-judgment assessment. The backend must validate input, drive image providers, and surface exactly three failure states — and the tech choice must read as deliberate. Do we use the usual Hono + Drizzle stack, or take Effect to its logical end?

## Decision Drivers
- **One source of truth**: define the API contract once, consume it on both server and web.
- **Typed client**: web→server calls should be end-to-end typed off that contract.
- **3 failure states as typed errors**: `GenTimeout`, `InvalidPrompt`, `BrokenResponse` map 1:1 onto Effect tagged errors with HTTP status annotations.
- A coherent "deliberate tech choice" story for the walkthrough.

## Considered Options
- **Hono + Drizzle + zod** — conventional, familiar to reviewers, but three separate type sources and ad-hoc error handling.
- **Fully Effect-native**: `@effect/platform` `HttpApi` (no Hono) + `@effect/sql-pg` (no Drizzle) + one shared Effect `Schema` contract (chosen).

## Decision Outcome
Chosen: "Fully Effect-native", because defining the API once yields free server-side validation, a derived `HttpApiClient` for the web, and the three failures as typed error responses declared once via `HttpApiSchema.annotations({ status })`. We **drop** `hono`, `drizzle-orm`, and `@effect/sql-drizzle`.

### Consequences
- Good, because the contract package is the single source of truth for request/response/error shapes across web AND server.
- Good, because the typed error channel makes the graded failure states first-class, not bolted on.
- Trade-off: reviewers may not know Effect. Mitigated by a README "architecture for reviewers" section and by keeping the load-bearing logic (e.g. `buildPrompt`) as plain, top-to-bottom readable code.
- Auth seam ([ADR-0017](./0017-auth-magic-link-better-auth.md)): the HttpApi now also carries an auth surface, and Better Auth owns exactly the `/api/auth/*` subtree as a single deliberate, contained seam (a raw web handler mounted beside the HttpApi router). A `CurrentUser` `HttpApiMiddleware` + an `Unauthorized` (401) typed error keep the "one contract drives both sides" story intact.

## Links
- relates to [ADR-0005](./0005-async-poll-generation.md), [ADR-0015](./0015-pinned-versions.md); implemented in [system design](../plan/11-system-design.md), [Effect layer](../plan/14-effect-layer.md), [failure handling](../plan/13-failure-handling.md)
