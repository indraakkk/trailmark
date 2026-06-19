# Failure Handling
> part of the [Trailmark plan](../../PLAN.md)

Cross-refs: [ADR-0005 async-poll generation](../adr/0005-async-poll-generation.md) · [ADR-0006 image providers](../adr/0006-image-providers.md) · provider shapes in [12-ai-and-providers](./12-ai-and-providers.md).

## 7. Failure handling (the heart of the grade)

### 7.1 The three tagged errors — declare status **once**

```ts
// packages/contract/src/errors.ts — the 3 REQUIRED failure states.
// Status is declared ONCE here. The handler does NOT re-map errors to status;
// the endpoint just declares .addError(...) and the typed error propagates.
import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class GenTimeout extends Schema.TaggedError<GenTimeout>()(
  'GenTimeout', { detail: Schema.String }, HttpApiSchema.annotations({ status: 504 })) {}
export class InvalidPrompt extends Schema.TaggedError<InvalidPrompt>()(
  'InvalidPrompt', { reason: Schema.String }, HttpApiSchema.annotations({ status: 422 })) {}
export class BrokenResponse extends Schema.TaggedError<BrokenResponse>()(
  'BrokenResponse', { detail: Schema.String }, HttpApiSchema.annotations({ status: 502 })) {}
```

> **Verifier correction (important):** do **not** hand‑roll a `catchTags → HttpServerResponse` mapper in the handler — that's redundant and reads as "errors handled in two places." Declare the status on the error via `HttpApiSchema.annotations` and let it propagate. Reserve `Effect.catchTag` **only** for collapsing an *infrastructure* error (`SqlError`, `ObjectStorageError`) into one of the 3 public errors or into a defect (`Effect.die`), exactly as taprunning does.

### 7.2 The generation pipeline

```ts
// apps/server/src/badge/generate.ts — order matters: pre-validate → fallback → overall timeout.
import { Effect, Schedule, Duration } from 'effect'
import { GenTimeout, InvalidPrompt, BrokenResponse } from '@trailmark/contract'

const MAX_PROMPT = 2048 // flux-schnell hard limit

export const generateEmblem = (prompt: string) =>
  Effect.gen(function* () {
    // 1. InvalidPrompt — pure, pre-flight, BEFORE any network call (no provider attempt wasted).
    if (prompt.trim().length === 0 || prompt.length > MAX_PROMPT)
      return yield* new InvalidPrompt({ reason: `prompt length ${prompt.length}` })

    // 2. Cloudflare primary → Pollinations fallback. Each raises BrokenResponse on bad bytes.
    return yield* cloudflareFlux(prompt).pipe(
      Effect.retry({
        schedule: Schedule.intersect(Schedule.exponential(Duration.seconds(1)), Schedule.recurs(2)),
        while: (e) => e._tag === 'BrokenResponse', // retry transient only — NEVER GenTimeout/InvalidPrompt
      }),
      Effect.catchTag('BrokenResponse', () => pollinationsFlux(prompt)), // different vendor = real failover
    )
  }).pipe(
    // 3. GenTimeout — overall wall-clock bound (one flux gen is realistically 10–30s).
    Effect.timeoutFail({ duration: Duration.seconds(35), onTimeout: () => new GenTimeout({ detail: 'emblem generation exceeded 35s' }) }),
  )
```

Provider cores thread the **AbortSignal** so an interrupt actually cancels the in‑flight fetch (no orphan fiber), and decode each provider's shape:

```ts
const cloudflareFlux = (prompt: string) => Effect.tryPromise({
  try: (signal) => fetch(CF_URL, { method:'POST', signal,
      headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ prompt, steps: 4, seed }) })
    .then(async (res) => {
      const json = await res.json() as { success:boolean; result?:{ image?:string }; errors?:unknown[] }
      const b64 = json.result?.image ?? (json as any).image
      if (!json.success || !b64) throw new Error('cloudflare: no image / success=false')
      const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
      if (!(isPng(bytes)||isJpeg(bytes)) || bytes.length < MIN_BYTES) throw new Error('cloudflare: not a valid image')
      return bytes
    }),
  catch: (cause) => new BrokenResponse({ detail: `cloudflare: ${String(cause)}` }),
})

const POLLINATIONS_PLACEHOLDER = 1_300_000 // ~1.3MB rate-limit decoy
const pollinationsFlux = (prompt: string) => Effect.tryPromise({
  try: (signal) => fetch(pollinationsUrl(prompt), { signal }).then(async (res) => {
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.startsWith('image/')) throw new Error('pollinations: non-image body')
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (Math.abs(bytes.length - POLLINATIONS_PLACEHOLDER) < 50_000) throw new Error('pollinations: rate-limit placeholder')
      if (!(isPng(bytes)||isJpeg(bytes)) || bytes.length < MIN_BYTES) throw new Error('pollinations: not a valid image')
      return bytes
    }),
  catch: (cause) => new BrokenResponse({ detail: `pollinations: ${String(cause)}` }),
})
```

### 7.3 Demo hooks — deterministically trigger each failure on camera

Gate to the **demo account** (`DEMO_ACCOUNT_EMAIL`, server-authoritative — a stray `?force=` from any other user is ignored; an empty value disables it entirely). **Failure on camera is the most important part of the recording — do not rely on luck.** `invalid` is raised **synchronously** in `submitBadge` (typed 422 on the POST, no row inserted); only `timeout`/`broken` are eventual and route through the provider:

```ts
// honored only when the signed-in user is the demo account (gated in submit.ts, case-
// insensitive/fail-closed). `invalid` is handled synchronously in submit, so the provider
// only ever sees timeout/broken.
switch (force) {
  case 'timeout': return Effect.never.pipe(Effect.timeoutFail({ duration: Duration.seconds(1),
                    onTimeout: () => new GenTimeout({ detail: 'force-timeout' }) }))
  case 'broken':  return Effect.fail(new BrokenResponse({ detail: 'force-broken (rate-limit placeholder)' }))
}
```

Each forced failure settles the row as `failed` + the matching `error_tag`; the gallery card renders the human label ("Generator timed out — retry?" / "Prompt rejected" / "Bad image from provider — retry?") with a one‑tap retry reusing the same `inputs`.

### 7.4 Auth failure states — separate from the three (see [chunk 15 auth](./15-auth.md), [ADR-0017](../adr/0017-auth-magic-link-better-auth.md))

Two more tagged errors guard the badge endpoints: `Unauthorized` (**401**, no session) and `NotFound` (**404**, non‑owner or missing row on `one`/`image` — existence never leaks). Both are declared **once** via `HttpApiSchema.annotations` and are the **auth/ownership** paths — **NOT** part of the 3 required *generation* failure states, which stay generation‑only. `NotFound` is `.addError`'d on the `one`/`image` endpoints ([14 §8.1](./14-effect-layer.md)); without that it would surface as a 500, not a 404.

```ts
// packages/contract/src/errors.ts — auth/session + ownership paths, alongside the 3 generation errors.
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized', {}, HttpApiSchema.annotations({ status: 401 })) {}
export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound', {}, HttpApiSchema.annotations({ status: 404 })) {}
```

| Failure | Behavior | Demo |
|---|---|---|
| Magic‑link expired (default 300s) / invalid or reused token | Better Auth rejects at `/api/auth/*`; client shows error → re‑request | Wait >5 min or reuse a consumed link, then click it |
| Resend send failure (sandbox 403 / `RESEND_API_KEY` absent) | `sendMagicLink` logs the error and **falls back to the logged link**; login still completes | Sign in with a non‑owner email or with no key; grab the link from the server log |
| Unauthenticated request to a badge endpoint | `Unauthorized` → **401** | `GET /api/badges` with no session cookie |
| Non‑owner reads another user's badge / image | **404** (not 403 — existence never leaks) | User B opens User A's `/api/badges/:id` URL |
