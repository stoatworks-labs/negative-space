// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { exportResolumeXml } from '../resolume'
import { solve } from '../geometry'
import type { Project, Surface } from '../../types'

/**
 * Structural conformance test.
 *
 * REFERENCE_SHAPES below is the complete set of `element path [sorted attribute
 * names]` pairs found in two files written by a real Resolume Arena 7.27.0
 * (rev 14395) install:
 *
 *   ~/Documents/Resolume Arena/Preferences/AdvancedOutput.xml
 *   ~/Documents/Resolume Arena/Presets/Advanced Output/output_map_1.xml
 *
 * The list was extracted mechanically (see docs/resolume-export.md for the
 * script), not transcribed by hand, and the `/XmlState` wrapper is normalised
 * away so the preset and preferences forms compare like for like.
 *
 * The rule this enforces: the exporter may only emit element/attribute shapes
 * Arena itself writes. Inventing a plausible-looking parameter is the one
 * failure mode that produces a file Arena silently mis-parses — it loads, it
 * looks fine, and it is wrong. If a shape genuinely needs adding, add it here
 * WITH a reference file that contains it, not because it looks right.
 */
const REFERENCE_SHAPES = new Set([
  '/ScreenSetup [name]',
  '/ScreenSetup/CurrentCompositionTextureSize [height width]',
  '/ScreenSetup/Params [name]',
  '/ScreenSetup/SoftEdging []',
  '/ScreenSetup/SoftEdging/Params [name]',
  '/ScreenSetup/SoftEdging/Params/ParamRange [T default name value]',
  '/ScreenSetup/SoftEdging/Params/ParamRange/PhaseSourceStatic [name]',
  '/ScreenSetup/screens []',
  '/ScreenSetup/screens/Screen [name uniqueId]',
  '/ScreenSetup/screens/Screen/OutputDevice []',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceNDI [deviceId height idHash name width]',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceVirtual [deviceId height name width]',
  '/ScreenSetup/screens/Screen/Params [name]',
  '/ScreenSetup/screens/Screen/Params/Param [T default name value]',
  '/ScreenSetup/screens/Screen/guides []',
  '/ScreenSetup/screens/Screen/guides/ScreenGuide [name type]',
  '/ScreenSetup/screens/Screen/layers []',
  '/ScreenSetup/screens/Screen/layers/Slice [uniqueId]',
  '/ScreenSetup/screens/Screen/layers/Slice/InputRect [orientation]',
  '/ScreenSetup/screens/Screen/layers/Slice/InputRect/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/OutputRect [orientation]',
  '/ScreenSetup/screens/Screen/layers/Slice/OutputRect/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Params [name]',
  '/ScreenSetup/screens/Screen/layers/Slice/Params/Param [T default name value]',
  '/ScreenSetup/screens/Screen/layers/Slice/Params/ParamChoice [default name storeChoices value]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/BezierWarper [controlHeight controlWidth]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/BezierWarper/vertices []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/BezierWarper/vertices/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/dst []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/dst/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/src []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/src/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Params [name]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Params/Param [T default name value]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Params/ParamChoice [default name storeChoices value]',
  '/ScreenSetup/versionInfo [majorVersion microVersion minorVersion name revision]',
  '/versionInfo [majorVersion microVersion minorVersion name revision]',
])

function shapesOf(xml: string): Set<string> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  const out = new Set<string>()
  const walk = (el: Element, path: string) => {
    // The preset wrapper is normalised away, exactly as in the extractor.
    const p = el.tagName === 'XmlState' ? path : `${path}/${el.tagName}`
    if (el.tagName !== 'XmlState') {
      const attrs = [...el.attributes].map((a) => a.name).sort().join(' ')
      out.add(`${p} [${attrs}]`)
    }
    for (const c of [...el.children]) walk(c, p)
  }
  walk(doc.documentElement, '')
  return out
}

const PANEL = 500 / 192

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

const LAYOUTS: Record<string, Project> = {
  'single surface': {
    name: 'One', surfaces: [wall('A', 2, 2, 0, 0)], pitch: { mode: 'finest' }, units: 'metric',
  },
  'a row with gaps': {
    name: 'Row',
    surfaces: [wall('L', 3, 2, 0, 0), wall('C', 3, 2, 1600, 0), wall('R', 3, 2, 3200, 0)],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
  'a grid with gaps on both axes': {
    name: 'Grid',
    surfaces: [
      wall('TL', 2, 2, 0, 0), wall('TR', 2, 2, 1120, 0),
      wall('BL', 2, 2, 0, 1080), wall('BR', 2, 2, 1120, 1080),
    ],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
  'mixed pitch': {
    name: 'Mixed',
    surfaces: [
      wall('fine', 2, 2, 0, 0),
      { ...wall('coarse', 2, 2, 1200, 0), pxWidth: 192, pxHeight: 192 },
    ],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
  'a name needing XML escaping': {
    name: 'Rock & "Roll" <2026>',
    surfaces: [{ ...wall('A', 2, 2, 0, 0), name: 'Stage Left & <Right>' }],
    pitch: { mode: 'finest' },
    units: 'metric',
  },
}

describe('Resolume XML conformance', () => {
  for (const [label, project] of Object.entries(LAYOUTS)) {
    for (const target of ['preferences', 'preset'] as const) {
      it(`emits only real Arena shapes: ${label}, ${target}`, () => {
        const xml = exportResolumeXml(solve(project), { name: project.name, target })
        const unknown = [...shapesOf(xml)].filter((s) => !REFERENCE_SHAPES.has(s))
        expect(unknown).toEqual([])
      })
    }
  }

  it('can actually catch an invented shape, so it cannot pass vacuously', () => {
    const xml = exportResolumeXml(solve(LAYOUTS['single surface']), {
      name: 'x',
      target: 'preferences',
    }).replace('</screens>', '<Param name="SoftEdgeLeft" value="0.1"/></screens>')
    const unknown = [...shapesOf(xml)].filter((s) => !REFERENCE_SHAPES.has(s))
    expect(unknown).toHaveLength(1)
    expect(unknown[0]).toBe('/ScreenSetup/screens/Param [name value]')
  })

  it('escapes names rather than producing broken XML', () => {
    const xml = exportResolumeXml(solve(LAYOUTS['a name needing XML escaping']), {
      name: LAYOUTS['a name needing XML escaping'].name,
      target: 'preferences',
    })
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&lt;Right&gt;')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })
})

describe('Resolume slice geometry', () => {
  const design = solve(LAYOUTS['a row with gaps'])

  it('offsets every input rect by the gaps to its left', () => {
    const xml = exportResolumeXml(design, { name: 'Row', target: 'preferences' })
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const inputs = [...doc.querySelectorAll('InputRect')].map((r) => {
      const v = [...r.querySelectorAll('v')]
      return { x0: Number(v[0].getAttribute('x')), x1: Number(v[1].getAttribute('x')) }
    })
    expect(inputs[0]).toEqual({ x0: 0, x1: 576 })
    // Wall C is at 1600 mm = 614.4 canvas px, so its slice starts at 614 —
    // NOT at 576, and not at a re-accumulated 576+38. See geometry.test.ts.
    expect(inputs[1].x0).toBe(Math.round(1600 / PANEL))
    expect(inputs[1].x1 - inputs[1].x0).toBe(576)
    expect(inputs[2].x0).toBe(Math.round(3200 / PANEL))
  })

  it('sets the composition texture size to the canvas INCLUDING the gaps', () => {
    const xml = exportResolumeXml(design, { name: 'Row', target: 'preferences' })
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const size = doc.querySelector('CurrentCompositionTextureSize')!
    expect(Number(size.getAttribute('width'))).toBe(design.canvas.widthPx)
    expect(Number(size.getAttribute('height'))).toBe(design.canvas.heightPx)
    // The point: it is wider than the surfaces laid edge to edge.
    expect(design.canvas.widthPx).toBeGreaterThan(3 * 576)
  })

  it('writes the output rect at the native raster, never at the canvas rect', () => {
    const mixed = solve(LAYOUTS['mixed pitch'])
    const xml = exportResolumeXml(mixed, { name: 'Mixed', target: 'preferences' })
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const devices = [...doc.querySelectorAll('OutputDeviceVirtual')]
    expect(devices.map((d) => d.getAttribute('width'))).toEqual(['384', '192'])
    // The coarse wall covers 384 canvas px but is a 192 px device: Arena
    // resamples, which is what a coarser pitch means.
    const coarse = mixed.surfaces.find((p) => p.surface.id === 'coarse')!
    expect(coarse.rect.w).toBe(384)
    expect(coarse.surface.pxWidth).toBe(192)
  })

  it('is deterministic given an id base', () => {
    const a = exportResolumeXml(design, { name: 'Row', target: 'preset', idBase: 1000 })
    const b = exportResolumeXml(design, { name: 'Row', target: 'preset', idBase: 1000 })
    expect(a).toBe(b)
    expect(a).toContain('uniqueId="1000"')
  })

  it('writes one screen per surface in both targets', () => {
    for (const target of ['preferences', 'preset'] as const) {
      const doc = new DOMParser().parseFromString(
        exportResolumeXml(design, { name: 'Row', target }),
        'application/xml',
      )
      expect(doc.querySelectorAll('Screen')).toHaveLength(3)
      expect(doc.querySelectorAll('Slice')).toHaveLength(3)
    }
  })
})
