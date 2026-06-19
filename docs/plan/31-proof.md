# The Proof — Loom, README & submission checklist
> part of the [Trailmark plan](../../PLAN.md)

## The Proof — Loom script (record last, ~5–7 min)

Real inputs, real API calls, don't skip the wait. Hit these beats:
0. **Sign in:** open the live URL cold → enter your email → "check your email (or grab the link from the server log)" → open the magic link → land **authenticated** on *your* gallery. (Say: "Better Auth magic‑link; the link is always logged so the demo never depends on Resend's sandbox.")
1. **Full flow:** tap chips (Marathon · mountain · enamel · alpine) → type a race name → watch the typography preview update → **Generate** → *sit through the real 10–30s wait* (talk over it: "this is a live Cloudflare flux‑schnell call") → emblem appears → typography composites → **download** the PNG.
2. **Persistence:** **refresh the page** → the badge is still in the gallery (it's Postgres + Garage, server‑side).
3. **Re‑generation:** open the saved badge → switch `enamel_pin`→`woodcut_seal`, toggle **Keep seed** → regenerate → same composition, new material.
4. **Failures (the most important part — show all three if you can, ≥2 required):**
   - `?force=timeout` → "Generator timed out — retry?"
   - `?force=invalid` → "Prompt rejected" (422)
   - `?force=broken` → "Bad image from provider — retry?" — and explain the real one: *"providers return HTTP 200 even when they fail; here's the byte‑validation that catches Pollinations' 1.3 MB placeholder."*
5. **Data isolation:** sign in as a **second user** (open the magic link from the log) → their gallery is empty; the first user's badges are **not** visible. Hit the first user's `/api/badges/:id` URL → **404** (existence never leaks). This is the no‑cross‑user‑data‑leakage moment.
6. **The honest part:** say one true limitation out loud (see [scope & honesty](./32-scope-honesty.md)) — e.g. Resend's sandbox only mails the account owner, so the logged link is the demo path.

---

## README outline (<15 min to run — graded)

```
# Trailmark
1. What it is + live URL + the two-layer thesis (emblem + client typography)
2. Architecture for reviewers (Effect in 4 sentences: Layer/Tag, one shared contract, tagged errors→status, async+poll)
3. Prereqs: Bun, Postgres (or `docker run postgres`), a free Cloudflare Workers AI token (how to get it). Pollinations needs no key.
4. Setup: `bun install` · `.env` (CF_ACCOUNT_ID, CF_API_TOKEN, PGHOST/PGUSER/PGDATABASE, S3_* for local Garage/MinIO, BETTER_AUTH_SECRET ≥32 chars, BETTER_AUTH_URL=http://localhost:3000, RESEND_API_KEY — **optional locally**: unset just skips the send and you use the link printed to the server log) · `bun run migrate`
5. Run: `bun run dev` (server :3000 + vite :5173) — open http://localhost:5173
6. Sign in: enter your email → open the magic link (from your inbox, or copy the `[magic-link] … url=` line from the server log) → you're in. Your gallery is private to you.
7. How the request flows (the §4.1 diagram)
8. The 3 failure states + how to trigger them (signed in as the demo account `DEMO_ACCOUNT_EMAIL`, then `?force=`) — plus the auth path (expired/invalid link, unauth → 401, non‑owner → 404)
9. What I deliberately did NOT build, and known limitations
```

Provide a one‑command local path (`docker compose` for Postgres + MinIO as a Garage stand‑in, or document local Garage) so a reviewer is running in minutes.

---

## Submission checklist (email to dic@ / chm@ / peb@ actu-al.co)

- [ ] **Repo** (GitHub/GitLab), ~16 honest commits, README runs in <15 min.
- [ ] **Live URL** — fully working at review time (keep the box warm; no free‑tier spin‑down — yours is always‑on).
- [ ] **Doc** (PDF/Google Doc): *Thinking* (§4 request journey + §2 stack + your process) and *Decisions* (§2 table). Pull straight from this plan.
- [ ] **Demo recording**: magic‑link sign‑in + full flow + per‑user gallery + re‑generation + **≥2 failure states** + the **data‑isolation** beat (second user can't see the first's badges) + the honest part.
- [ ] No slide deck. Live URL + recording + the thinking.

## Related
- [Build sequence & commits](./30-app-build-commits.md) · [Scope & honesty](./32-scope-honesty.md) · [Gotchas](./33-gotchas.md)
- Reference: [product](./10-product.md) · [system design](./11-system-design.md) · [failure handling](./13-failure-handling.md)
