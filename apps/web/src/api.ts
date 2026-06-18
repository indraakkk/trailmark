// apps/web/src/api.ts — the derived, typed browser client (same TrailmarkApi as the
// server) + the Better-Auth client. baseUrl:'' keeps every call same-origin so the
// httpOnly session cookie flows automatically (no token plumbing) and the emblem
// proxy stays canvas-safe. Imports only @effect/platform + contract + better-auth/client
// — no server-only runtime built-ins reach the bundle.
import { FetchHttpClient, HttpApiClient } from '@effect/platform'
import { Effect } from 'effect'
import { createAuthClient } from 'better-auth/client'
import { magicLinkClient } from 'better-auth/client/plugins'
import { TrailmarkApi, type BadgeView, type GenerateBadgeInput } from '@trailmark/contract'

export type { BadgeView, GenerateBadgeInput }

// ── Auth (separate from the HttpApi; talks to /api/auth/*) ───────────────────
export const authClient = createAuthClient({ plugins: [magicLinkClient()] })

export const sendMagicLink = (email: string) =>
  authClient.signIn.magicLink({ email, callbackURL: '/' })
export const signOut = () => authClient.signOut()

// ── The derived HttpApi client. Rebuilt per call (cheap) + run as a Promise. ─
const client = HttpApiClient.make(TrailmarkApi, { baseUrl: '' })
const run = <A, E>(f: (c: Effect.Effect.Success<typeof client>) => Effect.Effect<A, E, never>) =>
  Effect.runPromise(client.pipe(Effect.flatMap(f), Effect.provide(FetchHttpClient.layer)))

export type Force = 'timeout' | 'invalid' | 'broken'
export type GenResult = { ok: true; badge: BadgeView } | { ok: false; reason: string }

// Map ANY generate/regenerate failure to a typed result so these never reject:
// InvalidPrompt (synchronous 422), Unauthorized (expired session), or transport error.
const genErr = (e: { _tag?: string; reason?: string }): GenResult => {
  if (e?._tag === 'InvalidPrompt') return { ok: false, reason: e.reason ?? 'Prompt rejected' }
  if (e?._tag === 'Unauthorized') return { ok: false, reason: 'Your session expired — please sign in again.' }
  return { ok: false, reason: 'Could not reach the server — please retry.' }
}

/** Generate: failures (InvalidPrompt / Unauthorized / network) come back as a typed result. */
export const generate = (payload: GenerateBadgeInput, force?: Force): Promise<GenResult> =>
  run((c) =>
    c.badges.generate({ payload, urlParams: force ? { force } : {} }).pipe(
      Effect.map((badge) => ({ ok: true as const, badge })),
      Effect.catchAll((e) => Effect.succeed(genErr(e))),
    ),
  )

/** Regenerate: a NEW row owned by the current user; path id is provenance, seed from payload. */
export const regenerate = (id: string, payload: GenerateBadgeInput, force?: Force): Promise<GenResult> =>
  run((c) =>
    c.badges.regenerate({ path: { id }, payload, urlParams: force ? { force } : {} }).pipe(
      Effect.map((badge) => ({ ok: true as const, badge })),
      Effect.catchAll((e) => Effect.succeed(genErr(e))),
    ),
  )

/** Gallery: the signed-in user's ready badges, newest first. Throws on Unauthorized. */
export const gallery = (): Promise<ReadonlyArray<BadgeView>> => run((c) => c.badges.gallery())

/** Poll one badge (any status). Throws NotFound/Unauthorized. */
export const one = (id: string): Promise<BadgeView> => run((c) => c.badges.one({ path: { id } }))

/** Same-origin emblem proxy URL (never the provider URL — canvas-taint + privacy). */
export const imageUrl = (id: string) => `/api/badges/${id}/image`
