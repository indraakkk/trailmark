// apps/web/src/screens/DesignSystem.tsx — a static, buildable token + component reference.
//
// The living style guide for the TrailMark revamp: every brand/semantic/neutral color, the
// two type families (Saira Condensed display + Hanken Grotesk UI), the 8px spacing scale,
// radii/elevation, buttons, chips, and the three honest badge-tile states (done /
// generating / failed). Pure presentation, no props — App renders it under the 'system'
// view. Inline styles + design tokens only, faithful to the earthy / woodcut mockup.
import { PALETTES } from '../presets.js'
import { RADIUS, SPACE, T } from '../theme.js'
import { Medal } from '../badge/Medal.js'

const FONT_DISP = "'Saira Condensed', sans-serif"
const FONT_UI = "'Hanken Grotesk', sans-serif"

// ── shared little styles ───────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: T.paper,
  border: `1px solid ${T.borderSoft}`,
  borderRadius: 14,
  padding: 22,
}

const dsSection: React.CSSProperties = {
  fontFamily: FONT_DISP,
  fontWeight: 700,
  fontSize: 23,
  letterSpacing: 0.4,
  margin: '42px 0 18px',
  paddingBottom: 10,
  borderBottom: `2px solid ${T.ink}`,
}

// ── 1) COLOR ───────────────────────────────────────────────────────────────────
const BRAND = [
  { name: 'Forest / primary', hex: '#2f5d3a' },
  { name: 'Forest tint', hex: '#e4ebe2' },
  { name: 'Sage', hex: '#8a9a5b' },
  { name: 'Brass', hex: '#c9a14a' },
  { name: 'Rust / alert', hex: '#a8552e' },
  { name: 'Rust tint', hex: '#f6e7db' },
]

const NEUTRALS = [
  { name: 'Paper bg', hex: '#ece6da' },
  { name: 'Card', hex: '#f6f2e8' },
  { name: 'Field', hex: '#fbf8f1' },
  { name: 'Border', hex: '#d8cfbd' },
  { name: 'Ink', hex: '#26261f' },
  { name: 'Muted ink', hex: '#6b6658' },
  { name: 'Faint', hex: '#a39a86' },
  { name: 'Dark surface', hex: '#1c2019' },
]

const swatchGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 14,
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div>
      <div
        style={{
          height: 64,
          borderRadius: 10,
          background: hex,
          border: '1px solid rgba(38,38,31,0.10)',
        }}
      />
      <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, marginTop: 8 }}>{name}</div>
      <div style={{ fontFamily: FONT_DISP, fontSize: 12, color: T.faint }}>{hex}</div>
    </div>
  )
}

// ── chip + button specimen styles ───────────────────────────────────────────────
const baseChip: React.CSSProperties = {
  padding: '8px 13px',
  borderRadius: RADIUS.pill,
  fontFamily: FONT_UI,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
}

const baseBtn: React.CSSProperties = {
  borderRadius: 8,
  padding: '11px 18px',
  fontFamily: FONT_UI,
  fontWeight: 600,
  fontSize: 14,
}

export function DesignSystem() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 34, margin: 0 }}>
        Design system
      </h1>
      <p style={{ fontFamily: FONT_UI, color: T.mutedInk, fontSize: 14.5, margin: '6px 0 0' }}>
        The tokens and components that power TrailMark — earthy, woodcut, condensed-display.
        Buildable as-is.
      </p>

      {/* 1) COLOR ───────────────────────────────────────────────────────────── */}
      <h2 style={dsSection}>Color</h2>

      <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
        Brand &amp; semantic
      </div>
      <div style={swatchGrid}>
        {BRAND.map((c) => (
          <Swatch key={c.name} name={c.name} hex={c.hex} />
        ))}
      </div>

      <div
        style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, margin: '24px 0 12px' }}
      >
        Neutrals
      </div>
      <div style={swatchGrid}>
        {NEUTRALS.map((c) => (
          <Swatch key={c.name} name={c.name} hex={c.hex} />
        ))}
      </div>

      <div
        style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, margin: '24px 0 12px' }}
      >
        Palette / mood — each sets the medal single ink
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {PALETTES.map((p) => (
          <div
            key={p.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: T.paper,
              border: `1px solid ${T.borderSoft}`,
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: p.accent,
                flexShrink: 0,
                border: '1px solid rgba(38,38,31,0.10)',
              }}
            />
            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, flex: 1 }}>
              {p.label}
            </span>
            <span style={{ fontFamily: FONT_DISP, fontSize: 12, color: T.faint }}>{p.accent}</span>
          </div>
        ))}
      </div>

      {/* 2) TYPOGRAPHY ───────────────────────────────────────────────────────── */}
      <h2 style={dsSection}>Typography</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}
      >
        <div style={card}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: T.mutedInk }}>
            Saira Condensed — display &amp; medal
          </div>
          <div style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 40, marginTop: 10 }}>
            Finish line
          </div>
          <div style={{ fontFamily: FONT_DISP, fontWeight: 600, fontSize: 24, marginTop: 4 }}>
            2:45:00 · OCT 4, 2025
          </div>
          <div
            style={{
              fontFamily: FONT_DISP,
              fontWeight: 500,
              fontSize: 15,
              color: T.mutedInk,
              letterSpacing: 1,
              marginTop: 14,
            }}
          >
            ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
          </div>
        </div>

        <div style={card}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: T.mutedInk }}>
            Hanken Grotesk — UI &amp; body
          </div>
          <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 22, marginTop: 10 }}>
            Your collection
          </div>
          <p style={{ fontFamily: FONT_UI, fontSize: 14.5, lineHeight: 1.55, margin: '10px 0 0' }}>
            A clean grotesque for labels, controls, and body copy. Hierarchy comes from size and
            weight, never color.
          </p>
          <div style={{ fontFamily: FONT_UI, fontSize: 15, marginTop: 14 }}>
            <span style={{ fontWeight: 400 }}>Regular</span>
            <span style={{ color: T.faint }}> · </span>
            <span style={{ fontWeight: 500 }}>Medium</span>
            <span style={{ color: T.faint }}> · </span>
            <span style={{ fontWeight: 700 }}>Bold</span>
          </div>
        </div>
      </div>

      {/* 3) SPACING & RADIUS ─────────────────────────────────────────────────── */}
      <h2 style={dsSection}>Spacing &amp; radius</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}
      >
        <div style={card}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: T.mutedInk }}>
            8px spacing scale
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SPACE.map((v) => (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 28,
                    fontSize: 12,
                    fontFamily: FONT_DISP,
                    color: T.mutedInk,
                    flexShrink: 0,
                  }}
                >
                  {v}
                </span>
                <span
                  style={{ width: v, height: 18, borderRadius: 3, background: T.forest }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: T.mutedInk }}>
            Radius &amp; elevation
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            {[
              { r: 6, label: 'chips' },
              { r: 10, label: 'inputs' },
              { r: 16, label: 'cards' },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: s.r,
                    background: T.forestTint,
                    border: `1px solid ${T.border}`,
                  }}
                />
                <div style={{ fontFamily: FONT_UI, fontSize: 12, color: T.mutedInk, marginTop: 6 }}>
                  {s.r} · {s.label}
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: T.field,
                  boxShadow: '0 6px 18px rgba(58,46,30,0.16)',
                }}
              />
              <div style={{ fontFamily: FONT_UI, fontSize: 12, color: T.mutedInk, marginTop: 6 }}>
                medal + shadow
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4) BUTTONS ──────────────────────────────────────────────────────────── */}
      <h2 style={dsSection}>Buttons</h2>
      <div
        style={{
          ...card,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <button style={{ ...baseBtn, background: T.forest, color: T.paper, border: 'none' }}>
          Primary
        </button>
        <button
          style={{ ...baseBtn, background: 'transparent', border: `1px solid ${T.border}`, color: T.ink }}
        >
          Secondary
        </button>
        <button style={{ ...baseBtn, background: 'transparent', color: T.forest, border: 'none' }}>
          Ghost
        </button>
        <button style={{ ...baseBtn, background: T.forestDeep, color: T.paper, border: 'none' }}>
          Primary · active
        </button>
        <button
          style={{
            ...baseBtn,
            background: T.forest,
            color: T.paper,
            border: 'none',
            outline: `2px solid ${T.forest}`,
            outlineOffset: 2,
          }}
        >
          Focus ring
        </button>
        <button
          disabled
          style={{ ...baseBtn, background: '#e7e0cf', color: T.faint, border: 'none', cursor: 'not-allowed' }}
        >
          Disabled
        </button>
      </div>

      {/* 5) CHIPS & STATES ───────────────────────────────────────────────────── */}
      <h2 style={dsSection}>Chips &amp; states</h2>
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <button style={{ ...baseChip, background: T.field, border: `1px solid ${T.border}`, color: '#3c382e' }}>
          Default
        </button>
        <button style={{ ...baseChip, background: '#efe8d8', border: '1px solid #c2b9a4', color: '#3c382e' }}>
          Hover
        </button>
        <button style={{ ...baseChip, background: T.forest, border: `1px solid ${T.forest}`, color: T.paper }}>
          Selected
        </button>
        <button
          style={{
            ...baseChip,
            background: T.field,
            border: `1px solid ${T.border}`,
            color: '#3c382e',
            outline: `2px solid ${T.forest}`,
            outlineOffset: 2,
          }}
        >
          Focus
        </button>
        <button
          style={{ ...baseChip, background: T.field, border: `1px dashed ${T.border}`, color: '#3c382e' }}
        >
          Custom
        </button>
        <button
          disabled
          style={{
            ...baseChip,
            background: '#f1ece1',
            border: `1px solid ${T.borderSoft}`,
            color: '#bdb4a1',
            cursor: 'not-allowed',
          }}
        >
          Disabled
        </button>
      </div>

      {/* 6) BADGE TILE STATES ────────────────────────────────────────────────── */}
      <h2 style={dsSection}>Badge tile states — honest &amp; distinct</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 18,
        }}
      >
        {/* Done */}
        <div>
          <Medal
            emblemUrl={null}
            raceName="Trail Race"
            finishTime="2:45:00"
            dateLabel="OCT 4, 2025"
            distanceLabel="Half"
            faceTone="light"
            accent="#2f5d3a"
          />
          <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, marginTop: 12 }}>Done</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: T.mutedInk, marginTop: 2 }}>
            Medal — single ink, stats plate.
          </div>
        </div>

        {/* Generating */}
        <div>
          <div
            className="tm-shimmer"
            style={{
              aspectRatio: '1 / 1',
              borderRadius: '50%',
              border: '1px dashed #c7bda9',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <span
              className="tm-spin"
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                border: `3px solid ${T.border}`,
                borderTopColor: T.forest,
              }}
            />
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: T.mutedInk }}>Generating…</span>
          </div>
          <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, marginTop: 12 }}>
            Generating
          </div>
          <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: T.mutedInk, marginTop: 2 }}>
            Shimmer skeleton — no fake medal.
          </div>
        </div>

        {/* Failed */}
        <div>
          <div
            style={{
              aspectRatio: '1 / 1',
              borderRadius: '50%',
              background: '#f6ece3',
              border: '2px dashed #cf9b75',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <span style={{ color: '#b06a3f', fontSize: 30, lineHeight: 1 }}>⚠</span>
            <span style={{ fontFamily: FONT_UI, fontSize: 11, color: T.rust, fontWeight: 600 }}>
              Generator timed out
            </span>
          </div>
          <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: T.rust, marginTop: 12 }}>
            Failed
          </div>
          <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: T.mutedInk, marginTop: 2 }}>
            Muted, dashed, reason + retry.
          </div>
        </div>
      </div>

      <div style={{ height: 40 }} />
    </div>
  )
}
