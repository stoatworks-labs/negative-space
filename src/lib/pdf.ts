import type { Design, Diagnostic } from '../types'
import { slideGeometry } from './office'
import { int, lenBoth, pct, pitchLabel } from './units'

/**
 * The PDF report: what gets printed and taken to site.
 *
 * Vector throughout — the canvas plan is drawn with jsPDF primitives rather
 * than rasterised from the on-screen SVG. A screenshot of a 12000-pixel-wide
 * canvas reduced to fit an A4 page is unreadable exactly where it matters, at
 * the gaps, which are the thinnest features on it. Drawn as vectors they
 * survive being zoomed into on a phone in a loading bay.
 *
 * jsPDF is imported dynamically so it stays out of the main bundle. Most
 * sessions never press the button.
 */

const PAGE = { w: 297, h: 210, margin: 14 } // A4 landscape, millimetres

const INK = {
  text: '#11161d',
  dim: '#5b6b7d',
  rule: '#c9d3de',
  surface: '#dbeafe',
  surfaceEdge: '#1d4ed8',
  gap: '#fde68a',
  gapEdge: '#b45309',
  bad: '#b91c1c',
  warn: '#b45309',
}

type Doc = import('jspdf').jsPDF

function ruleLine(doc: Doc, y: number) {
  doc.setDrawColor(INK.rule)
  doc.setLineWidth(0.2)
  doc.line(PAGE.margin, y, PAGE.w - PAGE.margin, y)
}

function heading(doc: Doc, text: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(INK.text)
  doc.text(text, PAGE.margin, y)
  ruleLine(doc, y + 1.6)
  return y + 7
}

/** A table with a fixed column layout. Returns the y after the last row. */
function table(
  doc: Doc,
  y: number,
  widths: number[],
  header: string[],
  rows: string[][],
  opts: { rowHeight?: number } = {},
): number {
  const rh = opts.rowHeight ?? 5.2
  const xs: number[] = []
  let x = PAGE.margin
  for (const w of widths) {
    xs.push(x)
    x += w
  }

  // A table of labelled pairs has no column names; drawing an empty header row
  // leaves a rule and a band of white space that reads as a missing heading.
  if (header.some((h) => h !== '')) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(INK.dim)
    header.forEach((h, i) => doc.text(h, xs[i], y))
    ruleLine(doc, y + 1.4)
    y += rh
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(INK.text)
  for (const row of rows) {
    row.forEach((cell, i) => {
      // Truncate rather than overflow into the next column.
      const max = widths[i] - 2
      let t = cell
      while (t.length > 1 && doc.getTextWidth(t) > max) t = t.slice(0, -1)
      doc.text(t, xs[i], y)
    })
    y += rh
  }
  return y + 2
}

/**
 * The canvas plan, to scale, with the gaps shaded.
 *
 * This is the page people actually look at. It is the same information as the
 * tables above it, but a gap you can see is a gap that gets designed around.
 */
function drawPlan(doc: Doc, design: Design, y: number, maxH: number): number {
  const { widthPx: W, heightPx: H } = design.canvas
  if (W <= 0 || H <= 0) return y

  const availW = PAGE.w - PAGE.margin * 2
  const scale = Math.min(availW / W, maxH / H)
  const planW = W * scale
  const planH = H * scale
  const x0 = PAGE.margin
  const y0 = y

  // Canvas ground.
  doc.setFillColor('#f5f7fa')
  doc.setDrawColor(INK.rule)
  doc.setLineWidth(0.3)
  doc.rect(x0, y0, planW, planH, 'FD')

  // Gaps first, so surfaces draw over their full-span bands.
  doc.setFillColor(INK.gap)
  doc.setDrawColor(INK.gapEdge)
  doc.setLineWidth(0.15)
  for (const g of design.gutters) {
    if (g.px <= 0) continue
    if (g.axis === 'x') {
      doc.rect(x0 + g.startPx * scale, y0, g.px * scale, planH, 'FD')
    } else {
      doc.rect(x0, y0 + g.startPx * scale, planW, g.px * scale, 'FD')
    }
  }

  doc.setFillColor(INK.surface)
  doc.setDrawColor(INK.surfaceEdge)
  doc.setLineWidth(0.3)
  for (const p of design.surfaces) {
    doc.rect(x0 + p.rect.x * scale, y0 + p.rect.y * scale, p.rect.w * scale, p.rect.h * scale, 'FD')
  }

  // Labels last so nothing paints over them.
  doc.setFontSize(6.5)
  for (const p of design.surfaces) {
    const cx = x0 + (p.rect.x + p.rect.w / 2) * scale
    const cy = y0 + (p.rect.y + p.rect.h / 2) * scale
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(INK.text)
    doc.text(p.surface.name, cx, cy - 1.2, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(INK.dim)
    doc.text(`${p.rect.w} x ${p.rect.h} px`, cx, cy + 2, { align: 'center' })
  }

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(INK.gapEdge)
  doc.setFontSize(6)
  for (const g of design.gutters) {
    if (g.px <= 0) continue
    if (g.axis === 'x') {
      const cx = x0 + (g.startPx + g.px / 2) * scale
      doc.text(`${g.px} px`, cx, y0 + planH + 3.2, { align: 'center' })
    } else {
      const cy = y0 + (g.startPx + g.px / 2) * scale
      doc.text(`${g.px} px`, x0 + planW + 2, cy, { align: 'left' })
    }
  }

  return y0 + planH + 8
}

function severityColour(s: Diagnostic['severity']): string {
  return s === 'error' ? INK.bad : s === 'warning' ? INK.warn : INK.dim
}

export async function buildPdf(design: Design): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const name = design.project.name.trim() || 'Untitled'
  const geom = slideGeometry(design)

  /* ---------------- page 1: the plan and the headline numbers -------- */
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(INK.text)
  doc.text(name, PAGE.margin, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(INK.dim)
  doc.text(
    `Negative-space plan  ·  ${new Date().toLocaleDateString('en-GB')}  ·  ` +
      `canvas pitch ${pitchLabel(design.canvas.pitchMm)}`,
    PAGE.margin,
    23.5,
  )

  const headline = [
    ['Composite canvas', `${design.canvas.widthPx} x ${design.canvas.heightPx} px`],
    ['Physical extent', `${(design.canvas.widthMm / 1000).toFixed(2)} x ${(design.canvas.heightMm / 1000).toFixed(2)} m`],
    ['Active pixels', int(design.budget.activePx)],
    ['Blank pixels in gaps', `${int(design.budget.blankPx)}  (${pct(design.budget.blankFraction)})`],
  ]
  let y = 32
  doc.setFontSize(8)
  headline.forEach(([k, v], i) => {
    const x = PAGE.margin + i * ((PAGE.w - PAGE.margin * 2) / headline.length)
    doc.setTextColor(INK.dim)
    doc.setFont('helvetica', 'normal')
    doc.text(k.toUpperCase(), x, y)
    doc.setTextColor(INK.text)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(v, x, y + 5.5)
    doc.setFontSize(8)
  })
  y += 16

  y = heading(doc, 'Canvas plan — shaded bands are blank pixels', y)
  y = drawPlan(doc, design, y, 120)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(INK.dim)
  doc.text(
    'Set the composition to the composite canvas size. Content crossing a shaded band is hidden ' +
      'by the physical gap, which is what makes motion across the array read correctly.',
    PAGE.margin,
    Math.min(y + 2, PAGE.h - 8),
  )

  /* ---------------- page 2: the tables ------------------------------- */
  doc.addPage()
  y = 18
  y = heading(doc, 'Surfaces', y)
  y = table(
    doc,
    y,
    [42, 30, 24, 22, 26, 30, 26, 26, 24],
    ['Name', 'Physical', 'Native px', 'Pitch', 'Position', 'Canvas rect', 'Canvas px', 'Scale', 'Slide cm'],
    design.surfaces.map((p) => [
      p.surface.name,
      `${p.surface.widthMm.toFixed(0)} x ${p.surface.heightMm.toFixed(0)} mm`,
      `${p.surface.pxWidth} x ${p.surface.pxHeight}`,
      pitchLabel(p.pitch.meanMm),
      `${p.surface.xMm.toFixed(0)}, ${p.surface.yMm.toFixed(0)} mm`,
      `${p.rect.x}, ${p.rect.y} -> ${p.rect.x + p.rect.w}, ${p.rect.y + p.rect.h}`,
      `${p.rect.w} x ${p.rect.h}`,
      Math.abs(p.scaleX - 1) < 0.001 ? '1:1' : `${(p.scaleX * 100).toFixed(1)}%`,
      `${(geom.surfaces.find((g) => g.name === p.surface.name)?.wCm ?? 0).toFixed(1)} wide`,
    ]),
  )

  y = heading(doc, 'Gaps — the negative space', y + 2)
  y = table(
    doc,
    y,
    [40, 34, 30, 34, 40, 50],
    ['Axis', 'Physical gap', 'Blank px', 'Exact px', 'Rounding', 'Canvas columns / rows'],
    design.gutters.map((g) => [
      g.axis === 'x' ? 'Vertical gap' : 'Horizontal gap',
      lenBoth(g.mm),
      String(g.px),
      g.exactPx.toFixed(2),
      `${g.residualMm > 0 ? '+' : ''}${g.residualMm.toFixed(2)} mm`,
      `${g.startPx} to ${g.endPx}`,
    ]),
  )

  y = heading(doc, 'Pixel budget and PowerPoint geometry', y + 2)
  y = table(
    doc,
    y,
    [70, 60, 70, 60],
    ['', '', '', ''],
    [
      ['Native pixels driven', int(design.budget.nativePx), 'Slide size', `${geom.widthCm.toFixed(1)} x ${geom.heightCm.toFixed(1)} cm`],
      ['Canvas pixels', int(design.budget.canvasPx), 'Slide size (inches)', `${geom.widthIn.toFixed(2)} x ${geom.heightIn.toFixed(2)} in`],
      ['Blank pixels in gaps', `${int(design.budget.blankPx)} (${pct(design.budget.blankFraction)})`, 'Canvas px per slide inch', geom.pxPerInch.toFixed(1)],
      ['Canvas pitch', pitchLabel(design.canvas.pitchMm), 'Aspect preserved', geom.clamped ? 'yes (slide scaled to fit PowerPoint)' : 'yes (1:1 at 96 dpi)'],
    ],
  )

  if (design.diagnostics.length > 0) {
    y = heading(doc, 'Checks', y + 2)
    doc.setFontSize(7.5)
    for (const d of design.diagnostics) {
      if (y > PAGE.h - 12) break
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(severityColour(d.severity))
      doc.text(d.severity.toUpperCase(), PAGE.margin, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(INK.text)
      const lines = doc.splitTextToSize(d.message, PAGE.w - PAGE.margin * 2 - 22) as string[]
      doc.text(lines, PAGE.margin + 22, y)
      y += Math.max(4.4, lines.length * 3.6)
    }
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(INK.dim)
  doc.text(
    'Generated by Negative Space. Geometry is arithmetic and is tested; it has not been ' +
      'round-tripped through a running Resolume Arena. Check one slice against the wall before trusting a show to it.',
    PAGE.margin,
    PAGE.h - 6,
  )

  return doc.output('blob')
}
