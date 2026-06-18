# 22 · Scaffold — the Bun monorepo skeleton

> part of the [Trailmark plan](../../PLAN.md)

**Mentee step 4.** With the devShell live ([20-devshell](./20-devshell.md)) and Garage already up ([21 · process-compose](./21-process-compose.md)), lay down the empty monorepo and prove `/api/healthz` 200 **before** any badge logic. Scaffold comes **before** the full run-together: only once these packages exist do `migrate` / `server` / `web` start under `nix run .#dev`. The full app is [30-app-build-commits](./30-app-build-commits.md).

Skeleton, not the app. The contract exports **source `.ts`** so Vite transpiles it — see [ADR-0002](../adr/0002-fully-effect-native-backend.md), [ADR-0015](../adr/0015-pinned-versions.md).

## Tree

```
trailmark/
├─ package.json            # workspaces + pinned dev deps
├─ tsconfig.base.json      # shared compiler options + path aliases
├─ tsconfig.json           # solution (references)
├─ flake.nix · nix/        # from 20/21 (devshell + process-compose)
├─ packages/
│  ├─ contract/            # shared Effect Schema + HttpApi + auth TAGS (browser-safe)
│  │  ├─ package.json      #   exports "./src/index.ts"  ← SOURCE .ts
│  │  └─ src/
│  │     ├─ index.ts       # re-exports api + errors + auth tags
│  │     ├─ errors.ts      # GenTimeout/InvalidPrompt/BrokenResponse/Unauthorized/NotFound
│  │     └─ auth.ts        # Authorization + CurrentUser TAGS only (no pg/better-auth) — 15-auth.md
│  └─ db/                  # THIN: row types only (no ORM, no migrations dir)
│     ├─ package.json
│     └─ src/index.ts
├─ apps/
│  ├─ server/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ migrations/       # PgMigrator reads HERE: 0001_auth.sql (generated) → 0002_init.sql (badges)
│  │  └─ src/
│  │     ├─ main.ts        # GET /api/healthz on BunHttpServer
│  │     ├─ auth.ts        # Better Auth instance (so `bunx @better-auth/cli generate` finds it; else --config)
│  │     └─ auth-middleware.ts  # AuthorizationLive layer only (server-side getSession) — 15-auth.md
│  └─ web/
│     ├─ package.json
│     ├─ vite.config.ts
│     ├─ index.html
│     └─ src/main.tsx
```

## Root `package.json`

```json
{
  "name": "trailmark",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "typecheck": "bun run --filter '*' typecheck",
    "build": "bun run --filter '*' build"
  },
  "devDependencies": {
    "@effect/language-service": "0.86.2",
    "typescript": "6.0.3",
    "bun-types": "1.3.14"
  },
  "engines": { "bun": ">=1.1" }
}
```

Pinned runtime versions (every workspace dep — **do not bump `effect` alone**, [ADR-0015](../adr/0015-pinned-versions.md)):

```
effect@3.21.2 · @effect/platform@0.96.1 · @effect/platform-bun@0.89.0
@effect/sql@0.51.1 · @effect/sql-pg@0.52.1
# @effect/experimental ^0.60.0 arrives transitively via @effect/sql-pg — keep in lockfile
# DROP vs taprunning: hono · drizzle-orm · @effect/sql-drizzle · drizzle-kit
```

## Per-package essentials

**`packages/contract/package.json`** — exported as source so Vite/esbuild transpiles it; deps stay browser-safe (only `@effect/platform` + `effect`, never `-bun`/`sql`/`pg`).

```json
{
  "name": "@trailmark/contract",
  "version": "0.0.0", "private": true, "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "effect": "3.21.2", "@effect/platform": "0.96.1" },
  "devDependencies": { "bun-types": "1.3.14", "typescript": "6.0.3" }
}
```

**`packages/db/package.json`** — thin: row types + a `migrations/` dir for `PgMigrator`. No ORM.

```json
{
  "name": "@trailmark/db",
  "version": "0.0.0", "private": true, "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "effect": "3.21.2" },
  "devDependencies": { "typescript": "6.0.3" }
}
```

**`apps/server/package.json`**

```json
{
  "name": "@trailmark/server",
  "version": "0.0.0", "private": true, "type": "module",
  "exports": { ".": "./src/main.ts" },
  "scripts": {
    "dev": "TZ=UTC bun run --hot src/main.ts",
    "start": "TZ=UTC bun run src/main.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@effect/platform": "0.96.1",
    "@effect/platform-bun": "0.89.0",
    "@effect/sql": "0.51.1",
    "@effect/sql-pg": "0.52.1",
    "@trailmark/contract": "workspace:*",
    "@trailmark/db": "workspace:*",
    "better-auth": "1.6.19",
    "effect": "3.21.2",
    "resend": "6.14.0"
  },
  "devDependencies": { "@better-auth/cli": "latest", "bun-types": "1.3.14", "typescript": "6.0.3" }
}
```

`better-auth`/`resend` are runtime additions outside the effect peer-locked set ([ADR-0015](../adr/0015-pinned-versions.md)); `pg`'s `Pool` (used by Better Auth) already arrives transitively via `@effect/sql-pg`. `@better-auth/cli` is dev-only (tracks better-auth 1.6.x) — run `bunx @better-auth/cli generate`. Auth seam detail: [15-auth.md](./15-auth.md), [ADR-0017](../adr/0017-auth-magic-link-better-auth.md).

**`apps/web/package.json`** — imports the contract + `@effect/platform` only.

```json
{
  "name": "@trailmark/web",
  "version": "0.0.0", "private": true, "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@effect/platform": "0.96.1",
    "@trailmark/contract": "workspace:*",
    "effect": "3.21.2",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "18.3.29", "@types/react-dom": "18.3.7",
    "@vitejs/plugin-react": "6.0.2", "typescript": "6.0.3", "vite": "8.0.14"
  }
}
```

## `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@effect/language-service" }],
    "target": "ESNext", "module": "ESNext", "moduleResolution": "Bundler",
    "lib": ["ESNext", "DOM"], "jsx": "react-jsx", "moduleDetection": "force",
    "strict": true, "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true, "esModuleInterop": true,
    "skipLibCheck": true, "declaration": true, "sourceMap": true,
    "composite": true, "incremental": true, "types": ["bun-types"],
    "paths": {
      "@trailmark/contract": ["./packages/contract/src/index.ts"],
      "@trailmark/contract/*": ["./packages/contract/src/*"],
      "@trailmark/db": ["./packages/db/src/index.ts"],
      "@trailmark/db/*": ["./packages/db/src/*"]
    }
  },
  "include": [], "references": []
}
```

`apps/server/tsconfig.json` (web mirrors it): `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "composite": false, "noEmit": true, "types": ["bun-types"] }, "include": ["src/**/*"] }`.

## Smoke server — `apps/server/src/main.ts`

Minimal `/api/healthz` on `BunHttpServer` to prove "live" before any contract/DB. Replaced by the real [Effect layer](./14-effect-layer.md) in [30](./30-app-build-commits.md).

```ts
// apps/server/src/main.ts — skeleton: prove the server is live, no badge logic yet
import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Layer } from 'effect'

const router = HttpRouter.empty.pipe(
  HttpRouter.get('/api/healthz', HttpServerResponse.json({ ok: true })),
)

const HttpLive = HttpServer.serve(router).pipe(
  HttpServer.withLogAddress,
  // PORT env-driven from day one: 3000 dev default, prod injects PORT=3001. The real server keeps this.
  Layer.provide(BunHttpServer.layer({ port: Number(Bun.env.PORT ?? 3000), hostname: '127.0.0.1' })),
)

Layer.launch(HttpLive).pipe(BunRuntime.runMain)
```

## Web Vite scaffold — `apps/web/vite.config.ts`

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Absolute paths via ESM new URL(import.meta.url) — no path helper, no __dirname.
const here = (p: string) => new URL(p, import.meta.url).pathname

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@trailmark/contract': here('../../packages/contract/src/index.ts'),
      '@': here('./src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:3000' }, // dev: web → bun server
  },
  build: { outDir: 'dist', sourcemap: true },
})
```

`index.html` mounts `<div id="root">`; `src/main.tsx` is a bare `createRoot(...).render()` placeholder — real UI in [30](./30-app-build-commits.md).

## Auth-schema migration — committed, generated, single owner

The Better Auth tables (`user`/`session`/`account`/`verification`) are **not** hand-written: run `bunx @better-auth/cli generate` (reads `apps/server/src/auth.ts`) → `schema.sql` → **rename to `apps/server/migrations/0001_auth.sql`** (the dir `PgMigrator.fromFileSystem` reads — [14 §8.3](./14-effect-layer.md)), committed to the repo. It is numbered **before** `0002_init.sql` (the badges migration that adds `user_id text not null references "user"(id)`) — single PgMigrator owner, ascending order ([15-auth.md](./15-auth.md), [ADR-0017](../adr/0017-auth-magic-link-better-auth.md)). Do **not** add a second migration runner: the one `migrate` process-compose oneshot (`nix run .#dev`) creates auth + badges together.

## Commands

```bash
bun install            # one lockfile for all workspaces
nix run .#dev          # garage + garage-init + migrate + server + web together
# server-only sanity:  bun run --cwd apps/server dev
curl -s 127.0.0.1:3000/api/healthz   # -> {"ok":true}
```

## Acceptance check

- [ ] `bun install` resolves clean — one `bun.lock`, no hono/drizzle, pinned versions intact (incl. `better-auth`/`resend`).
- [ ] `bun run typecheck` passes across all workspaces.
- [ ] Under `nix run .#dev`, `GET /api/healthz` returns **200 `{"ok":true}`** via process-compose ([21-process-compose](./21-process-compose.md)).
- [ ] Vite dev server loads and proxies `/api/*` to `:3000`.

De-risks the "live URL fully working" line on day one — next: contract + [failure handling](./13-failure-handling.md) in [30-app-build-commits](./30-app-build-commits.md).
