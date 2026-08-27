import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Static SPA. Output goes to dist/ which is what Cloudflare publishes.
//
// No support-footer version-stamping plugin here yet, unlike blend-calc: this
// repo is not in the backend's projects.json, so public/about-data.js and
// public/support-footer.js have not been generated for it. Vendoring blend-calc's
// copies would put another app's name in the About dialog. See docs/NOTES.md.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
