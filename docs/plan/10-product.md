# Product — form, prompt-builder, typography overlay, re-gen UX
> part of the [Trailmark plan](../../PLAN.md)

The two-layer model — an AI emblem with a blank ring + crisp client-side SVG typography — is the product thesis. See [ADR-0004](../adr/0004-two-layer-emblem-typography.md). Failure states surfaced in this UI are typed in [failure handling](./13-failure-handling.md). The gallery is **per-user/private** behind magic-link sign-in — see [auth](./15-auth.md) and [ADR-0017](../adr/0017-auth-magic-link-better-auth.md).

## 3.0 Sign-in (magic link, zero-password)

Before the form: one email field → **"Send sign-in link"**. We email the magic link (Resend) **and** print it to the server log, so locally you just grab it from the log. Clicking it lands you authenticated; the **"Generate badge"** CTA and every badge are gated on that session. Each badge is owned by the signed-in user, so the gallery is **your** visual history — a second user never sees your badges (data isolation is a product strength, not just a security checkbox).

## 3.1 Form controls (zero-instruction, preset-driven)

The whole point: **one free-text field; everything else is a chip/pick-list.** A first-time user makes a badge by tapping chips and typing a race name — no explanation needed.

| Control | Type | Presets | Default | Used for |
|---|---|---|---|---|
| **Race name** | text (1–60 chars) | free text | `""` (placeholder `e.g. Broken Arrow 26K`) | typography only |
| **Distance** | chips (single) | `5K · 10K · Half · Marathon · 50K · 50mi · 100K · 100-Miler` | `Marathon` | typography (label) |
| **Finish time** | optional masked | `hh:mm:ss` | blank | typography only |
| **Date** | date picker | ISO | today | typography (formatted `JUN 18 2026`) |
| **Motif** | chips (single) | `Mountain · Wolf · Compass · Pine · Sun · Antlers · Trail · River · Bear · Feather` | `Mountain` | **prompt** (emblem subject) |
| **Badge style** | chips (swatches) | `Enamel Pin · Embroidered Patch · Woodcut Seal · Vintage Medal · Die-cut Sticker` | `Enamel Pin` | **prompt** (material/render) |
| **Palette / mood** | chips (color dots) | `Alpine · Sunrise · Forest · Dusk · Desert · Monochrome` | `Alpine` | **prompt** (colors/mood) |

Zero-instruction design rules:
- **Live typography preview** updates as you type the race name / pick the distance — *before* you generate. The user sees the two-layer model instantly without being told.
- Chips show a glyph/swatch (mountain icon, color dot) → meaning is visual, not lexical.
- One primary CTA: **"Generate badge"**, disabled only if race name is empty. Everything else has a default.
- The emblem doesn't need race name/time, so we never block on optional fields.

## 3.2 The prompt-builder (your text skill = the product's brain)

`buildPrompt(inputs)` is **pure and deterministic** — a lookup-table assembler, not freeform. Reviewers who don't know Effect can read it top-to-bottom: plain string assembly with named tables. Every prompt has a fixed slot order:

```
[STYLE PREAMBLE] of [MOTIF SUBJECT], [COMPOSITION], [PALETTE/MOOD], [RING RESERVATION], [QUALITY SUFFIX]. [AVOID]
```

```ts
// apps/server/src/badge/buildPrompt.ts
const STYLE = {
  enamel_pin:'a circular hard-enamel lapel pin emblem, glossy enamel fill, polished gold metal outline, soft studio reflection',
  embroidered_patch:'a circular embroidered iron-on patch, visible thread stitching, merrowed border, felt backing',
  woodcut_seal:'a circular woodcut seal emblem, hand-carved linocut engraving, bold black ink on textured paper, vintage letterpress',
  vintage_medal:'a circular antique bronze finisher medal, embossed bas-relief metal, aged patina',
  die_cut_sticker:'a circular die-cut vinyl sticker emblem, flat vector illustration, thick white kiss-cut border',
} as const
const MOTIF = { mountain:'a bold symmetrical mountain peak with a winding trail', wolf:'a howling wolf head in profile', compass:'an ornate compass rose over a mountain horizon', pine:'a single tall pine tree', sun:'a rising sun with radiating rays over hills', antlers:'a pair of symmetrical deer antlers', trail:'a winding mountain trail vanishing into peaks', river:'a flowing river winding through a valley', bear:'a standing grizzly bear silhouette', feather:'a single detailed feather' } as const
const PALETTE = { alpine:'slate grey, glacier ice-blue and crisp white, cold crisp alpine mood', sunrise:'warm amber, coral and burnt orange, hopeful sunrise mood', forest:'deep pine green, moss and bark brown, earthy forest mood', dusk:'deep purple, dusty rose and indigo, calm twilight mood', desert:'rust red, sand tan and clay, dry desert mood', mono:'ink black and warm cream, timeless monochrome' } as const

const COMPOSITION = 'centered symmetrical composition, badge crest emblem, icon logo, contained within a perfect circle, front view, flat'
// The load-bearing instruction: keep the outer ring empty for our typography.
const RING_RESERVATION = 'wide clean blank outer border ring with no text, plain empty rim reserved for lettering, all detail in the center medallion'
const QUALITY_SUFFIX = 'crisp vector-clean edges, high contrast, sticker-style, centered, plain off-white background, professional emblem design'
const AVOID = 'no text, no words, no letters, no numbers, no typography, no signature, no watermark, not photorealistic, no human faces, no clutter, not asymmetrical'

/** Pure: same inputs → same string. raceName/finishTime/date are NEVER sent to the model. */
export function buildPrompt(i: { style: keyof typeof STYLE; motif: keyof typeof MOTIF; palette: keyof typeof PALETTE }): string {
  return [STYLE[i.style], 'of', MOTIF[i.motif] + ',', COMPOSITION + ',', PALETTE[i.palette] + ',', RING_RESERVATION + ',', QUALITY_SUFFIX + '.', AVOID].join(' ')
}
```

> `no text / no letters / no numbers` appears in **both** the ring reservation and the avoid clause **on purpose** — diffusion text is garbage and we typeset it ourselves, so we suppress it twice. **That double-suppression, visible right in the prompt string, IS the "AI limitations" insight.** Persist `built_prompt` on the row so you can show it on camera: *"here's exactly what we told the model — note we told it twice to write no text."*

Write a tiny unit test asserting the 3 example prompts (Marathon·mountain·enamel·alpine; 100-Miler·wolf·woodcut·mono; 50K·compass·patch·sunrise). It's a cheap "real work" commit and pins the builder.

## 3.3 The typography overlay (the on-camera proof)

The emblem PNG is the background; an SVG layer carries **all** text. Demoing this side-by-side — *"the model literally can't spell, so we draw the picture and typeset the words ourselves"* — is the signature beat.

```tsx
// apps/web/src/badge/BadgeOverlay.tsx — text is REAL vector glyphs, the opposite of diffusion mush
const SIZE = 1024, C = SIZE / 2, RING_R = SIZE * 0.43
export function BadgeOverlay({ emblemUrl, raceName, distanceLabel, finishTime, dateLabel }:{
  emblemUrl:string; raceName:string; distanceLabel:string; finishTime:string|null; dateLabel:string }) {
  const topArc = `M ${C-RING_R},${C} A ${RING_R},${RING_R} 0 0 1 ${C+RING_R},${C}`
  const bottomArc = `M ${C-RING_R},${C} A ${RING_R},${RING_R} 0 0 0 ${C+RING_R},${C}` // reversed sweep so bottom text isn't upside-down
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} xmlns="http://www.w3.org/2000/svg">
      <defs><path id="ringTop" d={topArc}/><path id="ringBottom" d={bottomArc}/></defs>
      <image href={emblemUrl} x={0} y={0} width={SIZE} height={SIZE}/>
      <text fontSize={62} fontWeight={800} letterSpacing="6" fill="#1c1c1c" fontFamily="'Oswald',sans-serif" textAnchor="middle">
        <textPath href="#ringTop" startOffset="50%">{raceName.toUpperCase()}</textPath></text>
      <text fontSize={52} fontWeight={700} letterSpacing="10" fill="#1c1c1c" fontFamily="'Oswald',sans-serif" textAnchor="middle">
        <textPath href="#ringBottom" startOffset="50%">{distanceLabel.toUpperCase()}</textPath></text>
      <g textAnchor="middle" fontFamily="'Oswald',sans-serif" fill="#fff">
        {finishTime && <text x={C} y={C+250} fontSize={70} fontWeight={800}>{finishTime}</text>}
        <text x={C} y={C+320} fontSize={40} fontWeight={600} letterSpacing="4">{dateLabel}</text>
      </g>
    </svg>) }
```

**Export (SVG → PNG, client-side, no server round-trip):**

```ts
export async function exportBadgePng(svgEl: SVGSVGElement, fileName: string) {
  await document.fonts.ready // ensure the web font is loaded before raster
  const xml = new XMLSerializer().serializeToString(svgEl)
  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = svgUrl })
  const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 })
  canvas.getContext('2d')!.drawImage(img, 0, 0, 1024, 1024)
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName })
  a.click(); URL.revokeObjectURL(a.href)
}
```

> **Two real gotchas (verified):** (1) **Canvas taint** — the `<image href>` must be same-origin or `toBlob` throws `SecurityError`. So we serve the emblem from **our own** `GET /api/badges/:id/image` proxy (streamed from Garage), never the provider URL, and set `crossOrigin='anonymous'`. (2) **Web-font race** — `await document.fonts.ready` before rastering, or the text falls back. We persist only the raw emblem; the composite is re-typeset live from the row's `inputs`, so the gallery thumbnail stays editable.

## 3.4 Re-generation UX

From any saved badge, a new variant in two taps. Every gallery card has **"Tweak & regenerate"**:
1. Click a card → its `inputs` hydrate the same form (every chip + race name pre-selected).
2. Change **one** control. Live typography preview updates instantly.
3. Toggle: **New look** (`seed = null` → server rolls a fresh seed, big change) vs **Keep seed** (reuse the saved seed → same composition, only style/palette move — clean seed-determinism demo). Both providers honour `seed`.
4. POST → a **new** `badges` row owned by the signed-in user (we never mutate the original; the gallery is the *signed-in user's* visual history of variants). Settles `ready`/`failed` in 10–30s; the form polls `GET /api/badges/:id`.
5. During the wait, show a skeleton of the **known** typography ring (we already have the inputs) — the screen is never empty, reinforcing "text is ours and instant; the emblem is what takes time."
