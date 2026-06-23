# Trailmark

A trail-running **finisher-badge generator**. Pick a few chips (distance, motif, style,
palette), type a race name → get a circular AI **emblem** with your race name, distance,
finish time and date typeset crisply around it. Sign in by magic link; **your** collection
of badges persists, is re-generatable, and downloads as a PNG. Self-hosted, $0, fully
Effect-native.

> **The thesis:** a badge is **two layers** — (1) a circular emblem the diffusion model
> draws with a deliberately **blank outer ring**, and (2) **crisp client-side SVG
> typography** composited on top. *Diffusion can't spell, so we never ask it to.*

The full design rationale lives in [`docs/adr/`](docs/adr/README.md) (17 decision records,
ADR-0001 … ADR-0017) and [`docs/plan/`](docs/plan/) (sequenced build chunks);
[`PLAN.md`](PLAN.md) is the index.

---

## Quick start (< 15 min)

Prereqs: [Nix](https://nixos.org) with flakes, and a local Postgres reachable over a unix
socket (the dev DB; see [ADR-0011](docs/adr/0011-local-postgres-indra-nix-home.md)).

```bash
nix develop            # devShell: bun, psql, process-compose, bun2nix; creates the `trailmark` db
nix run .#dev          # garage + garage-init + migrate + server + web, one command
```

Then open <http://localhost:5173>:

1. Enter any email → **Send sign-in link**. Locally, the magic link is **printed to the
   server log** as `[magic-link] email=… url=…` (no email provider needed) — click it.
2. In the **Studio**, tap chips (distance, motif, style, palette), type a race name, and
   optionally set a finish time + date → **Generate badge**. It appears as *generating*,
   then *ready* in ~10–30s. The text is instant (it's vector SVG); the emblem is what takes
   time.
3. Back on the **Collection** (your per-race trophy case): the keeper badge for each race is
   the hero, with its other attempts in a collapsible variant strip and any failures in a
   **Needs attention** lane. **Tweak** spins a fresh variant (always a new seed),
   **Retry** re-runs a *failed* badge in place, **★ Keeper** pins the one you like, and
   **Download** rasterizes the badge to PNG client-side.

Each account starts with **20 credits**; every generate / tweak / retry spends one. No
Cloudflare token is needed locally — generation falls back to **Pollinations** (free, no
key). To use the **Cloudflare** primary, export `CF_API_TOKEN` + `CF_ACCOUNT_ID` before
`nix run .#dev`.

### Verify it without a browser

```bash
nix shell nixpkgs#garage --command bash scripts/verify-roundtrip.sh   # real gen → ready → image → Garage
bash scripts/verify-engine.sh     # auth (401→session→200), the 3 failure states, data isolation
```

---

## Architecture (the stack is deliberate)

The backend is **fully Effect-native** — one `@effect/platform` `HttpApi` on Bun, one
`@effect/sql-pg` client, and **one shared `Schema` contract** that drives *both* sides. If
you're new to Effect, three ideas carry most of the codebase:

- **A `Layer` is a wired dependency.** `DbLive` provides a Postgres client; `GarageLive` a
  storage client; `ProviderLive` the image provider. They're built **once**, inside the
  layer (no module-level mutable state), so concurrent requests are safe by construction.
- **A `Tag` is a typed handle to a service.** Handlers ask for `CurrentUser`, `Provider`,
  `ObjectStorage` by tag; the layers supply them. The auth middleware puts `CurrentUser` in
  scope on every badge handler, so per-user scoping is just `user.userId` in the query.
- **One `Schema` contract** (`packages/contract`) is the single source of truth for
  request/response shapes **and** the typed errors. The server validates against it; the web
  derives a **typed client** from the *same* definition (`HttpApiClient`); and the failures
  are declared **once** as tagged errors with their HTTP status — no duplication, no
  hand-rolled status mapper.

### The API surface

Every badge/credits endpoint is owner-scoped through a `CurrentUser` middleware
(`packages/contract/src/api.ts`):

| Method & path | What it does |
|---|---|
| `POST /api/badges` | generate a badge (inserts a `generating` row, returns sub-second) |
| `GET /api/badges` | the full collection — **all** statuses (generating / ready / failed), newest first |
| `GET /api/badges/:id` | one badge (poll target) |
| `POST /api/badges/:id/regenerate` | **Tweak** — always a **new** row, fresh seed |
| `POST /api/badges/:id/retry` | re-run a **failed** badge **in place** on the same row (reuses its stored prompt + seed) |
| `POST /api/badges/:id/keeper` | pin the keeper for a race; returns the refreshed collection |
| `DELETE /api/badges/:id` | remove a badge; returns the refreshed collection |
| `GET /api/credits` | remaining credit balance |
| `GET /api/badges/:id/image` | same-origin proxy that streams the emblem bytes from Garage |

The typed errors, each with its HTTP status declared once
(`packages/contract/src/errors.ts`): `GenTimeout` 504 · `InvalidPrompt` 422 ·
`BrokenResponse` 502 · `OutOfCredits` 402 · `Unauthorized` 401 · `NotFound` 404. Ownership
violations return **404, not 403**, so a badge's existence never leaks.

### The request journey

```
Browser (React SPA)                    Bun + Effect server (127.0.0.1)
  POST /api/auth/sign-in/magic-link ─► Better Auth: emails + LOGS a clickable link (rate-limited)
  click link ───────────────────────► sets an httpOnly session cookie
  POST /api/badges {inputs, seed} ───► getSession→userId (else 401); spend 1 credit (else 402);
                                       buildPrompt(inputs); insert a `generating` row (owner-stamped);
  ◄── BadgeView{status:'generating'}   forkDaemon(generate…) ───┐   returns sub-second
  poll GET /api/badges/:id (~2s) ────►                          ▼
  ◄── generating … then ready/failed   Cloudflare flux-schnell (35s bound, retry transient)
                                       → on bad bytes: Pollinations (different vendor)
                                       → validate bytes (magic + size) → Garage PUT
                                       → UPDATE row ready+key  (or failed+error_tag)
  GET /api/badges/:id/image ─────────► same-origin proxy streams the emblem from Garage
  React composites SVG typography over the emblem → view + download PNG
```

Postgres (unix socket) holds collection rows, the keeper flag, and credit balances; Garage
(S3, loopback) holds emblem **bytes** (`emblems/<id>.jpg`). Generation is
**async-then-poll** ([ADR-0005](docs/adr/0005-async-poll-generation.md)): the row is the
source of truth for the outcome, so a generation outliving its request is fine.

---

## How AI image generation works here (and where it falls short)

- **Inputs:** a text **prompt** (+ a `seed`). The prompt is *constrained* by the structured
  form → a pure `buildPrompt({style, motif, palette})` lookup-table assembler; the model
  never sees free-form user text (the race name, time and date are typography-only and are
  never sent to the model). The `seed` is server-rolled per generation; it's reused only on
  an in-place **retry** of a failed badge, not exposed as a UI affordance.
- **Outputs decode differently per vendor:** Cloudflare returns **base64 JSON**
  (`result.image`); Pollinations returns **raw bytes**. One "parse the image" function would
  be wrong for one of them, so there are two decode paths.
- **HTTP 200 ≠ success.** We validate the **decoded bytes**: magic number must be PNG or
  JPEG *and* size in band (8 KB–900 KB), which rejects the ~1.3 MB Pollinations rate-limit
  placeholder and Cloudflare's `success:false` moderation responses (the latter becomes a
  non-transient `InvalidPrompt` — no failover, no retry).
- **The core limitation, designed around:** diffusion **can't render text reliably**. So we
  reserve a blank ring and typeset client-side — and the prompt says **"no text / no letters
  / no numbers" twice** (in both the ring-reservation and avoid clauses). That double
  suppression — visible in the persisted `built_prompt` — is deliberate, not redundant.
- **Other known limits:** at flux-schnell's low step count the model sometimes still
  scribbles faux-text in the ring — Tweak/Retry are the escape hatches. flux-schnell is
  natively square (no aspect-ratio control).

## Failure handling & credits

The three generation failures are the heart of the design. Outcomes split by timing:
`InvalidPrompt` is checked **synchronously** at submit (422 on the POST, no row inserted);
`GenTimeout` / `BrokenResponse` are **eventual** — recorded on the row and surfaced via
poll/gallery with a **Retry** button (which re-runs the failed row in place, reusing its
stored prompt + seed).

A fourth guardrail is **credits**: each account starts at 20 (DB-backed), and every
generate / tweak / retry spends one **atomically** before any work begins. When exhausted,
the POST fails synchronously with a typed `OutOfCredits` (402) and **no row is created**.

The three failure states can be triggered deterministically for testing. The hooks are
gated **server-side to a demo account** (`DEMO_ACCOUNT_EMAIL`; empty disables) — a stray
`?force=` from any other user is ignored. Signed in as that account,
`?force=timeout|invalid|broken` triggers each:

| `?force=` | Outcome | HTTP status of the tag |
|---|---|---|
| `timeout` | row settles `failed` / `GenTimeout` (eventual, via poll) | 504 |
| `invalid` | synchronous `InvalidPrompt` on the POST — no row inserted | 422 |
| `broken`  | row settles `failed` / `BrokenResponse` (eventual, via poll) | 502 |

The comparison is case-insensitive, trimmed, and fail-closed; the web has a "Demo failure"
selector that drives `?force=` (cosmetic — the gate is server-side).

## Auth & data isolation

Per-user **private collections** via **Better Auth**'s magic-link plugin (+ Resend, optional
— the logged link is the reliable local/demo path). Session is an **httpOnly cookie** (no
JWT); the image proxy stays same-origin so the cookie flows and `canvas.toBlob` isn't
tainted. Every badge read is scoped `WHERE user_id = <current user>`; a non-owner (or
missing) badge returns **404, not 403**, so existence never leaks. Better Auth owns exactly
`/api/auth/*` (one deliberate non-Effect seam); everything else is HttpApi / Schema /
tagged errors.

The magic-link send endpoint is **rate-limited** (a 60 s window, 5 sends per IP, per-IP via
`X-Forwarded-For` behind the reverse proxy), with throttling enabled explicitly so it
doesn't depend on `NODE_ENV`.

---

## Project layout

```
packages/contract   shared Effect Schema: api + errors + auth tags (browser-safe)
packages/db         thin row types (no ORM)
apps/server         HttpApi on Bun: buildPrompt · provider (CF→Pollinations) · store · submit · auth · migrate
apps/web            React SPA, screen-based + inline-styled: Collection (per-race trophy
                    case) · Studio (chip form) · BadgeDetail · Landing; single-ink Medal.tsx
                    composites the SVG typography over the emblem + exports PNG client-side
nix/                devShell · process-compose · mkBunApp · bun2nix · clan service module
apps/server/migrations  0001_auth.sql (generated) → 0002_init.sql (badges) → 0003_revamp.sql (keeper flag + credits table)
```

Fonts are **Saira Condensed** (display + medal) and **Hanken Grotesk** (UI). The medal is
**single-ink** — one ink per face (light face → dark ink, dark face → light ink): race name
and distance ride the arcs; finish time and date sit in a palette-matched scrim plate for
legibility.

## Deliberate non-goals

Trailmark intentionally doesn't build (each a documented trade-off, see
[ADR-0016](docs/adr/0016-scope-no-auth-no-queue.md)):

- **No job queue / Redis.** `forkDaemon` + a status row is the mechanism.
- **No cross-store transaction or orphan GC.** A crash between the Garage PUT and the
  Postgres write leaves a harmless, GC-able orphan object (accepted trade-off).
- **No multiple aspect ratios.** flux-schnell is natively square.
- **No heavy resilience stack.** The policy is a 2-retry transient schedule + a single
  provider failover — nothing more.

The image proxy also labels every emblem `image/png` even when the stored bytes are JPEG
(browsers sniff; the canvas concern is *origin*, not content-type) — a deliberate
simplification.

## Deploy (GitHub Action → second app on a shared box)

Trailmark deploys as a **second app coexisting with another app on an existing clan.lol /
NixOS box** ([ADR-0009](docs/adr/0009-second-app-on-tap.md)) on non-conflicting ports
(server `3001`; its own loopback Garage on `3900/3901/3903`).

Because the box's whole config belongs to the *other* app's flake, a standalone deploy would
overwrite it. Instead, **the integration lives in that other repo**: the `trailmark` flake
input + a clan service module + an instance — all *additive* (the Caddy vhost and Postgres
db/role merge alongside the existing ones). This is validated by building the merged closure
(`nix eval .#nixosConfigurations.<box>.config.system.build.toplevel.drvPath` evaluates with
no conflicts). The clan vars (`better-auth-secret`, `garage-env`) are generated + committed
there, encrypted to the same recipients.

`.github/workflows/deploy.yml` (this repo) checks out both repos, re-locks the `trailmark`
input to the current commit, builds the box closure on an `x86_64-linux` runner, and
activates it via `clan machines update <box>` over SSH — sharing a deploy concurrency lane
so two activations never race.

**To run it (one-time setup):**

1. In this repo's settings → Secrets, add `DEPLOY_SSH_KEY` (a private SSH key whose public
   half is in the box's root `authorized_keys`) and `SOPS_AGE_KEY` (the CI age key that
   decrypts the clan vars).
2. Point your app's DNS record (e.g. `trailmark.example.com`) → `<SERVER_IP>` so the new
   vhost can get an ACME cert.
3. Trigger: `gh workflow run "Deploy trailmark to tap"` (or push to a `release` branch).
   Verify: `curl -fsS https://<app-host>/api/healthz`.

Runs on the **Pollinations** provider + logged-link auth by default; add Cloudflare/Resend
later by extending the clan-vars generator in `nix/trailmark-service.nix` (documented
inline).

## Pinned versions

`effect@3.21.2` · `@effect/platform@0.96.1` · `@effect/platform-bun@0.89.0` ·
`@effect/sql@0.51.1` · `@effect/sql-pg@0.52.1` (move as a set — never bump `effect` alone).
Plus `better-auth@1.6.19`, `resend@6.14.0`, `pg@8.21.0` (pinned to match `@effect/sql-pg`
under bun's isolated linker), React 18.3.1, Vite 8, TypeScript 6, `bun2nix` 2.0.8.
