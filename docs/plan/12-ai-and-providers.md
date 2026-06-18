# AI Image Generation & Provider Integration
> part of the [Trailmark plan](../../PLAN.md)

Cross-refs: [ADR-0006 image providers](../adr/0006-image-providers.md) · [ADR-0005 async-poll generation](../adr/0005-async-poll-generation.md) · failure mapping in [13-failure-handling](./13-failure-handling.md).

## 5. AI image generation — inputs, outputs, limitations, failure modes

This is the 20% "real understanding" section. Put a version of this in your submission doc.

- **Inputs:** a text prompt (+ `seed`, `steps`). We *constrain* the prompt via the structured form → `buildPrompt()`; the model never sees free‑form user text. `seed` makes generations reproducible (the basis of "keep seed").
- **Outputs:** Cloudflare returns **base64 JSON** (`{ result: { image } }`, ~1024px, billed in 512px tiles, `steps` default 4 / max 8, prompt ≤ 2048 chars). Pollinations returns **raw image bytes**. *Two different decode paths — one "parse the image" function would be wrong for one of them.*
- **Limitations (the product is built around these):**
  - **Text:** diffusion cannot reliably render letters/numbers. → we reserve the ring and typeset client‑side. *This is the whole design.*
  - **Determinism:** only stable if `seed` is fixed. → we store `seed` and expose "keep seed".
  - **Prompt adherence / blank‑rim:** at `steps=4` the model sometimes still scribbles faux‑text in the ring. The double "no text" suppression reduces it; the re‑gen button is the escape hatch. (Honest limitation.)
  - **Aspect ratio:** flux‑schnell is natively ~square; don't send width/height to Cloudflare (it ignores them). Crop/pad client‑side if ever needed.
- **Failure modes (→ [§7](./13-failure-handling.md)):** upstream **timeout** (10–30s is normal, sometimes longer); **invalid prompt** (empty / >2048 chars / provider moderation); **broken response** — and the nasty one: **HTTP 200 that's actually a failure** (Pollinations returns a ~1.3 MB placeholder when rate‑limited; Cloudflare returns `success:false`/no image). `response.ok` is not enough — you must validate the bytes.

---

## 6. Provider integration (free, server‑side only)

```
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell
Authorization: Bearer {CF_API_TOKEN}        Content-Type: application/json
{ "prompt": "<built prompt>", "steps": 4, "seed": 12345 }
→ 200 { "result": { "image": "<base64>" }, "success": true, "errors": [], "messages": [] }

GET https://image.pollinations.ai/prompt/{encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&seed=12345&nologo=true
→ 200 image/* raw bytes   (⚠ 200 + ~1.3MB placeholder when rate-limited)
```

**The load‑bearing validation** (catches "broken response" for both providers):

```ts
const isPng  = (b: Uint8Array) => b.length>=8 && b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47 // 89 50 4E 47
const isJpeg = (b: Uint8Array) => b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff               // FF D8 FF
const MIN_BYTES = 8 * 1024     // reject empty / truncated / HTML error page
const MAX_BYTES = 900 * 1024   // reject the ~1.3MB Pollinations rate-limit placeholder (real ~40–200KB)
// Check on DECODED bytes (CF base64 is ~33% larger). The two bands must not overlap with ~1.3MB.
```

> Verifier cautions baked in: CF's REST image field is `result.image` (decode defensively: `body.result?.image ?? body.image`; strip a `data:image/...;base64,` prefix if present). CF may return `success:false` + an `errors[]` moderation code instead of HTTP 400 — map that to **InvalidPrompt**, not transient, so it doesn't wrongly fall over to Pollinations. The ~1.3 MB placeholder size is a community heuristic, not an SLA — keep `MAX_BYTES` env‑overridable and **log rejected sizes** so you can retune without a redeploy.
