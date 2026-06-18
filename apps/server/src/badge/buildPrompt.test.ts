// apps/server/src/badge/buildPrompt.test.ts — pins the deterministic builder.
// The expected strings are the ACTUAL captured output (not a re-derivation), so
// any accidental edit to a lookup table or the slot order fails this test.
import { describe, expect, test } from 'bun:test'
import { buildPrompt } from './buildPrompt.js'

const MARATHON_MOUNTAIN_ENAMEL_ALPINE =
  'a circular hard-enamel lapel pin emblem, glossy enamel fill, polished gold metal outline, soft studio reflection of a bold symmetrical mountain peak with a winding trail, centered symmetrical composition, badge crest emblem, icon logo, contained within a perfect circle, front view, flat, slate grey, glacier ice-blue and crisp white, cold crisp alpine mood, wide clean blank outer border ring with no text, plain empty rim reserved for lettering, all detail in the center medallion, crisp vector-clean edges, high contrast, sticker-style, centered, plain off-white background, professional emblem design. no text, no words, no letters, no numbers, no typography, no signature, no watermark, not photorealistic, no human faces, no clutter, not asymmetrical'

const HUNDRED_WOLF_WOODCUT_MONO =
  'a circular woodcut seal emblem, hand-carved linocut engraving, bold black ink on textured paper, vintage letterpress of a howling wolf head in profile, centered symmetrical composition, badge crest emblem, icon logo, contained within a perfect circle, front view, flat, ink black and warm cream, timeless monochrome, wide clean blank outer border ring with no text, plain empty rim reserved for lettering, all detail in the center medallion, crisp vector-clean edges, high contrast, sticker-style, centered, plain off-white background, professional emblem design. no text, no words, no letters, no numbers, no typography, no signature, no watermark, not photorealistic, no human faces, no clutter, not asymmetrical'

const FIFTYK_COMPASS_PATCH_SUNRISE =
  'a circular embroidered iron-on patch, visible thread stitching, merrowed border, felt backing of an ornate compass rose over a mountain horizon, centered symmetrical composition, badge crest emblem, icon logo, contained within a perfect circle, front view, flat, warm amber, coral and burnt orange, hopeful sunrise mood, wide clean blank outer border ring with no text, plain empty rim reserved for lettering, all detail in the center medallion, crisp vector-clean edges, high contrast, sticker-style, centered, plain off-white background, professional emblem design. no text, no words, no letters, no numbers, no typography, no signature, no watermark, not photorealistic, no human faces, no clutter, not asymmetrical'

describe('buildPrompt', () => {
  test('Marathon · mountain · enamel pin · alpine', () => {
    expect(buildPrompt({ style: 'enamel_pin', motif: 'mountain', palette: 'alpine' })).toBe(
      MARATHON_MOUNTAIN_ENAMEL_ALPINE,
    )
  })

  test('100-Miler · wolf · woodcut · mono', () => {
    expect(buildPrompt({ style: 'woodcut_seal', motif: 'wolf', palette: 'mono' })).toBe(
      HUNDRED_WOLF_WOODCUT_MONO,
    )
  })

  test('50K · compass · embroidered patch · sunrise', () => {
    expect(buildPrompt({ style: 'embroidered_patch', motif: 'compass', palette: 'sunrise' })).toBe(
      FIFTYK_COMPASS_PATCH_SUNRISE,
    )
  })

  test('is deterministic — same inputs, same string', () => {
    const a = buildPrompt({ style: 'vintage_medal', motif: 'bear', palette: 'forest' })
    const b = buildPrompt({ style: 'vintage_medal', motif: 'bear', palette: 'forest' })
    expect(a).toBe(b)
  })

  test('suppresses text TWICE (the load-bearing AI-limitation insight)', () => {
    const p = buildPrompt({ style: 'die_cut_sticker', motif: 'pine', palette: 'dusk' })
    // once in the ring reservation, once in the avoid clause
    expect(p).toContain('blank outer border ring with no text')
    expect(p).toContain('no text, no words, no letters, no numbers')
    expect(p.match(/no text/g)?.length).toBe(2)
  })
})
