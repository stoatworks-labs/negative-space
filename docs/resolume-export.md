# Resolume Arena advanced-output export

## Where the format came from

Not from documentation. The element names, attribute names and nesting were read off two
files written by a real **Resolume Arena 7.27.0 (rev 14395)** install:

| File | Root element | Notes |
|---|---|---|
| `~/Documents/Resolume Arena/Preferences/AdvancedOutput.xml` | `<ScreenSetup>` | The live screen setup. Arena reads it at launch and rewrites it on quit. |
| `~/Documents/Resolume Arena/Presets/Advanced Output/output_map_1.xml` | `<XmlState>` | A saved preset. Wraps a `<ScreenSetup>` and omits `<SoftEdging>`. |

Both forms are supported, because they are not interchangeable — the preset wrapper and the
preferences file differ in more than the root tag.

The shape list in the test was extracted mechanically with this, not transcribed by hand:

```python
import xml.etree.ElementTree as ET
shapes = set()
def walk(e, path):
    p = path if e.tag == 'XmlState' else path + '/' + e.tag
    if e.tag != 'XmlState':
        shapes.add(f"{p} [{' '.join(sorted(e.attrib))}]")
    for c in e:
        walk(c, p)
for f in (PREFERENCES, PRESET):
    walk(ET.parse(f).getroot(), '')
```

39 shapes, as of 2026-08-27.

## The conformance rule

`src/lib/__tests__/resolume-schema.test.ts` holds that set and asserts **every shape the
exporter emits appears in it**, across five layouts and both targets.

This exists because the one failure mode that really hurts is inventing a plausible-looking
parameter. A missing feature is obvious; a `<Param name="GapWidth">` that Arena does not
recognise produces a file that loads, looks fine, and is quietly wrong. The test also
asserts it can catch an invented element, so it cannot pass vacuously.

If you need to add a shape, add it to `REFERENCE_SHAPES` **with a real Arena file that
contains it**. Not because it looks right.

## What the file contains

One `<Screen>` per surface, each holding one `<Slice>`:

- **`InputRect`** — the surface's rectangle in the composite canvas, offset by every gap to
  its left and above it. This is the whole point of the export.
- **`OutputRect`** — the surface's native raster, `0,0 → w,h`. Note this is the *native*
  raster, not the canvas rect: where a surface's pitch differs from the canvas pitch the two
  differ, and Arena resamples, which is exactly what a coarser pitch means.
- **`Warper`** — an identity 4×4 Bezier control grid plus an identity homography, every
  control point exactly on the output rect, so warping starts from a known-good state.
- **`OutputDevice`** — a `OutputDeviceVirtual`.

`CurrentCompositionTextureSize` is the composite canvas **including** the blank gap pixels.
Set the composition to that size and content crossing a gap lands correctly on the far side.

## What it deliberately does NOT contain

### Anything about the gaps themselves

There is no Arena concept to carry them. A gap is negative space: it is expressed entirely
by where the input rects are, and its only trace in the file is the distance between two of
them. That is as it should be.

### Real output devices

A physical display's `deviceId` and `idHash` are properties of the machine Arena is running
on. They cannot be synthesised elsewhere. Every screen is written as a **Virtual** device;
assign each one to a physical output once the file is loaded.

## Verified vs assumed

| Claim | Status |
|---|---|
| Element/attribute vocabulary matches a real Arena 7.27 file | **Verified** — extracted mechanically and asserted in CI |
| Output is well-formed XML, and names are escaped | **Verified** — parsed with `DOMParser` in the tests |
| Slice geometry carries the gap offsets correctly | **Verified** — asserted against the solved design |
| Arena loads the generated file and slices as intended | **NOT VERIFIED** — never round-tripped through a running Arena |

That last row is the honest gap. The structure conforms and the geometry is right, but no
generated file has been opened in Arena and looked at. Do that before trusting it on a show.

## Before you use it

Back up your existing `AdvancedOutput.xml` before replacing it. Arena reads it at launch and
**overwrites it on quit**, so a bad swap loses the setup that was there. The preset form is
the safer route: drop it in `Presets/Advanced Output/` and load it from inside Arena.
