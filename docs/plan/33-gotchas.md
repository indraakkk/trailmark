# Gotcha cheat‑sheet
> part of the [Trailmark plan](../../PLAN.md)

## App / Effect gotchas (verified — tape these to your monitor)

- Pin `effect@3.21.2` + the platform/sql set together; **don't** bump `effect` alone; avoid the 4.0 beta.
- **Declare error→status once** via `HttpApiSchema.annotations`; don't hand‑roll a `catchTags`→status mapper. Use `catchTag` only to collapse infra errors (`SqlError`) into public ones / `Effect.die`.
- **Unix socket = discrete `PG*` env via `Config`** (`PGHOST`/`PGUSER`/`PGDATABASE`), **not** a `postgres:///…?host=` URL (the `pg` driver mis-parses socket URLs → TCP fallback). Run with **`TZ=UTC`** and use `timestamptz` (avoid bare `date` → off‑by‑one).
- `PgMigrator.fromFileSystem(dir)` (re‑exported from `@effect/sql-pg/PgMigrator`); **omit `schemaDirectory`** (no `pg_dump` shell‑out).
- **Two providers decode differently** — CF = base64 JSON `result.image`; Pollinations = raw bytes. Validate **magic bytes + size band** on decoded bytes; **HTTP 200 ≠ success**.
- **Never retry `InvalidPrompt`**; retry transient (`BrokenResponse`) only; bound everything with one `timeoutFail`→`GenTimeout`.
- **Garage bootstrap gates on `garage status`, not `/health`** (quorum deadlock). One env file for secrets. Bun `S3Client` is **path‑style by default — no `forcePathStyle`**. Keep all Garage ports on `127.0.0.1`.
- **Canvas export needs same‑origin emblem** (serve via `/api/badges/:id/image`) + `await document.fonts.ready`.
- **Zero module‑level mutable state**; build clients/tokens inside Layers.

## Auth gotchas (Better Auth magic-link — [15-auth.md](./15-auth.md) · [ADR-0017](../adr/0017-auth-magic-link-better-auth.md))

- **Better Auth's pg `Pool` reads `PG*` (a `pg`-driver feature), NOT `DATABASE_URL`** — `new Pool()` reuses `PGHOST`/`PGUSER`/`PGDATABASE`; do **not** pass a `DATABASE_URL`. This is `pg`-driver behavior, not a Better Auth feature.
- **Auth schema is committed as a numbered PgMigrator migration** (`bunx @better-auth/cli generate` → `schema.sql` → rename to `apps/server/migrations/0001_auth.sql`) running **before** `0002_init.sql` (the badges FK migration) — **one** migration owner, never hand-write `user`/`session`/`verification`.
- **`sendMagicLink` must `console.log` the link AND (conditionally) Resend-send** — the structured log line is the reliable local/demo login path; the Resend **sandbox `onboarding@resend.dev` only delivers to the account owner's email**, so the logged link is what the Loom uses. `RESEND_API_KEY` unset → skip send, link still works.
- **`getSession({ headers })` can return `null`** — null-check before `session.user.id` or you deref undefined. Build a **web `Headers`** from the lowercase-keyed Effect req headers (`new Headers(req.headers as Record<string,string>)`).
- **`Unauthorized` is 401 only with `HttpApiSchema.annotations({ status: 401 })`**; non-owner / missing badge returns **404 (NOT 403)** so existence never leaks.
- **Mount `/api/auth` with `HttpRouter.mountApp(..., { includePrefix: true })` BEFORE the catch-all HttpApi** (Better Auth routes on the absolute pathname); use `HttpServerRequest.toWeb`, not the Bun-only `request.source as Request`. No `middlewareSecurity` in `@effect/platform@0.96.1`.
- **The session cookie is httpOnly + sameSite** — keep `/api/badges/:id/image` **same-origin** (web client `baseUrl:''`) so the cookie flows to the canvas emblem fetch.
- **Tag/Live split keeps the browser bundle clean** — the `Authorization`/`CurrentUser` tags live in the **contract** (`packages/contract/src/auth.ts`, import only `@effect/platform`+`effect`); only `AuthorizationLive` (which imports `pg`/`better-auth`) lives in `apps/server/src/auth-middleware.ts`. Never let the contract import the server `auth.ts`, or Vite bundles `pg` into the web app.
- **Prod secrets via `LoadCredential`, never `environment=`** — `BETTER_AUTH_SECRET` (≥32 chars) + `RESEND_API_KEY` are sops/clan-vars; only `BETTER_AUTH_URL` is plain env ([24-deploy](./24-deploy.md) §3/§6).

## Infra gotchas (Trailmark‑specific)

- **Local Postgres is the indra-nix-home shared server, NOT a process-compose service.** It listens on the socket `$HOME/.local/state/postgresql/run` as OS user `indra` (peer auth). The devShell shellHook must `createdb trailmark` only **if missing** (guard it) — don't add a Postgres process to process-compose. See [ADR-0011](../adr/0011-local-postgres-indra-nix-home.md) · [20-devshell](./20-devshell.md).
- **Local Garage is copied from taprunning's `nix/processes.nix`** into our process-compose (`nix run .#dev` runs garage + garage-init + migrate + server + web together). indra-nix-home has **no** Garage. See [ADR-0012](../adr/0012-local-garage-process-compose.md) · [21-process-compose](./21-process-compose.md).
- **Prod Garage bootstrap gates on `garage status`, not `/health`** — a fresh single instance has no quorum, so `/health` returns 503 → self‑deadlock. See [ADR-0013](../adr/0013-prod-garage-module.md) · [23-prod-garage](./23-prod-garage.md).
- **Trailmark deploys as a SECOND app on machine `tap`** (coexists with taprunning): systemd `trailmark-server` on `127.0.0.1:3001`, its **own** flat DuckDNS record `trailmark.duckdns.org` (NOT a sub‑subdomain), Postgres db `trailmark` + user `trailmark`. See [ADR-0009](../adr/0009-second-app-on-tap.md) · [24-deploy](./24-deploy.md).
- **DB config is env‑driven** so the same server binary works LOCAL and PROD: read host/database/username from config/env — LOCAL is `host=$HOME/.local/state/postgresql/run`, user `indra`, db `trailmark`; PROD is `host=/run/postgresql`, user `trailmark`, db `trailmark` (peer auth). **Do NOT hardcode `/run/postgresql`.** See [14-effect-layer](./14-effect-layer.md).

## Related
- [Build sequence & commits](./30-app-build-commits.md) · [Proof](./31-proof.md) · [Scope & honesty](./32-scope-honesty.md)
- ADR index: [README](../adr/README.md)
