# Scope discipline & the honest part
> part of the [Trailmark plan](../../PLAN.md)

## The honest part (write ≥1 — honesty beats false perfection)

Pre‑written candidates, all true:
- **flux‑schnell occasionally scribbles faux‑text in the reserved ring** at `steps=4`; the double "no text" suppression reduces but doesn't eliminate it — re‑generate is the escape hatch. (Shows you understand prompt‑adherence limits.)
- **Pollinations rate‑limit detection is a size heuristic, not a guarantee** — if they change the placeholder it could slip through; I log rejected sizes to retune.
- **Two‑store writes aren't transactional** — a crash between the Garage PUT and the Postgres row leaves a harmless orphan object I'd GC in a sweep; I chose not to build cross‑store transactions for a 7–8h scope.
- **Single small box** — Garage/Postgres/server share one VM; fine for a demo, not tuned for real concurrency beyond the CF free‑tier rate limit.
- **Resend's sandbox from‑address only delivers to the account owner** — so the magic link is **always** printed to the server log as a structured line, and that logged link is the reliable local/demo login path; real inbox delivery awaits a verified domain. (Honest about the email path, not pretending it's production‑grade.)

---

## What we *did* build for auth — per‑user, honestly scoped

- ✅ **Per‑user magic‑link sign‑in** ([ADR-0017](../adr/0017-auth-magic-link-better-auth.md), [chunk 15](./15-auth.md)) — one small, well‑scoped library (Better Auth + Resend) instead of hand‑rolling magic‑link + session + email‑verification. The gallery is now **private/per‑user**: every signed‑in user sees only their own badges (**no cross‑user data leakage**).
- ✅ **Data isolation** — non‑owner reads of a badge/image return **404** (not 403), so existence never leaks; unauthenticated requests are **401**.
- ✅ **Honest failure states** — magic‑link expired/invalid, Resend send failure → fall back to the logged link, unauthenticated/non‑owner. See [13-failure-handling §7.4](./13-failure-handling.md).

## Scope discipline — what we deliberately do NOT build (the 20% "what you chose not to build" answer)

- ❌ A job queue / Redis — `forkDaemon` + a status row covers async generation at this scale.
- ❌ Cross‑store transactions / orphan GC — noted as a limitation instead.
- ❌ Multiple aspect ratios / non‑square badges — flux‑schnell is native square; out of scope.
- ❌ The heavy taprunning resilience stack (single‑flight Ref, jitter+spaced‑cap schedules, status state machine) — a 2‑retry transient policy **plus** the provider fallback is the right amount; more would read as cargo‑culting.
- ❌ `@effect/sql-drizzle` (you dropped Drizzle), `HttpApiSwagger`/middleware/security for 4 endpoints, hand‑rolled `HttpClientRequest` when the derived client exists.

## Related
- ADRs: [ADR-0017 magic-link auth](../adr/0017-auth-magic-link-better-auth.md) · [ADR-0016 no queue / no cross-store txns](../adr/0016-scope-no-auth-no-queue.md) · [ADR-0005 async + poll](../adr/0005-async-poll-generation.md)
- [Build sequence & commits](./30-app-build-commits.md) · [Proof](./31-proof.md) · [Gotchas](./33-gotchas.md)
