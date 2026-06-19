// apps/web/src/screens/Studio.tsx — the generator screen.
//
// A presentational form over the StudioForm shape (App owns the data/actions). It mirrors
// the contract distance control (preset | custom), shows a LIVE Medal preview that updates
// as the chips change (emblem slot blank — the emblem is AI-generated server-side), and
// submits via props.onGenerate(form). Local state is initialized from props.initialForm and
// RESET whenever initialForm changes so Tweak re-populates every control. Inline styles only.
import { useEffect, useState } from 'react'
import { Medal } from '../badge/Medal.js'
import {
  DISTANCES,
  MOTIFS,
  PALETTES,
  STYLES,
  formToDistance,
  formatDate,
  paletteSpec,
  resolveDistanceLabel,
} from '../presets.js'
import { FONT_DISP, FONT_UI, T } from '../theme.js'
import type { StudioForm, StudioProps } from '../types.js'

export function Studio({ initialForm, mode, credits, busy, mobile, onBack, onGenerate }: StudioProps) {
  const [form, setFormState] = useState<StudioForm>(initialForm)

  // Re-seed every control when App swaps in a new starting form (Tweak / New badge).
  useEffect(() => {
    setFormState(initialForm)
  }, [initialForm])

  const setForm = (patch: Partial<StudioForm>) => setFormState((prev) => ({ ...prev, ...patch }))

  const distance = formToDistance(form)
  const resolvedDistance = resolveDistanceLabel(distance)
  const resolvedDate = form.date ? '→ ' + formatDate(form.date) : ''
  const pal = paletteSpec(form.palette)

  const disabled = busy || credits <= 0
  const generateLabel = mode === 'tweak' ? 'Generate variant' : 'Generate badge'
  const previewMedalW = mobile ? 230 : 300
  const lowCredits = credits <= 2

  const submit = () => {
    if (disabled) return
    onGenerate(form)
  }

  // ── shared inline styles ──────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: T.paper,
    border: `1px solid ${T.borderSoft}`,
    borderRadius: 16,
    padding: 22,
  }
  const cardH3: React.CSSProperties = {
    fontFamily: FONT_DISP,
    fontWeight: 700,
    fontSize: 19,
    margin: 0,
    marginBottom: 18,
    color: T.ink,
  }
  const fieldLabel: React.CSSProperties = {
    fontFamily: FONT_UI,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: T.mutedInk, // AA-legible on the card/field surfaces (was #8a8474, ~3.3:1)
    marginBottom: 10,
  }
  const miniLabel: React.CSSProperties = {
    fontFamily: FONT_UI,
    fontSize: 11.5,
    fontWeight: 600,
    color: T.mutedInk,
    marginBottom: 6,
  }
  // No `outline: none` — the global :focus-visible rule draws an on-brand keyboard ring.
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    background: T.field,
    fontFamily: FONT_UI,
    fontSize: 15,
    color: T.ink,
    boxSizing: 'border-box',
  }
  const bold: React.CSSProperties = { fontFamily: FONT_DISP, letterSpacing: 0.5, color: T.ink }

  const chip = (selected: boolean, dashed = false): React.CSSProperties => ({
    padding: '8px 13px',
    border: `1px ${selected || !dashed ? 'solid' : 'dashed'} ${selected ? T.forest : T.border}`,
    borderRadius: 20,
    background: selected ? T.forest : T.field,
    color: selected ? T.paper : '#3c382e',
    fontFamily: FONT_UI,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  })
  // Palette chip uses the tinted selected style (not solid forest) so the dot/label read.
  const palChip = (selected: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 13px',
    border: `1px solid ${selected ? T.forest : T.border}`,
    borderRadius: 20,
    background: selected ? T.forestTint : T.field,
    color: '#3c382e',
    fontFamily: FONT_UI,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  })
  const chipWrap: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }

  // ── PREVIEW card ────────────────────────────────────────────────────────────
  const preview = (
    <div
      style={
        mobile
          ? {
              position: 'sticky',
              top: 62,
              zIndex: 30,
              margin: '-20px -16px 0',
              padding: '22px 16px 18px',
              background: 'linear-gradient(180deg,#1c2019,#23281f)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }
          : {
              flex: 'none',
              width: 392,
              position: 'sticky',
              top: 96,
              background: 'linear-gradient(180deg,#1c2019,#23281f)',
              borderRadius: 18,
              padding: '30px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
            }
      }
    >
      <div
        style={{
          alignSelf: 'stretch',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: FONT_UI,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: 1.5,
            color: '#9aa18f',
            textTransform: 'uppercase',
          }}
        >
          Live preview
        </span>
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: '#787f6e' }}>single ink · crisp SVG</span>
      </div>

      <div style={{ width: previewMedalW, maxWidth: '100%' }}>
        <Medal
          emblemUrl={null}
          raceName={form.raceName || 'Your Race'}
          finishTime={form.finishTime || null}
          dateLabel={form.date ? formatDate(form.date) : ''}
          distanceLabel={resolvedDistance}
          faceTone={pal.faceTone}
          accent={pal.accent}
        />
      </div>

      <p
        style={{
          textAlign: 'center',
          fontFamily: FONT_UI,
          fontSize: 12,
          lineHeight: 1.5,
          color: '#8b9180',
          maxWidth: 300,
          margin: 0,
        }}
      >
        The emblem is AI-generated; the text is one crisp ink, kept legible by the plate behind the stats.
      </p>

      {!mobile && (
        <>
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            style={{
              width: '100%',
              background: T.forest, // AA contrast + consistent with the mobile Generate bar
              color: T.paper,
              border: 'none',
              borderRadius: 11,
              padding: 14,
              fontFamily: FONT_DISP,
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: 0.6,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {generateLabel}
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                background: lowCredits ? '#5a4a2a' : 'rgba(255,255,255,0.08)',
                color: lowCredits ? '#e7c878' : '#c3c9b6',
                fontFamily: FONT_UI,
                fontWeight: 700,
                fontSize: 11.5,
                padding: '3px 10px',
                borderRadius: 20,
              }}
            >
              {credits} credits left
            </span>
            <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: '#787f6e' }}>· regenerating uses one</span>
          </div>
        </>
      )}
    </div>
  )

  // ── CONTROLS ──────────────────────────────────────────────────────────────
  const controls = (
    <div style={{ flex: 1, minWidth: 0, maxWidth: mobile ? undefined : 640 }}>
      {/* CARD 1 — Race details */}
      <div style={card}>
        <h3 style={cardH3}>Race details</h3>

        <div style={{ marginBottom: 18 }}>
          <div style={fieldLabel}>Race name</div>
          <input
            style={inputStyle}
            aria-label="Race name"
            value={form.raceName}
            onChange={(e) => setForm({ raceName: e.target.value })}
            placeholder="e.g. Jakarta Running Festival"
          />
        </div>

        {/* DISTANCE */}
        <div style={{ marginBottom: 18 }}>
          <div style={fieldLabel}>Distance</div>
          <div style={chipWrap}>
            {DISTANCES.map((p) => {
              const selected = form.distanceMode === 'preset' && form.preset === p
              return (
                <button
                  key={p}
                  type="button"
                  style={chip(selected)}
                  onClick={() => setForm({ distanceMode: 'preset', preset: p })}
                >
                  {p}
                </button>
              )
            })}
            <button
              type="button"
              style={chip(form.distanceMode === 'custom', true)}
              onClick={() => setForm({ distanceMode: 'custom' })}
            >
              Custom
            </button>
          </div>

          {form.distanceMode === 'custom' && (
            <div
              style={{
                marginTop: 14,
                padding: 16,
                background: T.field,
                border: '1px dashed #cbbfa6',
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={miniLabel}>Number</div>
                  <input
                    style={inputStyle}
                    aria-label="Custom distance number"
                    value={form.customNum}
                    onChange={(e) => setForm({ customNum: e.target.value })}
                    placeholder="50"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <div style={miniLabel}>Unit</div>
                  <div
                    style={{
                      width: 116,
                      display: 'flex',
                      border: `1px solid ${T.border}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    {(['km', 'mi'] as const).map((u) => {
                      const active = form.customUnit === u
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setForm({ customUnit: u })}
                          style={{
                            flex: 1,
                            padding: '10px 0',
                            border: 'none',
                            background: active ? T.forest : 'transparent',
                            color: active ? T.paper : T.mutedInk,
                            fontFamily: FONT_UI,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                        >
                          {u.toUpperCase()}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={miniLabel}>Or a custom label — overrides the number</div>
                <input
                  style={inputStyle}
                  aria-label="Custom distance label"
                  value={form.customLabel}
                  onChange={(e) => setForm({ customLabel: e.target.value })}
                  placeholder="e.g. Backyard Ultra, Relay Leg 2"
                />
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: '#8a8474' }}>
            On the medal → <span style={bold}>{resolvedDistance}</span>
            {resolvedDistance.length > 14 && (
              <span style={{ color: T.rust }}> · long label auto-shrinks/curves to fit</span>
            )}
          </div>
        </div>

        {/* Finish time + Date */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 0 }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={fieldLabel}>
              Finish time{' '}
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: T.faint }}>
                (optional)
              </span>
            </div>
            <input
              style={inputStyle}
              aria-label="Finish time (optional)"
              value={form.finishTime}
              onChange={(e) => setForm({ finishTime: e.target.value })}
              placeholder="2:45:00"
            />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={fieldLabel}>Date</div>
            <input
              style={inputStyle}
              aria-label="Race date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ date: e.target.value })}
            />
            {form.date && (
              <div
                style={{
                  marginTop: 7,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: T.forestTint,
                  color: T.forest,
                  fontFamily: FONT_DISP,
                  fontWeight: 700,
                  fontSize: 12.5,
                  letterSpacing: 0.5,
                  padding: '4px 10px',
                  borderRadius: 7,
                }}
              >
                {resolvedDate}
                <span style={{ fontFamily: FONT_UI, fontWeight: 500, color: '#5d7a5f' }}>on the medal</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CARD 2 — Design */}
      <div style={{ ...card, marginTop: 20 }}>
        <h3 style={cardH3}>Design</h3>

        <div style={{ marginBottom: 18 }}>
          <div style={fieldLabel}>Motif</div>
          <div style={chipWrap}>
            {MOTIFS.map((m) => (
              <button
                key={m.key}
                type="button"
                style={chip(form.motif === m.key)}
                onClick={() => setForm({ motif: m.key })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={fieldLabel}>Badge style</div>
          <div style={chipWrap}>
            {STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                style={chip(form.style === s.key)}
                onClick={() => setForm({ style: s.key })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={fieldLabel}>
            Palette / mood{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: T.faint }}>
              — sets the medal single ink &amp; face
            </span>
          </div>
          <div style={chipWrap}>
            {PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                style={palChip(form.palette === p.key)}
                onClick={() => setForm({ palette: p.key })}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: p.accent,
                    flex: 'none',
                  }}
                />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        style={{
          flex: 'none',
          width: 38,
          height: 38,
          background: T.field,
          border: `1px solid ${T.border}`,
          borderRadius: 9,
          fontSize: 17,
          color: T.ink,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ←
      </button>
      <div>
        <h1 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 32, margin: 0, color: T.ink }}>
          {mode === 'tweak' ? 'Tweak badge' : 'New badge'}
        </h1>
        <p style={{ fontFamily: FONT_UI, fontSize: 14, color: T.mutedInk, margin: '2px 0 0' }}>
          {mode === 'tweak'
            ? 'Producing a new variant for this race'
            : 'Craft a finisher badge for your collection'}
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ paddingBottom: mobile ? 84 : 0 }}>
      {header}

      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {preview}
          <div style={{ marginTop: 22 }}>{controls}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'row-reverse', gap: 34, alignItems: 'flex-start' }}>
          {preview}
          {controls}
        </div>
      )}

      {/* MOBILE fixed bottom action bar */}
      {mobile && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            background: '#f4efe5',
            borderTop: `1px solid ${T.hairline}`,
            padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 11, color: T.mutedInk }}>credits</span>
            <span style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 18, color: T.ink }}>{credits}</span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            style={{
              flex: 1,
              background: T.forest,
              color: T.paper,
              border: 'none',
              borderRadius: 11,
              padding: 14,
              fontFamily: FONT_DISP,
              fontWeight: 600,
              fontSize: 18,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {generateLabel}
          </button>
        </div>
      )}
    </div>
  )
}
