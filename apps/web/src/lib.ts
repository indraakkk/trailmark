// apps/web/src/lib.ts — pure client helpers: group the flat BadgeView[] into races
// (hero + variants), surface failures, and apply search/filter/sort. No React, no I/O.
import type { BadgeView } from '@trailmark/contract'
import type { Collection, FilterKey, NeedsItem, RaceGroup, SortKey } from './types.js'
import { formatDate, paletteSpec, resolveDistanceLabel } from './presets.js'

export const FAIL_LABEL: Record<string, string> = {
  GenTimeout: 'Generator timed out',
  InvalidPrompt: 'Prompt rejected',
  BrokenResponse: 'Bad image from provider',
}

export const failLabel = (b: BadgeView): string => FAIL_LABEL[b.errorTag ?? ''] ?? 'Generation failed'

const norm = (s: string) => s.trim().toLowerCase()
const ms = (b: BadgeView) => new Date(b.createdAt).getTime()
const newestFirst = (a: BadgeView, b: BadgeView) => ms(b) - ms(a)

/** Two initials for the account avatar, derived from the email local part. */
export const initials = (email: string): string => {
  const local = (email.split('@')[0] ?? '').replace(/[^a-zA-Z]/g, '')
  if (local.length === 0) return '?'
  return (local[0]! + (local[1] ?? '')).toUpperCase()
}

/** Group badges into race sections + a needs-attention list. Unfiltered. */
export const buildCollection = (badges: ReadonlyArray<BadgeView>): Collection => {
  const groups = new Map<string, BadgeView[]>()
  for (const b of badges) {
    const k = norm(b.inputs.raceName)
    const arr = groups.get(k)
    if (arr) arr.push(b)
    else groups.set(k, [b])
  }

  const races: RaceGroup[] = []
  const needsAttention: NeedsItem[] = []
  let totalBadges = 0

  for (const [key, list] of groups) {
    list.sort(newestFirst)
    const ready = list.filter((b) => b.status === 'ready')
    const generating = list.filter((b) => b.status === 'generating')
    const failed = list.filter((b) => b.status === 'failed')
    totalBadges += ready.length

    for (const f of failed) {
      needsAttention.push({ badge: f, raceName: f.inputs.raceName, reason: failLabel(f) })
    }

    // hero: keeper (ready) → newest ready → newest generating → none (only-failed race)
    const hero =
      ready.find((b) => b.keeper) ?? ready[0] ?? generating[0] ?? null
    // representative carries the section identity (hero, else newest of any status)
    const rep = hero ?? list[0]!
    const variants = list.filter((b) => b !== hero && b.status !== 'failed')
    const pal = paletteSpec(rep.inputs.palette)
    const dateIso = rep.inputs.date

    races.push({
      key,
      name: rep.inputs.raceName,
      dateIso,
      dateLabel: formatDate(dateIso),
      finishTime: rep.inputs.finishTime,
      distanceLabel: resolveDistanceLabel(rep.inputs.distance),
      year: dateIso.slice(0, 4),
      accent: pal.accent,
      faceTone: pal.faceTone,
      hero,
      variants,
      badges: list,
    })
  }

  return { races, needsAttention, totalBadges, totalRaces: races.length }
}

/** Distinct years present, newest first, for the filter chips. */
export const collectionYears = (races: ReadonlyArray<RaceGroup>): string[] =>
  Array.from(new Set(races.map((r) => r.year).filter((y) => /^\d{4}$/.test(y)))).sort((a, b) =>
    b.localeCompare(a),
  )

/** Apply the toolbar's search / filter / sort to the race sections. */
export const filterAndSort = (
  races: ReadonlyArray<RaceGroup>,
  opts: { search: string; filter: FilterKey; sort: SortKey },
): RaceGroup[] => {
  const q = opts.search.trim().toLowerCase()
  let out = races.filter((r) => (q ? r.name.toLowerCase().includes(q) : true))
  if (opts.filter === 'ultra') out = out.filter((r) => /ultra|50|60|100/i.test(r.distanceLabel))
  else if (/^\d{4}$/.test(opts.filter)) out = out.filter((r) => r.year === opts.filter)
  out = out.slice()
  if (opts.sort === 'az') out.sort((a, b) => a.name.localeCompare(b.name))
  else out.sort((a, b) => b.dateIso.localeCompare(a.dateIso))
  return out
}

/** A filesystem-safe download name. */
export const safeName = (s: string) =>
  (s.trim() || 'trailmark').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
