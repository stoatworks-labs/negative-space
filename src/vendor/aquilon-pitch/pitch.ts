/**
 * THE ENGINE.
 *
 * One relation, applied twice — once per axis:
 *
 *     ratio = pitch_of_this_group / pitch_of_the_reference_group
 *
 * Everything else in this file is about the gap between that clean number and
 * what a LivePremier will actually hold: three decimal places, a range of
 * 0.100 to 10.000, and a floor() on the canvas footprint that comes out of it.
 * The gap is the whole reason the tool exists — dividing two pitches is not
 * work, but knowing that 1.5637 becomes 1.564 and costs you 1.4 mm at the far
 * end of a 12-metre wall is.
 *
 * No React, no DOM, no browser. This module is meant to be vendored wholesale
 * into other tools in the fleet, the way awj-surface's core is vendored into
 * livepremier-plus. Keep it that way: nothing in here may import from `..`.
 */

import {
  PITCH_SCALE, PITCH_MIN, PITCH_MAX, PITCH_UNITY, PITCHED_MAX, footprint,
} from './device.ts'
import type {
  AxisResult, GroupResult, OutputGroup, Project, ResolvedPitch, Result, Warning,
} from './types.ts'

/**
 * Below this, a group's H and V pitch are the same number wearing two hats.
 *
 * 0.5% is wide enough to swallow the rounding in a spec sheet that quotes a
 * 2.604 mm pitch as "2.6" — a real product, and one whose H and V genuinely are
 * equal — and narrow enough to catch a wall that is actually anisotropic.
 */
export const SQUARE_PIXEL_TOLERANCE = 0.005

/**
 * Quantisation drift worth telling someone about, in canvas pixels.
 *
 * Half a pixel is the point at which the error can no longer be described as
 * "the same pixel": below it the ideal and the achieved footprint round to the
 * same place, above it they do not.
 */
export const DRIFT_WARN_PX = 0.5

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

/**
 * Resolve whichever entry mode a group used down to millimetres per pixel.
 *
 * Returns null rather than NaN or Infinity for input that cannot produce a
 * pitch. A half-typed form is the normal state of a form, not an error, and the
 * caller decides how loudly to say so.
 */
export function resolvePitch(group: OutputGroup): ResolvedPitch | null {
  let hMm: number
  let vMm: number

  if (group.entry.mode === 'pitch') {
    hMm = group.entry.hMm
    vMm = group.entry.vMm
  } else {
    if (!(group.pxWidth > 0) || !(group.pxHeight > 0)) return null
    hMm = group.entry.widthMm / group.pxWidth
    vMm = group.entry.heightMm / group.pxHeight
  }

  if (!Number.isFinite(hMm) || !Number.isFinite(vMm) || hMm <= 0 || vMm <= 0) return null

  const meanMm = Math.sqrt(hMm * vMm)
  const anisotropy = Math.abs(hMm - vMm) / meanMm
  return { hMm, vMm, meanMm, anisotropy, square: anisotropy <= SQUARE_PIXEL_TOLERANCE }
}

/**
 * Choose the group to hold at 1:1.
 *
 * **The finest pitch, always, unless the user overrides it.** Not a style
 * preference — it is the only choice that never asks an output to invent
 * detail. The ratio scales a group's raster UP into canvas pixels, so the
 * reference is the group with the most pixels per millimetre, and every other
 * group ends at a ratio above 1: it is handed more canvas than it has real
 * pixels and resamples down, which is a resize a video processor does well.
 * Pick a coarse group as the reference instead and the fine wall lands below
 * 1.000, is handed fewer canvas pixels than it has real ones, and spends the
 * whole show upscaling — visibly, on the wall with the best pitch in the room.
 *
 * An explicit `referenceId` is honoured anyway. Matching a canvas that already
 * exists is a real reason to want the wrong one, and `upsampled` will say so.
 */
export function pickReference(project: Project): OutputGroup | null {
  const usable = project.groups.filter((g) => resolvePitch(g) !== null)
  if (usable.length === 0) return null

  if (project.referenceId) {
    const chosen = usable.find((g) => g.id === project.referenceId)
    if (chosen) return chosen
  }

  return usable.reduce((best, g) =>
    resolvePitch(g)!.meanMm < resolvePitch(best)!.meanMm ? g : best)
}

// ---------------------------------------------------------------------------
// One axis
// ---------------------------------------------------------------------------

function solveAxis(pitchMm: number, refPitchMm: number, px: number): AxisResult {
  const exact = pitchMm / refPitchMm

  // Round to the nearest thousandth: the field holds nothing finer, and there
  // is no reason to prefer the low side. The clamping happens nowhere — the
  // device rejects out-of-range writes outright, so a clamped value would be a
  // number we invented and the device never took.
  const raw = Math.round(exact * PITCH_SCALE)
  const outOfRange = raw < PITCH_MIN || raw > PITCH_MAX

  const fp = footprint(px, raw)
  const ideal = px * exact

  const errorPx = fp - ideal
  return {
    exact,
    raw,
    ratio: raw / PITCH_SCALE,
    outOfRange,
    footprint: fp,
    ideal,
    errorPx,
    // One canvas pixel is one reference pixel, and a reference pixel is
    // refPitchMm of wall. So the drift in canvas pixels is refPitchMm of real
    // displacement per pixel — measured at the far edge of this group, because
    // the error accumulates across it from an aligned near edge.
    errorMm: errorPx * refPitchMm,
  }
}

// ---------------------------------------------------------------------------
// The whole screen
// ---------------------------------------------------------------------------

export function compensate(project: Project): Result {
  const warnings: Warning[] = []
  const ref = pickReference(project)
  const refPitch = ref ? resolvePitch(ref) : null

  if (!ref || !refPitch) {
    return { reference: null, groups: [], canvas: { width: 0, height: 0 }, canvasPitch: null, warnings }
  }

  const results: GroupResult[] = []
  let cursorX = 0
  let cursorY = 0

  for (const group of project.groups) {
    const pitch = resolvePitch(group)
    if (!pitch) continue

    const h = solveAxis(pitch.hMm, refPitch.hMm, group.pxWidth)
    const v = solveAxis(pitch.vMm, refPitch.vMm, group.pxHeight)

    const result: GroupResult = {
      group,
      pitch,
      isReference: group.id === ref.id,
      h,
      v,
      canvasX: project.arrangement === 'row' ? cursorX : 0,
      canvasY: project.arrangement === 'column' ? cursorY : 0,
      physicalWidthMm: group.pxWidth * pitch.hMm,
      physicalHeightMm: group.pxHeight * pitch.vMm,
    }
    results.push(result)

    cursorX += h.footprint
    cursorY += v.footprint
  }

  const canvas = {
    width: Math.max(0, ...results.map((r) => r.canvasX + r.h.footprint)),
    height: Math.max(0, ...results.map((r) => r.canvasY + r.v.footprint)),
  }

  return {
    reference: results.find((r) => r.isReference) ?? null,
    groups: results,
    canvas,
    canvasPitch: refPitch,
    warnings: audit(results, canvas),
  }
}

// ---------------------------------------------------------------------------
// What is wrong with it
// ---------------------------------------------------------------------------

function audit(results: GroupResult[], canvas: { width: number; height: number }): Warning[] {
  const out: Warning[] = []
  const push = (w: Warning) => out.push(w)

  if (results.length > 1 && results.every((r) => r.h.raw === PITCH_UNITY && r.v.raw === PITCH_UNITY)) {
    push({
      level: 'note',
      code: 'no-compensation-needed',
      message:
        'Every group has the same pitch, so every ratio is 1.000. Leave pitch compensation alone — '
        + 'this screen does not need it.',
    })
  }

  for (const r of results) {
    const id = r.group.id
    const name = r.group.name || 'this group'

    for (const [axisName, a, px] of [
      ['H', r.h, r.group.pxWidth] as const,
      ['V', r.v, r.group.pxHeight] as const,
    ]) {
      if (a.outOfRange) {
        push({
          level: 'error',
          code: 'out-of-range',
          groupId: id,
          message:
            `${name}: ${axisName} ratio ${a.exact.toFixed(3)} is outside the field's 0.100–10.000 range. `
            + 'A LivePremier discards an out-of-range write silently — the field will keep whatever it '
            + 'held before, and nothing will tell you. These two pitches cannot be compensated against '
            + 'each other on one screen.',
        })
        continue
      }

      if (a.raw < PITCH_UNITY) {
        push({
          level: 'warn',
          code: 'upsampled',
          groupId: id,
          message:
            `${name}: ${axisName} ratio ${a.ratio.toFixed(3)} is below 1.000, so this group is given `
            + `${a.footprint} canvas pixels for ${px} real ones and upscales the difference. It has a `
            + 'finer pitch than the reference group — make it the reference instead and everything '
            + 'else scales down rather than this one scaling up.',
        })
      }

      if (Math.abs(a.errorPx) >= DRIFT_WARN_PX) {
        push({
          level: 'warn',
          code: 'quantised',
          groupId: id,
          message:
            `${name}: ${axisName} wants ${a.exact.toFixed(5)} and the field holds ${a.ratio.toFixed(3)}. `
            + `Across this group that is ${a.errorPx > 0 ? '+' : ''}${a.errorPx.toFixed(2)} canvas px `
            + `— ${fmtMm(a.errorMm)} on the wall at its far edge. Content crossing into the next group `
            + 'steps by that much.',
        })
      } else if (a.footprint < Math.floor(a.ideal + 1e-9)) {
        push({
          level: 'note',
          code: 'floor-loss',
          groupId: id,
          message:
            `${name}: ${axisName} footprint is ${a.footprint} canvas px. The device floors this product `
            + `rather than rounding it, so ${a.ideal.toFixed(2)} became ${a.footprint}, not `
            + `${Math.round(a.ideal)}.`,
        })
      }

      if (a.footprint > PITCHED_MAX) {
        push({
          level: 'error',
          code: 'footprint-cap',
          groupId: id,
          message:
            `${name}: ${axisName} footprint ${a.footprint} px exceeds the device's 65535 ceiling on a `
            + 'pitched dimension.',
        })
      }
    }

    if (!r.pitch.square) {
      push({
        level: 'note',
        code: 'non-square-pixels',
        groupId: id,
        message:
          `${name}: H pitch ${r.pitch.hMm.toFixed(3)} mm and V pitch ${r.pitch.vMm.toFixed(3)} mm differ `
          + `by ${(r.pitch.anisotropy * 100).toFixed(1)}%. Check the raster and the measured size — `
          + 'genuinely non-square LED pixels exist but are rare, and a typo looks exactly like one.',
      })
    }

    if (!r.isReference && r.h.raw !== r.v.raw && !r.h.outOfRange && !r.v.outOfRange) {
      push({
        level: 'note',
        code: 'anisotropic-ratio',
        groupId: id,
        message:
          `${name}: H ratio ${r.h.ratio.toFixed(3)} and V ratio ${r.v.ratio.toFixed(3)} are different. `
          + 'That is legal — the device holds the two axes separately — but it only makes sense if this '
          + "group's pixels really are a different shape from the reference group's.",
      })
    }
  }

  if (canvas.width > PITCHED_MAX || canvas.height > PITCHED_MAX) {
    push({
      level: 'warn',
      code: 'footprint-cap',
      message:
        `The screen canvas comes to ${canvas.width} x ${canvas.height}. Individual pitched dimensions `
        + 'cap at 65535; whether a screen canvas this size is buildable on your chassis is a question '
        + 'for the capacity model, not for this tool.',
    })
  }

  return out
}

function fmtMm(mm: number): string {
  const a = Math.abs(mm)
  if (a >= 1000) return `${(mm / 1000).toFixed(3)} m`
  if (a >= 1) return `${mm.toFixed(1)} mm`
  return `${mm.toFixed(2)} mm`
}
