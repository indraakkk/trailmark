// apps/web/src/badge/ChipForm.tsx — the zero-instruction chip form + LIVE typography
// preview. One free-text field (race name); everything else is a chip/pick-list with a
// sensible default, so a first-timer makes a badge by tapping chips. The preview shows
// Layer 2 (our SVG text) instantly over a blank medallion — the emblem is what takes time.
import type { BadgeInputs } from '@trailmark/contract'
import { DISTANCES, MOTIFS, PALETTES, STYLES, formatDate } from '../presets.js'
import { BadgeOverlay } from './BadgeOverlay.js'

export interface ChipFormProps {
  inputs: BadgeInputs
  onChange: (i: BadgeInputs) => void
  onGenerate: (opts: { keepSeed: boolean }) => void
  busy: boolean
  mode: 'create' | 'tweak'
}

function Chips<T extends string>({
  options,
  value,
  onPick,
}: {
  options: ReadonlyArray<{ key: T; label: string; glyph?: string; dot?: string }>
  value: T
  onPick: (k: T) => void
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`chip${o.key === value ? ' chip--on' : ''}`}
          onClick={() => onPick(o.key)}
        >
          {o.dot && <span className="dot" style={{ background: o.dot }} />}
          {o.glyph && <span className="glyph">{o.glyph}</span>}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ChipForm({ inputs, onChange, onGenerate, busy, mode }: ChipFormProps) {
  const set = (patch: Partial<BadgeInputs>) => onChange({ ...inputs, ...patch })
  const canGenerate = inputs.raceName.trim().length > 0 && !busy

  return (
    <div className="form">
      <div className="form__controls">
        <label className="field">
          <span className="field__label">Race name</span>
          <input
            className="input"
            maxLength={60}
            placeholder="e.g. Broken Arrow 26K"
            value={inputs.raceName}
            onChange={(e) => set({ raceName: e.target.value })}
          />
        </label>

        <div className="field">
          <span className="field__label">Distance</span>
          <Chips
            options={DISTANCES.map((d) => ({ key: d, label: d }))}
            value={inputs.distance}
            onPick={(distance) => set({ distance })}
          />
        </div>

        <div className="field field--row">
          <label className="field">
            <span className="field__label">Finish time (optional)</span>
            <input
              className="input"
              placeholder="hh:mm:ss"
              value={inputs.finishTime ?? ''}
              onChange={(e) => set({ finishTime: e.target.value.trim() === '' ? null : e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Date</span>
            <input
              className="input"
              type="date"
              value={inputs.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </label>
        </div>

        <div className="field">
          <span className="field__label">Motif</span>
          <Chips options={MOTIFS} value={inputs.motif} onPick={(motif) => set({ motif })} />
        </div>

        <div className="field">
          <span className="field__label">Badge style</span>
          <Chips options={STYLES} value={inputs.style} onPick={(style) => set({ style })} />
        </div>

        <div className="field">
          <span className="field__label">Palette / mood</span>
          <Chips options={PALETTES} value={inputs.palette} onPick={(palette) => set({ palette })} />
        </div>

        <div className="actions">
          {mode === 'tweak' ? (
            <>
              <button className="btn btn--primary" disabled={!canGenerate} onClick={() => onGenerate({ keepSeed: false })}>
                New look
              </button>
              <button className="btn" disabled={!canGenerate} onClick={() => onGenerate({ keepSeed: true })}>
                Keep seed
              </button>
            </>
          ) : (
            <button className="btn btn--primary" disabled={!canGenerate} onClick={() => onGenerate({ keepSeed: false })}>
              {busy ? 'Generating…' : 'Generate badge'}
            </button>
          )}
        </div>
      </div>

      <div className="form__preview">
        <div className="preview-card">
          <BadgeOverlay
            emblemUrl={null}
            raceName={inputs.raceName || 'YOUR RACE'}
            distanceLabel={inputs.distance}
            finishTime={inputs.finishTime}
            dateLabel={formatDate(inputs.date)}
          />
        </div>
        <p className="preview-hint">
          Live typography preview — the text is crisp SVG we draw ourselves. The emblem
          (the picture) is what the AI generates.
        </p>
      </div>
    </div>
  )
}
