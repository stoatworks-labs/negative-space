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

## Using it

Add surfaces from the cabinet presets or type real numbers in, drag them around the canvas,
and click any gap to set its spacing exactly. Mixed pitches are handled: the canvas defaults
to the finest pitch present, so no surface is ever asked to show fewer pixels than it has.

See [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

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

---

*Parts of this repository were written with AI assistance.*
