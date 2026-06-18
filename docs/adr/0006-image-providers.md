# 0006. Image providers — Cloudflare flux-schnell + Pollinations fallback
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
We need a free, no-card image model for the circular emblem, plus a credible failover story (graded). Which providers, and how do we know a response actually succeeded?

## Decision Drivers
- $0, no credit card — this is an unpaid take-home.
- A *real* failover means **two different vendors**, not one vendor retried.
- FLUX renders enamel/woodcut emblem illustration well.

## Considered Options
- Single provider, retry on error.
- **Cloudflare Workers AI `flux-1-schnell` (primary) + Pollinations flux (fallback)** — different vendors.

## Decision Outcome
Chosen: **Cloudflare flux-schnell primary, Pollinations flux fallback**. On `BrokenResponse` from Cloudflare we `Effect.catchTag('BrokenResponse', …)` over to Pollinations — a different vendor, so it's a genuine failover. Both are free with no card.

The two providers have **different decode paths**: Cloudflare returns base64 JSON (`result.image`, ~1024px, `steps`≤8, prompt ≤2048); Pollinations returns raw image bytes. One "parse the image" function would be wrong for one of them.

**The key insight — HTTP 200 is not success.** `response.ok` is not enough: Pollinations returns a ~1.3 MB placeholder when rate-limited (HTTP 200); Cloudflare returns `success:false`/no image. We **validate the decoded bytes** — magic number (PNG/JPEG) plus a size band (`MIN_BYTES` reject truncated/HTML; `MAX_BYTES` reject the ~1.3MB decoy) — and only valid bytes count as a result. A Cloudflare `success:false` moderation error maps to **InvalidPrompt** (not transient), so it does *not* wrongly fall over to Pollinations.

### Consequences
- Good — a real, demonstrable two-vendor failover and an honest "200 ≠ success" byte-validation story.
- Good — `MAX_BYTES` is env-overridable and rejected sizes are logged, so the 1.3MB heuristic can be retuned without a redeploy.
- Trade-off — two distinct decode/validation branches to maintain; the placeholder size is a community heuristic, not an SLA.

## Links
- relates to [ADR-0005](./0005-async-poll-generation.md), [ADR-0007](./0007-storage-garage.md); detailed in [AI & providers chunk](../plan/12-ai-and-providers.md) and [failure handling](../plan/13-failure-handling.md)
