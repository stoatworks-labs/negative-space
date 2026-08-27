/**
 * Negative Space's surfaces, expressed as an Analog Way LivePremier screen.
 *
 * The two tools already agree about the physics. A canvas pixel here is the
 * finest pitch present; a canvas pixel on a LivePremier with pitch compensation
 * set is the reference output group's pitch. Same idea, same arithmetic — which
 * is why the arithmetic is not repeated here. `src/vendor/aquilon-pitch/` is
 * that repo's engine, copied whole, and it carries the four things about the
 * device that are easy to get backwards:
 *
 *   - the ratio MULTIPLIES a group's raster to give its canvas footprint, so a
 *     COARSER wall takes a ratio above 1.000
 *   - the field is an integer in thousandths, range 0.100 to 10.000
 *   - an out-of-range write is DISCARDED by the device, not clamped
 *   - the footprint FLOORS, so 1080 x 1.234 is 1332 and not 1333
 *
 * This file only translates. It does not do device arithmetic and must not
 * start: anything the engine gets wrong is fixed upstream in aquilon-pitch.
 *
 * WHAT DOES NOT CARRY OVER — and it is the honest part of this feature.
 * Negative Space's whole point is that the canvas *includes the gaps*: three
 * walls a metre apart produce a canvas with the empty metres composited into
 * it, so a shape crossing the array travels at the speed it really does. A
 * LivePremier screen canvas is laid out by the outputs' own AOI positions, and
 * this tool has no way to reach in and set those. So the ratios below are
 * right, and the POSITIONS are still yours to set — from the canvas rectangles
 * Negative Space already gives you.
 */

import { surfacePitch } from './geometry'
import { compensate } from '../vendor/aquilon-pitch/index'
import type { OutputGroup, Project as PitchProject, Result } from '../vendor/aquilon-pitch/types'
import type { Design, Surface } from '../types'

/** Surfaces with a raster and a size — the same test `solve()` applies. */
function isUsable(s: Surface): boolean {
  return s.pxWidth > 0 && s.pxHeight > 0 && s.widthMm > 0 && s.heightMm > 0
}

/**
 * One surface, as an output group.
 *
 * Entered by MEASURED SIZE rather than by pitch, because that is what this tool
 * actually holds: a surface is a physical rectangle and a raster, and its pitch
 * is derived. Handing the engine the derived number instead would round it once
 * on the way in for no reason.
 */
export function toOutputGroup(s: Surface): OutputGroup {
  return {
    id: s.id,
    name: s.name,
    /* Negative Space has no idea which physical connector lights a surface, and
       guessing one would put a real output key on a write. Left empty; the
       engine skips AWJ frames for a group without one. */
    outputKey: '',
    pxWidth: s.pxWidth,
    pxHeight: s.pxHeight,
    entry: { mode: 'size', widthMm: s.widthMm, heightMm: s.heightMm },
  }
}

export type LivePremierPlan = {
  result: Result
  /**
   * True when this project's canvas pixel is the same size as the LivePremier
   * reference group's — i.e. when the canvas Negative Space is describing and
   * the canvas the switcher would build are the same scale.
   *
   * False whenever the canvas pitch is `coarsest` or a `manual` value, because
   * then no surface sits at 1.000 and the two canvases are different sizes.
   * That is not an error — matching a canvas that already exists is a real
   * reason to do it — but a plan that quietly meant a different canvas from the
   * one on screen would be a trap.
   */
  canvasesAgree: boolean
  /** This project's canvas pixel, in mm — for saying so when they disagree. */
  projectPitchMm: number
  /** The LivePremier canvas pixel: the finest surface's pitch, in mm. */
  referencePitchMm: number
}

/**
 * Work out the pitch compensation this design would need on a LivePremier.
 *
 * The reference is always left to the engine, which picks the finest pitch —
 * the only choice that never asks an output to upscale. It is deliberately NOT
 * wired to this project's `pitch` mode: a `coarsest` or `manual` canvas would
 * put every ratio below 1.000 and set the whole screen upscaling, which is a
 * sensible thing for a composition and a poor thing to do to a video wall.
 * `canvasesAgree` reports the difference rather than hiding it.
 */
export function planLivePremier(design: Design): LivePremierPlan | null {
  const usable = design.project.surfaces.filter(isUsable)
  if (usable.length === 0) return null

  const project: PitchProject = {
    name: design.project.name || 'Screen',
    /* Positions come from this tool's own geometry, not from the engine's
       simple row/column — see the note at the top of this file. `row` is the
       engine's default and only affects fields this feature does not use. */
    arrangement: 'row',
    referenceId: '',
    groups: usable.map(toOutputGroup),
  }

  const result = compensate(project)
  if (!result.reference) return null

  const referencePitchMm = result.canvasPitch!.meanMm
  const projectPitchMm = design.canvas.pitchMm

  return {
    result,
    /* Within a thousandth of a millimetre is the same pitch quoted twice. */
    canvasesAgree: Math.abs(projectPitchMm - referencePitchMm) < 0.001,
    projectPitchMm,
    referencePitchMm,
  }
}

/**
 * The canvas rectangle each surface occupies, in the LivePremier's units.
 *
 * Negative Space's own `PlacedSurface.rect` is already this — but only while
 * the project canvas pitch and the reference pitch are the same. When they are
 * not, the rects on screen are in a different scale from the ratios, and
 * reading one against the other silently mixes two canvases. So this recomputes
 * the placement at the reference pitch, and the caller can show it beside the
 * ratios knowing both mean the same thing.
 */
export function referenceRects(design: Design, plan: LivePremierPlan) {
  const scale = plan.projectPitchMm / plan.referencePitchMm
  return design.surfaces.map((p) => ({
    id: p.surface.id,
    name: p.surface.name,
    x: Math.round(p.exact.x * scale),
    y: Math.round(p.exact.y * scale),
    w: Math.round(p.exact.w * scale),
    h: Math.round(p.exact.h * scale),
  }))
}

/** A surface's pitch as this tool already computes it — re-exported for the UI. */
export { surfacePitch }
