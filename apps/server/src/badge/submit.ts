// apps/server/src/badge/submit.ts — the async core (ADR-0005).
//
// POST inserts an owner-stamped `generating` row and returns it sub-second; the work
// runs detached on Effect.forkDaemon (outlives the request, keeps the app layers).
// The ROW is the source of truth for the outcome: GenTimeout/BrokenResponse/(eventual)
// InvalidPrompt are recorded via markFailed; success flips it to ready. The browser polls.
import { Effect } from 'effect'
import { type GenerateBadgeInput, InvalidPrompt } from '@trailmark/contract'
import { buildPrompt } from './buildPrompt.js'
import { Provider } from './provider.js'
import { insertGenerating, markFailed, putEmblemThenMarkReady } from './store.js'

const MAX_PROMPT = 2048

export const submitBadge = (input: GenerateBadgeInput, userId: string, force?: string) =>
  Effect.gen(function* () {
    const prompt = buildPrompt(input.inputs)
    // Synchronous InvalidPrompt gate → typed 422 on the POST. (Valid chip inputs always
    // produce a bounded prompt; this is the honest synchronous failure path.)
    if (prompt.trim().length === 0 || prompt.length > MAX_PROMPT) {
      return yield* new InvalidPrompt({ reason: `built prompt length ${prompt.length}` })
    }
    const seed = input.seed ?? Math.floor(Math.random() * 2_000_000_000)
    const provider = yield* Provider
    const row = yield* insertGenerating({ inputs: input.inputs, builtPrompt: prompt, seed, userId })

    // Detach: this fiber outlives the request and runs on the app layers (Db/Garage/Provider).
    yield* Effect.forkDaemon(
      provider.generate({ prompt, seed, force }).pipe(
        Effect.flatMap((emblem) => putEmblemThenMarkReady(row.id, emblem)), // Garage PUT → row 'ready'
        // The row is the source of truth: record every eventual failure (incl. CF moderation
        // InvalidPrompt) on it. error_tag enum is 1:1 with these three.
        Effect.catchTags({
          GenTimeout: (e) => markFailed(row.id, 'GenTimeout', e.detail),
          BrokenResponse: (e) => markFailed(row.id, 'BrokenResponse', e.detail),
          InvalidPrompt: (e) => markFailed(row.id, 'InvalidPrompt', e.reason),
        }),
      ),
    )

    return row // status: 'generating'
  })
