// apps/server/src/main.ts — SKELETON: prove the server is live before any badge
// logic. Replaced by the real Effect HttpApi server (docs/plan/14-effect-layer.md)
// during the app-build phase (docs/plan/30-app-build-commits.md).
import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Layer } from 'effect'

const router = HttpRouter.empty.pipe(
  HttpRouter.get('/api/healthz', HttpServerResponse.json({ ok: true })),
)

const HttpLive = HttpServer.serve(router).pipe(
  HttpServer.withLogAddress,
  // PORT env-driven from day one: 3000 dev default; prod injects PORT=3001. The real server keeps this.
  Layer.provide(BunHttpServer.layer({ port: Number(Bun.env['PORT'] ?? 3000), hostname: '127.0.0.1' })),
)

Layer.launch(HttpLive).pipe(BunRuntime.runMain)
