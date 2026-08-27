import type { Design, Project, Surface } from '../types'
import { slideGeometry } from './office'

/**
 * CSV and JSON.
 *
 * The JSON is a PROJECT file — the inputs — not the solved design. Saving the
 * outputs would be saving a cache: reopened in a later version with a fixed
 * rounding rule it would contradict what that version computes, and there
 * would be no way to tell which was right. The inputs re-solve to the outputs
 * for free, so only the inputs are stored.
 */

export const PROJECT_FILE_VERSION = 1

export type ProjectFile = {
  format: 'negative-space.project'
  version: number
  savedAt: string
  project: Project
}

export function toProjectFile(project: Project): string {
  const file: ProjectFile = {
    format: 'negative-space.project',
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    project,
  }
  return JSON.stringify(file, null, 2)
}

/**
 * Parse a saved project, rejecting anything that is not one.
 *
 * Throws with a message meant for a person: this is reached by someone
 * dropping the wrong file on the window, which is a mistake, not a fault.
 */
export function fromProjectFile(text: string): Project {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const f = parsed as Partial<ProjectFile>
  if (f?.format !== 'negative-space.project') {
    throw new Error('That is not a Negative Space project file.')
  }
  if (typeof f.version !== 'number' || f.version > PROJECT_FILE_VERSION) {
    throw new Error(
      `That project was saved by a newer version of the tool (format ${String(f.version)}).`,
    )
  }
  const p = f.project
  if (!p || !Array.isArray(p.surfaces)) {
    throw new Error('That project file has no surfaces in it.')
  }
  return {
    name: typeof p.name === 'string' ? p.name : 'Untitled',
    units: p.units === 'imperial' ? 'imperial' : 'metric',
    pitch: p.pitch ?? { mode: 'finest' },
    surfaces: p.surfaces.map(sanitiseSurface),
  }
}

function sanitiseSurface(s: Partial<Surface>, i: number): Surface {
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return {
    id: typeof s.id === 'string' ? s.id : `s${i}`,
    name: typeof s.name === 'string' ? s.name : `Surface ${i + 1}`,
    kind: s.kind === 'projection' ? 'projection' : 'led',
    widthMm: num(s.widthMm, 0),
    heightMm: num(s.heightMm, 0),
    pxWidth: num(s.pxWidth, 0),
    pxHeight: num(s.pxHeight, 0),
    xMm: num(s.xMm, 0),
    yMm: num(s.yMm, 0),
  }
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRows(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/**
 * One CSV covering surfaces, gaps and the totals.
 *
 * Three tables in one file rather than three files: this gets opened in a
 * spreadsheet next to a rigging plot, and a single attachment is what actually
 * gets forwarded. A blank line and a new header row is a convention every
 * spreadsheet handles.
 */
export function toCsv(design: Design): string {
  const geom = slideGeometry(design)
  const rows: (string | number)[][] = []

  rows.push(['SURFACES'])
  rows.push([
    'Name', 'Kind',
    'Width mm', 'Height mm',
    'Native px W', 'Native px H',
    'Pitch mm X', 'Pitch mm Y',
    'Position X mm', 'Position Y mm',
    'Canvas X px', 'Canvas Y px', 'Canvas W px', 'Canvas H px',
    'Scale X', 'Scale Y',
    'Slide X cm', 'Slide Y cm', 'Slide W cm', 'Slide H cm',
  ])
  design.surfaces.forEach((p, i) => {
    const g = geom.surfaces[i]
    rows.push([
      p.surface.name, p.surface.kind,
      round(p.surface.widthMm), round(p.surface.heightMm),
      p.surface.pxWidth, p.surface.pxHeight,
      round(p.pitch.xMm, 4), round(p.pitch.yMm, 4),
      round(p.surface.xMm), round(p.surface.yMm),
      p.rect.x, p.rect.y, p.rect.w, p.rect.h,
      round(p.scaleX, 4), round(p.scaleY, 4),
      round(g.xCm, 2), round(g.yCm, 2), round(g.wCm, 2), round(g.hCm, 2),
    ])
  })

  rows.push([])
  rows.push(['GAPS (negative space)'])
  rows.push([
    'Axis', 'Gap mm', 'Blank px', 'Blank px exact',
    'Rounding error mm', 'Canvas from px', 'Canvas to px',
  ])
  for (const g of design.gutters) {
    rows.push([
      g.axis === 'x' ? 'vertical gap' : 'horizontal gap',
      round(g.mm), g.px, round(g.exactPx, 3),
      round(g.residualMm, 2), g.startPx, g.endPx,
    ])
  }

  rows.push([])
  rows.push(['TOTALS'])
  rows.push(['Canvas width px', design.canvas.widthPx])
  rows.push(['Canvas height px', design.canvas.heightPx])
  rows.push(['Canvas pitch mm', round(design.canvas.pitchMm, 4)])
  rows.push(['Physical width mm', round(design.canvas.widthMm)])
  rows.push(['Physical height mm', round(design.canvas.heightMm)])
  rows.push(['Active pixels', design.budget.activePx])
  rows.push(['Blank pixels in gaps', design.budget.blankPx])
  rows.push(['Blank percentage', round(design.budget.blankFraction * 100, 2)])
  rows.push(['Native pixels driven', design.budget.nativePx])
  rows.push(['PowerPoint slide W cm', round(geom.widthCm, 2)])
  rows.push(['PowerPoint slide H cm', round(geom.heightCm, 2)])

  return csvRows(rows)
}

function round(v: number, dp = 1): number {
  const k = 10 ** dp
  return Math.round(v * k) / k
}
