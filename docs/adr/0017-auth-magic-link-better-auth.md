# 0017. Per-user magic-link auth (Better Auth + Resend)
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
A locked user directive: **no cross-user data leakage** — every signed-in user sees only their own generated badges, so the gallery becomes per-user/private. This reverses the "no auth" non-goal of [ADR-0016](./0016-scope-no-auth-no-queue.md). The question is how to add auth without hand-rolling it and without breaking the fully-Effect-native thesis ([ADR-0002](./0002-fully-effect-native-backend.md)).

## Decision Drivers
- Honest minimalism — rolling our own magic-link + session + email-verification is exactly the over-engineering the rubric warns against; adopt one small, well-scoped library instead.
- Contained seam — one deliberate, bounded exception to ADR-0002, not a stack rewrite.
- One migration owner — auth tables and the badges FK live under a single PgMigrator, ascending order.

## Considered Options
- A. Roll our own magic-link + session + email-verification.
- B. **Better Auth** magic-link plugin + **Resend** email (chosen). (Session-cookie vs JWT decision not needed — Better Auth's httpOnly cookie session is the default.)

## Decision Outcome
Chosen: **B**. Locked decisions:
- Better Auth owns exactly the `/api/auth/*` subtree as a raw web handler (`auth.handler`) mounted beside the HttpApi router (`HttpRouter.mountApp(..., { includePrefix: true })`, BEFORE the catch-all) — everything else stays HttpApi / Schema / tagged-errors.
- The **magic-link** plugin (`better-auth/plugins`) with **Resend** for email; the magic link is **ALSO printed to the server log** as a structured line — both for debugging and as the reliable local/demo login path (the Resend sandbox only delivers to the account owner). `RESEND_API_KEY` is optional locally → skip the send, use the logged link.
- A `CurrentUser` `HttpApiMiddleware` (header-based, non-security) calls `auth.api.getSession({ headers })`; null session → `Unauthorized` (401).
- Gallery `GET /api/badges` scopes `WHERE user_id = current user`; generate inserts with the owner; one/image **enforce ownership → 404 (not 403)** so existence never leaks. The image route stays same-origin so the httpOnly session cookie flows.
- Single PgMigrator owner with a **committed generated** auth schema (`bunx @better-auth/cli generate` → `apps/server/migrations/0001_auth.sql`, before `0002_init.sql`); the pg `Pool` reads `PG*` — that is the **`pg` driver**, not Better Auth.
- `badges.user_id text NOT NULL REFERENCES "user"(id)` (`user` is a reserved identifier — quote it); the auth migration runs before the badges migration.

### Consequences
- Good: new honest failure states — expired/invalid magic link; Resend failure → fall back to the logged link; unauthenticated → 401; non-owner → 404. Plus a crisp data-isolation demo (a second user cannot see the first user's badges).
- Trade-off: one deliberate non-Effect seam (`/api/auth/*`); +~2 commits.

## Links
- supersedes in part [ADR-0016](./0016-scope-no-auth-no-queue.md); seam note in [ADR-0002](./0002-fully-effect-native-backend.md); pins in [ADR-0015](./0015-pinned-versions.md); detailed in [chunk 15 auth](../plan/15-auth.md).
