// packages/contract/src/errors.ts — the public, typed failure states.
//
// Status is declared ONCE here via HttpApiSchema.annotations. Handlers do NOT
// re-map errors to HTTP statuses; an endpoint just `.addError(...)` and the typed
// error propagates with its declared status. Effect.catchTag is reserved for
// collapsing INFRA errors (SqlError, ObjectStorageError) into one of these public
// errors (or a defect) — never for status mapping. See docs/plan/13-failure-handling.md.
import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

// ── The three REQUIRED generation failure states ───────────────────────────
// GenTimeout / BrokenResponse are EVENTUAL (recorded on the row, surfaced via
// poll/gallery). InvalidPrompt is the one checked SYNCHRONOUSLY at submit, so it
// is the POST's typed HTTP error (422).
export class GenTimeout extends Schema.TaggedError<GenTimeout>()(
  'GenTimeout',
  { detail: Schema.String },
  HttpApiSchema.annotations({ status: 504 }),
) {}

export class InvalidPrompt extends Schema.TaggedError<InvalidPrompt>()(
  'InvalidPrompt',
  { reason: Schema.String },
  HttpApiSchema.annotations({ status: 422 }),
) {}

export class BrokenResponse extends Schema.TaggedError<BrokenResponse>()(
  'BrokenResponse',
  { detail: Schema.String },
  HttpApiSchema.annotations({ status: 502 }),
) {}

// ── Generation guardrail (revamp) ──────────────────────────────────────────
// Checked SYNCHRONOUSLY at submit (like InvalidPrompt): if the user has no credits
// left, the POST fails 402 and no row is created. `balance` is the remaining count (0).
export class OutOfCredits extends Schema.TaggedError<OutOfCredits>()(
  'OutOfCredits',
  { balance: Schema.Int },
  HttpApiSchema.annotations({ status: 402 }),
) {}

// ── Auth / ownership paths — NOT part of the three generation failures ──────
// Unauthorized: no session. NotFound: non-owner OR missing row on one/image —
// 404 (NOT 403) so a badge's existence never leaks.
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  {},
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  {},
  HttpApiSchema.annotations({ status: 404 }),
) {}
