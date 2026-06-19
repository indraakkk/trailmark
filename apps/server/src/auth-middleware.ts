// apps/server/src/auth-middleware.ts — the server-only Live layer for the
// Authorization middleware tag (declared browser-safe in the contract). This is
// the only file that calls Better Auth from the Effect side; it must NEVER be
// imported by the contract (it pulls in ./auth → pg/better-auth).
import { HttpServerRequest } from '@effect/platform'
import { Effect, Layer } from 'effect'
import { Authorization, Unauthorized } from '@trailmark/contract'
import { auth } from './auth.js'

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    // The per-request handler: resolve the Better-Auth session → CurrentUser, else 401.
    return Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest
      const headers = new Headers(req.headers as Record<string, string>) // lowercase-keyed → web Headers
      const session = yield* Effect.promise(() => auth.api.getSession({ headers }))
      if (!session) return yield* new Unauthorized() // null-check is mandatory
      // email travels on CurrentUser so submitBadge can gate the demo-failure hooks to
      // the demo account (server-authoritative). Better Auth's core user always has email.
      return { userId: session.user.id, email: session.user.email }
    })
  }),
)
