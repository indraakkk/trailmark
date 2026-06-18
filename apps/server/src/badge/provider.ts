// apps/server/src/badge/provider.ts — the image provider with failover.
//
// Cloudflare flux-1-schnell (PRIMARY) → on BrokenResponse, fail over to Pollinations
// flux (DIFFERENT vendor, not a single-vendor retry). HTTP 200 ≠ success: we validate
// DECODED bytes (magic number + size band) for BOTH providers — they decode
// differently (CF = base64 JSON result.image; Pollinations = raw bytes), so there is
// NO shared "parse the image" function. Order: pre-validate prompt → CF (retry
// transient only) → Pollinations → overall 35s GenTimeout. See docs/plan/12 + 13.
import { Context, Duration, Effect, Layer, Schedule } from 'effect'
import { BrokenResponse, GenTimeout, InvalidPrompt } from '@trailmark/contract'
import { CloudflareConfig, DemoHooks, MaxBytes } from '../infra/Config.js'

const MAX_PROMPT = 2048 // flux-schnell hard limit
const MIN_BYTES = 8 * 1024 // reject empty / truncated / HTML error page
const POLLINATIONS_PLACEHOLDER = 1_300_000 // ~1.3MB rate-limit decoy

const isPng = (b: Uint8Array) =>
  b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 // 89 50 4E 47
const isJpeg = (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff // FF D8 FF

export type ProviderName = 'cloudflare' | 'pollinations'
export interface Emblem {
  readonly bytes: Uint8Array
  readonly provider: ProviderName
}
export type GenError = GenTimeout | InvalidPrompt | BrokenResponse

export interface GenerateArgs {
  readonly prompt: string
  readonly seed: number
  readonly force?: string | undefined // demo hook; only honored when DEMO_HOOKS=true
}

export class Provider extends Context.Tag('Provider')<
  Provider,
  { readonly generate: (args: GenerateArgs) => Effect.Effect<Emblem, GenError> }
>() {}

const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell'

export const ProviderLive = Layer.effect(
  Provider,
  Effect.gen(function* () {
    const cf = yield* CloudflareConfig
    const maxBytes = yield* MaxBytes
    const demoHooks = yield* DemoHooks
    const cfToken = cf.apiToken
    const cfAccount = cf.accountId

    // Validate DECODED bytes; reject + LOG out-of-band sizes (env-overridable MAX_BYTES).
    const validate = (bytes: Uint8Array, who: ProviderName) =>
      Effect.gen(function* () {
        const okMagic = isPng(bytes) || isJpeg(bytes)
        if (!okMagic || bytes.length < MIN_BYTES || bytes.length > maxBytes) {
          yield* Effect.logWarning(
            `[provider] ${who} rejected bytes: len=${bytes.length} magic=${okMagic} band=[${MIN_BYTES},${maxBytes}]`,
          )
          return yield* new BrokenResponse({
            detail: `${who}: invalid image bytes (len=${bytes.length}, magic=${okMagic})`,
          })
        }
        return bytes
      })

    // ── Cloudflare: base64 JSON. success:false/moderation → InvalidPrompt (NON-transient,
    // no failover). Network / bad bytes → BrokenResponse (failover-eligible). ──────────
    const cloudflareFlux = (prompt: string, seed: number): Effect.Effect<Emblem, GenError> =>
      Effect.gen(function* () {
        const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${CF_MODEL}`
        const res = yield* Effect.tryPromise({
          try: (signal) =>
            fetch(url, {
              method: 'POST',
              signal,
              headers: {
                Authorization: `Bearer ${cfToken}`, // server-side only; never logged
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ prompt, steps: 4, seed }), // no width/height: flux is square, ignored
            }),
          catch: (cause) => new BrokenResponse({ detail: `cloudflare fetch: ${String(cause)}` }),
        })
        const json = yield* Effect.tryPromise({
          try: () =>
            res.json() as Promise<{
              success?: boolean
              result?: { image?: string }
              image?: string
              errors?: unknown[]
            }>,
          catch: (cause) => new BrokenResponse({ detail: `cloudflare json: ${String(cause)}` }),
        })
        // success:false / moderation → InvalidPrompt: non-transient, do NOT fail over or retry.
        if (json.success === false) {
          return yield* new InvalidPrompt({
            reason: `cloudflare blocked: ${JSON.stringify(json.errors ?? [])}`.slice(0, 300),
          })
        }
        const raw = json.result?.image ?? json.image
        const b64 = raw?.replace(/^data:image\/\w+;base64,/, '')
        if (!b64) return yield* new BrokenResponse({ detail: 'cloudflare: no image in response' })
        const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
        const valid = yield* validate(bytes, 'cloudflare')
        return { bytes: valid, provider: 'cloudflare' as const }
      })

    // ── Pollinations: raw bytes. ?model=flux&nologo. Reject the ~1.3MB rate-limit decoy. ─
    const pollinationsFlux = (prompt: string, seed: number): Effect.Effect<Emblem, GenError> =>
      Effect.gen(function* () {
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true`
        const res = yield* Effect.tryPromise({
          try: (signal) => fetch(url, { signal }),
          catch: (cause) => new BrokenResponse({ detail: `pollinations fetch: ${String(cause)}` }),
        })
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.startsWith('image/')) {
          return yield* new BrokenResponse({ detail: `pollinations: non-image body (${ct})` })
        }
        const bytes = yield* Effect.tryPromise({
          try: async () => new Uint8Array(await res.arrayBuffer()),
          catch: (cause) => new BrokenResponse({ detail: `pollinations body: ${String(cause)}` }),
        })
        if (Math.abs(bytes.length - POLLINATIONS_PLACEHOLDER) < 50_000) {
          yield* Effect.logWarning(`[provider] pollinations rate-limit placeholder: len=${bytes.length}`)
          return yield* new BrokenResponse({ detail: 'pollinations: rate-limit placeholder' })
        }
        const valid = yield* validate(bytes, 'pollinations')
        return { bytes: valid, provider: 'pollinations' as const }
      })

    const realGenerate = (prompt: string, seed: number): Effect.Effect<Emblem, GenError> =>
      Effect.gen(function* () {
        // 1. InvalidPrompt — pure pre-flight, BEFORE any network call.
        if (prompt.trim().length === 0 || prompt.length > MAX_PROMPT) {
          return yield* new InvalidPrompt({ reason: `prompt length ${prompt.length}` })
        }
        // 2. CF primary (retry transient only) → Pollinations fallback. If no CF token
        //    (local dev), skip straight to Pollinations.
        const primary = cfToken.length === 0 ? pollinationsFlux(prompt, seed) : cloudflareFlux(prompt, seed)
        return yield* primary.pipe(
          Effect.retry({
            schedule: Schedule.intersect(Schedule.exponential(Duration.seconds(1)), Schedule.recurs(2)),
            while: (e) => e._tag === 'BrokenResponse', // transient only — NEVER GenTimeout/InvalidPrompt
          }),
          Effect.catchTag('BrokenResponse', () => pollinationsFlux(prompt, seed)), // different vendor = real failover
        )
      }).pipe(
        // 3. GenTimeout — overall wall-clock bound (one flux gen is realistically 10–30s).
        Effect.timeoutFail({
          duration: Duration.seconds(35),
          onTimeout: () => new GenTimeout({ detail: 'emblem generation exceeded 35s' }),
        }),
      )

    const generate = ({ prompt, seed, force }: GenerateArgs): Effect.Effect<Emblem, GenError> => {
      // Demo hooks: deterministically trigger each failure on camera. Only when DEMO_HOOKS=true;
      // a stray ?force= must never work in real prod.
      if (demoHooks && force) {
        if (force === 'timeout')
          return Effect.never.pipe(
            Effect.timeoutFail({
              duration: Duration.seconds(1),
              onTimeout: () => new GenTimeout({ detail: 'force-timeout' }),
            }),
          )
        if (force === 'invalid')
          return Effect.fail(new InvalidPrompt({ reason: 'force-invalid (blocked prompt)' }))
        if (force === 'broken')
          return Effect.fail(new BrokenResponse({ detail: 'force-broken (rate-limit placeholder)' }))
      }
      return realGenerate(prompt, seed)
    }

    return Provider.of({ generate })
  }),
)
