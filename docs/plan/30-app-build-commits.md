# App build sequence & commit plan
> part of the [Trailmark plan](../../PLAN.md)

> **Phase 8+.** This app-build sequence runs **after** the infra / devshell / scaffold / deploy phases (Phases 0–7 in the [master sequence](../../PLAN.md)) are green — i.e. the devShell ([20-devshell](./20-devshell.md)), process-compose ([21-process-compose](./21-process-compose.md)), scaffold ([22-scaffold](./22-scaffold.md)), prod Garage ([23-prod-garage](./23-prod-garage.md)) and deploy ([24-deploy](./24-deploy.md)) are all working before you start cutting these commits.

Order is chosen to **get something live early** and de‑risk the new infra first. Commit at each ▸ — small, honest, story‑telling commits (their integrity check rewards this).

**Hour 0–1 · Skeleton + deploy pipe (prove "live" before logic)**
- ▸ `chore: bun monorepo skeleton (contract/db/server/web) + pinned effect versions`
- ▸ `feat(infra): trailmark machine, Caddy vhost, Postgres, DuckDNS — copied from taprunning`
- ▸ `feat(infra): production Garage module + bootstrap + clan-vars` ← **the net‑new piece, first, while fresh**
- ▸ deploy a hello‑world `/api/healthz`; confirm the **live URL** serves it. *(De‑risks the scariest 35%/20% line — "live URL fully working" — on day one.)*

**Hour 1–2 · Contract + DB + auth**
- ▸ `feat(contract): BadgeInputs/GenerateBadgeInput/BadgeView schemas + 3 tagged errors`
- ▸ `feat(auth): better-auth magic-link + resend + /api/auth mount + session middleware`
- ▸ `feat(db): commit better-auth schema migration + user_id on badges; scope gallery to current user`

**Hour 2–4.5 · The engine (server)**
- ▸ `feat(badge): deterministic buildPrompt + unit test of 3 example prompts`
- ▸ `feat(provider): Cloudflare flux-schnell client + byte validation (magic+size)`
- ▸ `feat(provider): Pollinations fallback + transient-only retry + 35s GenTimeout`
- ▸ `feat(badge): async submit (forkDaemon) + Garage PUT + status transitions`
- ▸ `feat(api): HttpApi server on Bun (generate/gallery/one/image) wired` — `.middleware(Authorization)`; gallery/one/image scoped to `CurrentUser`, non-owner → 404

**Hour 4.5–7 · Frontend**
- ▸ `feat(web): preset chip form + live typography preview (zero-instruction)`
- ▸ `feat(web): derived HttpApiClient + generate → poll → render`
- ▸ `feat(web): SVG ring overlay + PNG export (CORS-clean via our proxy)`
- ▸ `feat(web): gallery (newest-first) + tweak/keep-seed regenerate`

**Hour 7–8 · Failure UX, demo hooks, polish**
- ▸ `feat(badge): account-gated ?force= to trigger the 3 failure states on camera`
- ▸ `feat(web): inline failure cards (timeout/invalid/broken) + retry`
- ▸ `docs: README (<15min) + architecture-for-reviewers + honest limitations`

If you fall behind, the safe cut line is: **keep** the 3 generation failure states + per‑user gallery persistence + one provider; auth sits **above** pure polish but stays cheap because the logged‑link path needs no working Resend — keep it. **Drop** the Pollinations fallback (note it as future work) before you drop anything graded.

## Related
- [Proof / Loom / README](./31-proof.md) · [Scope & honesty](./32-scope-honesty.md) · [Gotchas](./33-gotchas.md)
- Engine details: [AI & providers](./12-ai-and-providers.md) · [Failure handling](./13-failure-handling.md) · [Effect layer](./14-effect-layer.md)
