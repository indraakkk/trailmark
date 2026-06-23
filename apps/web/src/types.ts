// apps/web/src/types.ts — shared client types: the Studio form, the grouped-collection
// view models, and the prop contracts every screen implements. App owns data + actions;
// each screen owns its own ephemeral UI state (hover, search, open/closed) internally.
import type {
  BadgeMotif,
  BadgePalette,
  BadgeStyle,
  BadgeView,
  DistancePreset,
  DistanceUnit,
} from '@trailmark/contract'

export type View = 'collection' | 'studio' | 'detail' | 'system'

/** The Studio control state. Mirrors the distance control (preset | custom). */
export interface StudioForm {
  raceName: string
  distanceMode: 'preset' | 'custom'
  preset: DistancePreset
  customNum: string
  customUnit: DistanceUnit
  customLabel: string
  finishTime: string
  date: string // ISO yyyy-mm-dd, or ''
  motif: BadgeMotif
  style: BadgeStyle
  palette: BadgePalette
}

// ── Collection view models (built by lib.ts from the flat BadgeView[]) ───────
/** A race section: identity carried once, a hero badge + variant strip. */
export interface RaceGroup {
  key: string // normalized race name (grouping key)
  name: string // display race name
  dateIso: string // representative ISO date (sort/year)
  dateLabel: string // e.g. "OCT 4, 2025"
  finishTime: string | null
  distanceLabel: string // resolved, e.g. "50 KM" / "Half"
  year: string
  accent: string
  faceTone: 'light' | 'dark'
  hero: BadgeView | null // keeper, else newest ready
  variants: ReadonlyArray<BadgeView> // other ready + generating (NOT failed)
  badges: ReadonlyArray<BadgeView> // every badge in this race
}

/** A failed badge surfaced in the "Needs attention" area. */
export interface NeedsItem {
  badge: BadgeView
  raceName: string
  reason: string
}

export interface Collection {
  races: ReadonlyArray<RaceGroup>
  needsAttention: ReadonlyArray<NeedsItem>
  totalBadges: number // ready badges
  totalRaces: number
}

export type SortKey = 'recent' | 'az'
export type FilterKey = string // 'all' | a year | 'ultra'

// ── Screen prop contracts ────────────────────────────────────────────────────
export interface TopBarProps {
  view: View
  onNav: (v: View) => void
  onNewBadge: () => void
  email: string
  onSignOut: () => void
  isDemo: boolean
  force: '' | 'timeout' | 'invalid' | 'broken'
  onForce: (f: '' | 'timeout' | 'invalid' | 'broken') => void
  mobile: boolean
}

export interface CollectionProps {
  badges: ReadonlyArray<BadgeView>
  mobile: boolean
  onNewBadge: () => void
  onOpenDetail: (b: BadgeView) => void
  onTweak: (b: BadgeView) => void
  onSetKeeper: (b: BadgeView) => void
  onRetry: (b: BadgeView) => void
  onDelete: (b: BadgeView) => void
  onShare: (b: BadgeView) => void
}

export interface StudioProps {
  initialForm: StudioForm
  mode: 'create' | 'tweak'
  credits: number
  busy: boolean
  mobile: boolean
  onBack: () => void
  /** Resolve the form to inputs and submit (create → new badge; tweak → variant). */
  onGenerate: (form: StudioForm) => void
}

export interface BadgeDetailProps {
  badge: BadgeView
  group: RaceGroup | null
  mobile: boolean
  onBack: () => void
  onTweak: (b: BadgeView) => void
  onSetKeeper: (b: BadgeView) => void
  onDelete: (b: BadgeView) => void
  onShare: (b: BadgeView) => void
  onRetry: (b: BadgeView) => void
}
