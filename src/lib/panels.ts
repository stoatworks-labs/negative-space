import type { Surface } from '../types'

/**
 * Cabinet presets.
 *
 * Each entry is a panel's physical size and its EXACT pixel count, so the pitch
 * comes out of the division rather than being typed in. That matters: a "P2.6"
 * cabinet is really 2.604166 mm, and a rig quoted at a rounded 2.6 drifts by
 * most of a pixel every two metres.
 *
 * These are the standard 500 mm module geometries the trade builds from, not
 * specific products — no manufacturer's specification is being asserted here,
 * so there is nothing to be wrong about. Enter a real cabinet's numbers
 * directly for anything else.
 */
export type PanelPreset = {
  label: string
  panelWMm: number
  panelHMm: number
  panelWPx: number
  panelHPx: number
}

export const PANEL_PRESETS: PanelPreset[] = [
  { label: 'P1.5 · 500×500 · 320×320', panelWMm: 500, panelHMm: 500, panelWPx: 320, panelHPx: 320 },
  { label: 'P1.9 · 500×500 · 256×256', panelWMm: 500, panelHMm: 500, panelWPx: 256, panelHPx: 256 },
  { label: 'P2.6 · 500×500 · 192×192', panelWMm: 500, panelHMm: 500, panelWPx: 192, panelHPx: 192 },
  { label: 'P2.9 · 500×500 · 168×168', panelWMm: 500, panelHMm: 500, panelWPx: 168, panelHPx: 168 },
  { label: 'P3.9 · 500×500 · 128×128', panelWMm: 500, panelHMm: 500, panelWPx: 128, panelHPx: 128 },
  { label: 'P4.8 · 500×500 · 104×104', panelWMm: 500, panelHMm: 500, panelWPx: 104, panelHPx: 104 },
  { label: 'P2.6 · 500×1000 · 192×384', panelWMm: 500, panelHMm: 1000, panelWPx: 192, panelHPx: 384 },
  { label: 'P3.9 · 500×1000 · 128×256', panelWMm: 500, panelHMm: 1000, panelWPx: 128, panelHPx: 256 },
]

export function wallFromPanels(
  id: string,
  name: string,
  preset: PanelPreset,
  cols: number,
  rows: number,
  xMm: number,
  yMm: number,
): Surface {
  return {
    id,
    name,
    kind: 'led',
    widthMm: preset.panelWMm * cols,
    heightMm: preset.panelHMm * rows,
    pxWidth: preset.panelWPx * cols,
    pxHeight: preset.panelHPx * rows,
    xMm,
    yMm,
  }
}

/** Common projector rasters, for a projection surface of a given physical size. */
export const PROJECTOR_RASTERS = [
  { label: 'HD 1920×1080', w: 1920, h: 1080 },
  { label: 'WUXGA 1920×1200', w: 1920, h: 1200 },
  { label: '4K UHD 3840×2160', w: 3840, h: 2160 },
  { label: 'DCI 4K 4096×2160', w: 4096, h: 2160 },
]
