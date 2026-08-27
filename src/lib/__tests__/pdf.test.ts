// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildPdf } from '../pdf'
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

const CASES: Record<string, Project> = {
  row: {
    name: 'Main Stage Row',
    surfaces: [wall('Left', 3, 2, 0, 0), wall('Centre', 3, 2, 1600, 0), wall('Right', 3, 2, 3200, 0)],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
  grid: {
    name: 'Upstage Grid',
    surfaces: [
      wall('TL', 2, 2, 0, 0), wall('TR', 2, 2, 1120, 0),
      wall('BL', 2, 2, 0, 1080), wall('BR', 2, 2, 1120, 1080),
    ],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
  broken: {
    // Deliberately awful: overlapping, mixed pitch, a sub-pixel gap and a
    // surface with no resolution. The report must still build.
    name: 'Broken',
    surfaces: [
      wall('A', 2, 2, 0, 0),
      wall('B', 2, 2, 500, 0),
      { ...wall('Coarse', 2, 2, 3000, 0), pxWidth: 192, pxHeight: 192 },
      { ...wall('NoRes', 1, 1, 5000, 0), pxWidth: 0 },
      wall('C', 1, 1, 6001, 0),
    ],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
  single: {
    name: 'One Wall',
    surfaces: [wall('Only', 4, 3, 0, 0)],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
  empty: { name: 'Nothing', surfaces: [], pitch: { mode: 'finest' }, units: 'metric' },
}

describe('PDF report', () => {
  for (const [label, project] of Object.entries(CASES)) {
    it(`builds for: ${label}`, async () => {
      const blob = await buildPdf(solve(project))
      expect(blob.size).toBeGreaterThan(1000)
      const head = new TextDecoder('latin1').decode(
        new Uint8Array(await blob.arrayBuffer()).slice(0, 5),
      )
      expect(head).toBe('%PDF-')
    })
  }

  it('writes the reports out when asked, for looking at', async () => {
    const out = process.env.NEGATIVE_SPACE_PDF_OUT
    if (!out) return
    mkdirSync(out, { recursive: true })
    for (const [label, project] of Object.entries(CASES)) {
      const blob = await buildPdf(solve(project))
      writeFileSync(`${out}/${label}.pdf`, new Uint8Array(await blob.arrayBuffer()))
    }
    expect(true).toBe(true)
  })
})
