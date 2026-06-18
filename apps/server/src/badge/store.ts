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
  BrokenResponse,
  NotFound,
} from '@trailmark/contract'
import { ObjectStorage } from '../infra/ObjectStorage.js'
import type { Emblem } from './provider.js'

// Shared projection: row columns → BadgeView field names. seed::int (our seeds are
// < 2e9, well within int4) so pg returns a JS number, not a bigint string.
const VIEW_COLS = `id, inputs, built_prompt as "builtPrompt", provider, seed::int as seed,
  image_key as "imageKey", status, error_tag as "errorTag", created_at as "createdAt"`

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

/** Gallery: the signed-in user's ready badges, newest first. */
export const listReadyBadgesNewestFirst = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<BadgeView>`
      select ${sql.unsafe(VIEW_COLS)} from badges
      where status = 'ready' and user_id = ${userId} order by created_at desc`
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
