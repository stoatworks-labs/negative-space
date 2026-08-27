import type { Design } from '../types'

/**
 * Resolume Arena "Advanced Output" export
 * =======================================
 *
 * The element names, attribute names and nesting here were read off two REAL
 * files written by Resolume Arena 7.27.0 (rev 14395) on this machine:
 *
 *   ~/Documents/Resolume Arena/Preferences/AdvancedOutput.xml
 *   ~/Documents/Resolume Arena/Presets/Advanced Output/output_map_1.xml
 *
 * They are not guessed from documentation. See docs/resolume-export.md, and
 * `resolume-schema.test.ts` for the rule that keeps it honest.
 *
 * What this writes, and why it is the point of the tool
 * ----------------------------------------------------
 * One `<Screen>` per surface, each holding one `<Slice>`:
 *
 *   InputRect   the surface's rectangle IN THE COMPOSITE CANVAS — offset by
 *               every gap to its left and above it. This is the whole reason
 *               the file exists. Typing these offsets by hand, for a dozen
 *               surfaces, from a pitch and a tape measure, is the error-prone
 *               job this tool removes.
 *   OutputRect  the surface's native raster, 0,0 -> w,h.
 *   Warper      identity 4x4 Bezier grid and identity homography, so warping
 *               starts from a known-good state.
 *   OutputDevice  Virtual, because a real display's deviceId and idHash are
 *               properties of the machine Arena runs on and cannot be
 *               synthesised elsewhere. Assign outputs once loaded.
 *
 * `CurrentCompositionTextureSize` is the composite canvas INCLUDING the blank
 * gap pixels. Set the composition to that size and content crossing a gap
 * lands correctly on the far side.
 *
 * What this does NOT write
 * ------------------------
 * Nothing about the gaps themselves. There is no Arena concept to carry them:
 * the gap is negative space, expressed entirely by where the input rects are.
 * Its only trace in the file is the distance between two InputRects, which is
 * exactly as it should be.
 */

export type ResolumeExportOptions = {
  /** Composition/project name, used for the screen names. */
  name: string
  /**
   * `preferences` -> a drop-in AdvancedOutput.xml (root <ScreenSetup>)
   * `preset`      -> a file for Presets/Advanced Output/ (root <XmlState>)
   */
  target: 'preferences' | 'preset'
  /** Base for the generated uniqueIds. Injectable so tests are deterministic. */
  idBase?: number
}

const ARENA_VERSION = {
  name: 'Resolume Arena',
  majorVersion: 7,
  minorVersion: 27,
  microVersion: 0,
  revision: 14395,
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Resolume writes plain decimals, and integers without a decimal point. */
function n(v: number): string {
  const r = Math.abs(v) < 1e-9 ? 0 : v
  return Number.isInteger(r) ? String(r) : String(Number(r.toFixed(6)))
}

function rect(x0: number, y0: number, x1: number, y1: number) {
  // Clockwise from top-left, matching how Arena writes InputRect/OutputRect.
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

function vertsXml(pts: { x: number; y: number }[], indent: string): string {
  return pts.map((p) => `${indent}<v x="${n(p.x)}" y="${n(p.y)}"/>`).join('\n')
}

/**
 * A 4x4 identity Bezier control grid over the output rect, written row-major
 * with y increasing — the ordering Arena uses for an unrotated slice.
 */
function bezierGrid(x0: number, y0: number, x1: number, y1: number) {
  const pts: { x: number; y: number }[] = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      pts.push({ x: x0 + ((x1 - x0) * c) / 3, y: y0 + ((y1 - y0) * r) / 3 })
    }
  }
  return pts
}

export type SliceLayout = {
  screenName: string
  sliceName: string
  /** The surface's region of the composite canvas, gaps already accounted for. */
  input: { x0: number; y0: number; x1: number; y1: number }
  /** The surface's own raster. */
  output: { width: number; height: number }
}

/** Turn a solved design into the slices the file describes. */
export function sliceLayout(design: Design, projectName: string): SliceLayout[] {
  return design.surfaces.map((p) => ({
    screenName: `${projectName} ${p.surface.name}`.trim(),
    sliceName: p.surface.name,
    input: {
      x0: p.rect.x,
      y0: p.rect.y,
      x1: p.rect.x + p.rect.w,
      y1: p.rect.y + p.rect.h,
    },
    output: { width: p.surface.pxWidth, height: p.surface.pxHeight },
  }))
}

function screenXml(slice: SliceLayout, screenId: number, sliceId: number, ind: string): string {
  const i = (k: number) => ind + '\t'.repeat(k)
  const { input, output } = slice
  const inputPts = rect(input.x0, input.y0, input.x1, input.y1)
  const outputPts = rect(0, 0, output.width, output.height)
  const bezier = bezierGrid(0, 0, output.width, output.height)

  return `${i(0)}<Screen name="${esc(slice.screenName)}" uniqueId="${screenId}">
${i(1)}<Params name="Params">
${i(2)}<Param name="Name" T="STRING" default="" value="${esc(slice.screenName)}"/>
${i(2)}<Param name="Enabled" T="BOOL" default="1" value="1"/>
${i(2)}<Param name="Hidden" T="BOOL" default="0" value="0"/>
${i(1)}</Params>
${i(1)}<guides>
${i(2)}<ScreenGuide name="ScreenGuide" type="0"/>
${i(2)}<ScreenGuide name="ScreenGuide" type="1"/>
${i(1)}</guides>
${i(1)}<layers>
${i(2)}<Slice uniqueId="${sliceId}">
${i(3)}<Params name="Common">
${i(4)}<Param name="Name" T="STRING" default="Layer" value="${esc(slice.sliceName)}"/>
${i(4)}<Param name="Enabled" T="BOOL" default="1" value="1"/>
${i(3)}</Params>
${i(3)}<Params name="Input">
${i(4)}<ParamChoice name="Input Source" default="0:1" value="0:1" storeChoices="0"/>
${i(3)}</Params>
${i(3)}<Params name="Output">
${i(4)}<Param name="Flip" T="UINT8" default="0" value="0"/>
${i(3)}</Params>
${i(3)}<InputRect orientation="0">
${vertsXml(inputPts, i(4))}
${i(3)}</InputRect>
${i(3)}<OutputRect orientation="0">
${vertsXml(outputPts, i(4))}
${i(3)}</OutputRect>
${i(3)}<Warper>
${i(4)}<Params name="Warper">
${i(5)}<ParamChoice name="Point Mode" default="PM_LINEAR" value="PM_LINEAR" storeChoices="0"/>
${i(5)}<Param name="Flip" T="UINT8" default="0" value="0"/>
${i(4)}</Params>
${i(4)}<BezierWarper controlWidth="4" controlHeight="4">
${i(5)}<vertices>
${vertsXml(bezier, i(6))}
${i(5)}</vertices>
${i(4)}</BezierWarper>
${i(4)}<Homography>
${i(5)}<src>
${vertsXml(outputPts, i(6))}
${i(5)}</src>
${i(5)}<dst>
${vertsXml(outputPts, i(6))}
${i(5)}</dst>
${i(4)}</Homography>
${i(3)}</Warper>
${i(2)}</Slice>
${i(1)}</layers>
${i(1)}<OutputDevice>
${i(2)}<OutputDeviceVirtual name="${esc(slice.screenName)}" deviceId="Virtual${esc(
    slice.screenName,
  )}" width="${output.width}" height="${output.height}"/>
${i(1)}</OutputDevice>
${i(0)}</Screen>`
}

export function exportResolumeXml(design: Design, opts: ResolumeExportOptions): string {
  const projectName = opts.name.trim() || 'Negative Space'
  const slices = sliceLayout(design, projectName)
  const { widthPx, heightPx } = design.canvas

  // Ids only have to be unique within the file. Real Arena files use epoch-ish
  // millisecond values; a fixed base keeps the export reproducible.
  const base = opts.idBase ?? 1800000000000
  let seq = 0
  const nextId = () => base + seq++

  const v = ARENA_VERSION
  const versionInfo =
    `<versionInfo name="${v.name}" majorVersion="${v.majorVersion}" ` +
    `minorVersion="${v.minorVersion}" microVersion="${v.microVersion}" revision="${v.revision}"/>`

  if (opts.target === 'preset') {
    // Preset files wrap the ScreenSetup in an XmlState, and Arena writes the
    // SoftEdging block only in the preferences file, so it is omitted here.
    const screens = slices.map((s) => screenXml(s, nextId(), nextId(), '\t\t\t\t')).join('\n')
    return `<?xml version="1.0" encoding="utf-8"?>
<XmlState name="${esc(projectName)}">
\t${versionInfo}
\t<ScreenSetup name="ScreenSetup">
\t\t<Params name="ScreenSetupParams"/>
\t\t<CurrentCompositionTextureSize width="${widthPx}" height="${heightPx}"/>
\t\t<screens>
${screens}
\t\t</screens>
\t</ScreenSetup>
</XmlState>
`
  }

  const softEdging = [
    `<SoftEdging>`,
    `\t<Params name="Soft Edge">`,
    `\t\t<ParamRange name="Power" T="DOUBLE" default="2" value="2">`,
    `\t\t\t<PhaseSourceStatic name="PhaseSourceStatic"/>`,
    `\t\t</ParamRange>`,
    `\t</Params>`,
    `</SoftEdging>`,
  ]

  const screens = slices.map((s) => screenXml(s, nextId(), nextId(), '\t\t')).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<ScreenSetup name="ScreenSetup">
\t${versionInfo}
\t<CurrentCompositionTextureSize width="${widthPx}" height="${heightPx}"/>
\t<screens>
${screens}
\t</screens>
\t${softEdging.join('\n\t')}
</ScreenSetup>
`
}
