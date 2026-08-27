import type { UnitSystem } from '../types'

/**
 * Metric/imperial at the edges only. The engine is millimetres throughout;
 * nothing in here is allowed to be called from geometry.ts.
 */

const MM_PER_IN = 25.4
const MM_PER_FT = 304.8

export function lengthUnit(units: UnitSystem): string {
  return units === 'metric' ? 'mm' : 'in'
}

/** Millimetres -> the display unit. */
export function fromMm(mm: number, units: UnitSystem): number {
  return units === 'metric' ? mm : mm / MM_PER_IN
}

/** The display unit -> millimetres. */
export function toMm(v: number, units: UnitSystem): number {
  return units === 'metric' ? v : v * MM_PER_IN
}

/** A length with its suffix, at a sensible scale for the magnitude. */
export function len(mm: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const inch = mm / MM_PER_IN
    return Math.abs(inch) >= 12 ? feetInches(mm) : `${inch.toFixed(2)}"`
  }
  if (Math.abs(mm) >= 1000) return `${(mm / 1000).toFixed(3)} m`
  return `${mm.toFixed(1)} mm`
}

export function feetInches(mm: number): string {
  const totalIn = mm / MM_PER_IN
  const sign = totalIn < 0 ? '-' : ''
  const abs = Math.abs(totalIn)
  const ft = Math.floor(abs / 12)
  const inch = abs - ft * 12
  return `${sign}${ft}' ${inch.toFixed(1)}"`
}

/** Both systems, for reports that get read on either side of the Atlantic. */
export function lenBoth(mm: number): string {
  const metric = Math.abs(mm) >= 1000 ? `${(mm / 1000).toFixed(3)} m` : `${mm.toFixed(1)} mm`
  return `${metric} (${feetInches(mm)})`
}

/** Millimetres to PowerPoint/Office points (72 per inch). */
export function mmToPt(mm: number): number {
  return (mm / MM_PER_IN) * 72
}

/** Millimetres to OOXML EMU. 914400 per inch, exact and integral by design. */
export function mmToEmu(mm: number): number {
  return Math.round((mm / MM_PER_IN) * 914400)
}

export function mmToIn(mm: number): number {
  return mm / MM_PER_IN
}

export function inToMm(inch: number): number {
  return inch * MM_PER_IN
}

export { MM_PER_IN, MM_PER_FT }

export function int(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

export function megapixels(n: number): string {
  return `${(n / 1e6).toFixed(2)} MP`
}

export function pct(fraction: number, dp = 1): string {
  return `${(fraction * 100).toFixed(dp)}%`
}

/** Pixel pitch is always quoted in mm, and always to three places. */
export function pitchLabel(mm: number): string {
  return `${mm.toFixed(3)} mm`
}

/**
 * The "P" designation the trade actually uses — P2.6, P3.9. Rounded to one
 * decimal because that is how cabinets are sold, and it is a LABEL: the exact
 * pitch is what the maths uses.
 */
export function pDesignation(mm: number): string {
  return `P${mm.toFixed(1).replace(/\.0$/, '')}`
}
