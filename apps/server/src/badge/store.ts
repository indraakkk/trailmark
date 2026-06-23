// apps/server/src/badge/store.ts — Postgres rows + Garage bytes, scoped to a user.
//
// Concurrency rules (the "correct under concurrent load" line): no module-level
// mutable state; every query runs on the request fiber via the pooled SqlClient;
// object keys are server-generated uuids (never user input). Two-store write order
// is load-bearing: Garage PUT FIRST (idempotent by key) THEN the row update — a
// crash between them leaves a harmless GC-able orphan (accepted; no cross-store txn).
//
// Error policy: infra errors are collapsed — SqlError → defect (Effect.die → 500);
// ObjectStorageError on PUT → BrokenResponse (the fork records it on the row);
// ObjectStorageError on GET (missing object) → NotFound. Public errors stay typed.
import { SqlClient } from '@effect/sql'
import { Effect } from 'effect'
import {
  type BadgeErrorTag,
  type BadgeInputs,
  type BadgeView,
  type CreditsView,
  BrokenResponse,
  NotFound,
} from '@trailmark/contract'
import { ObjectStorage } from '../infra/ObjectStorage.js'
import type { Emblem } from './provider.js'

// Shared projection: row columns → BadgeView field names. seed::int (our seeds are
// < 2e9, well within int4) so pg returns a JS number, not a bigint string. image_key
// is deliberately NOT projected — it stays server-internal (the client uses the proxy).
const VIEW_COLS = `id, inputs, built_prompt as "builtPrompt", provider, seed::int as seed,
  status, error_tag as "errorTag", keeper, created_at as "createdAt"`

export const emblemKey = (id: string) => `emblems/${id}.jpg`

/** Insert an owner-stamped generating row and return its BadgeView (sub-second). */
export const insertGenerating = (args: {
  inputs: BadgeInputs
  builtPrompt: string
  seed: number
  userId: string
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<BadgeView>`
      insert into badges (inputs, built_prompt, seed, user_id)
      values (${JSON.stringify(args.inputs)}::jsonb, ${args.builtPrompt}, ${args.seed}, ${args.userId})
      returning ${sql.unsafe(VIEW_COLS)}`
    const row = rows[0]
    if (!row) return yield* Effect.die(new Error('insert returned no row'))
    return row
  }).pipe(Effect.catchTag('SqlError', Effect.die))

/** Garage PUT first (idempotent by key), THEN flip the row to ready with the key + provider. */
export const putEmblemThenMarkReady = (id: string, emblem: Emblem) =>
  Effect.gen(function* () {
    const store = yield* ObjectStorage
    const sql = yield* SqlClient.SqlClient
    const key = emblemKey(id)
    const contentType = emblem.bytes[0] === 0x89 ? 'image/png' : 'image/jpeg' // PNG magic byte
    yield* store
      .putObject(key, emblem.bytes, contentType)
      .pipe(Effect.mapError((e) => new BrokenResponse({ detail: `garage put: ${e.detail}` })))
    yield* sql`
      update badges set status = 'ready', image_key = ${key}, provider = ${emblem.provider}, updated_at = now()
      where id = ${id}`.pipe(Effect.catchTag('SqlError', Effect.die))
  })

/** Record an eventual failure on the row (surfaced via poll/gallery with a retry button). */
export const markFailed = (id: string, errorTag: BadgeErrorTag, detail: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* Effect.logWarning(`[badge] ${id} failed: ${errorTag} — ${detail}`)
    yield* sql`
      update badges set status = 'failed', error_tag = ${errorTag}::badge_error_tag, updated_at = now()
      where id = ${id}`
  }).pipe(Effect.catchTag('SqlError', Effect.die))

/** Gallery: ALL of the signed-in user's badges (any status), newest first. */
export const listBadgesNewestFirst = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<BadgeView>`
      select ${sql.unsafe(VIEW_COLS)} from badges
      where user_id = ${userId} order by created_at desc`
  }).pipe(Effect.catchTag('SqlError', Effect.die))

/** Poll: a single owned badge (any status). Non-owner OR missing → NotFound (404, never 403). */
export const getOwnedBadge = (id: string, userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<BadgeView>`
      select ${sql.unsafe(VIEW_COLS)} from badges where id = ${id} and user_id = ${userId}`.pipe(
      Effect.catchTag('SqlError', Effect.die),
    )
    const row = rows[0]
    if (!row) return yield* new NotFound()
    return row
  })

/** Image proxy: owned + ready emblem bytes. Non-owner/missing/not-ready → NotFound. */
export const getOwnedEmblem = (id: string, userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const store = yield* ObjectStorage
    const rows = yield* sql<{ imageKey: string | null; status: string }>`
      select image_key as "imageKey", status from badges where id = ${id} and user_id = ${userId}`.pipe(
      Effect.catchTag('SqlError', Effect.die),
    )
    const row = rows[0]
    if (!row || row.status !== 'ready' || !row.imageKey) return yield* new NotFound()
    return yield* store.getObject(row.imageKey).pipe(Effect.catchTag('ObjectStorageError', () => new NotFound()))
  })

/**
 * Promote a badge to its race's keeper. Ownership-checked (missing/non-owner → NotFound).
 * The race key is the badge's normalized raceName (lower + btrim). ONE update flips keeper
 * across every ready sibling of this user/race: only the target id wins, all others off.
 * Returns the refreshed full collection. (A generating/failed target is not "ready", so
 * `keeper` won't actually stick to it — keeper is meaningful only on a ready hero.)
 */
export const setKeeper = (id: string, userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // Verify ownership first so a non-owner / missing id leaks nothing (404, not 403).
    const owned = yield* sql<{ id: string }>`
      select id from badges where id = ${id} and user_id = ${userId}`.pipe(
      Effect.catchTag('SqlError', Effect.die),
    )
    if (!owned[0]) return yield* new NotFound()
    // One pass over the user's ready badges sharing this race key: target → keeper, rest → off.
    yield* sql`
      update badges set keeper = (id = ${id}), updated_at = now()
      where user_id = ${userId}
        and status = 'ready'
        and lower(btrim(inputs->>'raceName')) = (
          select lower(btrim(inputs->>'raceName')) from badges where id = ${id}
        )`.pipe(Effect.catchTag('SqlError', Effect.die))
    return yield* listBadgesNewestFirst(userId)
  })

/**
 * Delete an owned badge row. Missing/non-owner → NotFound (404, never 403). The Garage
 * object is intentionally NOT removed — a dangling emblem is a harmless GC-able orphan
 * (ADR-0016: no cross-store compensating delete). Returns the refreshed collection.
 */
export const deleteBadge = (id: string, userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const deleted = yield* sql<{ id: string }>`
      delete from badges where id = ${id} and user_id = ${userId} returning id`.pipe(
      Effect.catchTag('SqlError', Effect.die),
    )
    if (!deleted[0]) return yield* new NotFound()
    return yield* listBadgesNewestFirst(userId)
  })

// ── Credits: a per-user soft generation guardrail (ADR-0016) ────────────────────
// The row is created lazily (first touch) so existing/seeded users need no backfill.

/** Idempotently ensure the user has a credits row (default starting balance). */
export const ensureCredits = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      insert into credits (user_id) values (${userId})
      on conflict (user_id) do nothing`
  }).pipe(Effect.catchTag('SqlError', Effect.die))

/**
 * Atomically spend one credit. Returns the NEW balance, or null when the user is out
 * (no row updated because balance was already 0). The `balance > 0` guard makes the
 * decrement race-safe under concurrent submits (no double-spend below zero).
 */
export const spendCredit = (userId: string) =>
  Effect.gen(function* () {
    yield* ensureCredits(userId)
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ balance: number }>`
      update credits set balance = balance - 1
      where user_id = ${userId} and balance > 0
      returning balance`.pipe(Effect.catchTag('SqlError', Effect.die))
    return rows[0]?.balance ?? null
  })

/** Refund one credit. Used when a retry spent a credit but then couldn't proceed
 *  (e.g. the target turned out not to be retryable). No upper cap — refunds only ever
 *  undo a spend, so the balance can't exceed where it started. */
export const refundCredit = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`update credits set balance = balance + 1 where user_id = ${userId}`
  }).pipe(Effect.catchTag('SqlError', Effect.die))

/** Read the user's remaining credits (ensures the row first). */
export const getCredits = (userId: string): Effect.Effect<CreditsView, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    yield* ensureCredits(userId)
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ balance: number }>`
      select balance from credits where user_id = ${userId}`.pipe(Effect.catchTag('SqlError', Effect.die))
    return { balance: rows[0]?.balance ?? 0 }
  })

/**
 * Flip an owned FAILED badge back to generating for an in-place retry. Missing / non-owner /
 * not-failed → NotFound (the row stays untouched). Returns the stored builtPrompt + seed (to
 * re-fork the SAME generation) and the projected (now 'generating') BadgeView for the response.
 */
export const markGeneratingForRetry = (id: string, userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<BadgeView & { builtPrompt: string; seed: number }>`
      update badges set status = 'generating', error_tag = null, updated_at = now()
      where id = ${id} and user_id = ${userId} and status = 'failed'
      returning ${sql.unsafe(VIEW_COLS)}`.pipe(Effect.catchTag('SqlError', Effect.die))
    const row = rows[0]
    if (!row) return yield* new NotFound()
    return { builtPrompt: row.builtPrompt, seed: row.seed, view: row as BadgeView }
  })
