// apps/web/src/badge/Gallery.tsx — the signed-in user's visual history, newest first.
// A card renders one of three states: generating (skeleton of the KNOWN typography ring,
// so the screen is never empty), ready (emblem + typography + download/tweak), or failed
// (the typed failure label + one-tap retry reusing the same inputs).
import { useRef } from 'react'
import type { BadgeView } from '../api.js'
import { imageUrl } from '../api.js'
import { formatDate } from '../presets.js'
import { BadgeOverlay, exportBadgePng } from './BadgeOverlay.js'

const FAIL_LABEL: Record<string, string> = {
  GenTimeout: 'Generator timed out — retry?',
  InvalidPrompt: 'Prompt rejected',
  BrokenResponse: 'Bad image from provider — retry?',
}

const safeName = (s: string) => (s.trim() || 'trailmark').replace(/[^a-z0-9]+/gi, '-').toLowerCase()

function Card({
  badge,
  onTweak,
  onRetry,
}: {
  badge: BadgeView
  onTweak: (b: BadgeView) => void
  onRetry: (b: BadgeView) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { inputs } = badge

  const overlay = (emblemUrl: string | null) => (
    <BadgeOverlay
      emblemUrl={emblemUrl}
      raceName={inputs.raceName}
      distanceLabel={inputs.distance}
      finishTime={inputs.finishTime}
      dateLabel={formatDate(inputs.date)}
    />
  )

  const download = () => {
    const svg = ref.current?.querySelector('svg')
    if (svg) exportBadgePng(svg, `${safeName(inputs.raceName)}-badge.png`).catch(() => {})
  }

  if (badge.status === 'failed') {
    return (
      <div className="card card--failed">
        <div className="card__art card__art--muted">{overlay(null)}</div>
        <div className="card__bar">
          <span className="fail">{FAIL_LABEL[badge.errorTag ?? ''] ?? 'Generation failed'}</span>
          {badge.errorTag !== 'InvalidPrompt' && (
            <button className="btn btn--sm" onClick={() => onRetry(badge)}>
              Retry
            </button>
          )}
          <button className="btn btn--sm" onClick={() => onTweak(badge)}>
            Tweak
          </button>
        </div>
      </div>
    )
  }

  if (badge.status === 'generating') {
    return (
      <div className="card card--generating">
        <div className="card__art card__art--muted">{overlay(null)}</div>
        <div className="card__bar">
          <span className="spinner" /> Generating…
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card__art" ref={ref}>
        {overlay(imageUrl(badge.id))}
      </div>
      <div className="card__bar">
        <span className="card__title">{inputs.raceName}</span>
        <button className="btn btn--sm btn--primary" onClick={download}>
          Download
        </button>
        <button className="btn btn--sm" onClick={() => onTweak(badge)}>
          Tweak
        </button>
      </div>
    </div>
  )
}

export function Gallery({
  badges,
  onTweak,
  onRetry,
}: {
  badges: ReadonlyArray<BadgeView>
  onTweak: (b: BadgeView) => void
  onRetry: (b: BadgeView) => void
}) {
  if (badges.length === 0) {
    return <p className="gallery-empty">No badges yet — fill the form and generate your first finisher badge.</p>
  }
  return (
    <div className="gallery">
      {badges.map((b) => (
        <Card key={b.id} badge={b} onTweak={onTweak} onRetry={onRetry} />
      ))}
    </div>
  )
}
