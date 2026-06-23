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
    // Env-driven so the same config serves Nix dev and Docker. Defaults preserve Nix:
    // bind loopback, proxy /api to the bun server on the same host. Docker overrides
    // VITE_HOST=0.0.0.0 (so the host browser reaches Vite via the mapped port) and
    // VITE_PROXY_TARGET=http://server:3000 (the bun server's compose-network hostname).
    host: process.env['VITE_HOST'] ?? '127.0.0.1',
    proxy: { '/api': process.env['VITE_PROXY_TARGET'] ?? 'http://127.0.0.1:3000' }, // same-origin in prod via Caddy
  },
  build: { outDir: 'dist', sourcemap: true },
})
