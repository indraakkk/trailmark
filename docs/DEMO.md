# Trailmark

A trail-running **finisher-badge generator**. Pick a few chips (distance, motif, style,
palette), type a race name → get a circular AI **emblem** with your race name, distance,
finish time and date typeset crisply around it. Sign in by magic link; **your** gallery
persists, is re-generatable, and downloads as a PNG. Self-hosted, $0, fully Effect-native.

> **The thesis:** a badge is **two layers** — (1) a circular emblem the diffusion model
> draws with a deliberately **blank outer ring**, and (2) **crisp client-side SVG
> typography** composited on top. *Diffusion can't spell, so we never ask it to.*

The full design rationale lives in [`docs/adr/`](docs/adr/README.md) (18 decision records,
written first) and [`docs/plan/`](docs/plan/) (sequenced build chunks); [`PLAN.md`](PLAN.md)
is the index.

---

## Quick start (< 15 min)

Prereqs: [Nix](https://nixos.org) with flakes, and the shared **indra-nix-home Postgres**
running (the local dev DB; socket at `$HOME/.local/state/postgresql/run`).

```bash
nix develop            # devShell: bun, psql, process-compose, bun2nix; creates the `trailmark` db
nix run .#dev          # garage + garage-init + migrate + server + web, one command
```

Then open <http://localhost:5173>:

1. Enter any email → **Send sign-in link**. The magic link is **printed to the server log**
   as `[magic-link] email=… url=…` (no email provider needed locally) — click it.
2. Tap chips, type a race name → **Generate badge**. It appears as *generating*, then
   *ready* in ~10–30s. The text is instant (it's ours); the emblem is what takes time.
3. **Tweak** any card to regenerate (New look = fresh seed, Keep seed = same composition);
   **Download** rasterizes the badge to PNG client-side.

No CF token needed locally — generation falls back to **Pollinations** (free, no key). To
use the **Cloudflare** primary, export `CF_API_TOKEN` + `CF_ACCOUNT_ID` before `nix run .#dev`.

### Verify it without a browser

```bash
bash scripts/verify-engine.sh     # auth (401→session→200), all 3 failure states, data isolation
nix shell nixpkgs#garage --command bash scripts/verify-roundtrip.sh   # real gen → ready → image → Garage
```

---

## Architecture for reviewers (the stack is deliberate)

The backend is **fully Effect-native** — one `@effect/platform` `HttpApi` on Bun, one
`@effect/sql-pg` client, and **one shared `Schema` contract** that drives *both* sides.
Three ideas, in case Effect is unfamiliar:

- **A `Layer` is a wired dependency.** `DbLive` provides a Postgres client; `GarageLive` a
  storage client; `ProviderLive` the image provider. They're built **once**, inside the
  layer (no module-level mutable state), so concurrent requests are safe by construction.
- **A `Tag` is a typed handle to a service.** Handlers ask for `CurrentUser`, `Provider`,
  `ObjectStorage` by tag; the layers supply them. The auth middleware puts `CurrentUser` in
  scope on every badge handler, so per-user scoping is just `user.userId` in the query.
- **One `Schema` contract** (`packages/contract`) is the single source of truth for
  request/response shapes **and** the typed errors. The server validates against it; the web
  derives a **typed client** from the *same* definition (`HttpApiClient`); and the three
  failures are declared **once** as tagged errors with their HTTP status
  (`GenTimeout` 504, `InvalidPrompt` 422, `BrokenResponse` 502) — no duplication, no
  hand-rolled status mapper.

### The request journey

```
Browser (React SPA)                    Bun + Effect server (127.0.0.1)
  POST /api/auth/sign-in/magic-link ─► Better Auth: emails + LOGS a clickable link
  click link ───────────────────────► sets an httpOnly session cookie
  POST /api/badges {inputs, seed} ───► getSession→userId (else 401); buildPrompt(inputs);
                                       insert a `generating` row (owner-stamped);
  ◄── BadgeView{status:'generating'}   forkDaemon(generate…) ───┐   returns sub-second
  poll GET /api/badges/:id (~2s) ────►                          ▼
  ◄── generating … then ready/failed   Cloudflare flux-schnell (35s bound, retry transient)
                                       → on bad bytes: Pollinations (different vendor)
                                       → validate bytes (magic + size) → Garage PUT
                                       → UPDATE row ready+key  (or failed+error_tag)
  GET /api/badges/:id/image ─────────► same-origin proxy streams the emblem from Garage
  React composites SVG typography over the emblem → view + download PNG
```

Postgres (unix socket) holds gallery rows; Garage (S3, loopback) holds emblem **bytes**.
Generation is **async-then-poll** ([ADR-0005](docs/adr/0005-async-poll-generation.md)): the
row is the source of truth for the outcome, so a generation outliving its request is fine.

---

## How AI image generation works here (and where it falls short)

- **Inputs:** a text **prompt** (+ `seed`, `steps`). We *constrain* the prompt via the
  structured form → a pure `buildPrompt({style, motif, palette})` lookup-table assembler;
  the model never sees free-form user text. `seed` makes a generation reproducible (the
  basis of "keep seed").
- **Outputs decode differently per vendor:** Cloudflare returns **base64 JSON**
  (`result.image`); Pollinations returns **raw bytes**. One "parse the image" function would
  be wrong for one of them, so there are two decode paths.
- **HTTP 200 ≠ success.** We validate the **decoded bytes**: magic number must be PNG or
  JPEG *and* size in band (8 KB–900 KB), which rejects the ~1.3 MB Pollinations rate-limit
  placeholder and Cloudflare's `success:false` moderation responses.
- **The core limitation, designed around:** diffusion **can't render text reliably**. So we
  reserve a blank ring and typeset client-side — and the prompt says **"no text / no letters
  / no numbers" twice** (in both the ring-reservation and avoid clauses). That double
  suppression, visible in the persisted `built_prompt`, *is* the demonstrated insight.
- **Other honest limits:** at `steps=4` the model sometimes still scribbles faux-text in the
  ring — the re-gen button is the escape hatch. Determinism only holds when `seed` is fixed.
  flux-schnell is natively square (no aspect-ratio control).

## Failure handling (demo each on camera)

The three generation failures are the heart of the design. The hooks are gated **server-side
to the demo account** (`DEMO_ACCOUNT_EMAIL`, default `indrakoslab@gmail.com`; empty disables)
— a stray `?force=` from any other user is ignored. Signed in as that account,
`?force=timeout|invalid|broken` triggers each deterministically:

| `?force=` | Outcome | HTTP status of the tag |
|---|---|---|
| `timeout` | row settles `failed` / `GenTimeout` (eventual, via poll) | 504 |
| `invalid` | synchronous `InvalidPrompt` on the POST — no row inserted | 422 |
| `broken`  | row settles `failed` / `BrokenResponse` (eventual, via poll) | 502 |

`InvalidPrompt` is also the **synchronous** 422 on submit; `GenTimeout`/`BrokenResponse` are
**eventual** (recorded on the row, surfaced via poll/gallery with a retry button). The UI has
a "Demo failure" selector that drives `?force=`.

## Auth & data isolation

Per-user **private galleries** via **Better Auth**'s magic-link plugin (+ Resend, optional —
the logged link is the reliable local/demo path). Session is an **httpOnly cookie** (no JWT);
the image proxy stays same-origin so the cookie flows and `canvas.toBlob` isn't tainted.
Every badge read is scoped `WHERE user_id = <current user>`; a non-owner (or missing) badge
returns **404, not 403**, so existence never leaks. Better Auth owns exactly `/api/auth/*`
(one deliberate non-Effect seam); everything else is HttpApi / Schema / tagged errors.

---

## Project layout

```
packages/contract   shared Effect Schema: api + errors + auth tags (browser-safe)
packages/db         thin row types (no ORM)
apps/server         HttpApi on Bun: buildPrompt · provider · store · submit · auth · migrate
apps/web            React SPA: derived client · chip form · SVG overlay · gallery
nix/                devShell · process-compose · mkBunApp · bun2nix · clan service module
apps/server/migrations  0001_auth.sql (generated) → 0002_init.sql (badges)
```

## What I chose **not** to build (scope honesty)

No job queue / Redis (forkDaemon + a status row is the mechanism). No cross-store
transaction or orphan GC — a crash between the Garage PUT and the Postgres write leaves a
harmless, GC-able orphan object (accepted trade-off). No multiple aspect ratios
(flux-schnell is square). No heavy resilience stack — the policy is a 2-retry transient
schedule + a single provider failover. The image proxy labels every emblem `image/png`
even when the stored bytes are JPEG (browsers sniff; the canvas concern is *origin*, not
content-type) — a deliberate simplification.

## Deploy (GitHub Action → second app on `tap`)

Trailmark deploys as a **second app on the existing clan.lol/NixOS box `tap`**, coexisting
with taprunning ([ADR-0009](docs/adr/0009-second-app-on-tap.md)) on a non-conflicting port
(server `3001` vs taprunning's `3000`; its own loopback Garage on `3900/3901/3903`).

`tap`'s whole config is taprunning's `nixosConfigurations.tap`, so a standalone deploy would
*overwrite* taprunning. Instead, **the integration lives in taprunning** (`main`): the
`trailmark` flake input + the clan service module + an instance — all *additive* (Caddy
vhost + Postgres db/role merge alongside taprunning's). This was validated by building the
merged closure: `nix eval .#nixosConfigurations.tap.config.system.build.toplevel.drvPath`
evaluates to a valid `nixos-system-tap` with no conflicts. The clan vars
(`better-auth-secret`, `garage-env`) are generated + committed in taprunning, encrypted to
the same recipients as taprunning's vars.

`.github/workflows/deploy.yml` (this repo) checks out trailmark + taprunning, re-locks the
`trailmark` input to the current commit, builds the tap closure on an x86_64-linux runner,
and activates it via `clan machines update tap` over SSH — sharing the `deploy-tap`
concurrency lane with taprunning so two activations never race.

**To run it (one-time setup):**
1. In the **trailmark** repo settings → Secrets, add `DEPLOY_SSH_KEY` (the private
   `id_github_indraakkk`, whose public half is in tap's root `authorizedKeys`) and
   `SOPS_AGE_KEY` (the CI age key, same value as taprunning's — it decrypts the vars).
2. Point DuckDNS `trailmark.duckdns.org` → `43.133.128.143` (for the new vhost's ACME cert).
3. Trigger: `gh workflow run "Deploy trailmark to tap" --repo indraakkk/trailmark` (or push
   to `release`). Verify: `curl -fsS https://trailmark.duckdns.org/api/healthz` **and**
   `curl -fsS https://taprunning.duckdns.org/` (coexistence).

Runs on the **Pollinations** provider + logged-link auth by default; add Cloudflare/Resend
later by extending the clan-vars generator in `nix/trailmark-service.nix` (documented inline).

## Pinned versions

`effect@3.21.2` · `@effect/platform@0.96.1` · `@effect/platform-bun@0.89.0` ·
`@effect/sql@0.51.1` · `@effect/sql-pg@0.52.1` (move as a set — never bump `effect` alone).
Plus `better-auth@1.6.19`, `resend@6.14.0`, `pg@8.21.0` (pinned to match `@effect/sql-pg`
under bun's isolated linker), React 18.3.1, Vite 8, TypeScript 6, `bun2nix` 2.0.8.
