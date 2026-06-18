// apps/web/src/badge/BadgeOverlay.tsx — LAYER 2: crisp client-side SVG typography
// composited over the AI emblem (LAYER 1). The model draws no text; we draw it as REAL
// vector glyphs. The emblem MUST be same-origin (our /api/badges/:id/image proxy) +
// crossOrigin='anonymous' or canvas.toBlob throws SecurityError; and we await
// document.fonts.ready before rasterizing or the font falls back. (docs/plan/10 §3.3)
const SIZE = 1024
const C = SIZE / 2
const RING_R = SIZE * 0.43

export interface BadgeOverlayProps {
  emblemUrl: string | null // null while generating → blank medallion behind the ring text
  raceName: string
  distanceLabel: string
  finishTime: string | null
  dateLabel: string
}

export function BadgeOverlay({
  emblemUrl,
  raceName,
  distanceLabel,
  finishTime,
  dateLabel,
}: BadgeOverlayProps) {
  const topArc = `M ${C - RING_R},${C} A ${RING_R},${RING_R} 0 0 1 ${C + RING_R},${C}`
  const bottomArc = `M ${C - RING_R},${C} A ${RING_R},${RING_R} 0 0 0 ${C + RING_R},${C}` // reversed sweep
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        <path id="ringTop" d={topArc} />
        <path id="ringBottom" d={bottomArc} />
      </defs>
      {emblemUrl ? (
        <image href={emblemUrl} crossOrigin="anonymous" x={0} y={0} width={SIZE} height={SIZE} />
      ) : (
        <circle cx={C} cy={C} r={SIZE * 0.47} fill="#ece7df" />
      )}
      <text
        fontSize={62}
        fontWeight={800}
        letterSpacing="6"
        fill="#1c1c1c"
        fontFamily="'Oswald',sans-serif"
        textAnchor="middle"
      >
        <textPath href="#ringTop" startOffset="50%">
          {raceName.toUpperCase()}
        </textPath>
      </text>
      <text
        fontSize={52}
        fontWeight={700}
        letterSpacing="10"
        fill="#1c1c1c"
        fontFamily="'Oswald',sans-serif"
        textAnchor="middle"
      >
        <textPath href="#ringBottom" startOffset="50%">
          {distanceLabel.toUpperCase()}
        </textPath>
      </text>
      <g textAnchor="middle" fontFamily="'Oswald',sans-serif" fill="#fff">
        {finishTime && (
          <text x={C} y={C + 250} fontSize={70} fontWeight={800} stroke="#1c1c1c" strokeWidth={6} paintOrder="stroke">
            {finishTime}
          </text>
        )}
        <text x={C} y={C + 320} fontSize={40} fontWeight={600} letterSpacing="4" stroke="#1c1c1c" strokeWidth={4} paintOrder="stroke">
          {dateLabel}
        </text>
      </g>
    </svg>
  )
}

/** Rasterize the live SVG (emblem + typography) → PNG download, fully client-side. */
export async function exportBadgePng(svgEl: SVGSVGElement, fileName: string) {
  await document.fonts.ready // load the web font BEFORE raster, or text falls back
  const xml = new XMLSerializer().serializeToString(svgEl)
  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = rej
    i.src = svgUrl
  })
  const canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(img, 0, 0, SIZE, SIZE)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'))
  if (!blob) throw new Error('toBlob failed')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: fileName,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}
