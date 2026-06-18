// apps/server/src/badge/buildPrompt.ts — PURE & DETERMINISTIC prompt assembler.
//
// A lookup-table assembler, NOT freeform — readable top-to-bottom by reviewers who
// don't know Effect. Fixed slot order:
//   [STYLE] of [MOTIF], [COMPOSITION], [PALETTE], [RING RESERVATION], [QUALITY]. [AVOID]
//
// Takes ONLY { style, motif, palette }. raceName/finishTime/date are typography-only
// and are NEVER sent to the model (the diffusion layer draws no text). The persisted
// built_prompt is demo gold: it shows EXACTLY what we told the model.
const STYLE = {
  enamel_pin:
    'a circular hard-enamel lapel pin emblem, glossy enamel fill, polished gold metal outline, soft studio reflection',
  embroidered_patch:
    'a circular embroidered iron-on patch, visible thread stitching, merrowed border, felt backing',
  woodcut_seal:
    'a circular woodcut seal emblem, hand-carved linocut engraving, bold black ink on textured paper, vintage letterpress',
  vintage_medal:
    'a circular antique bronze finisher medal, embossed bas-relief metal, aged patina',
  die_cut_sticker:
    'a circular die-cut vinyl sticker emblem, flat vector illustration, thick white kiss-cut border',
} as const

const MOTIF = {
  mountain: 'a bold symmetrical mountain peak with a winding trail',
  wolf: 'a howling wolf head in profile',
  compass: 'an ornate compass rose over a mountain horizon',
  pine: 'a single tall pine tree',
  sun: 'a rising sun with radiating rays over hills',
  antlers: 'a pair of symmetrical deer antlers',
  trail: 'a winding mountain trail vanishing into peaks',
  river: 'a flowing river winding through a valley',
  bear: 'a standing grizzly bear silhouette',
  feather: 'a single detailed feather',
} as const

const PALETTE = {
  alpine: 'slate grey, glacier ice-blue and crisp white, cold crisp alpine mood',
  sunrise: 'warm amber, coral and burnt orange, hopeful sunrise mood',
  forest: 'deep pine green, moss and bark brown, earthy forest mood',
  dusk: 'deep purple, dusty rose and indigo, calm twilight mood',
  desert: 'rust red, sand tan and clay, dry desert mood',
  mono: 'ink black and warm cream, timeless monochrome',
} as const

const COMPOSITION =
  'centered symmetrical composition, badge crest emblem, icon logo, contained within a perfect circle, front view, flat'
// The load-bearing instruction: keep the outer ring empty for our typography.
const RING_RESERVATION =
  'wide clean blank outer border ring with no text, plain empty rim reserved for lettering, all detail in the center medallion'
const QUALITY_SUFFIX =
  'crisp vector-clean edges, high contrast, sticker-style, centered, plain off-white background, professional emblem design'
// "no text / no letters / no numbers" appears in BOTH the ring reservation AND here
// ON PURPOSE — diffusion text is garbage and we typeset it ourselves, so we suppress
// it twice. That double-suppression IS the demonstrated "AI limitations" insight.
// Do not "clean it up".
const AVOID =
  'no text, no words, no letters, no numbers, no typography, no signature, no watermark, not photorealistic, no human faces, no clutter, not asymmetrical'

/** Pure: same inputs → same string. raceName/finishTime/date are NEVER sent to the model. */
export function buildPrompt(i: {
  style: keyof typeof STYLE
  motif: keyof typeof MOTIF
  palette: keyof typeof PALETTE
}): string {
  return [
    STYLE[i.style],
    'of',
    MOTIF[i.motif] + ',',
    COMPOSITION + ',',
    PALETTE[i.palette] + ',',
    RING_RESERVATION + ',',
    QUALITY_SUFFIX + '.',
    AVOID,
  ].join(' ')
}
