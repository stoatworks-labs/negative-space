import type { Design } from '../types'
import { buildZip, zipEntry, type ZipEntry } from './zip'

/**
 * PowerPoint slide geometry, and a starter .pptx carrying it.
 *
 * The problem this solves: a deck built for an LED array has to be authored at
 * the COMPOSITE canvas aspect, with the gaps present, or every slide is subtly
 * wrong — a title centred on the slide is not centred on the wall, and a lower
 * third can land in a gutter and simply not exist.
 *
 * PowerPoint cannot be set to the canvas's real physical size. Slides are
 * capped at 56 inches a side (and floored at 1), so a 28-metre-wide LED array
 * cannot be a 28-metre-wide slide. What CAN be preserved exactly is the aspect
 * ratio and therefore the proportional position of every surface and every
 * gap, which is what actually matters for layout.
 *
 * So: the slide is built at the canvas aspect, as large as PowerPoint allows,
 * and `pxPerInch` says how canvas pixels map onto it.
 */

/** PowerPoint's own limits, in inches. Not ours — theirs. */
export const SLIDE_MAX_IN = 56
export const SLIDE_MIN_IN = 1

/** PowerPoint's notional screen density: 96 px to the inch. */
export const NOMINAL_DPI = 96

const EMU_PER_IN = 914400
const EMU_PER_PT = 12700

export type SlideRect = {
  name: string
  /** Inches from the top-left of the slide. */
  xIn: number
  yIn: number
  wIn: number
  hIn: number
  /** The same rectangle in centimetres, which is what the UK/EU ruler shows. */
  xCm: number
  yCm: number
  wCm: number
  hCm: number
  /** The canvas pixels this rectangle corresponds to. */
  px: { x: number; y: number; w: number; h: number }
}

export type SlideGeometry = {
  widthIn: number
  heightIn: number
  widthCm: number
  heightCm: number
  /** Canvas pixels per slide inch. 96 when the canvas fits at 1:1. */
  pxPerInch: number
  /** True when the slide had to be shrunk to stay inside PowerPoint's limits. */
  clamped: boolean
  surfaces: SlideRect[]
  gutters: SlideRect[]
}

export function slideGeometry(design: Design): SlideGeometry {
  const { widthPx: W, heightPx: H } = design.canvas
  if (W <= 0 || H <= 0) {
    return {
      widthIn: 0, heightIn: 0, widthCm: 0, heightCm: 0,
      pxPerInch: NOMINAL_DPI, clamped: false, surfaces: [], gutters: [],
    }
  }

  // Start at 1:1 against PowerPoint's nominal 96 dpi, then clamp the LONG side
  // into range and let the other follow, so the aspect ratio is never touched.
  let widthIn = W / NOMINAL_DPI
  let heightIn = H / NOMINAL_DPI
  let clamped = false

  const longest = Math.max(widthIn, heightIn)
  if (longest > SLIDE_MAX_IN) {
    const k = SLIDE_MAX_IN / longest
    widthIn *= k
    heightIn *= k
    clamped = true
  }
  const shortest = Math.min(widthIn, heightIn)
  if (shortest < SLIDE_MIN_IN) {
    const k = SLIDE_MIN_IN / shortest
    widthIn *= k
    heightIn *= k
    clamped = true
  }

  const pxPerInch = W / widthIn
  const toRect = (name: string, x: number, y: number, w: number, h: number): SlideRect => {
    const xIn = x / pxPerInch
    const yIn = y / pxPerInch
    const wIn = w / pxPerInch
    const hIn = h / pxPerInch
    return {
      name,
      xIn, yIn, wIn, hIn,
      xCm: xIn * 2.54, yCm: yIn * 2.54, wCm: wIn * 2.54, hCm: hIn * 2.54,
      px: { x, y, w, h },
    }
  }

  return {
    widthIn,
    heightIn,
    widthCm: widthIn * 2.54,
    heightCm: heightIn * 2.54,
    pxPerInch,
    clamped,
    surfaces: design.surfaces.map((p) =>
      toRect(p.surface.name, p.rect.x, p.rect.y, p.rect.w, p.rect.h),
    ),
    gutters: design.gutters
      .filter((g) => g.px > 0)
      .map((g, i) =>
        g.axis === 'x'
          ? toRect(`Gap ${i + 1} (vertical, ${g.px} px)`, g.startPx, 0, g.px, H)
          : toRect(`Gap ${i + 1} (horizontal, ${g.px} px)`, 0, g.startPx, W, g.px),
      ),
  }
}

/* ------------------------------------------------------------------ *
 * .pptx
 *
 * A minimal OOXML presentation package. The parts below are the smallest set
 * PowerPoint will open without repairing: content types, the package and
 * presentation relationships, one master, one layout, one theme, one slide.
 * Dropping any of them — the theme in particular, which nothing visibly uses —
 * produces a file PowerPoint offers to repair rather than opens.
 * ------------------------------------------------------------------ */

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const emu = (inches: number) => Math.round(inches * EMU_PER_IN)

/** One rectangle with an optional caption, as a DrawingML shape. */
function shape(
  id: number,
  name: string,
  r: SlideRect,
  fill: string,
  /** Opacity in OOXML's hundred-thousandths: 100000 is opaque. */
  alpha: number,
  line: string,
  caption: string | null,
  fontPt: number,
): string {
  const body = caption
    ? `<p:txBody><a:bodyPr lIns="45720" tIns="45720" rIns="45720" bIns="45720" wrap="square"/>` +
      `<a:lstStyle/><a:p><a:pPr algn="l"/><a:r>` +
      `<a:rPr lang="en-GB" sz="${Math.round(fontPt * 100)}" b="1" dirty="0">` +
      `<a:solidFill><a:srgbClr val="E8EEF6"/></a:solidFill></a:rPr>` +
      `<a:t>${esc(caption)}</a:t></a:r></a:p></p:txBody>`
    : `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>`

  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${emu(r.xIn)}" y="${emu(r.yIn)}"/>` +
    `<a:ext cx="${emu(r.wIn)}" cy="${emu(r.hIn)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${fill}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>` +
    `<a:ln w="${Math.round(EMU_PER_PT * 1.5)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` +
    `</p:spPr>${body}</p:sp>`
  )
}

function slideXml(geom: SlideGeometry, design: Design): string {
  // Type sized off the slide so it is legible whatever the aspect: a 56-inch
  // slide and a 10-inch slide should look the same when each is on screen.
  const fontPt = Math.max(8, Math.min(28, geom.widthIn * 0.5))
  let id = 2
  const shapes: string[] = []

  shapes.push(
    shape(
      id++,
      'Canvas',
      { name: '', xIn: 0, yIn: 0, wIn: geom.widthIn, hIn: geom.heightIn, xCm: 0, yCm: 0, wCm: 0, hCm: 0, px: { x: 0, y: 0, w: 0, h: 0 } },
      '0B0E13',
      100000,
      '0B0E13',
      null,
      fontPt,
    ),
  )

  for (const g of geom.gutters) {
    // Gutters are drawn translucent so a designer can see they are a region to
    // avoid rather than a block to place something on.
    shapes.push(shape(id++, g.name, g, 'F9C74F', 25000, 'F9C74F', null, fontPt))
  }

  geom.surfaces.forEach((s, i) => {
    const p = design.surfaces[i]
    const caption =
      `${s.name} ${p.surface.pxWidth}×${p.surface.pxHeight} px` +
      ` canvas ${p.rect.x},${p.rect.y}`
    shapes.push(shape(id++, s.name, s, '16202E', 100000, '4CC9F0', caption, fontPt))
  })

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}><p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${shapes.join('')}
</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Negative Space">
<a:themeElements>
<a:clrScheme name="Negative Space"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0B0E13"/></a:dk2><a:lt2><a:srgbClr val="E8EEF6"/></a:lt2><a:accent1><a:srgbClr val="4CC9F0"/></a:accent1><a:accent2><a:srgbClr val="F9C74F"/></a:accent2><a:accent3><a:srgbClr val="90BE6D"/></a:accent3><a:accent4><a:srgbClr val="F94144"/></a:accent4><a:accent5><a:srgbClr val="577590"/></a:accent5><a:accent6><a:srgbClr val="F3722C"/></a:accent6><a:hlink><a:srgbClr val="4CC9F0"/></a:hlink><a:folHlink><a:srgbClr val="93A4B8"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Negative Space"><a:majorFont><a:latin typeface="Helvetica"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Helvetica"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Negative Space">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`

const EMPTY_TREE = `<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>`

const CLR_MAP =
  `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ` +
  `accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`

export function buildPptx(design: Design, geom: SlideGeometry, projectName: string): Uint8Array {
  const cx = emu(geom.widthIn)
  const cy = emu(geom.heightIn)

  const entries: ZipEntry[] = [
    zipEntry(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    ),
    zipEntry(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    ),
    zipEntry(
      'ppt/presentation.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS} saveSubsetFonts="1">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
<p:sldSz cx="${cx}" cy="${cy}"/>
<p:notesSz cx="${cy}" cy="${cx}"/>
</p:presentation>`,
    ),
    zipEntry(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`,
    ),
    zipEntry(
      'ppt/slideMasters/slideMaster1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${NS}>${EMPTY_TREE}${CLR_MAP}
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`,
    ),
    zipEntry(
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
    ),
    zipEntry(
      'ppt/slideLayouts/slideLayout1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS} type="blank" preserve="1">${EMPTY_TREE}
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    ),
    zipEntry(
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
    ),
    zipEntry('ppt/theme/theme1.xml', THEME),
    zipEntry('ppt/slides/slide1.xml', slideXml(geom, design)),
    zipEntry(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
    ),
  ]

  entries.push(
    zipEntry(
      'docProps/core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(projectName || 'Negative Space')}</dc:title>
<dc:description>Canvas ${design.canvas.widthPx}x${design.canvas.heightPx} px including ${design.budget.blankPx} blank pixels in the gaps.</dc:description>
</cp:coreProperties>`,
    ),
  )
  return buildZip(entries)
}
