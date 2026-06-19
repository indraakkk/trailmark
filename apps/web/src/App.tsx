// apps/web/src/App.tsx — the single-page orchestration. Sign-in gate → chip form →
// generate (or tweak/regenerate) → poll the generating row every 2s → render the
// gallery (newest first). Re-generation always creates a NEW row owned by the user;
// "Keep seed" reuses the saved seed, "New look" rolls a fresh one.
import { useEffect, useState } from 'react'
import {
  type BadgeView,
  type Force,
  authClient,
  gallery,
  generate,
  one,
  regenerate,
  sendMagicLink,
  signOut,
} from './api.js'
import type { BadgeInputs } from '@trailmark/contract'
import { defaultInputs } from './presets.js'
import { ChipForm } from './badge/ChipForm.js'
import { Gallery } from './badge/Gallery.js'

type Session = 'loading' | null | { userId: string; email: string }

// Cosmetic only: hide the demo-failure control for non-demo users. The SERVER gate
// (submit.ts, DEMO_ACCOUNT_EMAIL) is authoritative — this just avoids showing a no-op.
const DEMO_EMAIL = 'indrakoslab@gmail.com'

export function App() {
  const [session, setSession] = useState<Session>('loading')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  // Lazy initializer (React calls a function passed to useState once on mount).
  const [inputs, setInputs] = useState<BadgeInputs>(() => defaultInputs())
  const [seed, setSeed] = useState<number | null>(null)
  const [mode, setMode] = useState<'create' | 'tweak'>('create')
  const [provenanceId, setProvenanceId] = useState<string | null>(null)
  const [force, setForce] = useState<'' | Force>('')

  const [badges, setBadges] = useState<ReadonlyArray<BadgeView>>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Resolve the session once on load.
  useEffect(() => {
    authClient
      .getSession()
      .then((r) => {
        const data = (r as { data?: { user?: { id?: string; email?: string } } } | null)?.data
        setSession(data?.user?.id ? { userId: data.user.id, email: data.user.email ?? '' } : null)
      })
      .catch(() => setSession(null))
  }, [])

  // Load the gallery when signed in.
  useEffect(() => {
    if (session && session !== 'loading') {
      gallery()
        .then(setBadges)
        .catch(() => setBadges([]))
    }
  }, [session])

  // Poll any generating badges every 2s until they settle.
  useEffect(() => {
    if (!badges.some((b) => b.status === 'generating')) return
    const t = setInterval(() => {
      for (const b of badges.filter((x) => x.status === 'generating')) {
        one(b.id)
          .then((u) => setBadges((prev) => prev.map((x) => (x.id === u.id ? u : x))))
          .catch(() => {})
      }
    }, 2000)
    return () => clearInterval(t)
  }, [badges])

  const submit = async (payload: { inputs: BadgeInputs; seed: number | null }) => {
    setBusy(true)
    setNotice(null)
    const f = force || undefined
    const res =
      mode === 'tweak' && provenanceId
        ? await regenerate(provenanceId, payload, f)
        : await generate(payload, f)
    setBusy(false)
    if (!res.ok) {
      setNotice(`Prompt rejected: ${res.reason}`)
      return
    }
    setBadges((prev) => [res.badge, ...prev])
    setMode('create')
    setProvenanceId(null)
  }

  const onGenerate = ({ keepSeed }: { keepSeed: boolean }) =>
    submit({ inputs, seed: keepSeed ? seed : null })

  const onTweak = (b: BadgeView) => {
    setInputs(b.inputs)
    setSeed(b.seed)
    setMode('tweak')
    setProvenanceId(b.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onRetry = async (b: BadgeView) => {
    setBusy(true)
    const res = await regenerate(b.id, { inputs: b.inputs, seed: null }, force || undefined)
    setBusy(false)
    if (res.ok) setBadges((prev) => [res.badge, ...prev])
  }

  if (session === 'loading') return <main className="center">Loading…</main>

  if (session === null) {
    return (
      <main className="center signin">
        <h1 className="brand">Trailmark</h1>
        <p className="tagline">Trail-running finisher badges — your own private gallery.</p>
        {sent ? (
          <p className="notice">
            Check your email for the sign-in link. (Running locally? It's printed in the
            server log as <code>[magic-link] …</code>.)
          </p>
        ) : (
          <form
            className="signin__form"
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim()) void sendMagicLink(email.trim()).then(() => setSent(true))
            }}
          >
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn--primary" type="submit">
              Send sign-in link
            </button>
          </form>
        )}
      </main>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand brand--sm">Trailmark</span>
        <div className="topbar__right">
          {session.email.toLowerCase() === DEMO_EMAIL && (
            <label className="demo">
              Demo failure
              <select value={force} onChange={(e) => setForce(e.target.value as '' | Force)}>
                <option value="">none</option>
                <option value="timeout">timeout</option>
                <option value="invalid">invalid</option>
                <option value="broken">broken</option>
              </select>
            </label>
          )}
          <button
            className="btn btn--sm"
            onClick={() => {
              void signOut().then(() => {
                setSession(null)
                setBadges([])
                setSent(false)
              })
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="app__main">
        {mode === 'tweak' && (
          <p className="notice">
            Tweaking a saved badge — change a control, then “New look” or “Keep seed”.{' '}
            <button className="linkbtn" onClick={() => { setMode('create'); setProvenanceId(null) }}>
              cancel
            </button>
          </p>
        )}
        {notice && <p className="notice notice--warn">{notice}</p>}
        <ChipForm inputs={inputs} onChange={setInputs} onGenerate={onGenerate} busy={busy} mode={mode} />
        <h2 className="section">Your badges</h2>
        <Gallery badges={badges} onTweak={onTweak} onRetry={onRetry} />
      </main>
    </div>
  )
}
