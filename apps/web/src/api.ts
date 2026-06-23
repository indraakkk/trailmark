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

// Map ANY generate/regenerate/retry failure to a typed result so these never reject:
// InvalidPrompt (synchronous 422), OutOfCredits (402), Unauthorized, NotFound, or transport.
const genErr = (e: { _tag?: string; reason?: string }): GenResult => {
  if (e?._tag === 'InvalidPrompt') return { ok: false, reason: e.reason ?? 'Prompt rejected' }
  if (e?._tag === 'OutOfCredits')
    return { ok: false, reason: "You're out of credits — that's all the generations on this account." }
  if (e?._tag === 'Unauthorized')
    return { ok: false, reason: 'Your session expired — please sign in again.' }
  if (e?._tag === 'NotFound') return { ok: false, reason: 'That badge no longer exists.' }
  return { ok: false, reason: 'Could not reach the server — please retry.' }
}

const okBadge = (badge: BadgeView) => ({ ok: true as const, badge })

/** Generate: a NEW badge. Failures come back as a typed result (never rejects). */
export const generate = (payload: GenerateBadgeInput, force?: Force): Promise<GenResult> =>
  run((c) =>
    c.badges
      .generate({ payload, urlParams: force ? { force } : {} })
      .pipe(Effect.map(okBadge), Effect.catchAll((e) => Effect.succeed(genErr(e)))),
  )

/** Regenerate (Tweak / "new look"): a NEW row owned by the user; path id is provenance. */
export const regenerate = (id: string, payload: GenerateBadgeInput, force?: Force): Promise<GenResult> =>
  run((c) =>
    c.badges
      .regenerate({ path: { id }, payload, urlParams: force ? { force } : {} })
      .pipe(Effect.map(okBadge), Effect.catchAll((e) => Effect.succeed(genErr(e)))),
  )

/** Retry a FAILED badge IN PLACE — re-runs onto the SAME row (no new tile). */
export const retry = (id: string, force?: Force): Promise<GenResult> =>
  run((c) =>
    c.badges
      .retry({ path: { id }, urlParams: force ? { force } : {} })
      .pipe(Effect.map(okBadge), Effect.catchAll((e) => Effect.succeed(genErr(e)))),
  )

/** Gallery: ALL of the signed-in user's badges (any status), newest first. */
export const gallery = (): Promise<ReadonlyArray<BadgeView>> => run((c) => c.badges.gallery())

/** Poll one badge (any status). Throws NotFound/Unauthorized. */
export const one = (id: string): Promise<BadgeView> => run((c) => c.badges.one({ path: { id } }))

/** Promote a badge to its race's keeper. Returns the refreshed collection. */
export const setKeeper = (id: string): Promise<ReadonlyArray<BadgeView>> =>
  run((c) => c.badges.setKeeper({ path: { id } }))

/** Delete a badge. Returns the refreshed collection. */
export const remove = (id: string): Promise<ReadonlyArray<BadgeView>> =>
  run((c) => c.badges.remove({ path: { id } }))

/** Remaining generation credits for the current user. */
export const credits = (): Promise<number> => run((c) => c.badges.credits().pipe(Effect.map((r) => r.balance)))

/** Same-origin emblem proxy URL (never the provider URL — canvas-taint + privacy). */
export const imageUrl = (id: string) => `/api/badges/${id}/image`
