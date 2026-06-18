// packages/contract/src/schemas/Badge.ts — the shared badge shapes.
//
// One Schema source of truth: server validation + the derived browser client both
// use these. Browser-safe (imports only `effect`). The literal unions for
// style/motif/palette are the KEYS into buildPrompt's lookup tables (server-side);
// distance/finishTime/date are typography-only and never reach the model.
import { Schema } from 'effect'

export const BadgeStyle = Schema.Literal(
  'enamel_pin',
  'embroidered_patch',
  'woodcut_seal',
  'vintage_medal',
  'die_cut_sticker',
)
export type BadgeStyle = Schema.Schema.Type<typeof BadgeStyle>

export const BadgeMotif = Schema.Literal(
  'mountain',
  'wolf',
  'compass',
  'pine',
  'sun',
  'antlers',
  'trail',
  'river',
  'bear',
  'feather',
)
export type BadgeMotif = Schema.Schema.Type<typeof BadgeMotif>

export const BadgePalette = Schema.Literal(
  'alpine',
  'sunrise',
  'forest',
  'dusk',
  'desert',
  'mono',
)
export type BadgePalette = Schema.Schema.Type<typeof BadgePalette>

export const BadgeDistance = Schema.Literal(
  '5K',
  '10K',
  'Half',
  'Marathon',
  '50K',
  '50mi',
  '100K',
  '100-Miler',
)
export type BadgeDistance = Schema.Schema.Type<typeof BadgeDistance>

export const BadgeStatus = Schema.Literal('generating', 'ready', 'failed')
export type BadgeStatus = Schema.Schema.Type<typeof BadgeStatus>

export const BadgeErrorTag = Schema.Literal('GenTimeout', 'InvalidPrompt', 'BrokenResponse')
export type BadgeErrorTag = Schema.Schema.Type<typeof BadgeErrorTag>

/** The full structured form. The ONLY free-text field is `raceName` (1–60). */
export const BadgeInputs = Schema.Struct({
  raceName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(60)),
  distance: BadgeDistance, // typography label
  finishTime: Schema.NullOr(Schema.String), // "hh:mm:ss" or null — typography only
  date: Schema.String, // ISO date (YYYY-MM-DD) — typography only
  motif: BadgeMotif, // prompt: emblem subject
  style: BadgeStyle, // prompt: material/render
  palette: BadgePalette, // prompt: colors/mood
})
export type BadgeInputs = Schema.Schema.Type<typeof BadgeInputs>

/** POST /badges + /badges/:id/regenerate payload. `seed:null` ⇒ server rolls a fresh seed.
 *  seed is bounded to a non-negative int ≤ 2e9 so it round-trips through the `seed::int`
 *  column cast without truncation (rejects NaN / out-of-range at decode → 400). */
export const GenerateBadgeInput = Schema.Struct({
  inputs: BadgeInputs,
  seed: Schema.NullOr(Schema.Int.pipe(Schema.between(0, 2_000_000_000))),
})
export type GenerateBadgeInput = Schema.Schema.Type<typeof GenerateBadgeInput>

/** A gallery row as seen by the client. `imageKey` null until ready; `errorTag` null unless failed. */
export const BadgeView = Schema.Struct({
  id: Schema.UUID,
  inputs: BadgeInputs,
  builtPrompt: Schema.String,
  provider: Schema.String,
  seed: Schema.Number,
  // (no imageKey: the internal Garage object key never leaves the server; the client
  //  derives the emblem URL from `id` via the /api/badges/:id/image proxy.)
  status: BadgeStatus,
  errorTag: Schema.NullOr(BadgeErrorTag),
  createdAt: Schema.Date,
})
export type BadgeView = Schema.Schema.Type<typeof BadgeView>
