# Trailmark — Build Plan (master sequence & index)

> **What we're building:** a trail‑running **finisher‑badge / medal generator**. Pick a few chips (distance, motif, style, palette), type a race name → get a circular AI **emblem** with your race name, distance, time and date typeset crisply around it. Sign in by magic link; **your** gallery persists across refresh, re‑generatable, downloadable. Self‑hosted, $0, fully Effect‑native.
>
> **The thesis (40% of the score):** a badge is **two layers** — (1) a circular emblem the diffusion model draws with a deliberately **blank outer ring**, and (2) **crisp client‑side SVG typography** composited on top. *Diffusion can't spell, so we never ask it to.* See [ADR‑0004](docs/adr/0004-two-layer-emblem-typography.md).

This is the **chunked** plan. `PLAN.md` is the **sequence + index**; the detail lives in **[`docs/adr/`](docs/adr/README.md)** (MADR decision records — written *first*) and **`docs/plan/`** (sequenced chunks). Grounded in `~/SaaS/taprunning` + `~/indra-nix-home` and adversarially verified (2026‑06‑18; 3 blockers + 4 majors caught and fixed).

---

## 0. What the assessment actually scores

| Category | Weight | Where the points are |
|---|---|---|
| **Execution** | 35% | **Your** gallery persists across refresh · re‑gen works · **backend correct under concurrent load** · README <15 min · **many small honest commits** |
| **Thinking** | 25% | Planned before building · **request journey clear** · **stack deliberate & justified** · do you *understand* your tools |
| **Data & Validation** | 20% | Live URL **fully working** · recording shows **real API responses** · **≥2 failure states on camera** · you know **where it falls short** |
| **Problem Solving** | 20% | **Did the niche shape the product** · complexity **without over‑engineering** · **what you chose not to build** · real grasp of **how AI image gen works** |

It's a *failure‑handling + product‑judgment* test in an image‑generator costume. Two high‑leverage moves: **demo each failure deterministically** ([13](docs/plan/13-failure-handling.md) `?force=` hooks) and **commit as you go** ([30](docs/plan/30-app-build-commits.md)).

---

## 1. The build sequence — do it in this order

Front‑loads infra so the **live URL is green before any badge logic** (de‑risks the scariest graded line on day one). Each phase has a one‑line acceptance gate.

| # | Phase | Acceptance gate | Chunk |
|---|---|---|---|
| **0** | **ADRs** (MADR, written first) | every decision recorded in `docs/adr/` | [adr index](docs/adr/README.md) |
| **1** | **Devshell** — nix flake: `bun` (latest) + `pg` client + `process-compose` + `bun2nix`; `createdb trailmark` guard; **Garage comes up** | `nix develop` enters clean; `nix flake check` passes; Garage reachable | [20‑devshell](docs/plan/20-devshell.md) |
| **2** | **Scaffold** the Bun monorepo (contract/db/server/web), pinned versions, smoke `/api/healthz` | `bun install` clean · `GET /api/healthz` → 200 | [22‑scaffold](docs/plan/22-scaffold.md) |
| **3** | **Run together** — full `process-compose` (garage + garage‑init + migrate + server + web) | one `nix run .#dev`; a local generate **round‑trips bytes into the Garage `trailmark` bucket** | [21‑process‑compose](docs/plan/21-process-compose.md) |
| **4** | **Deploy** → machine `tap` as a **2nd app** (local `clan machines update tap`) | new closure activates over SSH | [24‑deploy](docs/plan/24-deploy.md) · [23‑prod‑garage](docs/plan/23-prod-garage.md) |
| **5** | **CI fallback** — GitHub Actions if the local deploy fails | a pushed commit deploys green | [25‑ci‑fallback](docs/plan/25-ci-fallback.md) |
| **6** | **Verify deploy** *(gate — don't continue until green)* | `trailmark.duckdns.org/api/healthz` 200 over TLS **AND** `taprunning.duckdns.org` still up (coexistence) | [24 §acceptance](docs/plan/24-deploy.md) |
| **7** | **App build** — the ~16‑commit engine + UI | the §0 rubric lines, commit‑by‑commit | [30‑commits](docs/plan/30-app-build-commits.md) · [10](docs/plan/10-product.md) [12](docs/plan/12-ai-and-providers.md) [13](docs/plan/13-failure-handling.md) [14](docs/plan/14-effect-layer.md) [15‑auth](docs/plan/15-auth.md) |
| **8** | **Proof** — Loom + README + submit | full flow + ≥2 failures on camera + honest limit | [31‑proof](docs/plan/31-proof.md) |

> **Ordering note (a verifier catch):** scaffold (Phase 2) comes **before** the full run‑together (Phase 3) — `server`/`web`/`migrate` run app code that doesn't exist until the scaffold. Garage + `garage-init` are scaffold‑independent and come up with the devShell in Phase 1. This matches the mentee's own step numbering (scaffold 4, run‑together 5).

---

## 2. Decisions (≈ your submission's "Decisions" — each links to its ADR)

| Decision | Choice | ADR |
|---|---|---|
| Niche | trail‑running finisher badge/medal | [0003](docs/adr/0003-niche-trail-finisher-badge.md) |
| Two‑layer product | AI emblem + client SVG typography | [0004](docs/adr/0004-two-layer-emblem-typography.md) |
| Runtime | **Bun** (latest) — runtime/PM/workspaces; npm CLIs via `bunx` | [0001](docs/adr/0001-runtime-bun.md) |
| Backend | fully **Effect‑native** — `HttpApi` (no Hono) + `@effect/sql-pg` (no Drizzle) + one shared `Schema` contract | [0002](docs/adr/0002-fully-effect-native-backend.md) |
| Generation flow | **async + poll** (`forkDaemon` + status row) | [0005](docs/adr/0005-async-poll-generation.md) |
| Image providers | Cloudflare flux‑schnell (primary) + Pollinations (fallback) — both free | [0006](docs/adr/0006-image-providers.md) |
| Storage | self‑hosted **Garage** (S3) + Postgres | [0007](docs/adr/0007-storage-garage.md) |
| Deploy | self‑hosted clan.lol/NixOS | [0008](docs/adr/0008-deploy-self-hosted-clan.md) |
| Deploy topology | **2nd app on the existing `tap` box** (coexist w/ taprunning) | [0009](docs/adr/0009-second-app-on-tap.md) |
| Devshell | plain **nix flake** (not devenv) | [0010](docs/adr/0010-devshell-nix-flake.md) |
| Local Postgres | the shared **indra‑nix‑home** server | [0011](docs/adr/0011-local-postgres-indra-nix-home.md) |
| Local Garage | copied from taprunning `process-compose` | [0012](docs/adr/0012-local-garage-process-compose.md) |
| Prod Garage | net‑new `services.garage` module on `tap` | [0013](docs/adr/0013-prod-garage-module.md) |
| Deploy mechanism | local `clan machines update`; CI fallback | [0014](docs/adr/0014-ci-deploy-fallback.md) |
| Versions | pin the whole effect/platform/sql set together | [0015](docs/adr/0015-pinned-versions.md) |
| Auth | per‑user magic link (Better Auth) + Resend (+ logged link) | [0017](docs/adr/0017-auth-magic-link-better-auth.md) |
| Scope | no queue, no cross‑store txns (auth **is** in scope) | [0016](docs/adr/0016-scope-no-auth-no-queue.md) |

### Pinned versions (do **not** bump `effect` alone — [ADR‑0015](docs/adr/0015-pinned-versions.md))
```
effect@3.21.2 · @effect/platform@0.96.1 · @effect/platform-bun@0.89.0 · @effect/sql@0.51.1 · @effect/sql-pg@0.52.1
# @effect/experimental ^0.60.0 arrives transitively · DROP: hono · drizzle-orm · @effect/sql-drizzle
# auth (runtime/dev, outside the effect peer‑locked set): better-auth@1.6.19 · resend@6.14.0 · dev @better-auth/cli
```

---

## 3. Chunk map (`docs/plan/`)

**Product & design** · [10‑product](docs/plan/10-product.md) · [11‑system‑design](docs/plan/11-system-design.md) (request journey + data model) · [12‑ai‑and‑providers](docs/plan/12-ai-and-providers.md) · [13‑failure‑handling](docs/plan/13-failure-handling.md) · [14‑effect‑layer](docs/plan/14-effect-layer.md) · [15‑auth](docs/plan/15-auth.md)

**Infra & deploy** · [20‑devshell](docs/plan/20-devshell.md) · [21‑process‑compose](docs/plan/21-process-compose.md) · [22‑scaffold](docs/plan/22-scaffold.md) · [23‑prod‑garage](docs/plan/23-prod-garage.md) · [24‑deploy](docs/plan/24-deploy.md) · [25‑ci‑fallback](docs/plan/25-ci-fallback.md)

**Build & ship** · [30‑app‑build‑commits](docs/plan/30-app-build-commits.md) · [31‑proof](docs/plan/31-proof.md) · [32‑scope‑honesty](docs/plan/32-scope-honesty.md) · [33‑gotchas](docs/plan/33-gotchas.md)

---

## 4. Two things to confirm (resolved with sensible defaults — flag to override)

- **Deploy topology:** trailmark ships as a **2nd app on the existing `tap` box** (cross‑repo: a `trailmark` flake input into taprunning's clan). Fallback if the cross‑repo wiring is fiddly inside the timebox: a separate one‑machine clan on a second VPS. [ADR‑0009](docs/adr/0009-second-app-on-tap.md) · [24 §fallback](docs/plan/24-deploy.md)
- **Auth (locked user directive):** **no cross‑user data leakage** → per‑user/private gallery. Per‑user **magic link** (Better Auth) + Resend, with the link **always logged** as a structured line (reliable local/demo login). [ADR‑0017](docs/adr/0017-auth-magic-link-better-auth.md) · [15‑auth](docs/plan/15-auth.md)

---

## 5. Submission checklist (email dic@ / chm@ / peb@ actu‑al.co)

- [ ] **Repo** — many honest commits ([30](docs/plan/30-app-build-commits.md)), README runs in <15 min.
- [ ] **Live URL** — fully working at review time (always‑on box, no spin‑down).
- [ ] **Doc** — *Thinking* (§1 sequence + [11 request journey](docs/plan/11-system-design.md)) + *Decisions* (§2 table). Pull straight from here.
- [ ] **Recording** — full flow + gallery + re‑gen + **≥2 failure states** + the honest part ([31](docs/plan/31-proof.md)).
- [ ] **Auth** — magic‑link sign‑in (link from log/email) + **data‑isolation** beat: a 2nd user can't see the 1st user's badges ([15](docs/plan/15-auth.md)).
