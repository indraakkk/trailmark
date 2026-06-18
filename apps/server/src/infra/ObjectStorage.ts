// apps/server/src/infra/ObjectStorage.ts — the only abstraction over the
// S3-compatible store (Garage in dev/prod). Built ONCE inside a Layer (closes over
// the Bun S3Client; zero module-level mutable state). Keys are server-generated
// (emblems/<uuid>.jpg) — no user input ever reaches a key. Bun's S3Client is
// path-style by default (no forcePathStyle); just point `endpoint` at Garage.
import { S3Client } from 'bun'
import { Context, Data, Effect, Layer, Redacted } from 'effect'
import { S3Config } from './Config.js'

/** Infra-internal failure. `detail` is a stringified cause — never a secret. */
export class ObjectStorageError extends Data.TaggedError('ObjectStorageError')<{
  readonly op: 'put' | 'get'
  readonly detail: string
}> {}

export class ObjectStorage extends Context.Tag('ObjectStorage')<
  ObjectStorage,
  {
    readonly putObject: (
      key: string,
      bytes: Uint8Array,
      contentType: string,
    ) => Effect.Effect<void, ObjectStorageError>
    readonly getObject: (key: string) => Effect.Effect<Uint8Array, ObjectStorageError>
  }
>() {}

export const GarageLive = Layer.effect(
  ObjectStorage,
  Effect.gen(function* () {
    const cfg = yield* S3Config
    const client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      bucket: cfg.bucket,
      accessKeyId: Redacted.value(cfg.accessKeyId),
      secretAccessKey: Redacted.value(cfg.secretAccessKey),
    })

    return ObjectStorage.of({
      putObject: (key, bytes, contentType) =>
        Effect.tryPromise({
          try: () => client.write(key, bytes, { type: contentType }),
          catch: (cause) => new ObjectStorageError({ op: 'put', detail: String(cause) }),
        }).pipe(Effect.asVoid),

      getObject: (key) =>
        Effect.tryPromise({
          try: async () => new Uint8Array(await client.file(key).arrayBuffer()),
          catch: (cause) => new ObjectStorageError({ op: 'get', detail: String(cause) }),
        }),
    })
  }),
)
