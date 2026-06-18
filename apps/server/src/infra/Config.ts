// apps/server/src/infra/Config.ts — env-driven config (no hardcoded secrets/hosts).
// Read ONCE inside Layers (zero module-level mutable state). Secret values stay
// out of logs. Discrete PG* is read by Db.ts; this file covers S3 + Cloudflare +
// validation/demo knobs.
import { Config } from 'effect'

// ── S3 / Garage object storage (emblem BYTES live here; rows live in Postgres) ─
export const S3Config = Config.all({
  endpoint: Config.string('S3_ENDPOINT'),
  region: Config.string('S3_REGION'),
  bucket: Config.string('S3_BUCKET'),
  accessKeyId: Config.redacted('S3_ACCESS_KEY_ID'),
  secretAccessKey: Config.redacted('S3_SECRET_ACCESS_KEY'),
})

// ── Cloudflare Workers AI (flux-1-schnell) — PRIMARY provider, server-side only ─
// Optional locally: an EMPTY token ⇒ the provider skips Cloudflare and goes
// straight to the Pollinations fallback (which needs no key). Never logged.
export const CloudflareConfig = Config.all({
  apiToken: Config.string('CF_API_TOKEN').pipe(Config.withDefault('')),
  accountId: Config.string('CF_ACCOUNT_ID').pipe(Config.withDefault('')),
})

// ── Byte-validation upper band — env-overridable so rejected sizes can be retuned
// without a redeploy (the ~1.3MB Pollinations rate-limit decoy must stay above it).
export const MaxBytes = Config.integer('MAX_BYTES').pipe(Config.withDefault(900 * 1024))

// ── Failure-demo hooks — default false; `?force=timeout|invalid|broken` is only
// honored when DEMO_HOOKS is true (a stray ?force= must never work in real prod).
export const DemoHooks = Config.boolean('DEMO_HOOKS').pipe(Config.withDefault(false))
