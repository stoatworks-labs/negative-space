# CLAUDE.md — Negative Space

Command reference. For the model, the invariants and the traps, read
[AGENTS.md](AGENTS.md) first.

## Commands

```bash
npm install
npm run dev          # vite dev server
npm test             # vitest — 94 tests
npm run sync:pitch-engine   # re-copy aquilon-pitch's engine into src/vendor/
npm run test:watch
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve the built dist/ (does NOT apply _headers)
npm run serve:dist   # serve dist/ WITH _headers applied — use this to check the CSP
npx tsc -b           # typecheck only
```

## Deploy

```bash
npx wrangler login   # you must run this — it's an account sign-in
npm run deploy       # build + wrangler deploy
```

Or connect the repo in Cloudflare: build `npm ci && npm run build`, output `dist`.

## Write the generated artefacts out to inspect them

```bash
NEGATIVE_SPACE_PDF_OUT=/tmp/out  npx vitest run pdf
NEGATIVE_SPACE_SVG_OUT=/tmp/out  npx vitest run guide
NEGATIVE_SPACE_PPTX_OUT=/tmp/out npx vitest run office
```

Rasterise with `rsvg-convert -w 1200 in.svg -o out.png` or
`pdftoppm -png -r 110 in.pdf out`, both in `/opt/homebrew/bin`. Then *look at them*.

## Ground rules

- All lengths are **millimetres** inside the engine. Convert only in `units.ts` and the UI.
- `geometry.ts` is the single source of truth for `pixels = mm / pitch`. Don't re-derive it.
- Surfaces round to integer pixels FIRST; the canvas and gutters are measured off those
  rounded rects.
- Equal physical gaps may legitimately differ by one pixel. There is a test saying so in
  capital letters. Don't "fix" it.
- The Resolume exporter may only emit XML shapes a real Arena file contains —
  `resolume-schema.test.ts` enforces this. Don't add a plausible-looking `<Param>`.
- Gutter bands and gutter labels are drawn in separate passes. Don't merge them.
