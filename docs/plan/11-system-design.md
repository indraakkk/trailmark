# System design / App journey
> part of the [Trailmark plan](../../PLAN.md)

This section ≈ your submission's "Thinking". The async+poll flow is recorded in [ADR-0005](../adr/0005-async-poll-generation.md); the three typed failure states it produces are detailed in [failure handling](./13-failure-handling.md). The two-layer emblem+typography model is [ADR-0004](../adr/0004-two-layer-emblem-typography.md). Every badge request is scoped to the signed-in user via magic-link auth — [auth](./15-auth.md), [ADR-0017](../adr/0017-auth-magic-link-better-auth.md).

## 4.1 The request journey (the specific, graded version)

```
                 ┌─────────────────────────── your clan.lol / NixOS box ───────────────────────────┐
  Browser        │  Caddy (TLS, :443)            Bun + Effect server (:3001 on tap, 127.0.0.1)     │
  (React SPA)    │  ├─ /            → static SPA  /api/auth/* → Better Auth (raw web handler)         │
     │           │  └─ /api/*       → reverse_proxy   /api/badges/* → HttpApi (BunHttpServer)        │
     │ 0a. POST /api/auth/sign-in/magic-link {email} → emails + LOGS clickable link                  │
     ├──────────────────────────────────────────────────────────►  Better Auth issues link         │
     │ 0b. click link → GET /api/auth/… → sets httpOnly session cookie ──► signed in                 │
     │ 1. POST /api/badges {inputs, seed}  (cookie ⇒ CurrentUser)│                                  │
     ├──────────────────────────────────────────────────────────►  2. getSession→userId (else 401) │
     │                                                           │     validate (InvalidPrompt?)    │
     │                                                           │     insert row user_id+generating│
     │ ◄──────── 3. 202-ish: BadgeView{ id, status:'generating' }│     forkDaemon(generate…) ───┐   │
     │                                                           │                              │   │
     │ 4. poll GET /api/badges/:id  (every ~2s)                  │   ┌──────────────────────────▼─┐ │
     ├──────────────────────────────────────────────────────────►   │ buildPrompt(inputs)         │ │
     │ ◄──────── status:'generating' … 'generating' …            │   │ Cloudflare flux-1-schnell   │ │  ← free, server-side only
     │                                                           │   │   timeout 30s → GenTimeout  │ │
     │                                                           │   │   retry transient only      │ │
     │                                                           │   │   on fail → Pollinations    │ │  ← free fallback (diff vendor)
     │                                                           │   │ validate bytes(magic+size)  │ │  ← BrokenResponse gate
     │                                                           │   │ Garage PUT emblems/<id>.jpg │ │  ← server-side storage you run
     │                                                           │   │ UPDATE row → ready+image_key│ │
     │                                                           │   └─────────────────────────────┘ │
     │ 5. poll returns status:'ready', imageUrl:/api/badges/:id/image                                │
     │ 6. React composites SVG typography over the emblem → user sees & can download the badge       │
     └──────────────────────────────────────────────────────────────────────────────────────────────┘
  Postgres (Nix, unix socket): gallery rows  ·  Garage (S3, loopback): emblem bytes
```

> **Ports:** on `tap` the Trailmark server listens on **:3001** behind Caddy (`:3000` is taprunning's). Local dev uses **:3000** (`PORT` is env-driven — [14 · Effect layer](./14-effect-layer.md), [24 · deploy](./24-deploy.md)).

Numbered for the doc:
0. User enters an email → React POSTs `/api/auth/sign-in/magic-link`. Better Auth emails **and logs** a clickable link; clicking it sets an **httpOnly session cookie**. Every `/api/badges/*` request below carries that cookie; the `CurrentUser` middleware resolves it via `auth.api.getSession` (no session → `Unauthorized` 401). Owner mismatch → **404** (never leak existence). See [auth](./15-auth.md).
1. User taps chips + types a race name; clicks **Generate**. React POSTs the structured `{inputs, seed}` to **your backend** (never the image API directly).
2. Backend validates the prompt, inserts a `generating` row, **forks** the generation, and returns the row id immediately.
3. The forked work builds the crafted prompt and calls **Cloudflare flux-schnell server-side** (key stays on the server). Timeout/retry/fallback wrap it.
4. The emblem bytes are validated (real image, sane size) and written to **Garage** (S3 you host); the row flips to `ready` with the object key — or `failed` with a typed `error_tag`.
5. The browser **polls** `GET /api/badges/:id` until `ready`/`failed`, then loads the emblem from **your** `/api/badges/:id/image` proxy.
6. React composites the **crisp SVG typography** over the emblem. The gallery (`GET /api/badges`) lists the **authenticated user's** ready badges newest-first (`WHERE user_id = current user`) and survives refresh (it's Postgres-backed).

## 4.2 Data model (`@effect/sql-pg`, not Drizzle — one table)

One row per generation. Migration as a single numbered SQL file run by `PgMigrator` at boot (or a `create table if not exists` boot effect — both fully Effect-native; pick the migrator for the "real work" optics).

```sql
-- apps/server/migrations/0002_init.sql — runs AFTER 0001_auth.sql (the committed Better Auth schema); gen_random_uuid() is core in PG13+
create type badge_status    as enum ('generating','ready','failed');
create type badge_error_tag as enum ('GenTimeout','InvalidPrompt','BrokenResponse'); -- 1:1 with the Effect errors

create table badges (
  id            uuid primary key default gen_random_uuid(),
  inputs        jsonb        not null,          -- full BadgeInputs: source of truth for re-typeset + re-gen
  built_prompt  text         not null,          -- exact deterministic string sent to the model (demo gold)
  provider      text         not null,          -- 'cloudflare' | 'pollinations'
  seed          bigint       not null,          -- reused for "keep seed"
  image_key     text,                           -- Garage key emblems/<id>.jpg; null until ready
  status        badge_status not null default 'generating',
  error_tag     badge_error_tag,                -- null unless status='failed'
  user_id       text         not null references "user"(id), -- owner; "user" is reserved → quoted
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);
create index badges_created_at_idx       on badges (created_at desc);
create index badges_ready_created_idx    on badges (created_at desc) where status = 'ready';
create index badges_user_id_idx          on badges (user_id);
```

Design notes:
- `inputs` jsonb is the **source of truth** — both re-generation and the gallery's live re-typeset read straight from it. We deliberately **do not** persist the composited PNG (only the emblem in Garage); text is cheap to redraw and keeping it editable is the feature.
- `seed` is a real column (not buried in jsonb) so "keep seed" is a trivial `SELECT seed`.
- `error_tag` enum is **1:1** with the three Effect tagged errors, so a failed row reproduces its failure state in the gallery with a retry button.
- `user_id` FK references Better Auth's `"user"` table. The Better Auth `user`/`session`/`account`/`verification` tables come from a **committed generated migration** (`bunx @better-auth/cli generate` → `0001_auth.sql`) that runs **before** this `0002_init.sql` badges migration — never hand-write them. See [auth](./15-auth.md), [scaffold](./22-scaffold.md).

## 4.3 Concurrency & correctness (the 35% "correct under concurrent load" line)

Verified rules — follow them and concurrent users Just Work:
- **Zero module-level mutable state.** Build the Garage S3 client and the Cloudflare token **once inside a Layer** (`Layer.effect`, closing over them); never reassign. Each request runs on its own fiber → per-request locals are safe. That fiber now also carries the **authenticated user identity** (`CurrentUser`), so scoping is just `user.userId` in the query — no shared state.
- If you need to cap concurrent provider calls (CF free tier is rate-limited), use `Effect.makeSemaphore(N)` inside the provider Layer (copy taprunning's `StravaApi` semaphore). Don't hand-roll a queue.
- **Two-store write order:** generate uuid key → **PUT to Garage first** (idempotent by key) → **then INSERT/UPDATE the Postgres row**. A crash between the two leaves a harmless orphan object (GC-able). **Do not** attempt a cross-store transaction or compensating delete — that's over-engineering for 7–8h. Note the orphan possibility as a known limitation (good honesty material).
- **Re-generate writes a NEW uuid object + NEW row** (immutable); the old object becomes garbage. Also fine to note.
- Postgres writes are safe via `@effect/sql-pg`'s pooled `SqlClient`. Garage objects are keyed by **server-generated** uuid, never user input, so concurrent writers never collide.
