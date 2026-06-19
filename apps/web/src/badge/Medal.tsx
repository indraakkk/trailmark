// apps/web/src/badge/Medal.tsx — the two-layer medal, single-ink edition.
//
// LAYER 1 is the AI emblem (a raster <image>); LAYER 2 is the crisp SVG typography we
// draw ourselves — the model renders NO text. The revamp's legibility fix (brief #2):
// ONE ink per face (light face → dark ink, dark face → light ink), never per-element
// color. The finish time/date sit in a "quiet zone" stats plate (a palette-matched
// scrim) so they stay legible over any emblem — replacing the old white-outline hack.
//
// The emblem lives INSIDE this SVG (clipped to the inner circle) so a single rasterize
// captures face + emblem + type for PNG export. For export the emblem MUST be inlined as
// a data: URL: an SVG loaded into <img> renders in restricted mode and will NOT fetch the
// external <image href> (the same-origin /api/badges/:id/image proxy), so a referenced
// emblem rasterizes blank. We also await document.fonts.ready before rasterizing.
import { useId } from 'react'
import { FONT_DISP, FONT_UI } from '../theme.js'

export type FaceTone = 'light' | 'dark'

export interface MedalProps {
  emblemUrl: string | null // null while generating / live-preview → blank slot behind the type
  raceName: string
  finishTime: string | null
  dateLabel: string // pre-formatted, e.g. "OCT 4, 2025"
  distanceLabel: string // resolved, e.g. "50 KM" / "Half"
  faceTone: FaceTone
  accent: string
}

const EXPORT_SIZE = 1024

export function Medal({
  emblemUrl,
  raceName,
  finishTime,
  dateLabel,
  distanceLabel,
  faceTone,
  accent,
}: MedalProps) {
  const uid = useId().replace(/[:]/g, '')
  const dark = faceTone === 'dark'
  const ink = dark ? '#f1ead9' : '#26261f'
  // dark-face scrim is heavier (0.70) so the light ink clears AA even over a near-white
  // emblem; the light face's 0.82 already does. This is what keeps stats legible over ANY art.
  const scrim = dark ? 'rgba(18,22,16,0.70)' : 'rgba(245,240,230,0.82)'
  const scrimBorder = dark ? 'rgba(241,234,217,0.22)' : 'rgba(38,38,31,0.14)'
  const faceBg = dark ? '#1d211b' : '#efe9dc'
  const slotBg = dark ? '#23271f' : '#e7e0d0'
  const medalShadow = dark ? '0 10px 30px rgba(0,0,0,0.45)' : '0 6px 18px rgba(58,46,30,0.16)'

  const race = (raceName || 'Your Race').toString()
  const time = (finishTime ?? '').toString()
  const hasTime = time.trim().length > 0
  const date = (dateLabel || '').toString()
  const dist = (distanceLabel || '').toString()

  // auto-shrink so long labels still fit the arcs / plate
  let distFs = 14, distLs = 2
  if (dist.length > 9) { distFs = 11.5; distLs = 1 }
  if (dist.length > 14) { distFs = 9.5; distLs = 0.5 }
  let raceFs = 15.5, raceLs = 1.6
  if (race.length > 22) { raceFs = 13; raceLs = 1 }
  if (race.length > 30) { raceFs = 11; raceLs = 0.4 }
  let timeFs = 34
  if (time.length > 7) timeFs = 28
  if (time.length > 9) timeFs = 23

  const clip = `clip-${uid}`
  const topArc = `at-${uid}`
  const botArc = `ab-${uid}`
  // `side` is valid SVG2 (keeps the bottom-arc glyphs upright) but absent from React's
  // SVGProps types — spread it as an untyped object to set it without a type error.
  const sideRight = { side: 'right' } as Record<string, string>


  return (
    <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: '50%', boxShadow: medalShadow }}>
      <svg
        viewBox="0 0 240 240"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`${race} finisher medal`}
      >
        <defs>
          <clipPath id={clip}>
            <circle cx={120} cy={120} r={103} />
          </clipPath>
          <path id={topArc} d="M 28 120 A 92 92 0 0 1 212 120" fill="none" />
          <path id={botArc} d="M 30 116 A 90 90 0 0 0 210 116" fill="none" />
        </defs>

        {/* face */}
        <circle cx={120} cy={120} r={120} fill={faceBg} />
        {/* emblem (LAYER 1), clipped to the inner circle */}
        <g clipPath={`url(#${clip})`}>
          <circle cx={120} cy={120} r={103} fill={slotBg} />
          {emblemUrl ? (
            <image
              href={emblemUrl}
              crossOrigin="anonymous"
              x={17}
              y={17}
              width={206}
              height={206}
              preserveAspectRatio="xMidYMid slice"
            />
          ) : (
            <text
              x={120}
              y={124}
              fontFamily={FONT_UI}
              fontSize={9}
              letterSpacing={2}
              fill={ink}
              opacity={0.32}
              textAnchor="middle"
            >
              EMBLEM
            </text>
          )}
        </g>

        {/* rings */}
        <circle cx={120} cy={120} r={116} fill="none" stroke={ink} strokeWidth={2.5} opacity={0.9} />
        <circle cx={120} cy={120} r={108} fill="none" stroke={accent} strokeWidth={1.4} opacity={0.85} />

        {/* race name — top arc (LAYER 2) */}
        <text
          fontFamily={FONT_DISP}
          fontWeight={600}
          fontSize={raceFs}
          letterSpacing={raceLs}
          fill={ink}
          textAnchor="middle"
        >
          <textPath href={`#${topArc}`} startOffset="50%">
            {race.toUpperCase()}
          </textPath>
        </text>

        {/* distance — bottom arc, upright */}
        <text
          fontFamily={FONT_DISP}
          fontWeight={600}
          fontSize={distFs}
          letterSpacing={distLs}
          fill={ink}
          textAnchor="middle"
        >
          <textPath href={`#${botArc}`} startOffset="50%" {...sideRight}>
            {dist.toUpperCase()}
          </textPath>
        </text>

        {/* stats plate — the quiet zone keeps time/date legible over any emblem. Drawn
            only when there's something to show, so a time/date-less medal stays clean. */}
        {(hasTime || !!date) && (
        <g transform="translate(120 152)">
          <rect x={-58} y={-25} width={116} height={50} rx={7} fill={scrim} stroke={scrimBorder} strokeWidth={1} />
          <rect x={-40} y={hasTime ? -23 : -2} width={80} height={1.4} fill={accent} opacity={0.9} />
          {hasTime && (
            <text
              x={0}
              y={4}
              fontFamily={FONT_DISP}
              fontWeight={700}
              fontSize={timeFs}
              letterSpacing={0.5}
              fill={ink}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {time}
            </text>
          )}
          {date && (
            <text
              x={0}
              y={hasTime ? 19 : 12}
              fontFamily={FONT_UI}
              fontWeight={600}
              fontSize={hasTime ? 9 : 11}
              letterSpacing={2}
              fill={ink}
              textAnchor="middle"
              opacity={0.82}
            >
              {date.toUpperCase()}
            </text>
          )}
        </g>
        )}
      </svg>
    </div>
  )
}

/** Rasterize a Medal's SVG (face + emblem + typography) → PNG download, fully client-side. */
export async function exportBadgePng(svgEl: SVGSVGElement, fileName: string) {
  await document.fonts.ready // load the web fonts BEFORE raster, or text falls back
  // Clone so we never disturb the on-screen SVG while we rewrite the emblem reference.
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(EXPORT_SIZE)) // explicit px: %+viewBox can raster 0-size in Firefox
  clone.setAttribute('height', String(EXPORT_SIZE))

  // Inline the emblem as a data: URL (see header note). Same-origin fetch carries the
  // httpOnly session cookie and keeps the canvas untainted. On failure, drop the <image>
  // and export the type-only medal rather than aborting the whole download.
  const emblem = clone.querySelector('image')
  if (emblem) {
    try {
      const res = await fetch(emblem.getAttribute('href') ?? '')
      if (!res.ok) throw new Error(`emblem ${res.status}`)
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result as string)
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(blob)
      })
      emblem.setAttribute('href', dataUrl)
      emblem.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl) // old-Safari fallback
    } catch {
      emblem.remove()
    }
  }

  const xml = new XMLSerializer().serializeToString(clone)
  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = svgUrl
  })
  const canvas = Object.assign(document.createElement('canvas'), { width: EXPORT_SIZE, height: EXPORT_SIZE })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(img, 0, 0, EXPORT_SIZE, EXPORT_SIZE)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'))
  if (!blob) throw new Error('toBlob failed')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: fileName,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}
