# AGENTS.md — bringing an LLM up to speed on Negative Space

Orientation for an AI assistant (or a new human) picking this project up cold. `CLAUDE.md`
holds the short command reference; this file explains the model and the traps.

---

## 1. What this is

A **negative-space calculator for LED and projection arrays**. Browser-only, no backend:
React + TypeScript + Vite, built to a static `dist/` and hosted on Cloudflare. State lives
in `localStorage`.

It answers: given a set of display surfaces with real physical sizes, real resolutions and
real distances between them — how big is the composite canvas *including the gaps*, how many
blank pixels is each gap, where does each slice sit, and can I hand someone a PDF, a
Resolume file, a guide plate and a PowerPoint at the end of it.

It is a sibling of `blend-calc`, and deliberately not part of it: edge blending is about
surfaces that **overlap**, this is about surfaces that **do not touch**. The two geometries
share nothing but a file layout.

## 2. Layout

```
src/
  types.ts              domain types. Read this first — it is the spec.
  lib/geometry.ts       THE ENGINE. Pitch, placement, gutters, budget, diagnostics.
  lib/resolume.ts       Arena advanced-output XML
  lib/guide.ts          the guide plate: SVG, and PNG rasterised from it
  lib/office.ts         PowerPoint slide geometry and a hand-built .pptx
  lib/zip.ts            dependency-free ZIP writer, used only by office.ts
  lib/pdf.ts            jsPDF report (vector, no rasterised canvas)
  lib/exports.ts        CSV, and the JSON project file
  lib/panels.ts         cabinet presets
  lib/units.ts          metric/imperial at the edges only
  components/Canvas.tsx the plan view; the SVG viewBox IS the canvas
  App.tsx               wiring, all the state
docs/resolume-export.md where the XML format came from, and what is unverified
```

**All lengths are MILLIMETRES internally.** Not metres — LED pitch is quoted in mm
everywhere in the trade, and an SI-metre engine puts the single most important number in the
tool at 1e-3. Conversion happens in `units.ts` and at the UI boundary only.

## 3. The one relation everything derives from

```
canvas pixels = millimetres / canvas pitch
```

Applied to the surfaces it gives their rects; applied to the space between them it gives the
blank pixels. `solve()` in `geometry.ts` is the only place this is written down. Nothing
outside that file may re-derive it.

The ordering rule that keeps the output self-consistent: **surfaces are rounded to integer
pixels first, and the canvas and gutters are then measured off those rounded rects.**
Rounding the total separately is how a canvas ends up a pixel wider than the slices meant to
fill it.

## 4. Traps

### Equal physical gaps are NOT always equal pixel gaps

Two gaps of exactly 100 mm, at a 2.604166 mm pitch, come out as **38 px and 39 px**. This is
correct and deliberate, and there is a test named in capitals pinning it.

Surfaces are placed by rounding their **absolute** position, not by accumulating a rounded
gap: a wall at 1600 mm is 614.4 px → 614, one at 3200 mm is 1228.8 px → 1229. The fractional
part walks, so the gutters either side of it differ by one.

The alternative — repeat a rounded 38 px gap — makes every gutter identical and lets the
error accumulate, so by the tenth wall in a row the canvas is millimetres out of step with
the floor. Absolute rounding keeps every surface within half a pixel of where it physically
is, for ever. **Do not "fix" this into uniform gutters.**

### Gutters are bands, not pairs

The negative space is computed by projecting every surface onto an axis, merging the
overlapping intervals into bands, and taking what is left between them — *not* by walking
adjacent pairs. That definition holds for staggered and ragged layouts, where "the gap
between A and B" is not well defined but "the canvas columns no surface lights at any
height" still is. Those columns are what you actually slice against.

`mergeSpans` carries the exact and the integer extents through the **same** membership
decisions for this reason. Merge them independently and a gap that rounds to zero pixels
changes the number of bands in one description and not the other, and every gutter after it
belongs to the wrong surfaces.

### Gutter extents are in PROJECT millimetres, not canvas-relative ones

`Gutter.startMm`/`endMm` include the canvas origin. `respaceGutter` compares them against
surface positions, and a mixed frame there silently moves the wrong surfaces. This was a
real bug, caught before it shipped.

### Bands and labels must be drawn in separate passes

A horizontal gutter spans the full canvas width and a vertical one the full height, so
wherever two cross, whichever band is drawn second paints over the other's label. Both
`guide.ts` and `Canvas.tsx` draw every band first and every label afterwards, and place
labels a **quarter** of the way along rather than halfway — two crossing gutters meet at
each other's midpoint, which is exactly where a centred label would sit.

### The pixel budget is measured by sweeping, not summing

Rects may overlap (a design error the diagnostics report). Summing their areas would
double-count and could report more active pixels than the canvas has, so `coveredPx` sweeps
y bands and merges x intervals. The invariant `canvasPx === activePx + blankPx` is asserted.

### The Resolume exporter must not invent parameters

See `docs/resolume-export.md`. The format was read off real Arena files, and
`resolume-schema.test.ts` asserts the exporter only emits element/attribute shapes those
files contain. **Adding a plausible-looking `<Param>` is the specific mistake that test
exists to stop.** If you add a shape, add it with a real Arena file that has it.

### The .pptx is hand-built OOXML and every part is load-bearing

`office.ts` writes the smallest package PowerPoint will open without offering to repair it.
The theme, which nothing visibly uses, is one of them — drop it and the file "looks fine"
and prompts for repair. ZIP local-header offsets are **byte** offsets into the finished
file, so `zip.ts` assembles `Uint8Array`s and never touches a string after encoding; there
is a test that walks the central directory and asserts each offset lands on a local header.

### PowerPoint cannot be set to the canvas's real size

Slides cap at 56 inches a side. A 28-metre array cannot be a 28-metre slide. What is
preserved exactly is the **aspect ratio**, and therefore the proportional position of every
surface and every gap — which is what matters for layout. `slideGeometry` clamps the long
side and lets the other follow, and a test asserts the aspect survives the clamp.

## 5. Commands

```bash
npm run dev       # vite dev server
npm test          # vitest, 81 tests
npm run build     # tsc -b && vite build -> dist/
```

Write the artefacts out to look at them:

```bash
NEGATIVE_SPACE_PDF_OUT=/tmp/out  npx vitest run pdf
NEGATIVE_SPACE_SVG_OUT=/tmp/out  npx vitest run guide
NEGATIVE_SPACE_PPTX_OUT=/tmp/out npx vitest run office
```

`rsvg-convert` and `pdftoppm` (both in `/opt/homebrew/bin`) rasterise them. **Look at the
output** — a PDF with a broken layout opens perfectly happily, and the gutter-label
overpaint bug above was invisible in every test that only parsed the SVG.

## 6. Deployment and the CSP

Static-assets Worker on Cloudflare, `wrangler.toml` → `dist/`.

`public/_headers` carries a strict CSP. **`npm run preview` does not apply it**, so it
cannot catch a CSP mistake. Use `scripts/serve-dist.py`, which parses `_headers` and
actually sends them:

```bash
npm run build && npm run serve:dist     # then load it and click every export button
```

That is how the current policy was verified: first render, the lazy jsPDF chunk, and all
eight exports, with zero console output. `style-src` needs `'unsafe-inline'` (React sets
inline `style` attributes) and `img-src` needs `data:` and `blob:` (the favicon, and the
SVG→PNG rasterisation). `connect-src 'self'` is deliberate — the tool sends nothing
anywhere, and the CSP is what enforces that rather than good intentions.

## 7. Verified vs assumed

| Claim | Status |
|---|---|
| Pitch, gap and canvas maths | **Verified** — 81 tests including the pixel-conservation invariant |
| Equal gaps can differ by a pixel | **Verified** — asserted directly, with the reasoning in the test |
| Resolume XML vocabulary matches a real Arena 7.27 file | **Verified** — extracted mechanically, asserted in CI |
| The .pptx opens in PowerPoint without repair | **Verified** — generated and opened in real PowerPoint 2026-08-27 |
| PDF builds for row, grid, single, empty and *broken* designs | **Verified** — generated, rasterised and inspected |
| Arena actually loads the generated file and slices correctly | **NOT VERIFIED** — never round-tripped through a running Arena |
| The guide plate lines up on real hardware | **NOT VERIFIED** — no array has been driven from this tool |

## 8. Deliberately not here (yet)

- **No PWA.** The fleet pattern wants `sw.js`, a manifest and generated icons. Skipped for
  0.1 rather than shipped half-done; a service worker with no icons is console noise.
- **No About dialog or support footer.** Both are vendored from `stoatworks-backend` and
  generated from its `projects.json`, which has no entry for this repo yet. Copying
  blend-calc's would put another app's name in the dialog. Add the repo to `projects.json`,
  run the sync scripts, then re-add the version-stamping plugin to `vite.config.ts`.
- **No backend.** Adding one would change the deployment story for no functional gain.

## Notes

`docs/NOTES.md` carries this repo's working notes. Cross-cutting fleet knowledge lives in
[fleet-notes](https://github.com/stoatworks-labs/fleet-notes).
