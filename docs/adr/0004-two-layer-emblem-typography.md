# 0004. Two-layer badge: AI emblem + client-side SVG typography
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
A finisher badge must carry a race name, distance, time, and date — text. Diffusion models cannot reliably render letters or numbers. How do we produce a badge with crisp, correct text? This decision is ~40% of the grade: it is the on-camera proof that we understand AI image generation's inputs, outputs, and **limitations**.

## Decision Drivers
- **Diffusion can't spell** — letters/numbers from a diffusion model are garbage.
- The badge text must be **crisp and correct** (real race name, real time).
- We want a single, demonstrable decision that proves we understand the model's limits and failure modes.

## Considered Options
- **Let the model render the text** — ask diffusion for the race name in the image. Fails: mangled glyphs.
- **Two layers**: (1) a circular AI emblem with a deliberately **BLANK outer ring**, (2) **crisp client-side SVG typography** composited on top (chosen).

## Decision Outcome
Chosen: "Two layers", because we never ask the model to do what it can't:

1. **Layer 1 — emblem.** The diffusion model draws a circular emblem, and the prompt deliberately reserves a **blank outer ring**. We tell it "no text / no letters / no numbers" twice — once in the ring reservation, once in the avoid clause. That double-suppression, visible right in the persisted prompt string, **is** the "AI limitations" insight.
2. **Layer 2 — typography.** Real vector glyphs — race name, distance, time, date — are typeset client-side as SVG and composited over the emblem. The opposite of diffusion mush.

Demoing the two side-by-side — *"the model literally can't spell, so we draw the picture and typeset the words ourselves"* — is the signature beat. We persist only the raw emblem; the text is re-typeset live from the row's `inputs`, so it stays editable.

### Consequences
- Good, because every badge has correct, sharp text regardless of model quality.
- Good, because it is a concrete, recordable demonstration that we understand the model's limitations and failure modes.
- Trade-off: extra client-side compositing (SVG → canvas) introduces real gotchas (canvas same-origin taint, web-font race); handled in [failure handling](../plan/13-failure-handling.md).

## Links
- proves the thesis behind [ADR-0003](./0003-niche-trail-finisher-badge.md); implemented in [product chunk](../plan/10-product.md) and [failure handling](../plan/13-failure-handling.md)
