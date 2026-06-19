// apps/web/src/presets.ts — chip presets + distance/date helpers. Keys match the
// contract's literal unions; labels/dots are display-only. The only free text is the
// race name and the custom distance label. distance/finishTime/date are typography-only;
// motif/style/palette drive the server-crafted prompt.
import type {
  BadgeDistance,
  BadgeInputs,
  BadgeMotif,
  BadgePalette,
  BadgeStyle,
  DistancePreset,
} from '@trailmark/contract'
import type { StudioForm } from './types.js'

export const DISTANCES: ReadonlyArray<DistancePreset> = [
  '5K', '10K', 'Half', 'Marathon', '50K', '50mi', '100K', '100-Miler',
]

export const MOTIFS: ReadonlyArray<{ key: BadgeMotif; label: string }> = [
  { key: 'mountain', label: 'Mountain' },
  { key: 'wolf', label: 'Wolf' },
  { key: 'compass', label: 'Compass' },
  { key: 'pine', label: 'Pine' },
  { key: 'sun', label: 'Sun' },
  { key: 'antlers', label: 'Antlers' },
  { key: 'trail', label: 'Trail' },
  { key: 'river', label: 'River' },
  { key: 'bear', label: 'Bear' },
  { key: 'feather', label: 'Feather' },
]

export const STYLES: ReadonlyArray<{ key: BadgeStyle; label: string }> = [
  { key: 'enamel_pin', label: 'Enamel Pin' },
  { key: 'embroidered_patch', label: 'Embroidered Patch' },
  { key: 'woodcut_seal', label: 'Woodcut Seal' },
  { key: 'vintage_medal', label: 'Vintage Medal' },
  { key: 'die_cut_sticker', label: 'Die-cut Sticker' },
]

/** Each palette sets the medal's SINGLE INK via `faceTone` (light face → dark ink, dark
 *  face → light ink) plus one accent used for the thin ring + stats rule. */
export interface PaletteSpec {
  key: BadgePalette
  label: string
  accent: string
  faceTone: 'light' | 'dark'
}
export const PALETTES: ReadonlyArray<PaletteSpec> = [
  { key: 'alpine', label: 'Alpine', accent: '#4a6d8c', faceTone: 'light' },
  { key: 'sunrise', label: 'Sunrise', accent: '#c98a3a', faceTone: 'light' },
  { key: 'forest', label: 'Forest', accent: '#2f5d3a', faceTone: 'light' },
  { key: 'dusk', label: 'Dusk', accent: '#7a5d9c', faceTone: 'dark' },
  { key: 'desert', label: 'Desert', accent: '#b5602f', faceTone: 'light' },
  { key: 'mono', label: 'Monochrome', accent: '#7d7a70', faceTone: 'dark' },
]

const PALETTE_BY_KEY: Record<BadgePalette, PaletteSpec> = Object.fromEntries(
  PALETTES.map((p) => [p.key, p]),
) as Record<BadgePalette, PaletteSpec>

export const paletteSpec = (key: BadgePalette): PaletteSpec => PALETTE_BY_KEY[key] ?? PALETTES[2]!

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

/** A fresh Studio form (create mode). */
export const defaultForm = (): StudioForm => ({
  raceName: '',
  distanceMode: 'preset',
  preset: 'Half',
  customNum: '',
  customUnit: 'km',
  customLabel: '',
  finishTime: '',
  date: today(),
  motif: 'mountain',
  style: 'woodcut_seal',
  palette: 'forest',
})

// ── distance resolution ─────────────────────────────────────────────────────
/** Resolve the medal's distance label. label > number+unit > preset. */
export const resolveDistanceLabel = (d: BadgeDistance): string => {
  if (typeof d === 'string') return d // a preset
  if (d.label && d.label.trim()) return d.label.trim()
  if (d.num != null && Number.isFinite(d.num)) return `${d.num} ${d.unit.toUpperCase()}`
  return ''
}

/** Form → contract distance union. */
export const formToDistance = (f: StudioForm): BadgeDistance => {
  if (f.distanceMode === 'preset') return f.preset
  const numRaw = f.customNum.trim()
  const num = numRaw === '' ? null : Number(numRaw)
  return {
    kind: 'custom',
    num: num != null && Number.isFinite(num) ? num : null,
    unit: f.customUnit,
    label: f.customLabel.trim() ? f.customLabel.trim() : null,
  }
}

/** Contract distance → form fields (for Tweak). */
export const distanceToForm = (
  d: BadgeDistance,
): Pick<StudioForm, 'distanceMode' | 'preset' | 'customNum' | 'customUnit' | 'customLabel'> => {
  if (typeof d === 'string') {
    return { distanceMode: 'preset', preset: d, customNum: '', customUnit: 'km', customLabel: '' }
  }
  return {
    distanceMode: 'custom',
    preset: 'Half',
    customNum: d.num != null ? String(d.num) : '',
    customUnit: d.unit,
    customLabel: d.label ?? '',
  }
}

/** Studio form → full contract BadgeInputs. */
export const formToInputs = (f: StudioForm): BadgeInputs => ({
  raceName: f.raceName.trim(),
  distance: formToDistance(f),
  finishTime: f.finishTime.trim() === '' ? null : f.finishTime.trim(),
  date: f.date,
  motif: f.motif,
  style: f.style,
  palette: f.palette,
})

/** Contract BadgeInputs → Studio form (for Tweak: re-populate the exact controls). */
export const inputsToForm = (i: BadgeInputs): StudioForm => ({
  raceName: i.raceName,
  ...distanceToForm(i.distance),
  finishTime: i.finishTime ?? '',
  date: i.date,
  motif: i.motif,
  style: i.style,
  palette: i.palette,
})

// ── date ─────────────────────────────────────────────────────────────────────
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** ISO 'YYYY-MM-DD' → 'OCT 4, 2025' (typography label; '' when unset/invalid). */
export const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${MONTHS[m - 1]} ${d}, ${y}`
}
