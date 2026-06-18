// @trailmark/db — THIN row types only (no ORM, no migrations live here).
// Mirrors apps/server/migrations/0002_init.sql. The SQL lives with the server
// (apps/server/migrations); this package is just the typed shape of a row.
// Kept dependency-free (no contract import): `inputs` is raw jsonb here — the
// server validates it against the contract's BadgeInputs Schema at the boundary.
export type BadgeStatus = 'generating' | 'ready' | 'failed'
export type BadgeErrorTag = 'GenTimeout' | 'InvalidPrompt' | 'BrokenResponse'

/** A `badges` table row exactly as Postgres stores it (snake_case columns). */
export interface BadgeRow {
  readonly id: string
  readonly inputs: unknown // jsonb (validated to BadgeInputs server-side)
  readonly built_prompt: string
  readonly provider: string
  readonly seed: number
  readonly image_key: string | null
  readonly status: BadgeStatus
  readonly error_tag: BadgeErrorTag | null
  readonly user_id: string
  readonly created_at: Date
  readonly updated_at: Date
}
