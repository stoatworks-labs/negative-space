import { describe, expect, it } from 'vitest'
import {
  arrange,
  boundsMm,
  canvasPitchMm,
  coveredPx,
  respaceGutter,
  solve,
  surfacePitch,
} from '../geometry'
import type { Project, Surface } from '../../types'

/**
 * The reference cabinet throughout is a 500 x 500 mm / 192 x 192 px panel —
 * the shape an Absen PL2.6-class product actually is. Its pitch is
 * 2.604166... mm, which is deliberately NOT a round number: a gap that divides
 * exactly into the pitch would hide every rounding bug in the engine.
 */
const PANEL_MM = 500
const PANEL_PX = 192
const PITCH = PANEL_MM / PANEL_PX // 2.604166...

function wall(id: string, cols: number, rows: number, xMm: number, yMm: number): Surface {
  return {
    id,
    name: id,
    kind: 'led',
    widthMm: cols * PANEL_MM,
    heightMm: rows * PANEL_MM,
    pxWidth: cols * PANEL_PX,
    pxHeight: rows * PANEL_PX,
    xMm,
    yMm,
  }
}

function project(surfaces: Surface[]): Project {
  return { name: 'test', surfaces, pitch: { mode: 'finest' }, units: 'metric' }
}

describe('pixel pitch', () => {
  it('is physical size over resolution, on each axis', () => {
    const p = surfacePitch(wall('a', 3, 2, 0, 0))
    expect(p.xMm).toBeCloseTo(PITCH, 9)
    expect(p.yMm).toBeCloseTo(PITCH, 9)
    expect(p.square).toBe(true)
  })

  it('round-trips: pitch back to physical size is the identity', () => {
    const s = wall('a', 3, 2, 0, 0)
    const p = surfacePitch(s)
    expect(p.xMm * s.pxWidth).toBeCloseTo(s.widthMm, 9)
    expect(p.yMm * s.pxHeight).toBeCloseTo(s.heightMm, 9)
  })

  it('reports non-square pixels rather than averaging them away', () => {
    const s: Surface = { ...wall('a', 1, 1, 0, 0), heightMm: 400 }
    const p = surfacePitch(s)
    expect(p.square).toBe(false)
    expect(p.anisotropy).toBeGreaterThan(0.2)
  })
})

describe('canvas pitch selection', () => {
  const fine = wall('fine', 1, 1, 0, 0) // 2.604 mm
  const coarse: Surface = {
    ...wall('coarse', 1, 1, 1000, 0),
    pxWidth: 96,
    pxHeight: 96,
  } // 5.208 mm

  it('finest never asks a surface for fewer pixels than it has', () => {
    expect(canvasPitchMm([fine, coarse], { mode: 'finest' })).toBeCloseTo(PITCH, 9)
    const d = solve(project([fine, coarse]))
    for (const p of d.surfaces) {
      expect(p.rect.w).toBeGreaterThanOrEqual(p.surface.pxWidth)
      expect(p.rect.h).toBeGreaterThanOrEqual(p.surface.pxHeight)
    }
  })

  it('coarsest and manual are honoured exactly', () => {
    expect(canvasPitchMm([fine, coarse], { mode: 'coarsest' })).toBeCloseTo(PITCH * 2, 9)
    expect(canvasPitchMm([fine, coarse], { mode: 'manual', pitchMm: 4 })).toBe(4)
  })

  it('an empty design does not divide by zero', () => {
    const d = solve(project([]))
    expect(d.canvas.widthPx).toBe(0)
    expect(d.budget.blankFraction).toBe(0)
    expect(Number.isFinite(d.canvas.pitchMm)).toBe(true)
  })
})

describe('a row of three walls with a real gap', () => {
  // Three 3x2-panel walls (1500 x 1000 mm, 576 x 384 px), 100 mm apart.
  const GAP = 100
  const d = solve(
    project([
      wall('L', 3, 2, 0, 0),
      wall('C', 3, 2, 1500 + GAP, 0),
      wall('R', 3, 2, 2 * (1500 + GAP), 0),
    ]),
  )

  it('places each wall at its native resolution', () => {
    for (const p of d.surfaces) {
      expect(p.rect.w).toBe(576)
      expect(p.rect.h).toBe(384)
      expect(p.scaleX).toBeCloseTo(1, 9)
    }
  })

  it('finds exactly two gutters, and no vertical one', () => {
    const x = d.gutters.filter((g) => g.axis === 'x')
    const y = d.gutters.filter((g) => g.axis === 'y')
    expect(x).toHaveLength(2)
    expect(y).toHaveLength(0)
  })

  it('converts the gap to blank pixels, and says what it lost', () => {
    const g = d.gutters[0]
    expect(g.mm).toBeCloseTo(GAP, 6)
    expect(g.exactPx).toBeCloseTo(GAP / PITCH, 6) // 38.4
    expect(g.px).toBe(38)
    // 38 px is 98.96 mm, so the canvas is 1.04 mm short of the real gap.
    expect(g.residualMm).toBeCloseTo(38 * PITCH - GAP, 6)
    expect(g.residualMm).toBeLessThan(0)
  })

  it('EQUAL PHYSICAL GAPS NEED NOT BE EQUAL PIXEL GAPS', () => {
    // Both gaps are exactly 100 mm and both are 38.4 canvas pixels, yet the
    // first becomes 38 px and the second 39 px.
    //
    // That is correct and it is deliberate. Surfaces are placed by ROUNDING
    // THEIR ABSOLUTE POSITION, not by accumulating a rounded gap: wall C sits
    // at 1600 mm = 614.4 px -> 614, wall R at 3200 mm = 1228.8 px -> 1229.
    // The fractional part walks, so the gutters either side of it differ.
    //
    // The alternative — repeat a rounded 38 px gap — would make every gutter
    // identical and let the error accumulate, so by the tenth wall in a row the
    // canvas would be several millimetres out of step with the floor. Absolute
    // rounding keeps every surface within half a pixel of where it physically
    // is, for ever. Do not "fix" this into uniform gutters.
    const x = d.gutters.filter((g) => g.axis === 'x')
    expect(x.map((g) => g.mm.toFixed(3))).toEqual(['100.000', '100.000'])
    expect(x.map((g) => g.px)).toEqual([38, 39])
    for (const p of d.surfaces) {
      expect(Math.abs(p.roundingMm.x)).toBeLessThanOrEqual(PITCH / 2 + 1e-9)
    }
  })

  it('sizes the canvas off the rounded rects, so nothing disagrees by a pixel', () => {
    expect(d.canvas.widthPx).toBe(576 * 3 + 38 + 39)
    expect(d.canvas.heightPx).toBe(384)
    const last = d.surfaces[2].rect
    expect(last.x + last.w).toBe(d.canvas.widthPx)
  })

  it('conserves pixels: canvas = active + blank', () => {
    expect(d.budget.activePx + d.budget.blankPx).toBe(d.budget.canvasPx)
    expect(d.budget.canvasPx).toBe(d.canvas.widthPx * d.canvas.heightPx)
  })

  it('accounts for every blank pixel through the gutters', () => {
    // A single row of equal-height walls: the blank pixels are exactly the
    // gutter columns, full canvas height. If this drifts, the negative-space
    // number the whole tool exists to report has drifted.
    const gutterPx = d.gutters
      .filter((g) => g.axis === 'x')
      .reduce((n, g) => n + g.px, 0)
    expect(d.budget.blankPx).toBe(gutterPx * d.canvas.heightPx)
  })

  it('reports the active pixels as the sum of the native rasters', () => {
    expect(d.budget.activePx).toBe(3 * 576 * 384)
    expect(d.budget.nativePx).toBe(3 * 576 * 384)
  })
})

describe('a 2x2 grid gaps in both axes', () => {
  const d = solve(
    project([
      wall('TL', 2, 2, 0, 0),
      wall('TR', 2, 2, 1000 + 120, 0),
      wall('BL', 2, 2, 0, 1000 + 80),
      wall('BR', 2, 2, 1000 + 120, 1000 + 80),
    ]),
  )

  it('finds one gutter on each axis', () => {
    expect(d.gutters.filter((g) => g.axis === 'x')).toHaveLength(1)
    expect(d.gutters.filter((g) => g.axis === 'y')).toHaveLength(1)
  })

  it('measures each axis independently', () => {
    const x = d.gutters.find((g) => g.axis === 'x')!
    const y = d.gutters.find((g) => g.axis === 'y')!
    expect(x.mm).toBeCloseTo(120, 6)
    expect(y.mm).toBeCloseTo(80, 6)
    expect(x.px).toBe(Math.round(120 / PITCH))
    expect(y.px).toBe(Math.round(80 / PITCH))
  })

  it('still conserves pixels when the blank region is a cross, not a strip', () => {
    expect(d.budget.activePx + d.budget.blankPx).toBe(d.budget.canvasPx)
    expect(d.budget.activePx).toBe(4 * 384 * 384)
  })
})

describe('covered area', () => {
  it('does not double-count an overlap', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 50, y: 50, w: 100, h: 100 }
    // Summing would give 20000; the union is 20000 - 2500.
    expect(coveredPx([a, b], 150, 150)).toBe(17500)
  })

  it('handles disjoint, touching and nested rects', () => {
    expect(coveredPx([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }], 30, 10)).toBe(200)
    expect(coveredPx([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }], 20, 10)).toBe(200)
    expect(coveredPx([{ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 2, w: 4, h: 4 }], 10, 10)).toBe(100)
  })

  it('is zero for an empty design', () => {
    expect(coveredPx([], 100, 100)).toBe(0)
  })
})

describe('diagnostics', () => {
  it('flags overlapping surfaces as an error', () => {
    const d = solve(project([wall('A', 2, 2, 0, 0), wall('B', 2, 2, 500, 0)]))
    expect(d.diagnostics.some((x) => x.code === 'surfaces-overlap' && x.severity === 'error')).toBe(true)
  })

  it('flags a gap too small to survive the canvas pitch', () => {
    const d = solve(project([wall('A', 1, 1, 0, 0), wall('B', 1, 1, 501, 0)]))
    const g = d.gutters.find((x) => x.axis === 'x')!
    expect(g.mm).toBeCloseTo(1, 6)
    expect(g.px).toBe(0)
    expect(d.diagnostics.some((x) => x.code === 'gutter-below-one-pixel')).toBe(true)
  })

  it('flags a surface whose pitch forces resampling', () => {
    const coarse: Surface = { ...wall('coarse', 1, 1, 700, 0), pxWidth: 96, pxHeight: 96 }
    const d = solve(project([wall('fine', 1, 1, 0, 0), coarse]))
    expect(d.diagnostics.some((x) => x.code === 'resampled' && x.surfaceId === 'coarse')).toBe(true)
  })

  it('excludes an undimensioned surface rather than producing NaN', () => {
    const broken: Surface = { ...wall('broken', 1, 1, 700, 0), pxWidth: 0 }
    const d = solve(project([wall('ok', 1, 1, 0, 0), broken]))
    expect(d.diagnostics.some((x) => x.code === 'surface-undimensioned')).toBe(true)
    expect(d.surfaces).toHaveLength(1)
    expect(Number.isFinite(d.canvas.widthPx)).toBe(true)
  })

  it('says nothing about a clean single-pitch design beyond rounding', () => {
    const d = solve(project([wall('A', 2, 2, 0, 0), wall('B', 2, 2, 1000 + 500, 0)]))
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toHaveLength(0)
  })
})

describe('respaceGutter', () => {
  const p = project([wall('A', 2, 2, 0, 0), wall('B', 2, 2, 1100, 0), wall('C', 2, 2, 2200, 0)])

  it('moves only what lies beyond the gutter', () => {
    const d = solve(p)
    const first = d.gutters.filter((g) => g.axis === 'x')[0]
    expect(first.mm).toBeCloseTo(100, 6)

    const moved = respaceGutter(p, first, 300)
    expect(moved.surfaces[0].xMm).toBe(0) // A is before the gutter
    expect(moved.surfaces[1].xMm).toBe(1300) // B and C slide by +200
    expect(moved.surfaces[2].xMm).toBe(2400)
  })

  it('produces exactly the gap it was asked for', () => {
    const d = solve(p)
    const first = d.gutters.filter((g) => g.axis === 'x')[0]
    const after = solve(respaceGutter(p, first, 250))
    expect(after.gutters.filter((g) => g.axis === 'x')[0].mm).toBeCloseTo(250, 6)
  })

  it('is a no-op for no change', () => {
    const d = solve(p)
    const g = d.gutters[0]
    expect(respaceGutter(p, g, g.mm)).toBe(p)
  })
})

describe('arrange', () => {
  it('lays a grid out row-major with the given gaps', () => {
    const s = [wall('1', 1, 1, 0, 0), wall('2', 1, 1, 0, 0), wall('3', 1, 1, 0, 0), wall('4', 1, 1, 0, 0)]
    const out = arrange(s, 2, 100, 50)
    expect(out.map((x) => [x.xMm, x.yMm])).toEqual([
      [0, 0],
      [600, 0],
      [0, 550],
      [600, 550],
    ])
  })

  it('uses the tallest surface in a row for the next row origin', () => {
    const out = arrange([wall('a', 1, 1, 0, 0), wall('b', 1, 2, 0, 0), wall('c', 1, 1, 0, 0)], 2, 0, 0)
    expect(out[2].yMm).toBe(1000)
  })
})

describe('bounds', () => {
  it('is the union of the surfaces', () => {
    expect(boundsMm([wall('a', 1, 1, 0, 0), wall('b', 1, 1, 700, 300)])).toEqual({
      x0: 0,
      y0: 0,
      x1: 1200,
      y1: 800,
    })
  })
})
