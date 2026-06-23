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

  // ── Rate limiting (login-abuse hardening) ──────────────────────────────────
  // THE CORE FIX. Better Auth's limiter defaults to `enabled: isProduction`,
  // where isProduction is derived from NODE_ENV. Our prod systemd unit does NOT
  // set NODE_ENV=production, so the limiter would silently be OFF in the live
  // app — leaving the magic-link endpoint open to email-bombing and account
  // enumeration. Setting `enabled: true` makes throttling explicit and
  // environment-independent (it is also harmless in dev: the windows are large
  // enough that normal use never trips them).
  rateLimit: {
    enabled: true,
    // Global fallback bucket for every /api/auth/* path that has no more
    // specific rule. Better Auth's own default is 10s/100; we keep a generous
    // window here because the auth surface is tiny (a handful of session/
    // sign-in calls) and the paths we actually care about are covered by the
    // tighter rules below.
    window: 10,
    max: 100,
    // Storage: in-process Map (the default when no secondaryStorage is set).
    // Single server instance ⇒ memory is correct: it needs NO database table
    // and therefore NO migration. It resets on process restart, which is fine
    // for abuse throttling (a restart is not an attack vector, and we are not
    // trying to build a durable security audit log — that's the "no heavy
    // resilience stack" non-goal). Stated explicitly so a future reader doesn't
    // reach for `storage: "database"` and a migration they don't need.
    storage: 'memory',
    // Per-path overrides. This is config, not a framework — we lean on Better
    // Auth's built-in matcher rather than writing our own middleware.
    customRules: {
      // The expensive, abusable endpoint: each POST sends an email (Resend
      // quota) AND mints a verification token. The magic-link PLUGIN already
      // registers 60s/5 for this path, but customRules sit at the END of the
      // precedence chain (global → built-in → plugin → customRules), so we
      // restate it here as the single, obvious source of truth.
      //
      // Chosen: 60s window, 5 sends. Rationale for a small live app — balance
      // "stop the email bomb / brute enumeration" against "don't lock out a
      // real human who fat-fingered their address and legitimately needs a
      // resend". 5 per minute comfortably covers a couple of honest retries
      // (typo → resend → clicked the wrong-tab stale link → resend) while
      // capping a single IP at 5 outbound emails/min — far below anything that
      // would burn Resend quota or function as a mailbomb. Keyed per-IP (see
      // ipAddressHeaders below), so one abuser can't starve everyone.
      '/sign-in/magic-link': { window: 60, max: 5 },
    },
  },

  // ── IP detection (correct per-IP bucketing behind Caddy) ───────────────────
  // Prod runs behind Caddy on the same host; Caddy's reverse_proxy sets
  // X-Forwarded-For, which is already Better Auth's default header. We pin the
  // header list explicitly for clarity and to avoid trusting headers we don't
  // emit. If Better Auth finds no usable IP it warns and collapses everyone
  // into ONE shared per-path bucket (a real user could then be throttled by a
  // stranger's attempts) — so getting this right is what makes the limits above
  // actually "per IP". Same-origin in prod means the session cookie still flows.
  advanced: {
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
    },
  },

  plugins: [
    magicLink({
      // expiresIn defaults to 300s (5 min). disableSignUp defaults false → a
      // first-time email auto-creates an account (the behavior we want).
      //
      // We deliberately do NOT set `allowedAttempts`: in better-auth@1.6.19 a
      // magic-link token is single-use and consumed atomically on the first
      // verification (GHSA-hc7v-rggr-4hvx), and multi-attempt is no longer
      // supported — the option is a deprecated no-op (any value ≠ 1 just emits a
      // startup warning). So replay is already prevented; a failed click means
      // the user requests a fresh link, governed by the 60s/5 send limit above.
      //
      // NOTE on a per-EMAIL throttle (across IPs): intentionally NOT added.
      // The per-IP send limit above already defeats the realistic threats for a
      // small single-instance app — a single client bombing one mailbox, or
      // enumerating accounts. A cross-IP per-email cap only adds value against a
      // *distributed* botnet targeting one inbox, which is squarely in
      // "heavy resilience stack" non-goal territory and not worth the in-memory
      // bookkeeping + the risk of confusingly swallowing a legitimate resend
      // (e.g. someone signing in from phone then laptop). If it is ever needed,
      // it belongs in `customRules` as a keyed rule with a clear 429 — not as a
      // silent early-return inside sendMagicLink. See the deliverable notes.
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