# Negative Space — user guide

## What it is for

You have several LED walls, or projection surfaces, with real space between them. You want
content laid out across the whole array to behave as though that space were part of the
picture — so a graphic sliding across the stage disappears behind each gap and comes out the
far side at the speed it was really travelling, instead of jumping.

To do that, the composition has to be bigger than the sum of the screens. It has to include
the gaps as blank pixels. This works out how many.

## The quick version

1. **Add your surfaces.** Pick a cabinet from the presets and say how many panels across and
   down, or type the real numbers straight into any surface card.
2. **Set the spacing.** Either drag surfaces around the canvas, or click a shaded gap and
   type the exact distance in millimetres. Everything to the right of it slides.
3. **Read the canvas size** in the top right. That is what you set your composition to.
4. **Export** whatever you need.

## Entering surfaces

Each surface needs four numbers: its **active image area** in millimetres, and its **native
resolution** in pixels. The pitch is the division of the two, and the tool shows it back to
you — check it against the cabinet's spec sheet. If it reads 2.604 mm for a product sold as
"P2.6", that is right; the pitch of a 500 mm cabinet with 192 pixels across genuinely is
2.604166… mm, and the rounded figure is a marketing name.

Use the *active area*, not the cabinet's outside dimension. The frame around a panel is part
of the gap, not part of the picture.

Projection surfaces work the same way: physical size of the projected image, and the
projector's raster.

## Mixed pitches

If your surfaces have different pitches, the canvas has to pick one. **Finest pitch present**
is the default and almost always right: it means no surface is ever asked to display fewer
canvas pixels than it physically has, so the fine walls stay sharp and the coarse ones are
downsampled into.

Choosing **Coarsest** does the reverse and upsamples into your finest wall — a real decision
with a real look, which is why it is offered rather than hidden. **Set manually** is for
matching a canvas that already exists.

Any surface whose pitch differs from the canvas pitch is listed under Checks, with the scale
factor, so you always know which surfaces are being resampled.

## Reading the gaps

Each gap is reported as:

- **Gap** — the physical distance you entered.
- **Blank px** — how many canvas pixels that is.
- **Error** — how far the whole number of pixels is from the real distance. A 100 mm gap at
  2.604 mm pitch is 38.4 px; rounded to 38 it is 1.04 mm short. That is normal and almost
  never matters, but it is shown rather than hidden.
- **Canvas** — the exact columns (or rows) of the canvas that are dead.

### Why two identical gaps can differ by one pixel

You will sometimes see two gaps both entered as 100 mm come out as 38 px and 39 px. This is
correct.

Surfaces are positioned by rounding where they really are, not by stacking up rounded gaps.
A wall at 1600 mm is 614.4 canvas pixels along, so it is placed at 614; one at 3200 mm is
1228.8, so it is placed at 1229. The gutters either side of that fractional drift differ by
one pixel.

The alternative would be to repeat an identical rounded gap, which looks tidier and is
worse: the error accumulates, and by the tenth wall in a row the canvas is millimetres out
of step with the floor. This way every surface stays within half a pixel of its true
position, however long the row.

## The exports

**PDF report** — a scale plan of the canvas with the gaps shaded and dimensioned, plus every
table. This is the one to print and take to site.

**Guide PNG / SVG** — a plate at *exactly* the canvas resolution, with the gaps hatched and
each surface labelled. Put it on a PowerPoint slide background, in an After Effects comp, or
as a Photoshop layer at 100%, and design against it. Text that would fall down a gap can be
seen falling down it.

**PowerPoint** — a starter deck already at the right slide size, with the surfaces and gaps
drawn on the first slide. PowerPoint caps slides at 56 inches, so a large array is scaled to
fit; the aspect ratio and every proportional position are exact, which is what matters. The
panel also shows the slide size in cm and inches if you would rather set up your own deck.

**Resolume preset / AdvancedOutput.xml** — the screen setup, with each slice's input
rectangle already offset by the gaps.

> **Back up your existing `AdvancedOutput.xml` before replacing it.** Arena reads it at
> launch and rewrites it on quit, so a bad swap loses the setup that was there. The preset
> form is safer: drop it in `Presets/Advanced Output/` and load it from inside Arena.

Each screen comes in as a **Virtual** output device, because a real display's identifiers
belong to the machine Arena is running on. Assign them to physical outputs once loaded.

**CSV** — every surface and gap, for a spreadsheet next to the rigging plot.

**Save project** — a JSON file of your inputs. Reload it with **Open…**. Your work is also
kept in the browser automatically between visits.

## Checks

The panel lists anything worth knowing:

- **Errors** — overlapping surfaces, or a surface with a missing dimension.
- **Warnings** — non-square pixels (usually a typo in the physical size), or a gap too small
  to survive the canvas pitch at all.
- **Notes** — surfaces being resampled, and gaps whose rounding is more than a quarter of a
  pixel.

## Before you trust it on a show

The arithmetic is tested, and the PowerPoint file has been opened in real PowerPoint. **The
Resolume file has never been round-tripped through a running Arena.** Load it, put a test
pattern up, and check one slice against the wall before you rely on it.
