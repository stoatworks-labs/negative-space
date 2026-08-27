// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { DEFAULT_GUIDE, guideSvg } from '../guide'
import { solve } from '../geometry'
import type { Project, Surface } from '../../types'

function wall(id: string, cols: number, rows: number, xMm: number, yMm: number): Surface {
  return {
    id, name: id, kind: 'led',
    widthMm: cols * 500, heightMm: rows * 500,
    pxWidth: cols * 192, pxHeight: rows * 192,
    xMm, yMm,
  }
}

const row: Project = {
  name: 'Row',
  surfaces: [wall('Left', 3, 2, 0, 0), wall('Centre', 3, 2, 1600, 0), wall('Right', 3, 2, 3200, 0)],
  pitch: { mode: 'finest' },
  units: 'metric',
}

const grid: Project = {
  name: 'Grid',
  surfaces: [
    wall('TL', 2, 2, 0, 0), wall('TR', 2, 2, 1120, 0),
    wall('BL', 2, 2, 0, 1080), wall('BR', 2, 2, 1120, 1080),
  ],
  pitch: { mode: 'finest' },
  units: 'metric',
}

describe('guide image', () => {
  const design = solve(row)
  const svg = guideSvg(design, DEFAULT_GUIDE)

  it('is well-formed SVG', () => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('is EXACTLY the canvas size, so it can be used as a 1:1 plate', () => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement
    expect(root.getAttribute('width')).toBe(String(design.canvas.widthPx))
    expect(root.getAttribute('height')).toBe(String(design.canvas.heightPx))
    expect(root.getAttribute('viewBox')).toBe(
      `0 0 ${design.canvas.widthPx} ${design.canvas.heightPx}`,
    )
  })

  it('draws every surface at its canvas rect', () => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const rects = [...doc.querySelectorAll('rect')]
    for (const p of design.surfaces) {
      const hit = rects.find(
        (r) =>
          r.getAttribute('x') === String(p.rect.x) &&
          r.getAttribute('width') === String(p.rect.w),
      )
      expect(hit, `no rect for ${p.surface.name}`).toBeTruthy()
    }
  })

  it('labels each gap with its blank pixel count', () => {
    for (const g of design.gutters) {
      expect(svg).toContain(`${g.px} px`)
    }
  })

  it('escapes a surface name rather than breaking the document', () => {
    const nasty = solve({
      ...row,
      surfaces: [{ ...wall('x', 2, 2, 0, 0), name: 'Stage <Left> & "Right"' }],
    })
    const out = guideSvg(nasty, DEFAULT_GUIDE)
    expect(out).toContain('&lt;Left&gt;')
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('honours the options', () => {
    const bare = guideSvg(design, {
      ...DEFAULT_GUIDE, labels: false, gutterLabels: false, fill: false,
    })
    expect(bare).not.toContain('native')
    expect(bare).toContain('fill="none"')
  })

  it('produces a valid document for an empty design', () => {
    const out = guideSvg(solve({ ...row, surfaces: [] }), DEFAULT_GUIDE)
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('writes the guides out when asked, for looking at', () => {
    const out = process.env.NEGATIVE_SPACE_SVG_OUT
    if (!out) return
    mkdirSync(out, { recursive: true })
    writeFileSync(`${out}/row.svg`, svg)
    writeFileSync(`${out}/grid.svg`, guideSvg(solve(grid), DEFAULT_GUIDE))
    writeFileSync(
      `${out}/row-grid.svg`,
      guideSvg(design, { ...DEFAULT_GUIDE, grid: true, gridPx: 100, centreMarks: true }),
    )
    expect(svg.length).toBeGreaterThan(100)
  })
})
