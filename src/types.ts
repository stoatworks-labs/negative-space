/**
 * Domain types for Negative Space.
 *
 * ALL LENGTHS ARE MILLIMETRES. LED pitch is quoted in mm by every manufacturer
 * and every spec sheet; an SI-metre engine would put the single most important
 * number in the tool at 1e-3 and invite exactly the exponent slips this is
 * meant to prevent. Conversion to cm/m/inch/foot happens in `units.ts` and at
 * the UI boundary only.
 *
 * The x axis runs right, the y axis runs DOWN — the same sense as a video
 * canvas, so a surface's physical position and its pixel rect never disagree
 * about which way is up.
 */

export type UnitSystem = 'metric' | 'imperial'

export type SurfaceKind = 'led' | 'projection'

/**
 * One physical display surface: an LED wall, a projection screen, a scenic
 * panel. Its *active image area* — not its cabinet or frame outside dimension.
 */
export type Surface = {
  id: string
  name: string
  kind: SurfaceKind
  /** Active image area. */
  widthMm: number
  heightMm: number
  /** The native raster driving that area. */
  pxWidth: number
  pxHeight: number
  /** Top-left of the active area, in project millimetres. */
  xMm: number
  yMm: number
}

/**
 * How the composite canvas pixel is sized.
 *
 * `finest` picks the smallest pitch present, so no surface is ever asked to
 * show fewer canvas pixels than it has real ones — content is downsampled into
 * the coarse surfaces rather than upsampled into the fine ones. That is the
 * right default and almost always the right answer.
 *
 * `manual` is for matching a canvas that already exists, or for deliberately
 * building a canvas at a round number.
 */
export type CanvasPitch =
  | { mode: 'finest' }
  | { mode: 'coarsest' }
  | { mode: 'manual'; pitchMm: number }

export type Project = {
  name: string
  surfaces: Surface[]
  pitch: CanvasPitch
  units: UnitSystem
}

/** A surface's pitch, and whether its pixels are actually square. */
export type SurfacePitch = {
  xMm: number
  yMm: number
  /** Geometric mean — what to quote as "the" pitch when the two agree. */
  meanMm: number
  /** |x-y| / mean. Anything above `SQUARE_PIXEL_TOLERANCE` is reported. */
  anisotropy: number
  square: boolean
}

/**
 * A surface placed into the composite canvas.
 *
 * `exact` is the fractional truth; `rect` is the integer rectangle the slice,
 * the guide image and the PDF all use. They differ whenever a position or a
 * size is not a whole number of canvas pixels, and `roundingMm` says by how
 * much on the floor — which is the number that decides whether the rounding
 * matters.
 */
export type PlacedSurface = {
  surface: Surface
  pitch: SurfacePitch
  exact: Rect
  rect: IntRect
  /**
   * rect.w / surface.pxWidth. 1 means the surface is driven at its native
   * resolution; anything else means the canvas is resampled into it.
   */
  scaleX: number
  scaleY: number
  /** How far `rect` sits from `exact`, back in millimetres on the floor. */
  roundingMm: { x: number; y: number; w: number; h: number }
}

export type Rect = { x: number; y: number; w: number; h: number }
export type IntRect = { x: number; y: number; w: number; h: number }

/**
 * An empty band running the full width or height of the canvas — the negative
 * space itself.
 *
 * Derived by projecting every surface onto one axis, merging the overlapping
 * intervals into bands, and taking what is left between them. That definition
 * holds for any arrangement, not just a tidy row: with three screens in a line
 * it gives the two gaps you expect, and with a staggered layout it gives the
 * columns of canvas that no surface lights at any height.
 *
 * These are the numbers you slice against. "Canvas columns 1920 to 1943 are
 * dead" is directly actionable in Resolume, in After Effects and on a
 * PowerPoint slide.
 */
export type Gutter = {
  axis: 'x' | 'y'
  /** Physical extent of the band, in project millimetres. */
  startMm: number
  endMm: number
  mm: number
  /** The same band in canvas pixels — the blank pixel count across the band. */
  startPx: number
  endPx: number
  px: number
  /** px before rounding. The fractional part is why `residualMm` exists. */
  exactPx: number
  /** How far the rounded gutter is from the real gap, in millimetres. */
  residualMm: number
}

export type Budget = {
  /** Canvas pixels covered by some surface's integer rect. */
  activePx: number
  /** Every pixel of the composite canvas. */
  canvasPx: number
  /** canvasPx - activePx: what you are compositing into the dark. */
  blankPx: number
  /** blankPx / canvasPx. */
  blankFraction: number
  /** Sum of the surfaces' own native rasters, which is what you are paying to drive. */
  nativePx: number
  activeAreaMm2: number
  canvasAreaMm2: number
}

export type Severity = 'error' | 'warning' | 'note'

export type Diagnostic = {
  severity: Severity
  /** Stable identifier, so tests can assert on a diagnostic without matching prose. */
  code: string
  message: string
  /** The surface it concerns, where it concerns one. */
  surfaceId?: string
}

export type Design = {
  project: Project
  canvas: {
    widthPx: number
    heightPx: number
    pitchMm: number
    /** Top-left of the canvas in project millimetres — the surfaces' bounding box. */
    originXMm: number
    originYMm: number
    widthMm: number
    heightMm: number
  }
  surfaces: PlacedSurface[]
  gutters: Gutter[]
  budget: Budget
  diagnostics: Diagnostic[]
}
