import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { solve } from '../geometry'
import { planLivePremier, referenceRects, toOutputGroup } from '../livepremier'
import type { Project, Surface } from '../../types'

/**
 * Same reference cabinet as geometry.test.ts — a 500 x 500 mm / 192 x 192 px
 * panel, pitch 2.604166... mm. Deliberately not a round number, so a ratio that
 * happens to land clean is the exception rather than the thing being tested.
 */
const PANEL_MM = 500
const PANEL_PX = 192

function wall(id: string, name: string, cols: number, rows: number, xMm: number, coarse = 1): Surface {
  return {
    id,
    name,
    kind: 'led',
    widthMm: cols * PANEL_MM,
    heightMm: rows * PANEL_MM,
    /* `coarse` halves (or quarters) the raster over the same physical area,
       which is exactly what a coarser-pitch product is. */
    pxWidth: (cols * PANEL_PX) / coarse,
    pxHeight: (rows * PANEL_PX) / coarse,
    xMm,
    yMm: 0,
  }
}

function project(surfaces: Surface[], pitch: Project['pitch'] = { mode: 'finest' }): Project {
  return { name: 'test', surfaces, pitch, units: 'metric' }
}

describe('toOutputGroup', () => {
  it('hands the engine the measured size, not a pitch derived on the way in', () => {
    const g = toOutputGroup(wall('a', 'Left', 3, 2, 0))
    expect(g.entry).toEqual({ mode: 'size', widthMm: 1500, heightMm: 1000 })
    expect([g.pxWidth, g.pxHeight]).toEqual([576, 384])
  })

  it('leaves the output key empty — this tool does not know the connectors', () => {
    /* A guessed key would end up on a write to a real switcher. */
    expect(toOutputGroup(wall('a', 'Left', 3, 2, 0)).outputKey).toBe('')
  })
})

describe('planLivePremier', () => {
  it('gives the finest wall 1.000 and a half-resolution wall 2.000', () => {
    const design = solve(project([
      wall('a', 'Fine', 3, 2, 0),
      wall('b', 'Coarse', 3, 2, 2000, 2),
    ]))
    const plan = planLivePremier(design)!

    expect(plan.result.reference!.group.id).toBe('a')
    expect(plan.result.groups[0].h.ratio).toBe(1)
    expect(plan.result.groups[1].h.ratio).toBe(2)
    /* The coarse wall takes MORE canvas than its raster, not less. */
    expect(plan.result.groups[1].h.footprint).toBe(576)
    expect(plan.result.groups[1].group.pxWidth).toBe(288)
  })

  it('agrees with this tool s own canvas when the pitch mode is finest', () => {
    const design = solve(project([
      wall('a', 'Fine', 3, 2, 0),
      wall('b', 'Coarse', 3, 2, 2000, 2),
    ]))
    const plan = planLivePremier(design)!

    expect(plan.canvasesAgree).toBe(true)
    expect(plan.projectPitchMm).toBeCloseTo(plan.referencePitchMm, 9)
  })

  it('says plainly when the project canvas is NOT the LivePremier canvas', () => {
    /*
     * A coarsest or manual canvas is a legitimate thing to want here and a poor
     * thing to send to a video wall: no surface would sit at 1.000 and the
     * whole screen would upscale. The plan keeps the sane reference and reports
     * the difference rather than silently meaning a different canvas from the
     * one on screen.
     */
    const surfaces = [wall('a', 'Fine', 3, 2, 0), wall('b', 'Coarse', 3, 2, 2000, 2)]
    const design = solve(project(surfaces, { mode: 'coarsest' }))
    const plan = planLivePremier(design)!

    expect(plan.canvasesAgree).toBe(false)
    expect(plan.projectPitchMm).toBeCloseTo(plan.referencePitchMm * 2, 6)
    /* The reference is still the fine wall, so nothing upscales. */
    expect(plan.result.groups[0].h.ratio).toBe(1)
    expect(plan.result.groups[1].h.ratio).toBe(2)
  })

  it('is null rather than broken when nothing is dimensioned yet', () => {
    expect(planLivePremier(solve(project([])))).toBeNull()
    const half = { ...wall('a', 'Left', 3, 2, 0), pxWidth: 0 }
    expect(planLivePremier(solve(project([half])))).toBeNull()
  })

  it('carries the drift the device s three-decimal field causes', () => {
    /* 500/192 = 2.604166..., against a wall at 4 mm: 1.53600 exactly is not
       what a 3:2-panel array gives, so this lands on a real remainder. */
    const fine = wall('a', 'Fine', 3, 2, 0)
    const odd: Surface = {
      ...wall('b', 'Odd', 3, 2, 2000),
      pxWidth: 500, pxHeight: 333,
    }
    const plan = planLivePremier(solve(project([fine, odd])))!
    const g = plan.result.groups[1]

    expect(g.h.ratio).toBeCloseTo(Math.round(g.h.exact * 1000) / 1000, 9)
    expect(g.h.ratio).not.toBe(g.h.exact)
    /* The drift is reported in real millimetres on the wall, which is the
       number that decides whether the rounding matters. */
    expect(Number.isFinite(g.h.errorMm)).toBe(true)
    expect(Math.abs(g.h.errorMm)).toBeLessThan(plan.referencePitchMm * 2)
  })
})

describe('referenceRects', () => {
  it('matches this tool s own rects when the two canvases agree', () => {
    const design = solve(project([
      wall('a', 'Fine', 3, 2, 0),
      wall('b', 'Coarse', 3, 2, 2000, 2),
    ]))
    const plan = planLivePremier(design)!
    const rects = referenceRects(design, plan)

    for (const r of rects) {
      const placed = design.surfaces.find((p) => p.surface.id === r.id)!
      expect(r.w).toBe(placed.rect.w)
      expect(r.x).toBe(placed.rect.x)
    }
  })

  it('rescales when they do not, so the rects and the ratios mean one canvas', () => {
    const surfaces = [wall('a', 'Fine', 3, 2, 0), wall('b', 'Coarse', 3, 2, 2000, 2)]
    const coarse = solve(project(surfaces, { mode: 'coarsest' }))
    const plan = planLivePremier(coarse)!
    const rects = referenceRects(coarse, plan)

    /* The coarsest canvas is half the resolution of the reference one, so every
       rect doubles on the way to LivePremier units. Reading the on-screen rects
       against these ratios instead would be mixing two canvases. */
    const fine = rects.find((r) => r.id === 'a')!
    expect(fine.w).toBe(576)
    expect(coarse.surfaces.find((p) => p.surface.id === 'a')!.rect.w).toBe(288)
  })
})

describe('the vendored engine', () => {
  const dir = fileURLToPath(new URL('../../vendor/aquilon-pitch/', import.meta.url))
  const upstream = fileURLToPath(new URL('../../../../aquilon-pitch/src/lib/', import.meta.url))

  it('has not been edited in place', async () => {
    /* The manifest is the copy's own record, so a hand-edited vendored file is
       caught even with no upstream checkout to compare against. */
    const manifest = JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8'))
    for (const [rel, hash] of Object.entries(manifest.files as Record<string, string>)) {
      const body = await readFile(join(dir, rel))
      expect(createHash('sha256').update(body).digest('hex'), `${rel} was edited here — edits belong upstream`)
        .toBe(hash)
    }
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$|^unknown$/)
  })

  it('matches an upstream checkout, when there is one beside this repo', async () => {
    try {
      await readdir(upstream)
    } catch {
      /* A clone on its own machine still gets a green run. */
      return
    }
    const manifest = JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8'))
    for (const [rel, hash] of Object.entries(manifest.files as Record<string, string>)) {
      const body = await readFile(join(upstream, rel))
      expect(createHash('sha256').update(body).digest('hex'), `${rel} has drifted — run: npm run sync:pitch-engine`)
        .toBe(hash)
    }
  })

  it('still holds the four facts this feature leans on', async () => {
    /*
     * The whole reason the engine is borrowed rather than re-typed. Each of
     * these was established upstream by driving a LivePremier simulator, and
     * each is one character away from being wrong and still looking right.
     */
    const eng = await import('../../vendor/aquilon-pitch/index')

    expect(eng.PITCH_SCALE).toBe(1000)
    expect(eng.PITCH_MIN).toBe(100)
    expect(eng.PITCH_MAX).toBe(10000)
    /* Floors, does not round. */
    expect(eng.footprint(1080, 1234)).toBe(1332)
    expect(eng.footprint(1920, 1001)).toBe(1921)
  })

  it('refuses a ratio the device would discard rather than clamping it', async () => {
    const fine = wall('a', 'Fine', 3, 2, 0)
    const absurd: Surface = { ...wall('b', 'Absurd', 3, 2, 2000), pxWidth: 20, pxHeight: 13 }
    const plan = planLivePremier(solve(project([fine, absurd])))!

    expect(plan.result.groups[1].h.outOfRange).toBe(true)
    expect(plan.result.warnings.some((w) => w.code === 'out-of-range' && w.level === 'error')).toBe(true)
  })
})
