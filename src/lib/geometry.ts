import type {
  Budget,
  CanvasPitch,
  Design,
  Diagnostic,
  Gutter,
  IntRect,
  PlacedSurface,
  Project,
  Surface,
  SurfacePitch,
} from '../types'

/**
 * THE ENGINE.
 *
 * Everything the tool claims derives from one relation:
 *
 *     canvas pixels = millimetres / canvas pitch
 *
 * applied to the surfaces (giving their rects) and to the space between them
 * (giving the blank pixels). `solve` is the only entry point that matters;
 * everything above it is a helper it uses, and nothing outside this file may
 * re-derive the relation.
 *
 * The ordering rule that keeps the output self-consistent: **the surfaces are
 * rounded to integer pixels first, and the canvas and the gutters are then
 * measured off those rounded rects.** Rounding the total separately is how a
 * canvas ends up one pixel wider than the slices that are supposed to fill it.
 */

/** Two pitches within this fraction of each other count as square pixels. */
export const SQUARE_PIXEL_TOLERANCE = 0.005

/** A surface driven within this fraction of 1:1 is not worth warning about. */
export const SCALE_TOLERANCE = 0.001

/** Comparing millimetres that came out of divisions. */
const EPS = 1e-6

export function surfacePitch(s: Surface): SurfacePitch {
  const xMm = s.widthMm / s.pxWidth
  const yMm = s.heightMm / s.pxHeight
  const meanMm = Math.sqrt(xMm * yMm)
  const anisotropy = meanMm > 0 ? Math.abs(xMm - yMm) / meanMm : 0
  return { xMm, yMm, meanMm, anisotropy, square: anisotropy <= SQUARE_PIXEL_TOLERANCE }
}

/**
 * The composite canvas pitch.
 *
 * `finest` — the smallest pitch present — is the default because it is the
 * only choice that never asks a surface to display fewer canvas pixels than it
 * has physical ones. Choose `coarsest` and the finest-pitch wall in the rig is
 * fed an upsampled image; that is a real decision with a real look, so it is
 * offered, not hidden.
 */
export function canvasPitchMm(surfaces: Surface[], pitch: CanvasPitch): number {
  if (pitch.mode === 'manual') return pitch.pitchMm
  const usable = surfaces.filter(isDimensioned).map((s) => surfacePitch(s).meanMm)
  if (usable.length === 0) return 1
  return pitch.mode === 'finest' ? Math.min(...usable) : Math.max(...usable)
}

function isDimensioned(s: Surface): boolean {
  return s.widthMm > 0 && s.heightMm > 0 && s.pxWidth > 0 && s.pxHeight > 0
}

/** Bounding box of the surfaces, in project millimetres. */
export function boundsMm(surfaces: Surface[]) {
  if (surfaces.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 }
  return {
    x0: Math.min(...surfaces.map((s) => s.xMm)),
    y0: Math.min(...surfaces.map((s) => s.yMm)),
    x1: Math.max(...surfaces.map((s) => s.xMm + s.widthMm)),
    y1: Math.max(...surfaces.map((s) => s.yMm + s.heightMm)),
  }
}

type Span = { start: number; end: number; intStart: number; intEnd: number }

/**
 * Merge overlapping (or touching) spans, carrying the exact and the integer
 * extents through the SAME membership decisions.
 *
 * Doing the merge once, on the exact geometry, and letting the integer extents
 * ride along is what keeps the two descriptions of the layout in step. Merging
 * them independently lets a gap that rounds to zero pixels change the number of
 * bands in one description and not the other, and the gutters then belong to
 * the wrong surfaces.
 */
function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return []
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.intStart - b.intStart)
  const out: Span[] = [{ ...sorted[0] }]
  for (const s of sorted.slice(1)) {
    const cur = out[out.length - 1]
    if (s.start <= cur.end + EPS) {
      cur.end = Math.max(cur.end, s.end)
      cur.intEnd = Math.max(cur.intEnd, s.intEnd)
    } else {
      out.push({ ...s })
    }
  }
  return out
}

/**
 * The empty bands along one axis: the negative space.
 *
 * A gutter's physical extent comes from the real geometry and its pixel extent
 * from the rounded rects, so `residualMm` can say how far the canvas is from
 * the room. That difference is the whole reason this tool is not just a
 * division.
 */
function guttersOn(
  axis: 'x' | 'y',
  placed: PlacedSurface[],
  pitchMm: number,
  /**
   * The canvas origin on this axis, in project millimetres. Gutter extents are
   * reported in PROJECT millimetres, not canvas-relative ones, because
   * `respaceGutter` compares them against surface positions and a mixed frame
   * there would move the wrong surfaces.
   */
  originMm: number,
): Gutter[] {
  const spans: Span[] = placed.map((p) =>
    axis === 'x'
      ? { start: p.exact.x, end: p.exact.x + p.exact.w, intStart: p.rect.x, intEnd: p.rect.x + p.rect.w }
      : { start: p.exact.y, end: p.exact.y + p.exact.h, intStart: p.rect.y, intEnd: p.rect.y + p.rect.h },
  )

  const bands = mergeSpans(spans)
  const gutters: Gutter[] = []

  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1]
    const next = bands[i]
    // Exact extents are in canvas pixels here; multiply back for millimetres.
    const mm = (next.start - prev.end) * pitchMm
    const startPx = prev.intEnd
    const endPx = next.intStart
    const px = Math.max(0, endPx - startPx)
    gutters.push({
      axis,
      startMm: originMm + prev.end * pitchMm,
      endMm: originMm + next.start * pitchMm,
      mm,
      startPx,
      endPx,
      px,
      exactPx: next.start - prev.end,
      residualMm: px * pitchMm - mm,
    })
  }
  return gutters
}

/**
 * Canvas pixels covered by at least one surface rect.
 *
 * Rects may overlap — that is a design error the diagnostics report, but the
 * budget still has to be arithmetic rather than optimistic, so the covered area
 * is measured by sweeping rather than by summing. Summing would double-count an
 * overlap and could report more active pixels than the canvas has.
 */
export function coveredPx(rects: IntRect[], canvasWidth: number, canvasHeight: number): number {
  if (rects.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) return 0

  // Sweep the distinct y bands; within each, merge the x intervals of the
  // rects that are live across it.
  const edges = new Set<number>()
  for (const r of rects) {
    edges.add(r.y)
    edges.add(r.y + r.h)
  }
  const ys = [...edges].sort((a, b) => a - b)

  let total = 0
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i]
    const y1 = ys[i + 1]
    const band = y1 - y0
    if (band <= 0) continue
    const live = rects
      .filter((r) => r.y <= y0 && r.y + r.h >= y1 && r.w > 0)
      .map((r) => ({ a: r.x, b: r.x + r.w }))
      .sort((p, q) => p.a - q.a)
    let width = 0
    let cur: { a: number; b: number } | null = null
    for (const iv of live) {
      if (cur && iv.a <= cur.b) {
        cur.b = Math.max(cur.b, iv.b)
      } else {
        if (cur) width += cur.b - cur.a
        cur = { ...iv }
      }
    }
    if (cur) width += cur.b - cur.a
    total += width * band
  }
  return total
}

function place(s: Surface, originXMm: number, originYMm: number, pitchMm: number): PlacedSurface {
  const exact = {
    x: (s.xMm - originXMm) / pitchMm,
    y: (s.yMm - originYMm) / pitchMm,
    w: s.widthMm / pitchMm,
    h: s.heightMm / pitchMm,
  }
  const rect: IntRect = {
    x: Math.round(exact.x),
    y: Math.round(exact.y),
    w: Math.max(1, Math.round(exact.w)),
    h: Math.max(1, Math.round(exact.h)),
  }
  return {
    surface: s,
    pitch: surfacePitch(s),
    exact,
    rect,
    scaleX: s.pxWidth > 0 ? rect.w / s.pxWidth : 1,
    scaleY: s.pxHeight > 0 ? rect.h / s.pxHeight : 1,
    roundingMm: {
      x: (rect.x - exact.x) * pitchMm,
      y: (rect.y - exact.y) * pitchMm,
      w: (rect.w - exact.w) * pitchMm,
      h: (rect.h - exact.h) * pitchMm,
    },
  }
}

/** Do two integer rects share any pixel? */
function overlaps(a: IntRect, b: IntRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function solve(project: Project): Design {
  const usable = project.surfaces.filter(isDimensioned)
  const pitchMm = canvasPitchMm(usable, project.pitch)
  const b = boundsMm(usable)

  const surfaces = usable.map((s) => place(s, b.x0, b.y0, pitchMm))

  // The canvas is measured off the rounded rects, never rounded separately.
  const widthPx = surfaces.reduce((m, p) => Math.max(m, p.rect.x + p.rect.w), 0)
  const heightPx = surfaces.reduce((m, p) => Math.max(m, p.rect.y + p.rect.h), 0)

  const gutters = [
    ...guttersOn('x', surfaces, pitchMm, b.x0),
    ...guttersOn('y', surfaces, pitchMm, b.y0),
  ]

  const activePx = coveredPx(surfaces.map((p) => p.rect), widthPx, heightPx)
  const canvasPx = widthPx * heightPx
  const budget: Budget = {
    activePx,
    canvasPx,
    blankPx: canvasPx - activePx,
    blankFraction: canvasPx > 0 ? (canvasPx - activePx) / canvasPx : 0,
    nativePx: usable.reduce((n, s) => n + s.pxWidth * s.pxHeight, 0),
    activeAreaMm2: usable.reduce((a, s) => a + s.widthMm * s.heightMm, 0),
    canvasAreaMm2: (b.x1 - b.x0) * (b.y1 - b.y0),
  }

  return {
    project,
    canvas: {
      widthPx,
      heightPx,
      pitchMm,
      originXMm: b.x0,
      originYMm: b.y0,
      widthMm: b.x1 - b.x0,
      heightMm: b.y1 - b.y0,
    },
    surfaces,
    gutters,
    budget,
    diagnostics: diagnose(project, surfaces, gutters, pitchMm, widthPx, heightPx),
  }
}

/**
 * The largest canvas dimension worth passing without comment.
 *
 * 8192 is the texture size a lot of real playback hardware tops out at, and a
 * composition wider than that is a decision rather than an accident. It is a
 * note, not an error — plenty of systems go further.
 */
export const TEXTURE_SIZE_NOTE = 8192

function diagnose(
  project: Project,
  surfaces: PlacedSurface[],
  gutters: Gutter[],
  pitchMm: number,
  widthPx: number,
  heightPx: number,
): Diagnostic[] {
  const d: Diagnostic[] = []

  for (const s of project.surfaces) {
    if (!isDimensioned(s)) {
      d.push({
        severity: 'error',
        code: 'surface-undimensioned',
        surfaceId: s.id,
        message: `${s.name} has a zero or missing dimension and is excluded from the canvas.`,
      })
    }
  }

  for (const p of surfaces) {
    if (!p.pitch.square) {
      d.push({
        severity: 'warning',
        code: 'non-square-pixels',
        surfaceId: p.surface.id,
        message:
          `${p.surface.name} has non-square pixels: ${p.pitch.xMm.toFixed(3)} mm across, ` +
          `${p.pitch.yMm.toFixed(3)} mm down. Check the physical size against the resolution — ` +
          `this is usually a typo rather than a real product.`,
      })
    }

    const off = Math.max(Math.abs(p.scaleX - 1), Math.abs(p.scaleY - 1))
    if (off > SCALE_TOLERANCE) {
      const dir = p.scaleX > 1 ? 'upsampled' : 'downsampled'
      d.push({
        severity: 'note',
        code: 'resampled',
        surfaceId: p.surface.id,
        message:
          `${p.surface.name} occupies ${p.rect.w}x${p.rect.h} canvas pixels but is ` +
          `${p.surface.pxWidth}x${p.surface.pxHeight} natively, so it is ${dir} ` +
          `(${(p.scaleX * 100).toFixed(1)}% across). Its pitch differs from the canvas pitch.`,
      })
    }

    const slip = Math.max(Math.abs(p.roundingMm.x), Math.abs(p.roundingMm.y))
    if (slip > pitchMm * 0.25) {
      d.push({
        severity: 'note',
        code: 'position-rounded',
        surfaceId: p.surface.id,
        message:
          `${p.surface.name} sits ${slip.toFixed(1)} mm from where a whole canvas pixel ` +
          `falls. The canvas places it at the nearest pixel.`,
      })
    }
  }

  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      if (overlaps(surfaces[i].rect, surfaces[j].rect)) {
        d.push({
          severity: 'error',
          code: 'surfaces-overlap',
          surfaceId: surfaces[i].surface.id,
          message:
            `${surfaces[i].surface.name} and ${surfaces[j].surface.name} overlap on the ` +
            `canvas. Two slices reading the same pixels is almost never intended here — ` +
            `this tool is about the space between surfaces, not shared coverage.`,
        })
      }
    }
  }

  for (const g of gutters) {
    if (g.mm > EPS && g.px === 0) {
      d.push({
        severity: 'warning',
        code: 'gutter-below-one-pixel',
        message:
          `A ${g.mm.toFixed(1)} mm ${g.axis === 'x' ? 'vertical' : 'horizontal'} gap is smaller than one canvas ` +
          `pixel (${pitchMm.toFixed(3)} mm) and disappears. Content will run straight ` +
          `across it with no allowance.`,
      })
    } else if (Math.abs(g.residualMm) > pitchMm * 0.25) {
      d.push({
        severity: 'note',
        code: 'gutter-rounded',
        message:
          `A ${g.mm.toFixed(1)} mm ${g.axis === 'x' ? 'vertical' : 'horizontal'} gap becomes ${g.px} canvas ` +
          `pixels — ${(g.px * pitchMm).toFixed(1)} mm, ${g.residualMm > 0 ? '+' : ''}` +
          `${g.residualMm.toFixed(1)} mm out.`,
      })
    }
  }

  if (widthPx > TEXTURE_SIZE_NOTE || heightPx > TEXTURE_SIZE_NOTE) {
    d.push({
      severity: 'note',
      code: 'large-canvas',
      message:
        `The canvas is ${widthPx}x${heightPx}. Past ${TEXTURE_SIZE_NOTE} px a lot of ` +
        `playback hardware needs the composition split, or a coarser canvas pitch.`,
    })
  }

  return d
}

/**
 * Re-space a gutter: set the gap to `newMm` and slide everything beyond it.
 *
 * This is the "tell us the spacing" direction of the tool — the inverse of
 * dragging a surface and reading the gap off. Surfaces that start at or after
 * the gutter's far edge move; surfaces that straddle it do not exist, because a
 * gutter is by construction a band no surface occupies.
 */
export function respaceGutter(project: Project, gutter: Gutter, newMm: number): Project {
  const delta = newMm - gutter.mm
  if (!Number.isFinite(delta) || delta === 0) return project
  const axis = gutter.axis
  const edge = gutter.endMm

  return {
    ...project,
    surfaces: project.surfaces.map((s) => {
      const start = axis === 'x' ? s.xMm : s.yMm
      if (start < edge - EPS) return s
      return axis === 'x' ? { ...s, xMm: s.xMm + delta } : { ...s, yMm: s.yMm + delta }
    }),
  }
}

/**
 * Lay surfaces out on a grid with a fixed gap, in the order they are given.
 *
 * Row-major, and the row height is the tallest surface in that row, so a mixed
 * array does not interleave. Positions are absolute millimetres, so the result
 * can be edited freely afterwards — this is a starting point, not a mode.
 */
export function arrange(
  surfaces: Surface[],
  columns: number,
  hGapMm: number,
  vGapMm: number,
): Surface[] {
  const cols = Math.max(1, Math.floor(columns))
  const out: Surface[] = []
  let y = 0
  for (let i = 0; i < surfaces.length; i += cols) {
    const row = surfaces.slice(i, i + cols)
    let x = 0
    for (const s of row) {
      out.push({ ...s, xMm: x, yMm: y })
      x += s.widthMm + hGapMm
    }
    y += Math.max(...row.map((s) => s.heightMm)) + vGapMm
  }
  return out
}
