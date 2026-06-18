// apps/server/src/infra/Db.ts — @effect/sql-pg over a unix socket.
//
// Discrete PG* env via Config, never a postgres:///db?host=… URL (the pg driver
// mis-parses socket URLs → silent TCP fallback). A host starting with '/' is a
// socket dir. The defaults below are the PROD values (host=/run/postgresql, user
// trailmark, peer auth); LOCAL dev overrides them via the devShell shellHook
// (host=$HOME/.local/state/postgresql/run, user indra). One code path, two envs.
import { layerConfig as PgClientLayerConfig } from '@effect/sql-pg/PgClient'
import { Config } from 'effect'

export const DbLive = PgClientLayerConfig({
  host: Config.string('PGHOST').pipe(Config.withDefault('/run/postgresql')),
  database: Config.string('PGDATABASE').pipe(Config.withDefault('trailmark')),
  username: Config.string('PGUSER').pipe(Config.withDefault('trailmark')),
})
