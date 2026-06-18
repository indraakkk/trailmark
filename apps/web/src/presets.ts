// apps/web/src/presets.ts — the chip presets (zero-instruction, visual). Keys match
// the contract's literal unions; labels/glyphs/dots are display-only. The ONLY free
// text is raceName. distance/finishTime/date are typography-only; motif/style/palette
// drive the server-crafted prompt.
import type { BadgeInputs } from '@trailmark/contract'

export const DISTANCES: ReadonlyArray<BadgeInputs['distance']> = [
  '5K', '10K', 'Half', 'Marathon', '50K', '50mi', '100K', '100-Miler',
]

export const MOTIFS: ReadonlyArray<{ key: BadgeInputs['motif']; label: string; glyph: string }> = [
  { key: 'mountain', label: 'Mountain', glyph: '🏔' },
  { key: 'wolf', label: 'Wolf', glyph: '🐺' },
  { key: 'compass', label: 'Compass', glyph: '🧭' },
  { key: 'pine', label: 'Pine', glyph: '🌲' },
  { key: 'sun', label: 'Sun', glyph: '🌄' },
  { key: 'antlers', label: 'Antlers', glyph: '🦌' },
  { key: 'trail', label: 'Trail', glyph: '🥾' },
  { key: 'river', label: 'River', glyph: '🏞' },
  { key: 'bear', label: 'Bear', glyph: '🐻' },
  { key: 'feather', label: 'Feather', glyph: '🪶' },
]

export const STYLES: ReadonlyArray<{ key: BadgeInputs['style']; label: string }> = [
  { key: 'enamel_pin', label: 'Enamel Pin' },
  { key: 'embroidered_patch', label: 'Embroidered Patch' },
  { key: 'woodcut_seal', label: 'Woodcut Seal' },
  { key: 'vintage_medal', label: 'Vintage Medal' },
  { key: 'die_cut_sticker', label: 'Die-cut Sticker' },
]

export const PALETTES: ReadonlyArray<{ key: BadgeInputs['palette']; label: string; dot: string }> = [
  { key: 'alpine', label: 'Alpine', dot: '#8aa1b8' },
  { key: 'sunrise', label: 'Sunrise', dot: '#e8853a' },
  { key: 'forest', label: 'Forest', dot: '#3f6b46' },
  { key: 'dusk', label: 'Dusk', dot: '#6b5b95' },
  { key: 'desert', label: 'Desert', dot: '#b86b4b' },
  { key: 'mono', label: 'Monochrome', dot: '#2b2b2b' },
]

const today = () => new Date().toISOString().slice(0, 10)

export const defaultInputs = (): BadgeInputs => ({
  raceName: '',
  distance: 'Marathon',
  finishTime: null,
  date: today(),
  motif: 'mountain',
  style: 'enamel_pin',
  palette: 'alpine',
})

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** ISO 'YYYY-MM-DD' → 'JUN 18 2026' (typography label). */
export const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${MONTHS[m - 1]} ${d} ${y}`
}
