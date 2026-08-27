/**
 * Domain types for the engine.
 *
 * These live INSIDE src/lib/ rather than beside the app, so the directory is
 * closed: a TypeScript consumer can copy src/lib/ wholesale and it compiles,
 * with no import reaching out to a file that was left behind. negative-space
 * vendors it exactly that way; livepremier-plus, which is plain JavaScript,
 * takes the bundled build instead. Same engine, two shapes, one hash check
 * each.
 *
 * ALL LENGTHS ARE MILLIMETRES. Pixel pitch is quoted in mm by every LED
 * manufacturer and on every spec sheet, and pitch is the hinge this whole tool
 * turns on. Converting to metres and back around each pitch multiply is how you
 * acquire float dust in a number people read to three decimal places. Same
 * choice, for the same reason, as aspect-calc and negative-space.
 */

/**
 * How a group's pitch was arrived at.
 *
 * `pitch` is what you have when someone hands you a spec sheet. `size` is what
 * you have when someone hands you a wall — measure it, count the pixels, and
 * the pitch falls out. Both end at the same place, and the tool keeps whichever
 * one was typed so a later edit changes the thing the user thinks they own.
 */
export type PitchEntry =
  | { mode: 'pitch'; hMm: number; vMm: number }
  | { mode: 'size'; widthMm: number; heightMm: number }

/**
 * One output group on the screen — the thing the vendor UI lets you select in
 * Preconfig > Canvas and give a pitch to.
 *
 * A group is not necessarily one connector: an output in a 4x1 DP box mode is
 * one logic key with one pitch ratio pair. What matters here is that a group
 * has ONE raster and ONE pitch.
 */
export type OutputGroup = {
  id: string
  name: string
  /**
   * The output logic key on the device ("1".."96" on an Aquilon C), used to
   * address the AWJ write. Optional: the ratios are useful without it, and
   * nobody knows their logic keys off the top of their head.
   */
  outputKey: string
  /** The raster this group's outputs actually drive. */
  pxWidth: number
  pxHeight: number
  entry: PitchEntry
}

/** How the groups sit next to each other on the screen canvas. */
export type Arrangement = 'row' | 'column'

export type Project = {
  name: string
  groups: OutputGroup[]
  /**
   * Group id to hold at 1:1. Empty string means "the finest pitch present",
   * which is the right answer almost every time — see `pickReference`.
   */
  referenceId: string
  arrangement: Arrangement
}

/** A group's pitch once resolved out of whichever entry mode it used. */
export type ResolvedPitch = {
  hMm: number
  vMm: number
  /** Geometric mean — what to quote as "the" pitch when the two agree. */
  meanMm: number
  /** |h - v| / mean. Above `SQUARE_PIXEL_TOLERANCE` the pixels are not square. */
  anisotropy: number
  square: boolean
}

export type WarningLevel = 'error' | 'warn' | 'note'

export type WarningCode =
  | 'out-of-range'
  | 'upsampled'
  | 'quantised'
  | 'floor-loss'
  | 'anisotropic-ratio'
  | 'non-square-pixels'
  | 'footprint-cap'
  | 'no-compensation-needed'

export type Warning = {
  level: WarningLevel
  code: WarningCode
  /** Which group it is about; absent for whole-project warnings. */
  groupId?: string
  message: string
}

/** One axis of one group, all the way from spec sheet to what the device holds. */
export type AxisResult = {
  /** pitch_group / pitch_reference, before the device gets near it. */
  exact: number
  /** The integer the device stores: round(exact * 1000). */
  raw: number
  /** What the operator types, and what the field will read back: raw / 1000. */
  ratio: number
  /** raw is outside 100..10000, so the device will refuse the write entirely. */
  outOfRange: boolean
  /** Canvas pixels this group occupies: floor(px * raw / 1000). */
  footprint: number
  /** Canvas pixels it would occupy at the exact ratio — fractional on purpose. */
  ideal: number
  /** footprint - ideal, in canvas pixels. Negative means the group came up short. */
  errorPx: number
  /** The same error back on the floor, in millimetres at the far edge. */
  errorMm: number
}

export type GroupResult = {
  group: OutputGroup
  pitch: ResolvedPitch
  isReference: boolean
  h: AxisResult
  v: AxisResult
  /** Top-left of this group's footprint on the screen canvas. */
  canvasX: number
  canvasY: number
  /** Physical size implied by raster x pitch — what is actually on the wall. */
  physicalWidthMm: number
  physicalHeightMm: number
}

export type Result = {
  reference: GroupResult | null
  groups: GroupResult[]
  /** Bounding box of every footprint: the screen canvas this design needs. */
  canvas: { width: number; height: number }
  /** The pitch one canvas pixel represents — the reference group's pitch. */
  canvasPitch: ResolvedPitch | null
  warnings: Warning[]
}
