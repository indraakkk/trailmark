# CLAUDE.md

Guidance for working in this repo. Derived from the architecture decision records in
`docs/adr/` (ADR-0001 … ADR-0017). When a rule here conflicts with what you see in
code, the ADRs win — re-read the cited ADR before deviating, and update both the ADR
and this file if a decision genuinely changes.

## What this repo is right now

**Scaffolded and building.** The monorepo exists: `apps/server`, `apps/web`,
`packages/contract`, `packages/db`, plus `flake.nix`, `package.json`, `bun.lock`. It is a
git repository. The build is green (`bun run typecheck` / `bun run build` pass). The ADR
docs (`docs/adr/`, `docs/plan/`, `PLAN.md`) remain the authoritative "why"; this section's
old "spec-only / no source" note is obsolete.

- **Project codename:** `trailmark` (the on-disk folder is `niche`).
- **Workspace package scope:** `@trailmark/*` (`contract`, `db`, `server`, `web`).
- **Start here:** `PLAN.md` is the master build sequence and decisions index.

### UI/UX revamp (post-ADR-0017) — what changed from the original build
A major web revamp turned the flat output grid into a **per-race trophy case**. Binding
deltas (ADR-pending; update an ADR if any of these is revisited):
- **Web is screen-based, inline-styled.** `apps/web/src/App.tsx` routes four surfaces —
  `screens/Collection.tsx` (home, grouped by race: hero "keeper" + collapsible variant
  strip + a "Needs attention" area for failures), `screens/Studio.tsx` (generator),
  `screens/BadgeDetail.tsx` (share/order), `screens/DesignSystem.tsx`. Tokens live in
  `theme.ts` (`T`, `FONT_DISP`/`FONT_UI`); grouping/sort in `lib.ts`; the Studio form +
  screen prop contracts in `types.ts`. Screens use **inline styles** (the design mockup's
  idiom); `styles.css` is globals only (resets, fonts, keyframes, focus rings).
- **`Medal.tsx` replaces `BadgeOverlay.tsx`** (deleted, with `ChipForm`/`Gallery`). It is
  the **single-ink** medal: one ink per face (light face→dark ink, dark face→light ink),
  race name + distance on the arcs, finish-time/date in a palette-matched **scrim plate**
  (the legibility fix; no more white-outline). The emblem is composited **inside** the SVG
  so `exportBadgePng` still rasterizes face+emblem+type faithfully.
- **Fonts are Saira Condensed (display + medal) + Hanken Grotesk (UI)** — Oswald is gone.
- **Distance is `Union(preset | {kind:'custom',num,unit,label})`** in the contract
  (backward-compatible: legacy bare-string rows still decode). Typography-only as before —
  `buildPrompt` is unchanged and still takes only `{style,motif,palette}`.
- **New badge endpoints** (`packages/contract/src/api.ts`, all owner-scoped, 404-not-403):
  `retry` (POST `/badges/:id/retry`) re-runs a **FAILED** badge **in place** on the SAME
  row (no new tile) with its stored prompt+seed; `setKeeper`, `remove` (both return the
  refreshed collection); `credits` (GET `/credits`). `gallery` now returns **all** statuses
  (the Collection needs generating/failed too); the image proxy still guards ready-only.
- **Keeper + credits are DB-backed** (migration `0003_revamp.sql`: `badges.keeper` +
  `credits` table, default balance 20). Every generation/regenerate/retry spends one credit
  atomically; out-of-credits is a synchronous typed `OutOfCredits` (402). Tweak/regenerate
  still makes a NEW row; only **retry** mutates the failed row.

## The product (ADR-0003, ADR-0004)

Trailmark is a **trail-running finisher-badge / medal generator** — *not* a general AI
image gallery (that option was explicitly rejected). The niche shapes every decision:

- Output is a **constrained circular emblem**, repeatable, square (1024px).
- The user fills a **structured chip form** (Distance / Motif / Badge-style / Palette +
  Race name). **Never expose a raw free-text prompt.** The only free-text input is the
  race name (1–60 chars). The prompt is crafted **server-side**.
- A badge is **two layers**:
  - **Layer 1** — the AI emblem, with a deliberately **blank outer ring**. The diffusion
    model is **never** asked to render letters/numbers/text.
  - **Layer 2** — crisp **client-side SVG vector glyphs** (race name, distance, finish
    time, date), font **Oswald**, composited over the emblem.
- Persist the **raw emblem** + the **built prompt string** (`built_prompt`). Do **not**
  persist the composited text+emblem — text is re-typeset live from the row's `inputs`
  so it stays editable.

## Architecture — binding decisions

### Toolchain: Bun only (ADR-0001)
- Bun is the **only** JS runtime, package manager, and workspace driver. Do **not**
  introduce Node/npm/pnpm/yarn. Use **Bun workspaces**.
- Run any npm-registry CLI via **`bunx`** (e.g. `bunx @better-auth/cli generate`).
- Bun comes from Nix (`pkgs.bun`); bump it with `nix flake update`, not by manual install.

### Backend: fully Effect-native (ADR-0002, ADR-0015)
- **Use** `@effect/platform` **`HttpApi`** (not Hono) and **`@effect/sql-pg`** (not
  Drizzle). **Never add** `hono`, `drizzle-orm`, or `@effect/sql-drizzle`.
- **One shared contract:** the Effect `Schema` package (`packages/contract`) is the
  single source of truth for request/response/error shapes for **both** server and web.
  No second type source (no zod-as-second-source, no hand-written client types).
- Web→server calls use the **derived `HttpApiClient`**. Do **not** hand-roll
  `HttpClientRequest`.
- The three generation failures are **tagged errors declared once** in
  `packages/contract/src/errors.ts`, each with its HTTP status via
  `HttpApiSchema.annotations({ status })`:
  `GenTimeout` (504), `InvalidPrompt` (422), `BrokenResponse` (502). Do **not** write a
  `catchTags → HttpServerResponse` status mapper in handlers. Reserve `Effect.catchTag`
  for collapsing infra errors (`SqlError`, `ObjectStorageError`) into a public error/defect.
- Keep load-bearing logic (e.g. `buildPrompt`) as **plain, top-to-bottom readable code**,
  not buried in combinators (reviewers may not know Effect).

### Async generation: forkDaemon + status row (ADR-0005)
- Generation is **async-then-poll**, never a synchronous hold-open request.
  `POST /api/badges` inserts a `generating` row and returns `BadgeView{status:'generating'}`
  sub-second; the work runs detached on **`Effect.forkDaemon`** (so it outlives the
  request and keeps the app layers). The browser polls `GET /api/badges/:id` ~every 2s
  until `ready` or `failed`.
- The **row is the source of truth** for outcome (`status` = generating/ready/failed).
- Split failures by timing: `InvalidPrompt` is checked **synchronously** at submit and
  travels on the HTTP error channel (422). `GenTimeout`/`BrokenResponse` are **eventual**
  — record them on the row (`markFailed`, `error_tag`) and surface via poll/gallery.
- Keep `idleTimeout: 60` on `BunHttpServer.layer(...)` as headroom — do not remove it.

### Image providers: Cloudflare primary, Pollinations fallback (ADR-0006)
- **Two real vendors:** Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell`
  (primary) → on `BrokenResponse`, `Effect.catchTag` fails over to **Pollinations flux**.
  Failover means a *different vendor*, not a single-vendor retry.
- **Different decode paths** — do not share one parser. Cloudflare returns base64 JSON
  (`body.result?.image ?? body.image`, strip any `data:image/...;base64,` prefix);
  Pollinations returns raw bytes.
- **HTTP 200 ≠ success.** Validate **decoded bytes**: magic number must be PNG
  (`89 50 4E 47`) or JPEG (`FF D8 FF`) **and** length in band —
  `MIN_BYTES = 8*1024`, `MAX_BYTES = 900*1024` (real images ~40–200 KB). Reject the
  ~1.3 MB Pollinations rate-limit decoy (`POLLINATIONS_PLACEHOLDER = 1_300_000`).
  `MAX_BYTES` must be **env-overridable** and rejected sizes **logged**.
- Cloudflare `success:false`/moderation → `InvalidPrompt` (422, **non-transient**, no
  failover, no retry). Only `BrokenResponse` (502) is failover-eligible. `GenTimeout`
  (504, overall bound 35s via `Effect.timeoutFail`) is never retried/failed over.
- Server-side only — keep `CF_API_TOKEN` / `CF_ACCOUNT_ID` off the client. Don't send
  width/height to flux-schnell (square; ignored). `MAX_PROMPT = 2048`, validated pre-flight.

### Storage: Garage (S3) for bytes, Postgres for rows (ADR-0007, 0011, 0012, 0013)
- **Two stores, fixed roles:** emblem **bytes** → self-hosted **Garage** (S3, $0,
  loopback-only); gallery **rows** → **Postgres**. No blobs in Postgres `bytea`; no
  managed S3 (AWS/R2 rejected).
- Object key is exactly `emblems/<id>.jpg`, keyed by a **server-generated uuid**.
- **Write order is load-bearing:** generate uuid → **PUT to Garage first** (idempotent by
  key) → **then** INSERT/UPDATE the Postgres row.
- The browser **never** touches Garage. Images stream through the server proxy
  `GET /api/badges/:id/image` (keeps S3 private + avoids canvas-taint on export).
- S3 client = Bun's built-in `S3Client` (`import { S3Client } from 'bun'`). It is
  **path-style by default with no `forcePathStyle` option** — do not set it; just point
  `endpoint` at the Garage URL. Bucket is `trailmark`, region `garage`, in dev and prod.
- Garage ports are loopback only: s3 `3900`, rpc `3901`, admin `3903`; never firewall-open.
  Single instance ⇒ `replication_factor = 1`.
- **Bootstrap gates on `garage status` (RPC-ready), NOT `/health`** — a fresh single
  instance has no quorum, so `/health` returns 503 and a `/health` gate self-deadlocks.
  (Dev process-compose may use a `/health` readiness gate only because `garage-init`
  waits on `garage status` internally; prod bootstrap deliberately diverges.)
- **Engine differs by environment:** dev (ADR-0012) uses `db_engine = sqlite`; prod
  (ADR-0013) uses `db_engine = "lmdb"`. Match the target; don't copy one into the other.
- Postgres is **never** a process-compose service (ADR-0011). Local = the always-on
  shared **indra-nix-home** server over a unix socket (peer auth); the devShell
  `shellHook` runs a guarded `createdb trailmark`.

### Auth: magic-link via Better Auth + Resend (ADR-0017)
- Per-user **private galleries** — each user sees only their own badges. Use **Better
  Auth's magic-link plugin** + **Resend** for email. Do not hand-roll auth.
- Better Auth owns **exactly** `/api/auth/*`, mounted as a raw web handler
  (`auth.handler`) via `HttpRouter.mountApp(..., { includePrefix: true })`, **before** the
  catch-all. This is the **one** deliberate non-Effect seam — do not expand it; everything
  else stays HttpApi / Schema / tagged-errors.
- Session = Better Auth's default **httpOnly cookie** (no JWT). The image route must stay
  **same-origin** so the cookie flows.
- `CurrentUser` `HttpApiMiddleware` calls `auth.api.getSession({ headers })`; null →
  typed `Unauthorized` (401).
- **Data isolation:** gallery `GET /api/badges` scopes `WHERE user_id = <current user>`;
  generate inserts stamp the owner. Ownership violations on single-badge/image routes
  return **404, not 403**, so existence never leaks.
- Auth schema is **generated and committed**: `bunx @better-auth/cli generate` →
  `apps/server/migrations/0001_auth.sql`. A **single PgMigrator** runs migrations in
  ascending order; `0001_auth.sql` runs **before** `0002_init.sql`. Better Auth reuses the
  `pg` driver (`Pool` reading `PG*` env) that arrives transitively via `@effect/sql-pg`.
- `badges.user_id` is `text NOT NULL REFERENCES "user"(id)` — `user` is reserved, quote it.

## Pinned versions (ADR-0015) — move as a set, never piecemeal

Effect peer-locked set (verified, taprunning-parity). **Never bump `effect` alone**; if a
bump is needed, bump the whole set and typecheck. Do not float to `latest` or the 4.0 beta.

```
effect@3.21.2
@effect/platform@0.96.1
@effect/platform-bun@0.89.0
@effect/sql@0.51.1
@effect/sql-pg@0.52.1
@effect/experimental ^0.60.0   # transitive via @effect/sql-pg — keep in lockfile
```

Outside the locked set: `better-auth@1.6.19` (newest 1.6.x), `resend@6.14.0`,
`@better-auth/cli` (dev). **`pg@8.21.0` + `@types/pg@8.20.0` are pinned as direct
`apps/server` deps** — under bun's **isolated linker** (per-workspace `node_modules`,
the proven taprunning setup) transitive `pg` is *not* reachable from app code, so
`auth.ts`'s `import { Pool } from 'pg'` needs a direct dep. Pin pg to the **exact
version `@effect/sql-pg@0.52.1` resolves (8.21.0)** so both share ONE `pg-types`
singleton (no drift). This supersedes the earlier "never add pg directly" rule,
which assumed a hoisting linker. Re-check the pin on any `@effect/sql-pg` bump.
Other pins: TypeScript `6.0.3`, Vite `8.0.14`, React `18.3.1`, `bun2nix 2.0.8`,
Postgres `16` (`postgresql_16`).

## Commands (all PLANNED — nothing runs until scaffolded)

Sourced from `docs/plan/` (chiefly 20–25). Treat as the intended contract, not as live.

```bash
# Dev environment (plain Nix flake — NOT devenv, ADR-0010)
nix develop                       # devShell: bun postgresql_16 git jq yq-go gh bun2nix
nix flake check                   # eval devShell + flake across systems
nix run .#dev                     # process-compose: garage + garage-init + migrate + server + web

# Workspace (Bun)
bun install                       # one lockfile for all workspaces
bun run typecheck                 # bun run --filter '*' typecheck   (per-pkg: tsc --noEmit)
bun run build                     # bun run --filter '*' build
bun run --cwd apps/server dev     # TZ=UTC bun run --hot src/main.ts
bun run --cwd apps/web dev        # vite (:5173, proxies /api → :3000)
bun run --cwd apps/server migrate # PgMigrator oneshot (see gap below)

# Auth schema (generated artifact, committed)
bunx @better-auth/cli generate    # → rename output to apps/server/migrations/0001_auth.sql

# Smoke
curl -s 127.0.0.1:3000/api/healthz   # expects {"ok":true}
```

Local ports: server `3000` (PORT-driven; prod injects `3001`), web `5173`, garage
`3900/3901/3903` (all `127.0.0.1`).

> **Doc gap to resolve at scaffold time:** process-compose and the README call
> `bun run --cwd apps/server migrate` / `bun run migrate`, but the scaffolded
> `apps/server/package.json` only defines `dev`/`start`/`typecheck`. Add a `migrate`
> script (entrypoint `apps/server/src/infra/migrate.ts`) when scaffolding.

## Deploy (ADR-0008, 0009, 0014) — self-hosted clan.lol, $0

- Target is the existing **clan.lol / NixOS box `tap`** (`root@43.133.128.143`), **not** a
  managed PaaS. Trailmark is a **second app coexisting** with `taprunning` on `tap` —
  full isolation: own unit `trailmark-server` on `127.0.0.1:3001` (taprunning uses 3000),
  own Caddy vhost `trailmark.duckdns.org` (flat DuckDNS record), own Postgres db+role
  `trailmark` (peer auth, no password), own Garage bucket `trailmark`.
- **Cross-repo:** this repo ships a `nixosModule` + app package (via `bun2nix`/`mkBunApp`);
  the **separate `taprunning` repo** consumes it as a **pinned** flake input and owns the
  clan inventory. **Primary deploy runs from the taprunning repo:**
  `nix run .#clan-cli -- machines update tap`.
- Migrations run as a `trailmark-migrate` oneshot (Effect `PgMigrator`, **not** drizzle-kit)
  ordered `After=`/`Requires=` **both** `postgresql.service` **and** `postgresql-setup.service`,
  before `trailmark-server`.
- Use discrete `PGHOST=/run/postgresql` / `PGUSER=trailmark` / `PGDATABASE=trailmark` —
  **never a `DATABASE_URL`** socket URL (the `pg` driver mis-parses it into a TCP fallback).
- Secrets via sops/clan-vars + systemd `LoadCredential` (never plain `environment=`):
  `CF_API_TOKEN`, `CF_ACCOUNT_ID`, garage key/secret, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`.
- **CI fallback** (ADR-0014): a GitHub Actions workflow mirroring
  `taprunning/.github/workflows/deploy.yml`, on `ubuntu-latest` (builds `x86_64-linux`
  **natively** — do not cross-build from the aarch64 mac), run **on demand** (dispatch /
  release branch), **not** per-PR. Pre-deploy proof: `nix build .#packages.x86_64-linux.trailmark -L`.

## Hard non-goals — DO NOT build (ADR-0016)

This is a tight take-home surface; deferred concerns are documented trade-offs, not omissions.

- ❌ Job queue / Redis / worker pool — `forkDaemon` + status row is the mechanism.
- ❌ Cross-store transactions / compensating delete / orphan GC — a crash between the
  Garage PUT and the Postgres write leaves a harmless GC-able orphan (accepted limitation).
- ❌ Multiple aspect ratios / non-square badges — flux-schnell is natively square.
- ❌ Heavy resilience stack (single-flight `Ref`, jitter/spaced-cap schedules, status state
  machine). Policy is a 2-retry transient policy + provider fallback — nothing more.
- ❌ `HttpApiSwagger`, security middleware for 4 endpoints, `@effect/sql-drizzle`,
  hand-rolled `HttpClientRequest`.
- (The original "no auth" non-goal was **reversed** by ADR-0017 — auth is now in scope.)

## Gotchas

- **buildPrompt** (`apps/server/src/badge/buildPrompt.ts`) must be **pure & deterministic**
  — a lookup-table assembler (named tables STYLE/MOTIF/PALETTE/COMPOSITION/RING_RESERVATION/
  QUALITY_SUFFIX/AVOID), fixed slot order, **takes only `{style, motif, palette}`**
  (raceName/finishTime/date are typography-only and never sent to the model). Keep the unit
  test asserting the 3 example prompts.
- **Double text-suppression is load-bearing**, not redundant: "no text / no letters / no
  numbers" appears in **both** the RING_RESERVATION and AVOID clauses — do not "clean it up".
  It is the deliberate demonstration of the model's limitations (~40% of the grade).
- **Export = inline the emblem:** the overlay `<image href>` must be **same-origin** (the
  `/api/badges/:id/image` proxy) — never the provider URL. For PNG export, `exportBadgePng`
  **fetches the emblem and inlines it as a base64 `data:` URL** before serializing: an SVG
  loaded into `<img>` renders in *restricted mode* and will **not** fetch an external
  `<image href>`, so a referenced emblem rasterizes blank (text-only — the bug this fixed).
  The same-origin fetch carries the session cookie and keeps the canvas untainted (no
  `toBlob` `SecurityError`). Also set explicit `width/height` on the clone (Firefox).
- **Web-font race:** `await document.fonts.ready` before rasterizing SVG→PNG, or text falls
  back to the wrong font.
- **Re-generation (Tweak) creates a NEW row** owned by the current user — never mutate the
  original. (Post-revamp the Studio's single "Generate" always rolls a fresh seed; the old
  "Keep seed" affordance was dropped.) **Exception — `retry`:** retrying a **FAILED** badge
  re-runs generation **in place on the SAME row** (`markGeneratingForRetry` flips it
  failed→generating; no new tile), reusing the row's stored `built_prompt` + `seed`.
- **Generated / single-owner artifacts — do not hand-edit:** `0001_auth.sql`
  (regenerate via the better-auth CLI), `bun.lock.nix` (regenerate via `bun2nix` whenever
  `bun.lock` changes), `bun.lock`, and `dist/` build outputs.
- **Failure-demo hooks:** `?force=timeout|invalid|broken` deterministically trigger the 3
  failure states on camera, gated **server-side to the demo account** (`DEMO_ACCOUNT_EMAIL`,
  default `indrakoslab@gmail.com`; empty disables — supersedes the old `DEMO_HOOKS` bool).
  The compare is case-insensitive/trimmed/fail-closed in `submit.ts`; the web `<select>` is
  cosmetic-only. `invalid` is synchronous (422 on the POST, no row); `timeout`/`broken`
  settle on the row and surface via poll.
- **Reference repos** (outside this dir, for copying patterns): `~/SaaS/taprunning`
  (clan flake, process-compose, `mkBunApp`, clanServices, `ObjectStorage.ts`) and
  `~/indra-nix-home` (the shared Postgres). `RESEND_API_KEY` is optional locally — when
  unset, skip the email and use the magic link printed to the server log.

## Where the decisions live

- `PLAN.md` — master build sequence and decisions index.
- `docs/adr/` — the authoritative "why" (written before code). Index: `docs/adr/README.md`.
  - 0001 Bun · 0002 Effect-native backend · 0003 niche · 0004 two-layer badge ·
    0005 async+poll · 0006 image providers · 0007 storage/Garage · 0008 deploy/clan ·
    0009 second app on tap · 0010 nix devShell · 0011 local Postgres · 0012 local Garage ·
    0013 prod Garage · 0014 CI fallback · 0015 pinned versions · 0016 non-goals · 0017 auth.
- `docs/plan/` — sequenced implementation chunks (10–15 product/design/auth/effect-layer,
  20–25 infra/devshell/scaffold/deploy/CI, 30–33 app-build/proof/scope/gotchas).
