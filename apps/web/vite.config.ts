import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Absolute paths via ESM new URL(import.meta.url) — no path helper, no __dirname.
const here = (p: string) => new URL(p, import.meta.url).pathname

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Contract exported as SOURCE .ts → Vite/esbuild transpiles it into the bundle.
      '@trailmark/contract': here('../../packages/contract/src/index.ts'),
      '@': here('./src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:3000' }, // dev: web → bun server (same-origin in prod via Caddy)
  },
  build: { outDir: 'dist', sourcemap: true },
})
