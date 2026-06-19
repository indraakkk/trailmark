// apps/server/src/main.ts — the real Effect-native server on Bun.
//
// Two apps share one BunHttpServer: the Better-Auth raw web handler owns /api/auth/*
// (mounted FIRST, includePrefix so it routes on the absolute path), and the derived
// HttpApi (badges) is the catch-all. Architecture for reviewers:
//   • Layer  = a wired dependency (DbLive provides a Postgres client, etc.).
//   • Tag    = a typed handle to a service (CurrentUser, Provider, ObjectStorage).
//   • One Schema contract (@trailmark/contract) drives server validation, the typed
//     browser client, AND the 3 tagged errors → HTTP statuses, with zero duplication.
import {
  HttpApiBuilder,
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { CurrentUser, TrailmarkApi } from '@trailmark/contract'
import { auth } from './auth.js'
import { AuthorizationLive } from './auth-middleware.js'
import { ProviderLive } from './badge/provider.js'
import { getOwnedBadge, getOwnedEmblem, listReadyBadgesNewestFirst } from './badge/store.js'
import { submitBadge } from './badge/submit.js'
import { DbLive } from './infra/Db.js'
import { GarageLive } from './infra/ObjectStorage.js'

// ── The one deliberate non-Effect seam: Better Auth owns /api/auth/* ────────────
// A tiny HttpApp delegating every request under the mount to auth.handler (a
// Web-standard (Request) => Promise<Response>). toWeb, not the Bun-only request.source.
const authApp = HttpRouter.empty.pipe(
  HttpRouter.all(
    '*',
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest
      const webReq = yield* HttpServerRequest.toWeb(req)
      const webRes = yield* Effect.promise(() => auth.handler(webReq))
      return HttpServerResponse.fromWeb(webRes)
    }),
  ),
)

// ── The badge handlers. CurrentUser is in scope on every one (the group carries
// .middleware(Authorization)); each query is scoped to u.userId. ────────────────
const BadgesLive = HttpApiBuilder.group(TrailmarkApi, 'badges', (h) =>
  h
    .handle('generate', ({ payload, urlParams }) =>
      // Pass the whole CurrentUser (userId + email): submitBadge gates the demo-failure
      // hooks on the email and stamps ownership with the userId.
      CurrentUser.pipe(Effect.flatMap((u) => submitBadge(payload, u, urlParams.force))),
    )
    .handle('regenerate', ({ payload, urlParams }) =>
      // path.id is provenance only; the seed comes from the payload ("keep seed").
      CurrentUser.pipe(Effect.flatMap((u) => submitBadge(payload, u, urlParams.force))),
    )
    .handle('gallery', () =>
      CurrentUser.pipe(Effect.flatMap((u) => listReadyBadgesNewestFirst(u.userId))),
    )
    .handle('one', ({ path }) =>
      CurrentUser.pipe(Effect.flatMap((u) => getOwnedBadge(path.id, u.userId))),
    )
    .handle('image', ({ path }) =>
      CurrentUser.pipe(Effect.flatMap((u) => getOwnedEmblem(path.id, u.userId))),
    ),
)

// AuthorizationLive provides the CurrentUser/Unauthorized middleware to the API layer.
const ApiLive = HttpApiBuilder.api(TrailmarkApi).pipe(
  Layer.provide(BadgesLive),
  Layer.provide(AuthorizationLive),
)

// Add /api/healthz (unauthenticated) + /api/auth/* (Better Auth) to the SAME router
// HttpApiBuilder.serve uses (HttpApiBuilder.Router). The API mounts SPECIFIC prefixes
// (/api/badges/*), so healthz/auth/badges coexist by prefix — no catch-all collision.
const ExtraRoutes = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    yield* router.get('/api/healthz', HttpServerResponse.json({ ok: true }))
    yield* router.mountApp('/api/auth', authApp, { includePrefix: true })
  }),
)

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ExtraRoutes),
  Layer.provide(ApiLive),
  Layer.provide(Layer.mergeAll(DbLive, GarageLive, ProviderLive)),
  // PORT env-driven: 3000 dev default; prod (systemd on `tap`) injects PORT=3001 behind Caddy.
  // idleTimeout headroom is harmless even though we return fast; keep it above worst case.
  Layer.provide(
    BunHttpServer.layer({ port: Number(Bun.env['PORT'] ?? 3000), hostname: '127.0.0.1', idleTimeout: 60 }),
  ),
)

Layer.launch(HttpLive).pipe(BunRuntime.runMain)
