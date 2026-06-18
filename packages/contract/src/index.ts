// packages/contract/src/index.ts — the single import surface for server + web.
// Exported as SOURCE .ts (package exports: "./src/index.ts") so Vite/esbuild
// transpiles it into the browser bundle.
export * from './errors.js'
export * from './auth.js'
export * from './schemas/Badge.js'
export * from './api.js'
