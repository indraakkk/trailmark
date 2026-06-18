# Auth — per-user magic link (Better Auth + Resend)

> part of the [Trailmark plan](../../PLAN.md)

Rationale (the *why*, locked) lives in [ADR-0017](../adr/0017-auth-magic-link-better-auth.md); this chunk is the wiring. Cross-refs: seam vs [ADR-0002 effect-native](../adr/0002-fully-effect-native-backend.md) · pins in [ADR-0015](../adr/0015-pinned-versions.md) · supersedes-in-part [ADR-0016](../adr/0016-scope-no-auth-no-queue.md) · contract/handlers in [14-effect-layer](./14-effect-layer.md).

## The seam (one deliberate, contained non-Effect boundary)

Auth is in scope for one concrete property: **no cross-user data leakage** — every signed-in user sees only their own badges, so the gallery is per-user/private. We adopt **Better Auth** + its **magic-link** plugin + **Resend** rather than hand-rolling magic-link + session + email-verification (honest minimalism, not over-engineering). Better Auth owns exactly the `/api/auth/*` subtree as a raw web handler mounted beside the HttpApi router — everything else stays HttpApi / Schema / tagged-errors. The magic link is **always printed to the server log** as a structured line: it is both the debug aid and the reliable local/demo login path that does not depend on Resend's sandbox.

## Env vars

| Name | Local | Prod | Optional? |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | any ≥32-char dev string | sops/clan-vars secret | required (≥32 chars) |
| `BETTER_AUTH_URL` | `http://localhost:3000` | `https://trailmark.duckdns.org` | required |
| `RESEND_API_KEY` | unset OK (skip send, use logged link) | sops/clan-vars secret | **optional locally**, required in prod |
| `PGHOST`/`PGUSER`/`PGDATABASE` (`PGPORT`/`PGPASSWORD`) | existing | existing | existing — reused, no new PG vars |

`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` are auto-read by `betterAuth()`. The pg `Pool` reads `PG*` automatically — a `pg`-driver feature, NOT Better Auth. No `DATABASE_URL`. Prod from-address is the Resend sandbox `Trailmark <onboarding@resend.dev>` (delivers only to the Resend account owner) — the logged link stays the reliable demo path. Prod secrets via LoadCredential, never plain env ([24-deploy](./24-deploy.md)).

## `auth.ts` — Better Auth server config

Lives at `./` (or `./lib`/`./utils`, else `--config`) so `@better-auth/cli generate` finds it. `sendMagicLink`'s first arg is destructured `{ email, token, url, metadata }`; `url` is the full clickable link.

```ts
// auth.ts
import { betterAuth } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { Pool } from "pg"
import { Resend } from "resend"

// Optional locally: if RESEND_API_KEY is unset we skip the send and rely on the logged link.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export const auth = betterAuth({
  // Reads BETTER_AUTH_SECRET + BETTER_AUTH_URL from env automatically.
  // new Pool() reads PGHOST/PGUSER/PGDATABASE/PGPORT/PGPASSWORD — that is the pg driver, not Better Auth.
  database: new Pool(),
  plugins: [
    magicLink({
      // expiresIn defaults to 300s (5 min)
      sendMagicLink: async ({ email, url }) => {
        // 1) ALWAYS log a structured line — debugging + reliable local/demo login path.
        console.log(`[magic-link] email=${email} url=${url}`)

        // 2) Conditionally send via Resend (sandbox only delivers to the Resend account owner).
        if (!resend) return
        const { error } = await resend.emails.send({
          from: "Trailmark <onboarding@resend.dev>",
          to: [email],
          subject: "Your Trailmark sign-in link",
          html: `<p>Sign in to Trailmark:</p><p><a href="${url}">${url}</a></p>`,
        })
        if (error) console.error("[magic-link] resend send failed; use the logged link", error)
      },
    }),
  ],
})
```

`auth.handler` is a Web-standard `(request: Request) => Promise<Response>` owning `/api/auth/*`. Client trigger: `authClient.signIn.magicLink({ email, callbackURL })`. By default (`disableSignUp: false`) magic-link **auto-creates** an account for a first-time email — the behavior we want; do **not** set `disableSignUp: true`.

## `/api/auth/*` raw mount beside HttpApi

Verified against `@effect/platform@0.96.1`. `HttpRouter.mountApp` with `includePrefix: true` (Better Auth routes on the absolute pathname); mount auth **BEFORE** the catch-all HttpApi. Do NOT use `middlewareSecurity` (does not exist in 0.96.1). `request.source as Request` is a Bun-only sync shortcut; prefer `toWeb`.

```ts
import {
  HttpRouter, HttpServerRequest, HttpServerResponse, HttpServer, HttpApiBuilder,
} from "@effect/platform"
import { Effect, Layer } from "effect"
import { auth } from "./auth"

// Tiny HttpApp delegating every request to the Better Auth web handler.
const authApp = HttpRouter.empty.pipe(
  HttpRouter.all("*", Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest
    const webReq = yield* HttpServerRequest.toWeb(req)          // Effect<Request, RequestError>
    const webRes = yield* Effect.promise(() => auth.handler(webReq))
    return HttpServerResponse.fromWeb(webRes)                   // maps status/headers/streamed body
  })),
)

export const ServerLive = Effect.gen(function* () {
  const apiApp = yield* HttpApiBuilder.httpApp                  // requires HttpApiBuilder.api(...) provided
  const router = HttpRouter.empty.pipe(
    HttpRouter.mountApp("/api/auth", authApp, { includePrefix: true }), // FIRST; keep full path
    HttpRouter.mountApp("/", apiApp),                                    // catch-all HttpApi LAST
  )
  return yield* HttpServer.serve(router)
}).pipe(Layer.scopedDiscard)
// Provide TrailmarkApiLive (HttpApiBuilder.api) + BunHttpServer.layer({ port }) to ServerLive.
```

## `CurrentUser` middleware — Tag/Live split (browser-safety)

`BadgesApi.middleware(Authorization)` puts `Authorization` on the **contract**, and the web bundle imports the contract — so the *tag* must stay browser-safe (import only `@effect/platform` + `effect`). Only its **Live** layer calls Better Auth and is server-side. Two files (verifier-mandated split — a single shared `auth-middleware.ts` would drag `pg`/`better-auth` into the browser bundle):

**`packages/contract/src/auth.ts` — the pure tags (browser-safe).** `Unauthorized` is imported from the contract [errors module](./13-failure-handling.md) (declared once there), never re-declared here.

```ts
// packages/contract/src/auth.ts
import { HttpApiMiddleware } from "@effect/platform"
import { Context } from "effect"
import { Unauthorized } from "./errors.js"            // declared once in errors.ts

export class CurrentUser extends Context.Tag("CurrentUser")<
  CurrentUser, { readonly userId: string }
>() {}

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()(
  "Authorization", { provides: CurrentUser, failure: Unauthorized },
) {}
```

`index.ts` re-exports `Authorization`/`CurrentUser` so the server and the derived web client import them from `@trailmark/contract`.

**`apps/server/src/auth-middleware.ts` — the Live layer (server-only).** Imports the tags from the contract and the `auth` instance from `./auth` — this is the file that pulls `pg`/`better-auth`, so it must **never** be imported by the contract.

```ts
// apps/server/src/auth-middleware.ts
import { HttpServerRequest } from "@effect/platform"
import { Effect, Layer } from "effect"
import { Authorization, CurrentUser, Unauthorized } from "@trailmark/contract"  // browser-safe tags + error
import { auth } from "./auth"                                                   // server-only: pulls pg/better-auth

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest
      const headers = new Headers(req.headers as Record<string, string>) // lowercase-keyed -> web Headers
      const session = yield* Effect.promise(() => auth.api.getSession({ headers }))
      if (!session) return yield* new Unauthorized()                      // null-check is mandatory
      return { userId: session.user.id }
    })
  }),
)
```

Header-based, non-security middleware: null session → `Unauthorized` (401), the auth/session failure path — **not** one of the three generation failure states ([13-failure-handling](./13-failure-handling.md)).

Wiring + scoping (handlers in [14-effect-layer §8](./14-effect-layer.md)):

- `.middleware(Authorization)` on the `BadgesApi` group → adds `CurrentUser` to context, `Unauthorized` to the error channel.
- `GET /api/badges` (gallery): `const user = yield* CurrentUser` → `WHERE user_id = user.userId`, newest-first.
- `POST /api/generate`: insert the generating row with `user_id = user.userId`.
- `GET /api/badges/:id` and `…/image`: fetch then enforce ownership; non-owner **or** missing row → **`NotFound` → 404 (NOT 403)** so existence never leaks (`NotFound` is declared once in the contract errors and `.addError`'d on `one`/`image` — [14 §8.1](./14-effect-layer.md)).
- `/api/badges/:id/image` stays **same-origin** (canvas gotcha) so the httpOnly session cookie flows.
- Provide `AuthorizationLive` to the API layer: `HttpApiBuilder.api(TrailmarkApi).pipe(Layer.provide(BadgesLive), Layer.provide(AuthorizationLive))`.

## Data model + migration

`badges` gains an owner column (FK to Better Auth's quoted `"user"` — `user` is reserved):

```sql
alter table badges add column user_id text not null references "user"(id);
create index badges_user_id_idx on badges (user_id);
-- greenfield scaffold carries it inline:  user_id text not null references "user"(id),
```

The Better Auth tables (`user`/`session`/`account`/`verification`) come from a **committed generated migration**: `bunx @better-auth/cli generate` → `schema.sql` → rename to **`apps/server/migrations/0001_auth.sql`** (the dir `PgMigrator.fromFileSystem` actually reads — [14 §8.3](./14-effect-layer.md)). The magic-link plugin reuses `user`/`session`/`verification` and adds NO extra table. **Single PgMigrator owner**: `0001_auth.sql` (creating `"user"`) runs BEFORE `0002_init.sql` (badges, which FK-references it). No second migration runner ([22-scaffold](./22-scaffold.md)).

## New failure states + how to demo

| Failure | Behavior | Demo |
|---|---|---|
| Magic-link expired (default 300s) / invalid token | Better Auth rejects at `/api/auth/*`; client shows error → re-request | Wait >5min or reuse a consumed link, click it |
| Resend send failure (sandbox 403 / key absent) | `sendMagicLink` logs the error, **falls back to the logged link**; login still completes | Sign in with a non-owner email or no `RESEND_API_KEY`; grab link from server log |
| Unauthenticated request to a badge endpoint | `Unauthorized` → **401** | Hit `GET /api/badges` with no session cookie |
| Non-owner accessing another user's badge/image | **404** (not 403 — no existence leak) | User B opens User A's `/api/badges/:id` URL |

Loom data-isolation beat ([31-proof](./31-proof.md)): enter email → grab link from log/email → logged in → your gallery; then a **second user** signs in and cannot see the first user's badges.
