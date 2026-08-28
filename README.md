> **AI-assisted project.** This codebase was created with [Claude Code](https://claude.com/claude-code).
> The geometry is arithmetic and is covered by tests, including conservation invariants, and the
> generated `.pptx` has been opened in real PowerPoint. **The Resolume advanced-output XML has
> never been round-tripped through a running Arena**, and no array laid out here has been built on
> site — check one slice against the wall before trusting a show to it. See [Status](#status).

# Negative Space

**A negative-space calculator for LED and projection arrays.** Lay out display surfaces
with their real physical dimensions and resolutions, say how far apart they are, and get
the composite canvas *including the blank pixels in the gaps* — so content laid out across
the array accounts for the space between the screens as though it were pixel surface.

Runs entirely in your browser. No account, no backend, nothing uploaded.

## The problem

Three LED walls in a row, 100 mm apart. Each is 576 × 384 px. Lay them out as a
1728 × 384 composition and anything moving across the array jumps: it leaves the first wall
and instantly appears on the second, because the composition has no idea the gap exists.

What you actually want is a canvas that includes the gap — 1805 × 384 — where the
77 blank pixels between the walls are composited into the dark. An object crossing the array
now disappears behind the gap and re-emerges the far side, at the speed it was really going.

Working out those blank pixel counts by hand means dividing physical gaps by a pixel pitch
that is rarely a round number (a "P2.6" cabinet is 2.604166… mm), for every gap, and then
offsetting every slice by the running total. That is the job this does.

## What it gives you

- **The composite canvas size**, and what fraction of it is gap.
- **Per-surface slice rectangles**, gap offsets already applied.
- **Resolume Arena advanced output** — both the `AdvancedOutput.xml` and preset forms.
- **A guide image** (SVG and PNG) at exactly the canvas resolution, with the gaps shaded —
  drop it behind a PowerPoint slide or into After Effects and design against the real
  negative space.
- **PowerPoint slide geometry**, plus a starter `.pptx` with the surfaces and gaps drawn on it.
- **CSV** of every surface and gap, and a **JSON project file** to save and reload.
- **A PDF report** with a scale plan of the canvas, for taking to site.
- **LivePremier pitch compensation** — the H and V ratios an Analog Way Aquilon needs to
  drive surfaces of different pitches from one screen.

## Using it

Add surfaces from the cabinet presets or type real numbers in, drag them around the canvas,
and click any gap to set its spacing exactly. Mixed pitches are handled: the canvas defaults
to the finest pitch present, so no surface is ever asked to show fewer pixels than it has.

See [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

## LivePremier pitch compensation

If the array is going on an Analog Way **LivePremier**, one screen spanning surfaces of
different pitches needs each output told how much canvas its raster is worth — or a layer
crossing between them changes physical size as it goes. The panel gives the two numbers
per surface, for **Preconfig > Canvas > Pitch**.

The arithmetic is [aquilon-pitch](https://github.com/stoatworks-labs/aquilon-pitch)'s
engine, vendored as source into `src/vendor/aquilon-pitch/`. It carries four things about
the device that are easy to get backwards and still look right, each established there by
driving a simulator rather than reading the manual: the ratio **multiplies** a raster to
give its canvas footprint, so a **coarser** wall goes **above** 1.000; the field is an
integer in thousandths, 0.100 to 10.000; an out-of-range write is **discarded**, not
clamped; and the footprint **floors**.

**The ratios are right; the positions are not sent anywhere.** A LivePremier lays its
canvas out from each output's own area of interest, which this tool cannot reach into — so
the gaps that are the entire point of a Negative Space canvas still have to be built there
by hand, from the canvas rectangles shown beside each ratio.

One thing worth watching: those ratios are always built on the **finest** pitch, because a
reference below 1.000 would set the whole screen upscaling. If the project's canvas pitch
is set to `coarsest` or a manual value, the two canvases are different sizes and the panel
says so — the rectangles it shows are rescaled to match the ratios, and are deliberately
not the pixel numbers shown elsewhere on the page.

## Development

```bash
npm install
npm run dev      # vite dev server
npm test         # vitest
npm run build    # tsc -b && vite build -> dist/
```

[AGENTS.md](AGENTS.md) explains the model and the traps. [CLAUDE.md](CLAUDE.md) is the
command reference.

## Status

The geometry is arithmetic and is covered by tests, including conservation invariants. The
`.pptx` has been opened in real PowerPoint. **The Resolume XML has never been round-tripped
through a running Arena** — the structure conforms to real Arena files and is asserted in
CI, but check one slice against the wall before trusting a show to it. See
[docs/resolume-export.md](docs/resolume-export.md).

## Licence

MIT. See [LICENSE](LICENSE).
