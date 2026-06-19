// apps/web/src/screens/TopBar.tsx — the sticky global top bar.
//
// Brandmark (→ collection) · center nav (desktop only) · "+ New badge", the demo-failure
// control (demo account only), and the account avatar with a dropdown menu. Presentational:
// data + action callbacks arrive via props; the avatar dropdown's open/closed state lives
// here (useState), closed on any item click and on an outside-click overlay.
import { useState } from 'react'
import type { TopBarProps, View } from '../types.js'
import { FONT_DISP, FONT_UI, T } from '../theme.js'
import { initials } from '../lib.js'

export function TopBar({
  view,
  onNav,
  onNewBadge,
  email,
  onSignOut,
  isDemo,
  force,
  onForce,
  mobile,
}: TopBarProps) {
  const [accountOpen, setAccountOpen] = useState(false)

  const navBtn = (active: boolean): React.CSSProperties => ({
    background: active ? '#e7e0cf' : 'transparent',
    border: 'none',
    borderRadius: 8,
    padding: '9px 14px',
    fontFamily: FONT_UI,
    fontWeight: 600,
    fontSize: 14,
    color: active ? T.ink : T.mutedInk,
    cursor: 'pointer',
  })

  const menuItem: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    fontFamily: FONT_UI,
    fontWeight: 500,
    fontSize: 13.5,
    padding: '9px 12px',
    borderRadius: 7,
    color: T.ink,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: mobile ? '14px 18px' : '16px 36px',
        background: '#f4efe5',
        borderBottom: `1px solid ${T.hairline}`,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* LEFT — brandmark → collection */}
      <button
        type="button"
        onClick={() => onNav('collection')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `2.5px solid ${T.forest}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: `10px solid ${T.forest}`,
            }}
          />
        </div>
        <span
          style={{
            fontFamily: FONT_DISP,
            fontWeight: 700,
            fontSize: 21,
            letterSpacing: 3,
            color: T.ink,
          }}
        >
          TRAILMARK
        </span>
      </button>

      {/* CENTER NAV — desktop only */}
      {!mobile && (
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" style={navBtn(view === 'collection')} onClick={() => onNav('collection')}>
            Collection
          </button>
          <button type="button" style={navBtn(view === 'studio')} onClick={() => onNav('studio')}>
            Studio
          </button>
          <button type="button" style={navBtn(view === 'system')} onClick={() => onNav('system')}>
            Design system
          </button>
        </nav>
      )}

      {/* RIGHT */}
      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 10 : 14 }}>
        {/* + New badge */}
        <button
          type="button"
          onClick={onNewBadge}
          style={{
            background: T.forest,
            color: T.paper,
            border: 'none',
            borderRadius: 8,
            padding: '9px 15px',
            fontFamily: FONT_UI,
            fontWeight: 600,
            fontSize: 13.5,
            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>+</span>
          New badge
        </button>

        {/* Demo failure control — demo account only (dev artifact) */}
        {isDemo && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <select
              value={force}
              onChange={(e) => onForce(e.target.value as TopBarProps['force'])}
              aria-label="Demo failure mode"
              style={{
                fontFamily: FONT_UI,
                fontSize: 12,
                color: T.mutedInk,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                padding: 4,
                background: T.field,
                cursor: 'pointer',
              }}
            >
              <option value="">none</option>
              <option value="timeout">timeout</option>
              <option value="invalid">invalid</option>
              <option value="broken">broken</option>
            </select>
            <span style={{ fontFamily: FONT_UI, fontSize: 10, color: T.faint, letterSpacing: 0.5 }}>demo</span>
          </div>
        )}

        {/* Account avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setAccountOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label="Account menu"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: `1px solid ${T.border}`,
              background: '#efe9dc',
              color: '#3c5a3e',
              fontFamily: FONT_DISP,
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            {initials(email)}
          </button>

          {accountOpen && (
            <>
              {/* outside-click overlay */}
              <div
                onClick={() => setAccountOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 59, background: 'transparent' }}
              />
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 46,
                  width: 212,
                  background: '#fff',
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: 12,
                  boxShadow: '0 16px 40px rgba(40,34,24,0.18)',
                  padding: 8,
                  zIndex: 60,
                }}
              >
                <div
                  style={{
                    padding: '10px 12px 12px',
                    borderBottom: '1px solid #efe9dc',
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      fontFamily: FONT_UI,
                      fontWeight: 700,
                      fontSize: 14,
                      color: T.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {email}
                  </div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 12, color: T.mutedInk, marginTop: 2 }}>
                    Signed in
                  </div>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  style={menuItem}
                  onClick={() => {
                    setAccountOpen(false)
                    onNav('collection' as View)
                  }}
                >
                  Your collection
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={menuItem}
                  onClick={() => setAccountOpen(false)}
                >
                  Account settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={menuItem}
                  onClick={() => setAccountOpen(false)}
                >
                  Order history
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={{
                    ...menuItem,
                    color: T.rust,
                    borderTop: '1px solid #efe9dc',
                    marginTop: 4,
                    paddingTop: 11,
                  }}
                  onClick={() => {
                    setAccountOpen(false)
                    onSignOut()
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
