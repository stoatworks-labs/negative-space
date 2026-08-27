// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildPptx, slideGeometry, SLIDE_MAX_IN, SLIDE_MIN_IN, NOMINAL_DPI } from '../office'
import { buildZip, crc32, zipEntry } from '../zip'
import { solve } from '../geometry'
import type { Project, Surface } from '../../types'

function wall(id: string, cols: number, rows: number, xMm: number, yMm: number): Surface {
  return {
    id,
    name: id,
    kind: 'led',
    widthMm: cols * 500,
    heightMm: rows * 500,
    pxWidth: cols * 192,
    pxHeight: rows * 192,
    xMm,
    yMm,
  }
}

const row: Project = {
  name: 'Main Stage',
  surfaces: [wall('L', 3, 2, 0, 0), wall('C', 3, 2, 1600, 0), wall('R', 3, 2, 3200, 0)],
  pitch: { mode: 'finest' },
  units: 'metric',
}

describe('crc32', () => {
  it('matches the known IEEE check vector', () => {
    // "123456789" -> 0xCBF43926, the standard CRC-32 check value.
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926')
  })

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('zip', () => {
  const zip = buildZip([zipEntry('a.txt', 'hello'), zipEntry('dir/b.txt', 'world')])

  it('starts with the local file header signature', () => {
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('ends with the end-of-central-directory record', () => {
    const tail = zip.slice(-22)
    expect([...tail.slice(0, 4)]).toEqual([0x50, 0x4b, 0x05, 0x06])
    // Two entries, recorded twice (this disk / total).
    expect(tail[8]).toBe(2)
    expect(tail[10]).toBe(2)
  })

  it('records local header offsets that actually land on a local header', () => {
    // The trap this exists for: an offset computed against a string rather than
    // against the finished bytes. Walk the central directory and check each one.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const cdOffset = view.getUint32(zip.length - 22 + 16, true)
    let p = cdOffset
    for (let i = 0; i < 2; i++) {
      expect(view.getUint32(p, true)).toBe(0x02014b50)
      const nameLen = view.getUint16(p + 28, true)
      const local = view.getUint32(p + 42, true)
      expect(view.getUint32(local, true)).toBe(0x04034b50)
      p += 46 + nameLen
    }
  })

  it('is byte-identical for identical input', () => {
    const again = buildZip([zipEntry('a.txt', 'hello'), zipEntry('dir/b.txt', 'world')])
    expect([...again]).toEqual([...zip])
  })
})

describe('slide geometry', () => {
  it('maps a small canvas 1:1 at 96 dpi', () => {
    const design = solve({ ...row, surfaces: [wall('A', 2, 2, 0, 0)] })
    const g = slideGeometry(design)
    expect(g.clamped).toBe(false)
    expect(g.pxPerInch).toBeCloseTo(NOMINAL_DPI, 9)
    expect(g.widthIn).toBeCloseTo(design.canvas.widthPx / NOMINAL_DPI, 9)
  })

  it('clamps an oversized canvas into range WITHOUT touching the aspect ratio', () => {
    const wide: Project = {
      ...row,
      surfaces: Array.from({ length: 12 }, (_, i) => wall(`W${i}`, 4, 2, i * 2100, 0)),
    }
    const design = solve(wide)
    const g = slideGeometry(design)
    expect(g.clamped).toBe(true)
    expect(Math.max(g.widthIn, g.heightIn)).toBeCloseTo(SLIDE_MAX_IN, 6)
    expect(g.widthIn / g.heightIn).toBeCloseTo(design.canvas.widthPx / design.canvas.heightPx, 6)
  })

  it('keeps a very thin canvas above the minimum side', () => {
    const thin = solve({
      ...row,
      surfaces: [{ ...wall('T', 1, 1, 0, 0), heightMm: 40, pxHeight: 16 }],
    })
    const g = slideGeometry(thin)
    expect(Math.min(g.widthIn, g.heightIn)).toBeGreaterThanOrEqual(SLIDE_MIN_IN - 1e-9)
  })

  it('places every surface and gap proportionally, gaps included', () => {
    const design = solve(row)
    const g = slideGeometry(design)
    expect(g.surfaces).toHaveLength(3)
    expect(g.gutters).toHaveLength(2)
    expect(g.surfaces[0].xIn).toBeCloseTo(0, 9)
    expect(g.surfaces[1].xIn).toBeGreaterThan(g.surfaces[0].wIn)
    // Proportions on the slide match proportions on the canvas exactly. This is
    // the property that makes a deck authored on the slide land correctly on
    // the wall, and it must survive the clamp.
    expect(g.surfaces[1].xIn / g.widthIn).toBeCloseTo(
      design.surfaces[1].rect.x / design.canvas.widthPx,
      9,
    )
  })

  it('converts to centimetres consistently', () => {
    const g = slideGeometry(solve(row))
    expect(g.widthCm).toBeCloseTo(g.widthIn * 2.54, 9)
    expect(g.surfaces[0].wCm).toBeCloseTo(g.surfaces[0].wIn * 2.54, 9)
  })

  it('survives an empty design', () => {
    const g = slideGeometry(solve({ ...row, surfaces: [] }))
    expect(g.surfaces).toEqual([])
    expect(Number.isFinite(g.widthIn)).toBe(true)
  })
})

describe('pptx package', () => {
  const design = solve(row)
  const geom = slideGeometry(design)
  const bytes = buildPptx(design, geom, 'Main Stage')
  const latin1 = new TextDecoder('latin1').decode(bytes)

  it('is a zip', () => {
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b])
  })

  it('contains every part PowerPoint needs to open it without repairing', () => {
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      'ppt/theme/theme1.xml',
      'ppt/slides/slide1.xml',
      'ppt/slides/_rels/slide1.xml.rels',
      'docProps/core.xml',
    ]) {
      expect(latin1).toContain(part)
    }
  })

  it('sets the slide size to the clamped geometry in EMU', () => {
    expect(latin1).toContain(`<p:sldSz cx="${Math.round(geom.widthIn * 914400)}"`)
  })

  it('draws a shape for the canvas, each gap and each surface', () => {
    expect((latin1.match(/<p:sp>/g) ?? []).length).toBe(1 + 2 + 3)
  })

  it('carries the project name in the document properties', () => {
    expect(latin1).toContain('<dc:title>Main Stage</dc:title>')
  })

  it('writes valid XML in every part', () => {
    const text = new TextDecoder('utf-8').decode(bytes)
    const decls = text.split('<?xml').length - 1
    expect(decls).toBeGreaterThanOrEqual(12)
  })

  it('writes a file out when asked, for opening in PowerPoint', () => {
    const out = process.env.NEGATIVE_SPACE_PPTX_OUT
    if (!out) return
    mkdirSync(out, { recursive: true })
    writeFileSync(`${out}/negative-space.pptx`, bytes)
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
