// apps/web/src/screens/Collection.tsx — the HOME trophy case.
//
// Badges are grouped BY RACE (lib.ts/buildCollection): a race's identity (name, distance,
// date, finish) lives ONCE in its section header; the hero medal + variant strip below
// never repeat it. A "Needs attention" card surfaces failed generations above the sections.
// This screen owns only ephemeral UI state (search / filter / sort / hover / open-variants);
// all data + actions arrive via props. Download is per-tile (each MedalTile holds its own
// <svg> ref) so concurrent exports never collide.
import { useRef, useState } from 'react'
import type { BadgeView } from '@trailmark/contract'
import type { CollectionProps, FilterKey, RaceGroup, SortKey } from '../types.js'
import { FONT_DISP, FONT_UI, T } from '../theme.js'
import { buildCollection, collectionYears, filterAndSort, safeName } from '../lib.js'
import { Medal, exportBadgePng } from '../badge/Medal.js'
import { imageUrl } from '../api.js'

export function Collection(props: CollectionProps) {
  const { mobile, onNewBadge, onOpenDetail, onTweak, onSetKeeper, onRetry, onShare } = props

  const { races, needsAttention, totalBadges, totalRaces } = buildCollection(props.badges)

  // ── ephemeral UI state ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [hoverId, setHoverId] = useState<string | null>(null)
  // missing key ⇒ OPEN (variants default to expanded)
  const [openVariants, setOpenVariants] = useState<Record<string, boolean>>({})
  const isOpen = (key: string) => openVariants[key] !== false
  const toggleOpen = (key: string) =>
    setOpenVariants((prev) => ({ ...prev, [key]: prev[key] === false ? true : false }))

  const shown = filterAndSort(races, { search, filter, sort })
  const years = collectionYears(races)

  const heroSize = mobile ? 240 : 268
  const variantSize = mobile ? 96 : 116

  // ── EMPTY STATE ────────────────────────────────────────────────────────────
  if (props.badges.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: mobile ? '40px 8px' : '64px 24px',
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: `3px solid ${T.forest}`,
            background: '#efe9dc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 26,
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '20px solid transparent',
              borderRight: '20px solid transparent',
              borderBottom: `34px solid ${T.forest}`,
            }}
          />
        </div>
        <h1 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 38, margin: '0 0 12px', color: T.ink }}>
          Finished a race?
        </h1>
        <p style={{ color: T.mutedInk, maxWidth: 420, lineHeight: 1.55, fontFamily: FONT_UI, margin: '0 0 28px' }}>
          Turn every finish into a keepsake. Make your first badge and start a collection you
          will add to race after race, year after year.
        </p>
        <button
          type="button"
          onClick={onNewBadge}
          style={{
            background: T.forest,
            color: T.paper,
            border: 'none',
            borderRadius: 10,
            padding: '15px 28px',
            fontFamily: FONT_DISP,
            fontWeight: 600,
            fontSize: 18,
            boxShadow: '0 4px 14px rgba(47,93,58,0.28)',
            cursor: 'pointer',
          }}
        >
          Make your first badge
        </button>
        <div style={{ display: 'flex', gap: 18, marginTop: 44 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                border: '2px dashed #a99f8b',
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── POPULATED ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT_UI }}>
      {/* HEADER */}
      <h1 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 34, margin: 0, color: T.ink }}>
        Your collection
      </h1>
      <div
        style={{
          display: 'flex',
          gap: 18,
          marginTop: 6,
          color: T.mutedInk,
          fontSize: 13.5,
          fontWeight: 500,
        }}
      >
        <span>
          <strong style={{ color: T.ink }}>{totalBadges}</strong> badges
        </span>
        <span>
          <strong style={{ color: T.ink }}>{totalRaces}</strong> races
        </span>
      </div>

      {/* TOOLBAR */}
      <div
        style={{
          margin: '18px 0 22px',
          paddingBottom: 18,
          borderBottom: '1px solid #d6cdba',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {/* search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: T.faint,
              fontSize: 14,
              pointerEvents: 'none',
            }}
          >
            ⌕
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search races…"
            aria-label="Search races"
            style={{
              width: '100%',
              padding: '10px 12px 10px 30px',
              border: `1px solid ${T.border}`,
              borderRadius: 9,
              background: T.field,
              fontFamily: FONT_UI,
              fontSize: 14,
              color: T.ink,
            }}
          />
        </div>

        {/* filter chips */}
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        {years.map((y) => (
          <FilterChip key={y} label={y} active={filter === y} onClick={() => setFilter(y)} />
        ))}
        <FilterChip label="Ultras" active={filter === 'ultra'} onClick={() => setFilter('ultra')} />

        {/* sort */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: T.mutedInk, fontWeight: 500 }}>Sort</span>
          <button
            type="button"
            onClick={() => setSort((s) => (s === 'recent' ? 'az' : 'recent'))}
            style={{
              padding: '9px 12px',
              border: `1px solid ${T.border}`,
              borderRadius: 9,
              background: T.field,
              fontFamily: FONT_UI,
              fontWeight: 600,
              fontSize: 13,
              color: T.ink,
              cursor: 'pointer',
            }}
          >
            {sort === 'recent' ? 'Most recent' : 'A–Z'} ▾
          </button>
        </div>
      </div>

      {/* NEEDS ATTENTION */}
      {needsAttention.length > 0 && (
        <div
          style={{
            background: T.rustTint,
            border: '1px solid #e3c5ad',
            borderRadius: 14,
            padding: '16px 18px',
            marginBottom: 26,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: T.rust,
                color: '#fff',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flex: 'none',
              }}
            >
              !
            </span>
            <h2 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 18, color: '#8a3f1f', margin: 0 }}>
              Needs attention
            </h2>
            <span
              style={{
                fontSize: 12.5,
                color: T.rust,
                background: '#efd3c0',
                padding: '2px 9px',
                borderRadius: 20,
                fontWeight: 600,
              }}
            >
              {needsAttention.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {needsAttention.map((item) => (
              <div
                key={item.badge.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  background: '#fdf7f1',
                  border: '1px dashed #d9a883',
                  borderRadius: 11,
                  padding: '11px 13px',
                  minWidth: 288,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    border: '2px dashed #cf9b75',
                    background: '#f6ece3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                  }}
                >
                  <span style={{ color: '#b06a3f', fontSize: 20 }}>⚠</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* full race name (no truncation — failed-only races never get a section
                      header, so this is the one place their name is shown) */}
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: T.ink, lineHeight: 1.25 }}>
                    {item.raceName}
                  </div>
                  <div style={{ fontSize: 12, color: T.rust }}>{item.reason}</div>
                </div>
                <div style={{ display: 'flex', gap: 7, flex: 'none' }}>
                  {item.badge.errorTag !== 'InvalidPrompt' && (
                    <button
                      type="button"
                      onClick={() => onRetry(item.badge)}
                      style={{
                        background: T.forest,
                        color: T.paper,
                        border: 'none',
                        borderRadius: 7,
                        padding: '7px 11px',
                        fontWeight: 600,
                        fontSize: 12.5,
                        fontFamily: FONT_UI,
                        cursor: 'pointer',
                      }}
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onTweak(item.badge)}
                    style={{
                      background: 'transparent',
                      color: T.ink,
                      border: `1px solid ${T.border}`,
                      borderRadius: 7,
                      padding: '7px 11px',
                      fontWeight: 600,
                      fontSize: 12.5,
                      fontFamily: FONT_UI,
                      cursor: 'pointer',
                    }}
                  >
                    Tweak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RACE SECTIONS */}
      {shown.map((race) => {
        // only-failed races (no hero, no variants) already live in needs-attention
        if (race.hero === null && race.variants.length === 0) return null
        return (
          <section key={race.key} style={{ marginBottom: 34 }}>
            {/* section header */}
            <div
              style={{
                borderBottom: `2px solid ${T.ink}`,
                paddingBottom: 12,
                marginBottom: 18,
                display: 'flex',
                flexDirection: mobile ? 'column' : 'row',
                alignItems: mobile ? 'flex-start' : 'baseline',
                justifyContent: mobile ? 'flex-start' : 'space-between',
                flexWrap: 'wrap',
                gap: mobile ? 9 : 0,
              }}
            >
              <h2
                style={{
                  fontFamily: FONT_DISP,
                  fontWeight: 700,
                  fontSize: 25,
                  lineHeight: 1.05,
                  color: T.ink,
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                {race.name}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: '#e7e0cf',
                    color: race.accent,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: 0.6,
                    padding: '3px 10px',
                    borderRadius: 20,
                    textTransform: 'uppercase',
                    fontFamily: FONT_UI,
                  }}
                >
                  {race.distanceLabel}
                </span>
              </h2>
              <div style={{ color: T.mutedInk, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span>{race.dateLabel}</span>
                {race.finishTime && (
                  <>
                    <span style={{ color: T.faint }}>•</span>
                    <span>
                      Finish{' '}
                      <strong
                        style={{
                          fontFamily: FONT_DISP,
                          fontSize: 15,
                          letterSpacing: 0.5,
                          color: T.ink,
                          fontWeight: 700,
                        }}
                      >
                        {race.finishTime}
                      </strong>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* hero + variants */}
            <div
              style={{
                display: 'flex',
                flexDirection: mobile ? 'column' : 'row',
                gap: mobile ? 22 : 30,
                alignItems: 'flex-start',
              }}
            >
              {/* HERO */}
              {race.hero && (
                <div style={{ flex: 'none', width: heroSize, maxWidth: '100%', position: 'relative' }}>
                  {race.hero.status === 'generating' ? (
                    <GeneratingSkeleton caption="Generating your emblem…" spinner={22} captionSize={11} />
                  ) : (
                    <MedalTile
                      badge={race.hero}
                      race={race}
                      variant={false}
                      mobile={mobile}
                      hover={hoverId === race.hero.id}
                      onHover={setHoverId}
                      onOpenDetail={onOpenDetail}
                      onTweak={onTweak}
                      onShare={onShare}
                      onSetKeeper={onSetKeeper}
                    />
                  )}
                </div>
              )}

              {/* VARIANT STRIP */}
              {race.variants.length > 0 && (
                <div style={{ flex: 1, minWidth: 0, width: mobile ? '100%' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
                    <button
                      type="button"
                      onClick={() => toggleOpen(race.key)}
                      aria-expanded={isOpen(race.key)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: 0,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: 0.4,
                          color: T.mutedInk,
                          textTransform: 'uppercase',
                          fontFamily: FONT_UI,
                        }}
                      >
                        Variants
                      </span>
                      <span
                        style={{
                          background: '#e2dac9',
                          color: T.mutedInk,
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: '1px 8px',
                          borderRadius: 20,
                        }}
                      >
                        {race.variants.length}
                      </span>
                      <span style={{ color: T.mutedInk, fontSize: 11 }}>{isOpen(race.key) ? '▲' : '▼'}</span>
                    </button>
                    <span style={{ fontSize: 12, color: T.mutedInk }}>Tap to open · ★ sets the keeper</span>
                  </div>

                  {isOpen(race.key) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                      {race.variants.map((v) => (
                        <div key={v.id} style={{ width: variantSize, maxWidth: '100%', position: 'relative' }}>
                          {v.status === 'generating' ? (
                            <GeneratingSkeleton caption="Generating…" spinner={18} captionSize={10} />
                          ) : (
                            <MedalTile
                              badge={v}
                              race={race}
                              variant={true}
                              mobile={mobile}
                              hover={hoverId === v.id}
                              onHover={setHoverId}
                              onOpenDetail={onOpenDetail}
                              onTweak={onTweak}
                              onShare={onShare}
                              onSetKeeper={onSetKeeper}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ── Toolbar filter chip ────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 14px',
        border: `1px solid ${active ? T.forest : T.border}`,
        borderRadius: 9,
        background: active ? T.forest : T.field,
        color: active ? T.paper : T.ink,
        fontFamily: FONT_UI,
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ── Generating skeleton (shimmer circle + spinner + caption) ─────────────────────
function GeneratingSkeleton({ caption, spinner, captionSize }: { caption: string; spinner: number; captionSize: number }) {
  return (
    <div
      className="tm-shimmer"
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: '50%',
        border: '1px dashed #c7bda9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
      }}
    >
      <div
        className="tm-spin"
        style={{
          width: spinner,
          height: spinner,
          border: '2.5px solid #c7bda9',
          borderTopColor: T.forest,
          borderRadius: '50%',
        }}
      />
      <span style={{ fontSize: captionSize, color: T.mutedInk, fontWeight: 600, fontFamily: FONT_UI, textAlign: 'center', padding: '0 6px' }}>
        {caption}
      </span>
    </div>
  )
}

// ── MedalTile: holds its OWN <svg> ref so concurrent downloads never collide. On desktop
// actions live in a hover overlay; on touch (no hover) they render as a persistent row
// BENEATH the tile, so Download/Share/Tweak/Keeper are always reachable on mobile. ───────
interface MedalTileProps {
  badge: BadgeView
  race: RaceGroup
  variant: boolean
  mobile: boolean
  hover: boolean
  onHover: (id: string | null) => void
  onOpenDetail: (b: BadgeView) => void
  onTweak: (b: BadgeView) => void
  onShare: (b: BadgeView) => void
  onSetKeeper: (b: BadgeView) => void
}

function MedalTile({ badge, race, variant, mobile, hover, onHover, onOpenDetail, onTweak, onShare, onSetKeeper }: MedalTileProps) {
  const wrapRef = useRef<HTMLDivElement>(null)

  const download = () => {
    const svg = wrapRef.current?.querySelector('svg')
    if (svg) void exportBadgePng(svg as SVGSVGElement, safeName(race.name) + '-badge.png').catch(() => {})
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div ref={wrapRef}>
      <div
        onClick={() => onOpenDetail(badge)}
        onMouseEnter={() => onHover(badge.id)}
        onMouseLeave={() => onHover(null)}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        <Medal
          emblemUrl={imageUrl(badge.id)}
          raceName={race.name}
          finishTime={race.finishTime}
          dateLabel={race.dateLabel}
          distanceLabel={race.distanceLabel}
          faceTone={race.faceTone}
          accent={race.accent}
        />

        {/* KEEPER pill (hero only) */}
        {!variant && badge.keeper && (
          <span
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: T.forest,
              color: T.paper,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 20,
              fontFamily: FONT_UI,
            }}
          >
            ★ KEEPER
          </span>
        )}

        {/* hover overlay (desktop pointers only) */}
        {!mobile && hover && !variant && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'rgba(28,30,22,0.46)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <OverlayBtn size={46} label="Download badge" onClick={(e) => { stop(e); download() }}>↓</OverlayBtn>
            <OverlayBtn size={46} label="Share badge" onClick={(e) => { stop(e); onShare(badge) }}>↗</OverlayBtn>
            <OverlayBtn size={46} label="Tweak badge" onClick={(e) => { stop(e); onTweak(badge) }}>✎</OverlayBtn>
          </div>
        )}

        {!mobile && hover && variant && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'rgba(28,30,22,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            <button
              type="button"
              onClick={(e) => { stop(e); onSetKeeper(badge) }}
              style={{
                background: T.paper,
                color: T.ink,
                border: 'none',
                borderRadius: 7,
                padding: '6px 11px',
                fontWeight: 700,
                fontSize: 11.5,
                fontFamily: FONT_UI,
                cursor: 'pointer',
              }}
            >
              ★ Keeper
            </button>
            <div style={{ display: 'flex', gap: 7 }}>
              <MiniBtn label="Download badge" onClick={(e) => { stop(e); download() }}>↓</MiniBtn>
              <MiniBtn label="Tweak badge" onClick={(e) => { stop(e); onTweak(badge) }}>✎</MiniBtn>
            </div>
          </div>
        )}
      </div>

      {/* touch: persistent action row beneath the tile (overlays need hover, unreachable on touch) */}
      {mobile && (
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {variant && <TileActionBtn label="Set as keeper" onClick={() => onSetKeeper(badge)}>★ Keeper</TileActionBtn>}
          <TileActionBtn label="Download badge" onClick={download}>↓</TileActionBtn>
          {!variant && <TileActionBtn label="Share badge" onClick={() => onShare(badge)}>↗</TileActionBtn>}
          <TileActionBtn label="Tweak badge" onClick={() => onTweak(badge)}>✎</TileActionBtn>
        </div>
      )}
    </div>
  )
}

// compact, always-visible tile action (touch) — a real button on the paper surface
function TileActionBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        background: T.field,
        color: T.ink,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: '6px 10px',
        fontFamily: FONT_UI,
        fontWeight: 600,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// round overlay action button (hero)
function OverlayBtn({
  size,
  label,
  onClick,
  children,
}: {
  size: number
  label: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(246,242,232,0.95)',
        color: T.ink,
        fontSize: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// small round overlay action button (variant)
function MiniBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(246,242,232,0.95)',
        color: T.ink,
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
