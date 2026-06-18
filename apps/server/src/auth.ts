// apps/server/src/auth.ts — the Better Auth server instance (the ONE deliberate
// non-Effect seam). Lives at apps/server/src/ so `bunx @better-auth/cli generate`
// finds it. Owns exactly /api/auth/* (mounted as a raw web handler beside the
// HttpApi router — see auth-middleware.ts + main.ts). NEVER imported by the
// contract (it pulls pg/better-auth/resend — server-only).
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { Pool } from 'pg'
import { Resend } from 'resend'

// Optional locally: if RESEND_API_KEY is unset we skip the send and rely on the
// logged magic link (the reliable local/demo login path).
const resend = process.env['RESEND_API_KEY'] ? new Resend(process.env['RESEND_API_KEY']) : null

export const auth = betterAuth({
  // betterAuth() auto-reads BETTER_AUTH_SECRET + BETTER_AUTH_URL from env.
  // new Pool() reads PGHOST/PGUSER/PGDATABASE/PGPORT/PGPASSWORD — that is the pg
  // driver's env support, NOT Better Auth. No DATABASE_URL is passed.
  database: new Pool(),
  // Dev serves the web from :5173 (Vite) proxying /api → :3000, so the browser
  // Origin (localhost:5173) ≠ BETTER_AUTH_URL (localhost:3000) and Better Auth's
  // CSRF origin check 403s the magic-link POST. Trust the Vite dev origin. In prod
  // web+server are same-origin so this is a no-op. Override via csv env if needed.
  trustedOrigins: process.env['BETTER_AUTH_TRUSTED_ORIGINS']?.split(',').map((s) => s.trim()) ?? [
    'http://localhost:5173',
  ],
  plugins: [
    magicLink({
      // expiresIn defaults to 300s (5 min). disableSignUp defaults false → a
      // first-time email auto-creates an account (the behavior we want).
      sendMagicLink: async ({ email, url }) => {
        // 1) ALWAYS log a structured line — debugging + reliable local/demo login.
        console.log(`[magic-link] email=${email} url=${url}`)

        // 2) Conditionally send via Resend (sandbox only delivers to the account owner).
        if (!resend) return
        const { error } = await resend.emails.send({
          from: 'Trailmark <onboarding@resend.dev>',
          to: [email],
          subject: 'Your Trailmark sign-in link',
          html: `<p>Sign in to Trailmark:</p><p><a href="${url}">${url}</a></p>`,
        })
        if (error) console.error('[magic-link] resend send failed; use the logged link', error)
      },
    }),
  ],
})
