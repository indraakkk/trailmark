# 0003. Niche: trail-running finisher badge / medal generator
> part of the [Trailmark plan](../../PLAN.md) · ADR index: [README](./README.md)

- Status: accepted
- Date: 2026-06-18
- Deciders: mentee, mentor

## Context and Problem Statement
The rubric explicitly grades "did the niche shape the product, or is it just a label". We need a niche that is authentic to the mentee and that genuinely constrains the product, not a generic image gallery with a theme painted on.

## Decision Drivers
- **Authenticity**: trail running is the mentee's hobby, so the "walk us through your code / what did you not build" conversation sounds like a real user, not a label.
- **The niche must shape the product**, not decorate it.
- **Risk in a 7-8h timebox**: a constrained output space means fewer ugly generations.

## Considered Options
- **Generic AI image gallery** — broadest, but a label, not a product; weak on the "niche shaped it" axis.
- **Trail-running finisher badge / medal generator** (chosen).

## Decision Outcome
Chosen: "Trail-running finisher badge / medal generator", because enamel-pin / finisher-medal culture is genuinely huge in ultra running and the niche actively constrains every product decision:

- The output is a **circular emblem** → a constrained, repeatable composition → fewer failure modes than open-ended images.
- The user fills a **structured chip form** (distance, motif, style, palette + a race name), never a raw prompt → the prompt is *crafted* server-side.
- The badge carries **race name, distance, finish time, date** — real data a finisher has — which drives the two-layer typography design ([ADR-0004](./0004-two-layer-emblem-typography.md)).

The niche is the reason the product looks the way it does — that is the point.

### Consequences
- Good, because the constrained circular output lowers generation risk and makes the demo crisp.
- Good, because the walkthrough is credible — the mentee actually uses this.
- Trade-off: narrower appeal than a general gallery; acceptable — this is an assessment of judgment, not a market launch.

## Links
- shapes [ADR-0004](./0004-two-layer-emblem-typography.md); implemented in [product chunk](../plan/10-product.md)
