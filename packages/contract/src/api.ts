// packages/contract/src/api.ts — the HttpApi definition (one source of truth).
//
// Drives BOTH sides: server handlers implement this group; the web derives a typed
// HttpApiClient from it. `/api/auth/*` is NOT here — it is the raw Better-Auth web
// handler mounted beside this router (see docs/plan/15-auth.md). Browser-safe:
// imports only @effect/platform + effect + sibling contract modules.
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'
import { InvalidPrompt, NotFound } from './errors.js'
import { BadgeView, GenerateBadgeInput } from './schemas/Badge.js'
import { Authorization } from './auth.js'

// Demo hook (server-gated to the demo account via DEMO_ACCOUNT_EMAIL): ?force=
// deterministically triggers a failure state on camera. timeout/broken settle on the ROW
// (status:'failed') and surface via poll/gallery, not as the POST's error; invalid is
// checked synchronously (like a real blocked prompt), so it is the POST's typed 422.
const ForceParam = Schema.Struct({
  force: Schema.optional(Schema.Literal('timeout', 'invalid', 'broken')),
})

// The image bytes default content-type is image/png; the server streams the real
// type from the stored bytes' magic number (PNG or JPEG). The `.jpg` key suffix is
// a cosmetic label, not a format assertion.
const ImageBytes = Schema.Uint8ArrayFromSelf.pipe(
  HttpApiSchema.withEncoding({ kind: 'Uint8Array', contentType: 'image/png' }),
)

class BadgesApi extends HttpApiGroup.make('badges')
  .add(
    HttpApiEndpoint.post('generate', '/badges')
      .setPayload(GenerateBadgeInput)
      .setUrlParams(ForceParam)
      .addSuccess(BadgeView)
      .addError(InvalidPrompt),
  )
  .add(HttpApiEndpoint.get('gallery', '/badges').addSuccess(Schema.Array(BadgeView)))
  .add(
    HttpApiEndpoint.get('one', '/badges/:id')
      .setPath(Schema.Struct({ id: Schema.UUID }))
      .addSuccess(BadgeView)
      .addError(NotFound),
  )
  .add(
    HttpApiEndpoint.post('regenerate', '/badges/:id/regenerate')
      .setPath(Schema.Struct({ id: Schema.UUID }))
      .setPayload(GenerateBadgeInput)
      .setUrlParams(ForceParam)
      .addSuccess(BadgeView)
      .addError(InvalidPrompt),
  )
  .add(
    HttpApiEndpoint.get('image', '/badges/:id/image')
      .setPath(Schema.Struct({ id: Schema.UUID }))
      .addSuccess(ImageBytes)
      .addError(NotFound),
  )
  .middleware(Authorization) {} // every badge endpoint gets CurrentUser; adds Unauthorized to the error channel

export class TrailmarkApi extends HttpApi.make('trailmark').add(BadgesApi).prefix('/api') {}
