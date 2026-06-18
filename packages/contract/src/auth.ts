// packages/contract/src/auth.ts — the auth TAGS only (browser-safe).
//
// Imports ONLY @effect/platform + effect, so the web bundle can import the
// contract without dragging in pg/better-auth. The server-side Live layer
// (AuthorizationLive) lives in apps/server/src/auth-middleware.ts and is the only
// place that touches Better Auth. Never let this file import the server `auth.ts`.
import { HttpApiMiddleware } from '@effect/platform'
import { Context } from 'effect'
import { Unauthorized } from './errors.js' // declared once in errors.ts

export class CurrentUser extends Context.Tag('CurrentUser')<
  CurrentUser,
  { readonly userId: string }
>() {}

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()(
  'Authorization',
  { provides: CurrentUser, failure: Unauthorized },
) {}
