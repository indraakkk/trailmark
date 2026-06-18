# Effect-native layer (HttpApi + @effect/sql-pg + shared contract)

> part of the [Trailmark plan](../../PLAN.md)

One shared Effect Schema contract drives **both** sides: server validation + a typed browser client + the 3 failures as typed HTTP responses, with zero duplication. No Hono, no Drizzle. See [ADR-0002](../adr/0002-fully-effect-native-backend.md).

Every API below was confirmed present in the installed v3 packages. Reference, verbatim, the taprunning files: `apps/server/src/main.ts`, `infra/ObjectStorage.ts`, `infra/Config.ts`, `infra/Db.ts`, `strava/StravaApi.ts`, `packages/contract/src/errors/*`.

## 8.1 The shared contract (one source of truth)

```ts
// packages/contract/src/api.ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'
import { GenTimeout, InvalidPrompt, BrokenResponse, NotFound } from './errors.js'
import { BadgeView, GenerateBadgeInput } from './schemas/Badge.js'
import { Authorization } from './auth.js'                       // browser-safe middleware TAG (provides CurrentUser, fails Unauthorized 401); Live impl is server-side — see [15-auth §G]

const ImageBytes = Schema.Uint8ArrayFromSelf.pipe(
  HttpApiSchema.withEncoding({ kind: 'Uint8Array', contentType: 'image/png' }))

class BadgesApi extends HttpApiGroup.make('badges')
  .add(HttpApiEndpoint.post('generate', '/badges')
    .setPayload(GenerateBadgeInput).addSuccess(BadgeView)
    .addError(InvalidPrompt))                                   // generate validates synchronously; gen errors land on the row
  .add(HttpApiEndpoint.get('gallery', '/badges').addSuccess(Schema.Array(BadgeView)))
  .add(HttpApiEndpoint.get('one', '/badges/:id')
    .setPath(Schema.Struct({ id: Schema.UUID })).addSuccess(BadgeView).addError(NotFound))   // poll; non-owner/missing → 404
  .add(HttpApiEndpoint.post('regenerate', '/badges/:id/regenerate')
    .setPath(Schema.Struct({ id: Schema.UUID })).setPayload(GenerateBadgeInput).addSuccess(BadgeView)
    .addError(InvalidPrompt))
  .add(HttpApiEndpoint.get('image', '/badges/:id/image')
    .setPath(Schema.Struct({ id: Schema.UUID })).addSuccess(ImageBytes).addError(NotFound))
  .middleware(Authorization) {}                                // every badge endpoint gets CurrentUser; adds Unauthorized to the error channel

export class TrailmarkApi extends HttpApi.make('trailmark').add(BadgesApi).prefix('/api') {}
```

> `/api/auth/*` is **NOT** an HttpApi group — it is the raw Better-Auth web handler mounted beside this router via `HttpRouter.mountApp(..., { includePrefix: true })`, FIRST, ahead of the catch-all HttpApi. **Tag/Live split (browser-safety):** the `Authorization`/`CurrentUser` *tags* live contract-side in `packages/contract/src/auth.ts` (import only `@effect/platform` + `effect` → safe in the web bundle); `Unauthorized`/`NotFound` are in `packages/contract/src/errors.ts`. Only the server-side `AuthorizationLive` *Layer* (in `apps/server/src/auth-middleware.ts`) touches Better Auth. Full mount + middleware code: [15-auth](./15-auth.md) · rationale [ADR-0017](../adr/0017-auth-magic-link-better-auth.md).

> Because generation is **async**, the `GenTimeout`/`BrokenResponse` outcomes are recorded on the **row** (`status:'failed'`, `error_tag`) and surfaced via the poll/gallery `BadgeView`, not as the POST's HTTP error. `InvalidPrompt` is the one checked **synchronously** at submit, so it's the POST's typed error (422). This keeps the contract honest about which failures are immediate vs. eventual. See [failure handling](./13-failure-handling.md).

> **Image content-type:** the contract declares `image/png` as the default, but the `image` handler streams via `HttpServerResponse.stream` and sets the real content-type from the stored bytes' **magic number** (PNG→`image/png`, JPEG→`image/jpeg`) — providers return either and the validator ([failure handling](./13-failure-handling.md)) accepts both. The `emblems/<id>` object's stored type and served type always agree; the `.jpg` in the key is a cosmetic label, not a format assertion.

> **"Keep seed" wiring:** regenerate's `:id` is **provenance only** (which badge was tweaked). The seed is supplied in the **payload** — "Keep seed" re-sends the saved `BadgeView.seed`; "New look" sends `seed: null` → `submitBadge` rolls a fresh seed. So the determinism demo ([proof](./31-proof.md)) is reproducible straight from the client contract, no extra `SELECT`.

## 8.2 Server: implement + serve on Bun (fully Effect-native, no Hono)

```ts
// apps/server/src/main.ts
import { HttpApiBuilder, HttpMiddleware, HttpServerResponse } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { TrailmarkApi, CurrentUser } from '@trailmark/contract'            // CurrentUser is a browser-safe tag (provided by the middleware)
import { AuthorizationLive } from './auth-middleware.js'                    // server-side Live impl: getSession → CurrentUser / Unauthorized(401) — see [15-auth](./15-auth.md)
import { DbLive } from './infra/Db.js'
import { GarageLive } from './infra/ObjectStorage.js'
import { ProviderLive } from './badge/provider.js'

// CurrentUser is in scope on every handler (the group carries .middleware(Authorization)).
const BadgesLive = HttpApiBuilder.group(TrailmarkApi, 'badges', (h) =>
  h.handle('generate',   ({ payload }) => CurrentUser.pipe(Effect.flatMap((u) => submitBadge(payload, u.userId))))   // owner-stamped generating row
   .handle('regenerate', ({ payload }) => CurrentUser.pipe(Effect.flatMap((u) => submitBadge(payload, u.userId))))   // path.id = provenance; seed from payload
   .handle('gallery',    () => CurrentUser.pipe(Effect.flatMap((u) => listReadyBadgesNewestFirst(u.userId))))        // WHERE user_id = current user
   .handle('one',        ({ path }) => CurrentUser.pipe(Effect.flatMap((u) => getOwnedBadge(path.id, u.userId))))    // poll; non-owner/missing → 404
   .handle('image',      ({ path }) => CurrentUser.pipe(Effect.flatMap((u) =>
      Effect.map(getOwnedEmblemStream(path.id, u.userId), HttpServerResponse.stream)))))                            // ownership enforced → 404

// AuthorizationLive provides the CurrentUser/Unauthorized middleware to the API layer (see [15-auth §G]).
const ApiLive  = HttpApiBuilder.api(TrailmarkApi).pipe(Layer.provide(BadgesLive), Layer.provide(AuthorizationLive))
const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  Layer.provide(Layer.mergeAll(DbLive, GarageLive, ProviderLive)),
  // idleTimeout headroom is harmless even though we return fast; keep it well above worst case.
  // PORT is env-driven: 3000 is the DEV default; prod (systemd on `tap`) injects PORT=3001 (Caddy proxies to it).
  Layer.provide(BunHttpServer.layer({ port: Number(Bun.env.PORT ?? 3000), hostname: '127.0.0.1', idleTimeout: 60 })),
)
Layer.launch(HttpLive).pipe(BunRuntime.runMain)
```

`submitBadge` is the async core:

```ts
const submitBadge = (input: GenerateBadgeInput, userId: string) => Effect.gen(function* () {
  const prompt = buildPrompt(input.inputs)
  // synchronous InvalidPrompt gate → typed 422 on the POST
  if (input.inputs.raceName.length > 60) return yield* new InvalidPrompt({ reason: 'race name too long' })
  const seed = input.seed ?? Math.floor(Math.random() * 2_000_000_000)
  const row  = yield* insertGenerating({ inputs: input.inputs, builtPrompt: prompt, seed, userId })  // owner-stamped
  // detach: outlives the request, runs on app layers (Db/Garage/Provider available)
  yield* Effect.forkDaemon(
    generateEmblem(prompt).pipe(
      Effect.flatMap((bytes) => putEmblemThenMarkReady(row.id, bytes)),   // Garage PUT → row 'ready'
      Effect.catchTags({
        GenTimeout:     (e) => markFailed(row.id, 'GenTimeout', e.detail),
        BrokenResponse: (e) => markFailed(row.id, 'BrokenResponse', e.detail),
      }),
    ))
  return yield* getBadge(row.id) // status:'generating'
})
```

See [async + poll generation](./11-system-design.md) · [ADR-0005](../adr/0005-async-poll-generation.md).

## 8.3 DB: `@effect/sql-pg` over the unix socket (env-driven discrete config, never a URL)

> **Env-driven config (no hardcoding):** `DbLive` reads discrete `PGHOST` / `PGDATABASE` / `PGUSER` via Effect `Config` — one code path, two environments. LOCAL dev points at the indra-nix-home socket (`$HOME/.local/state/postgresql/run`, user `indra`, db `trailmark`); PROD at `/run/postgresql` (user `trailmark`, peer auth). We deliberately do **not** use a `DATABASE_URL` socket-URL — the `pg` driver mis-parses `postgres:///db?host=…` and silently falls back to TCP. The defaults below are the *prod* values; the devShell/`process-compose` export the local `PG*` ([20-devshell](./20-devshell.md), [ADR-0011](../adr/0011-local-postgres-indra-nix-home.md)).

> **Auth env (alongside `PG*`):** `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` are auto-read by `betterAuth()` and `RESEND_API_KEY` is optional locally. Better Auth's pg `Pool` reuses the **same** `PG*` — that env fallback is the `pg` driver's, not Better Auth's, and no `DATABASE_URL` is passed. The single PgMigrator owner runs the committed Better-Auth `"user"` migration BEFORE the badges migration that FK-references it ([15-auth](./15-auth.md), [22-scaffold](./22-scaffold.md)).

```ts
// apps/server/src/infra/Db.ts
import { layerConfig as PgClientLayerConfig } from '@effect/sql-pg/PgClient'
import { Config } from 'effect'
// Discrete PG* env, never hardcoded. A host starting with '/' is a unix-socket dir.
// Do NOT use postgres:///db?host=… (the pg driver mis-parses socket URLs → TCP fallback).
export const DbLive = PgClientLayerConfig({
  host:     Config.string('PGHOST').pipe(Config.withDefault('/run/postgresql')),   // local: $HOME/.local/state/postgresql/run
  database: Config.string('PGDATABASE').pipe(Config.withDefault('trailmark')),
  username: Config.string('PGUSER').pipe(Config.withDefault('trailmark')),         // local: indra
})
```

```ts
// apps/server/src/infra/migrate.ts — run once at boot. OMIT schemaDirectory (no pg_dump shell-out).
import { BunContext, BunRuntime } from '@effect/platform-bun'
import * as PgMigrator from '@effect/sql-pg/PgMigrator'
import { Layer } from 'effect'
// import.meta.dir is Bun-native — resolves the dir with no url helper. apps/server/migrations holds 0001_auth.sql then 0002_init.sql.
const MigratorLive = Layer.scopedDiscard(
  PgMigrator.run({ loader: PgMigrator.fromFileSystem(`${import.meta.dir}/../../migrations`) }),
).pipe(Layer.provide(DbLive), Layer.provide(BunContext.layer))
// run as a deploy-time oneshot BEFORE the server (mirror taprunning's migrate→server ordering)
```

Queries use the `sql` tag (no ORM):

```ts
const listReadyBadgesNewestFirst = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<BadgeView>`select id, inputs, built_prompt as "builtPrompt", provider, seed,
      image_key as "imageKey", status, error_tag as "errorTag", created_at as "createdAt"
    from badges where status = 'ready' and user_id = ${userId} order by created_at desc`   // scoped to the signed-in user
})

// getOwnedBadge / getOwnedEmblemStream: SELECT by :id, then compare user_id to CurrentUser — non-owner OR
// missing row → Effect.fail(new NotFound()) (404, NOT 403) so a badge's existence never leaks. NotFound is
// declared once in the contract errors and .addError'd on `one`/`image` (so it's in their typed error channel).
```

## 8.4 Web: the derived client (browser-safe)

```ts
// apps/web/src/api.ts — same TrailmarkApi as the server. No server-only/runtime built-ins reach the bundle.
import { FetchHttpClient, HttpApiClient } from '@effect/platform'
import { Effect } from 'effect'
import { TrailmarkApi } from '@trailmark/contract'

// baseUrl:'' keeps every call same-origin → the httpOnly Better-Auth session cookie flows automatically (no token plumbing).
// Sign-in is a separate Better-Auth client call, not an HttpApi endpoint:
//   import { createAuthClient } from 'better-auth/client'; import { magicLinkClient } from 'better-auth/client/plugins'
//   const authClient = createAuthClient({ plugins: [magicLinkClient()] })  // baseURL defaults to the same origin
//   authClient.signIn.magicLink({ email, callbackURL: '/' })              // server logs + (optionally) Resend-emails the link
const client = HttpApiClient.make(TrailmarkApi, { baseUrl: '' })
export const generate = (input: GenerateBadgeInput) => Effect.gen(function* () {
  return yield* (yield* client).badges.generate({ payload: input })
}).pipe(
  // exhaustive, typed: the failure channel is InvalidPrompt (immediate) — handle others via the poll
  Effect.catchTag('InvalidPrompt', (e) => Effect.succeed({ rejected: e.reason } as const)),
  Effect.provide(FetchHttpClient.layer),
) // run with Effect.runPromise in a React handler
```

> Browser build notes (verified): export the contract package as **source `.ts`** (workspace `exports: './src/index.ts'`) so Vite/esbuild transpiles it. In web code import **only** `@effect/platform` (`HttpApiClient`, `FetchHttpClient`) + the contract — never `@effect/platform-bun`, `@effect/sql*`, or `pg` (they pull server-only runtime built-ins). The `HttpApi` definition itself imports only `@effect/platform` + `Schema`, and the contract's auth `Authorization`/`CurrentUser` tags import only `@effect/platform` + `effect`, so the whole contract is safe to share.

## 8.5 Readability mitigations (because reviewers may not know Effect)

This is graded ("clear names, straightforward logic, no unexplained shortcuts"). Neutralise the risk cheaply:
- A **"Architecture for reviewers"** section in the README: one paragraph each on *what a Layer/Tag is*, *why one schema drives both sides*, and *how the 3 tagged errors become HTTP statuses*.
- A top-of-file plain-English comment block per service file (taprunning does this) — one sentence on what each Effect construct does.
- Intent-revealing names: `buildPrompt`, `generateEmblem`, `putEmblemThenMarkReady`, `markFailed`.
- Sell it as a **deliberate choice** in the doc: "one `Schema` contract → server validation + a typed browser client + the 3 failures as typed responses, with zero duplication." That's a 25%-Thinking win, not a liability.
