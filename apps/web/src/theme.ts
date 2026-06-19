// apps/web/src/theme.ts — the design-token sheet, as plain JS constants.
//
// The TrailMark revamp uses INLINE styles throughout (faithful to the Claude Design
// mockup), so screens reference these tokens directly instead of CSS classes. Two
// families: Saira Condensed (display + the medal) and Hanken Grotesk (UI + body).
// Earthy / woodcut palette; hierarchy comes from size & weight, never per-element color.

export const FONT_DISP = "'Saira Condensed', sans-serif" // display & medal
export const FONT_UI = "'Hanken Grotesk', sans-serif" // UI & body

/** Brand, semantic, and neutral color tokens (single source for inline styles). */
export const T = {
  // brand & semantic
  forest: '#2f5d3a',
  forestDeep: '#1f3f28',
  forestTint: '#e4ebe2',
  sage: '#8a9a5b',
  brass: '#c9a14a',
  rust: '#a8552e',
  rustTint: '#f6e7db',
  // neutrals
  bg: '#ece6da', // paper background
  paper: '#f6f2e8', // card surface
  field: '#fbf8f1', // input surface
  border: '#d8cfbd',
  borderSoft: '#e2dac9',
  ink: '#26261f',
  mutedInk: '#6b6658',
  faint: '#a39a86',
  hairline: '#ddd5c5',
  // dark surface (studio preview + detail backdrop)
  dark: '#1c2019',
  darkInk: '#f1ead9',
} as const

/** 8px spacing scale (used by the design-system sheet + as a reference for components). */
export const SPACE = [4, 8, 12, 16, 24, 32, 48, 64] as const

export const RADIUS = { chip: 6, input: 10, card: 16, pill: 20 } as const
