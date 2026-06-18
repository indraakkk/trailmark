// apps/web/src/main.tsx — placeholder mount. Real UI (sign-in, chip form, live
// typography preview, gallery, regenerate) lands in the app-build phase
// (docs/plan/10-product.md, docs/plan/30-app-build-commits.md).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <main style={{ fontFamily: "'Oswald', sans-serif", padding: 48, textAlign: 'center' }}>
      <h1>Trailmark</h1>
      <p>Finisher-badge generator — scaffold is live. UI coming next.</p>
    </main>
  </StrictMode>,
)
