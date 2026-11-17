import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Static SPA. Output goes to dist/ which is what Cloudflare publishes.
//
// No support-footer version-stamping plugin here yet, unlike blend-calc:
// public/support-footer.js has not been synced into this repo. The About dialog
// has (public/about.js and about-data.js, from stoatworks-backend's
// sync-about.py), and src/main.tsx hands it __APP_VERSION__. See docs/NOTES.md.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
