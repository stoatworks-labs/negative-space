/**
 * Turning a result into something you can act on: a list of fields to type, and
 * the AWJ frames that would type them for you.
 *
 * The frames are OFFERED, NOT SENT. This tool has no socket and will not grow
 * one. A pitch change is a preconfig change on a live show machine, and the
 * difference between a calculator that is always safe to open and a control
 * application is exactly this file declining to make the connection.
 */

import { awjPath, awjCommitPath, PITCH_UNITY, UI_LOCATION } from './device.ts'
import type { GroupResult, Result } from './types.ts'

/** One line of "go here, type this". */
export type Instruction = {
  groupId: string
  groupName: string
  outputKey: string
  hRatio: number
  vRatio: number
  isReference: boolean
  /** Nothing to do: the field is already at its default. */
  noop: boolean
}

export function instructions(result: Result): Instruction[] {
  return result.groups.map((g) => ({
    groupId: g.group.id,
    groupName: g.group.name,
    outputKey: g.group.outputKey,
    hRatio: g.h.ratio,
    vRatio: g.v.ratio,
    isReference: g.isReference,
    noop: g.h.raw === PITCH_UNITY && g.v.raw === PITCH_UNITY,
  }))
}

/** The operator-facing version: what to do in Web RCS, in order. */
export function walkthrough(result: Result): string {
  if (!result.reference) return 'Nothing to compensate yet.'

  const lines: string[] = []
  lines.push(`In Web RCS: ${UI_LOCATION}`)
  lines.push('')
  lines.push(
    `Reference group: ${result.reference.group.name || result.reference.group.id} — leave both `
    + 'ratios at 1.000. Every other group is measured against it.',
  )
  lines.push('')

  for (const g of result.groups) {
    if (g.isReference) continue
    const key = g.group.outputKey ? ` (output ${g.group.outputKey})` : ''
    if (g.h.outOfRange || g.v.outOfRange) {
      lines.push(`${g.group.name || g.group.id}${key}: NOT SETTABLE — ratio outside 0.100–10.000.`)
      continue
    }
    lines.push(
      `${g.group.name || g.group.id}${key}: H Ratio ${g.h.ratio.toFixed(3)}, `
      + `V Ratio ${g.v.ratio.toFixed(3)}  ->  ${g.h.footprint} x ${g.v.footprint} canvas px`,
    )
  }

  lines.push('')
  lines.push(`Screen canvas: ${result.canvas.width} x ${result.canvas.height} px.`)
  return lines.join('\n')
}

export type AwjFrame = { channel: 'DEVICE'; data: { path: string[]; value: number | boolean } }

/**
 * The frames a Web RCS socket would carry for this design.
 *
 * A group with no `outputKey` is skipped — a path with an empty key would
 * address nothing, and writing to output "" is the kind of thing that is
 * harmless right up until it is not.
 *
 * `xUpdate` is included per group and is not optional: writing the ratio alone
 * moves `cmd` and leaves `status.pitchedWidth` where it was. Verified on the
 * simulator, and it is the step a hand-written script forgets.
 */
export function awjFrames(result: Result): AwjFrame[] {
  const frames: AwjFrame[] = []
  for (const g of result.groups) {
    if (!g.group.outputKey) continue
    if (g.h.outOfRange || g.v.outOfRange) continue
    frames.push(frame(awjPath(g.group.outputKey, 'H'), g.h.raw))
    frames.push(frame(awjPath(g.group.outputKey, 'V'), g.v.raw))
    frames.push(frame(awjCommitPath(g.group.outputKey), true))
  }
  return frames
}

function frame(path: string[], value: number | boolean): AwjFrame {
  return { channel: 'DEVICE', data: { path, value } }
}

/** A CSV of the whole result, for the file that ends up in the show folder. */
export function csv(result: Result): string {
  const head = [
    'group', 'output', 'reference', 'raster_w', 'raster_h',
    'pitch_h_mm', 'pitch_v_mm', 'physical_w_mm', 'physical_h_mm',
    'exact_h', 'exact_v', 'set_h_ratio', 'set_v_ratio',
    'canvas_x', 'canvas_y', 'canvas_w', 'canvas_h',
    'drift_h_px', 'drift_v_px', 'drift_h_mm', 'drift_v_mm',
  ]
  const rows = result.groups.map((g: GroupResult) => [
    g.group.name, g.group.outputKey, g.isReference ? 'yes' : '',
    g.group.pxWidth, g.group.pxHeight,
    g.pitch.hMm.toFixed(4), g.pitch.vMm.toFixed(4),
    g.physicalWidthMm.toFixed(1), g.physicalHeightMm.toFixed(1),
    g.h.exact.toFixed(6), g.v.exact.toFixed(6),
    g.h.ratio.toFixed(3), g.v.ratio.toFixed(3),
    g.canvasX, g.canvasY, g.h.footprint, g.v.footprint,
    g.h.errorPx.toFixed(3), g.v.errorPx.toFixed(3),
    g.h.errorMm.toFixed(2), g.v.errorMm.toFixed(2),
  ])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
