/**
 * What a LivePremier actually does with a pitch ratio.
 *
 * Every constant and every rule in this file was read off, or driven into, a
 * running **AW LivePremier Simulator 6.2.73** — not the user manual. The manual
 * describes the feature in four sentences and gets the important part wrong by
 * omission: it says "set the H and V ratio" without saying what the field's
 * range is, what precision it holds, or which direction the ratio points.
 *
 * Sources, in order of how much they are worth:
 *
 * 1. **Driven on the wire.** `pitchRatioH = 2000` written to
 *    `device/outputList/items/1/canvas/cmd/pp`, followed by `xUpdate = true`,
 *    turned that output's read-only `pitchedWidth`/`pitchedHeight` from
 *    1920x1080 into 3840x2160. That single observation fixes the direction of
 *    the ratio and is the reason `footprint()` multiplies rather than divides.
 * 2. **The generated attribute table** in the simulator's own client bundle
 *    (`cmd-attributes.ts`, emitted by Analog Way's `aw-generate-do` script),
 *    which carries the min, max, default and type verbatim.
 *
 * Nothing here has been checked against a physical Aquilon. The simulator runs
 * the same `nlc-platform` web application and the same object model, but it is
 * not the hardware.
 */

/**
 * The device stores the ratio as an integer in thousandths.
 *
 * Named `AOI_SCREEN_PITCH_SCALE_RATIO` in the vendor bundle, where the comment
 * beside it reads "Rapport d'echelle pour reglage Pitch de l'AOI (1000 = 1)".
 */
export const PITCH_SCALE = 1000

/** 0.100 as stored. Writes below this are REJECTED — see `RANGE_IS_REJECTED`. */
export const PITCH_MIN = 100

/** 10.000 as stored. */
export const PITCH_MAX = 10000

/** 1.000 — the reference output group's value, and every group's default. */
export const PITCH_UNITY = 1000

/** Smallest change the field will hold: 1/1000 = 0.001. */
export const PITCH_STEP_DISPLAYED = 1 / PITCH_SCALE

/**
 * An out-of-range write is **discarded, not clamped**.
 *
 * Verified: writing 10001 and then 99 to a field holding 1001 left it at 1001
 * both times. So a tool that quietly clamps an impossible ratio to 10.000 would
 * report a number the device will never hold, and the operator would find the
 * field still showing whatever was there before. Refuse instead.
 */
export const RANGE_IS_REJECTED = true

/**
 * The canvas footprint the device derives from the ratio.
 *
 *     pitchedWidth = floor(rasterWidth * pitchRatioH / 1000)
 *
 * **`floor`, not `round`** — measured, and it matters. At ratio 1.234 a
 * 1080-pixel-tall output produced 1332, where rounding 1332.72 would have given
 * 1333; at 0.333 a 1080 gave 359, not the 360 rounding produces. Four such
 * pairs were checked and every one floored.
 *
 * `px * raw` is an exact integer product well inside 2^53 for any real raster,
 * so this is exact arithmetic, not a float approximation of the device.
 */
export function footprint(px: number, raw: number): number {
  return Math.floor((px * raw) / PITCH_SCALE)
}

/**
 * Ceiling on a pitched dimension, from the generated attribute table
 * (`pitchedWidth`/`pitchedHeight`, `max: 65535`). Also the ceiling on the AOI
 * position and size attributes.
 */
export const PITCHED_MAX = 65535

/** Where the ratio lives in the AWJ object model, for one output logic key. */
export function awjPath(outputKey: string, axis: 'H' | 'V'): string[] {
  return [
    'device', 'outputList', 'items', outputKey,
    'canvas', 'cmd', 'pp', axis === 'H' ? 'pitchRatioH' : 'pitchRatioV',
  ]
}

/**
 * The write that commits a staged pitch change.
 *
 * Setting `pitchRatioH` alone changed `cmd` but left `status.pitchedWidth`
 * where it was; the status only moved once `xUpdate` was written true.
 */
export function awjCommitPath(outputKey: string): string[] {
  return ['device', 'outputList', 'items', outputKey, 'canvas', 'cmd', 'pp', 'xUpdate']
}

/** The labels the vendor UI puts on these two fields, under a "Pitch" heading. */
export const FIELD_LABELS = { H: 'H Ratio', V: 'V Ratio' } as const

/** Where the operator finds them. */
export const UI_LOCATION = 'Preconfig > Canvas > (select output group) > Pitch'
