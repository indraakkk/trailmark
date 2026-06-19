// apps/server/src/badge/submit.ts — the async core (ADR-0005).
//
// POST inserts an owner-stamped `generating` row and returns it sub-second; the work
// runs detached on Effect.forkDaemon (outlives the request, keeps the app layers).
// The ROW is the source of truth for the outcome: GenTimeout/BrokenResponse/(eventual)
// InvalidPrompt are recorded via markFailed; success flips it to ready. The browser polls.
//
// Revamp: every generation (submit, regenerate, retry) costs ONE credit, spent
// synchronously BEFORE the row flips to generating — so an out-of-credits caller never
// leaves a row stuck generating, and out-of-credits is the typed 402 on the POST.
import { Effect } from 'effect'
import { type GenerateBadgeInput, InvalidPrompt, OutOfCredits } from '@trailmark/contract'
import { buildPrompt } from './buildPrompt.js'
import { MAX_PROMPT, Provider } from './provider.js'
import { DemoAccountEmail } from '../infra/Config.js'
import {
  insertGenerating,
  markFailed,
  markGeneratingForRetry,
  putEmblemThenMarkReady,
  refundCredit,
  spendCredit,
} from './store.js'

type CurrentUser = { readonly userId: string; readonly email: string }

// Failure-demo hooks are honored ONLY for the demo account (server-authoritative,
// case-insensitive + trimmed, fail-closed: an empty DemoAccountEmail disables it). A
// stray ?force= from any other user is silently ignored. withDefault makes the read
// infallible, so orDie keeps ConfigError out of the handler's public error channel.
const authorizeForce = (user: CurrentUser, force?: string) =>
  Effect.gen(function* () {
    const demoEmail = yield* Effect.orDie(DemoAccountEmail)
    const authorized =
      demoEmail.trim().length > 0 &&
      user.email.trim().toLowerCase() === demoEmail.trim().toLowerCase()
    return authorized ? force : undefined
  })

// The detached generation fiber, shared by submit/regenerate/retry: provider →
// Garage PUT → row 'ready'; every eventual failure is recorded on the SAME row (the
// error_tag enum is 1:1 with these three). InvalidPrompt here = CF moderation, which is
// eventual on the row (the SYNCHRONOUS invalid gate is handled before the fork).
const forkGeneration = (id: string, prompt: string, seed: number, force?: string) =>
  Provider.pipe(
    Effect.flatMap((provider) =>
      Effect.forkDaemon(
        provider.generate({ prompt, seed, force }).pipe(
          Effect.flatMap((emblem) => putEmblemThenMarkReady(id, emblem)),
          Effect.catchTags({
            GenTimeout: (e) => markFailed(id, 'GenTimeout', e.detail),
            BrokenResponse: (e) => markFailed(id, 'BrokenResponse', e.detail),
            InvalidPrompt: (e) => markFailed(id, 'InvalidPrompt', e.reason),
          }),
        ),
      ),
    ),
  )

export const submitBadge = (input: GenerateBadgeInput, user: CurrentUser, force?: string) =>
  Effect.gen(function* () {
    const prompt = buildPrompt(input.inputs)
    // Synchronous InvalidPrompt gate → typed 422 on the POST. (Valid chip inputs always
    // produce a bounded prompt; this is the honest synchronous failure path.)
    if (prompt.trim().length === 0 || prompt.length > MAX_PROMPT) {
      return yield* new InvalidPrompt({ reason: `built prompt length ${prompt.length}` })
    }
    const honored = yield* authorizeForce(user, force)
    // `invalid` is the ONE synchronous failure (typed 422 on the POST, like the length gate
    // above) — raise it BEFORE spending a credit or inserting a row.
    if (honored === 'invalid') {
      return yield* new InvalidPrompt({ reason: 'force-invalid (blocked prompt)' })
    }
    // Spend a credit BEFORE creating any row — out of credits ⇒ typed 402, no row created.
    const bal = yield* spendCredit(user.userId)
    if (bal === null) return yield* new OutOfCredits({ balance: 0 })

    const seed = input.seed ?? Math.floor(Math.random() * 2_000_000_000)
    const row = yield* insertGenerating({
      inputs: input.inputs,
      builtPrompt: prompt,
      seed,
      userId: user.userId,
    })

    // Detach: this fiber outlives the request and runs on the app layers (Db/Garage/Provider).
    yield* forkGeneration(row.id, prompt, seed, honored)

    return row // status: 'generating'
  })

// Retry a FAILED badge IN PLACE: re-run generation onto the SAME row with its stored
// prompt + seed. Spend the credit FIRST (atomically — no double-spend / negative under
// concurrent retries), then flip the row; if the target turns out not to be retryable,
// REFUND the credit and surface NotFound. A generation forks iff a credit was spent.
export const retryBadge = (id: string, user: CurrentUser, force?: string) =>
  Effect.gen(function* () {
    const honored = yield* authorizeForce(user, force)
    const bal = yield* spendCredit(user.userId)
    if (bal === null) return yield* new OutOfCredits({ balance: 0 })
    // Flip failed → generating. Not retryable (missing / non-owner / not failed) → refund
    // the just-spent credit and re-raise NotFound; the row stays untouched.
    const { builtPrompt, seed, view } = yield* markGeneratingForRetry(id, user.userId).pipe(
      Effect.catchTag('NotFound', (e) => refundCredit(user.userId).pipe(Effect.zipRight(Effect.fail(e)))),
    )
    yield* forkGeneration(id, builtPrompt, seed, honored)
    return view // status: 'generating'
  })
