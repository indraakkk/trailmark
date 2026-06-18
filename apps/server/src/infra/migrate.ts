// apps/server/src/infra/migrate.ts — run migrations once at boot (a oneshot,
// BEFORE the server; mirrors taprunning's migrate→server ordering). A SINGLE
// PgMigrator owner runs apps/server/migrations in ascending order: 0001_auth.sql
// (committed Better-Auth schema) THEN 0002_init.sql (badges, which FK-references
// "user").
//
// @effect/sql's built-in fromFileSystem only loads .ts/.js migration MODULES, but
// our migrations are committed raw .sql (the auth one is a generated artifact we
// keep verbatim). So we provide a tiny custom Loader that reads *.sql in numeric
// order and executes each file statement-by-statement via the SqlClient. We strip
// `--` line comments before splitting on `;` (one comment in 0002 contains a `;`).
import { FileSystem } from '@effect/platform'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { MigrationError, type ResolvedMigration } from '@effect/sql/Migrator'
import * as PgMigrator from '@effect/sql-pg/PgMigrator'
import { Effect } from 'effect'
import { DbLive } from './Db.js'

// import.meta.dir is Bun-native — src/infra/ → ../../migrations = apps/server/migrations.
const MIGRATIONS_DIR = `${import.meta.dir}/../../migrations`

const splitStatements = (text: string): ReadonlyArray<string> =>
  text
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--')
      return i >= 0 ? line.slice(0, i) : line
    })
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

const sqlFileLoader = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const files = (yield* fs.readDirectory(MIGRATIONS_DIR))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()

  return yield* Effect.forEach(files, (file) =>
    Effect.gen(function* () {
      const [, id, name] = file.match(/^(\d+)_(.+)\.sql$/)!
      const text = yield* fs.readFileString(`${MIGRATIONS_DIR}/${file}`)
      const statements = splitStatements(text)
      // The migration effect: run every statement in this file (DDL is transactional in PG).
      const run = Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* Effect.forEach(statements, (stmt) => sql.unsafe(stmt), { discard: true })
      })
      // ResolvedMigration's 3rd element is an Effect that RETURNS the migration effect.
      return [Number(id), name, Effect.succeed(run)] as ResolvedMigration
    }),
  )
}).pipe(
  // Loader's error channel must be MigrationError; FileSystem ops raise PlatformError.
  Effect.mapError((cause) => new MigrationError({ reason: 'import-error', message: String(cause) })),
)

BunRuntime.runMain(
  PgMigrator.run({ loader: sqlFileLoader }).pipe(
    Effect.provide(DbLive),
    Effect.provide(BunContext.layer),
  ),
)
