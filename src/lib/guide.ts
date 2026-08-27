import type { Design, Gutter, PlacedSurface } from '../types'
import { pitchLabel } from './units'

/**
 * The guide image: a template at EXACTLY the composite canvas resolution.
 *
 * This is the artefact that makes the negative space designable rather than
 * merely calculated. Drop it on a PowerPoint slide, an After Effects comp or a
 * Photoshop document at 100%, and every dead pixel is visible in the place it
 * will actually be dead. Text that would fall down a 39-pixel gutter can be
 * seen falling down it.
 *
 * SVG is authored first and PNG is rasterised from it, so the two can never
 * disagree. One pixel of the image is one pixel of the canvas — no scaling
 * factor anywhere, which is the property that makes it usable as a background
 * plate.
 */

export type GuideOptions = {
  /** Surface name, resolution and canvas rect drawn on each surface. */
  labels: boolean
  /** Gutter widths called out in the blank bands. */
  gutterLabels: boolean
  /** A reference grid across the whole canvas. */
  grid: boolean
  gridPx: number
  /** Solid surfaces (a plate to design on) or outlines only (an overlay). */
  fill: boolean
  /** Rule-of-thirds and centre marks per surface. */
  centreMarks: boolean
}

export const DEFAULT_GUIDE: GuideOptions = {
  labels: true,
  gutterLabels: true,
  grid: false,
  gridPx: 100,
  fill: true,
  centreMarks: false,
}

const INK = {
  gap: '#0b0e13',
  gapHatch: '#1d2430',
  surface: '#16202e',
  surfaceEdge: '#4cc9f0',
  gutterEdge: '#f9c74f',
  text: '#e8eef6',
  dim: '#93a4b8',
  grid: '#1f2a38',
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Type sized against the canvas, not against the viewer.
 *
 * A 12 px label is illegible on an 11000 px wide canvas and absurd on a 600 px
 * one. Scaling with the canvas keeps the guide readable at whatever zoom it is
 * eventually looked at, which is the only thing a label on a plate has to do.
 */
function typeScale(design: Design): number {
  const span = Math.max(design.canvas.widthPx, design.canvas.heightPx)
  return Math.max(10, Math.min(96, Math.round(span / 60)))
}

function surfaceBlock(p: PlacedSurface, fs: number, opts: GuideOptions): string {
  const { x, y, w, h } = p.rect
  const parts: string[] = []

  parts.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" ` +
      `fill="${opts.fill ? INK.surface : 'none'}" stroke="${INK.surfaceEdge}" ` +
      `stroke-width="${Math.max(1, Math.round(fs / 8))}"/>`,
  )

  if (opts.centreMarks) {
    const cx = x + w / 2
    const cy = y + h / 2
    const arm = Math.min(w, h) / 12
    parts.push(
      `<g stroke="${INK.surfaceEdge}" stroke-width="${Math.max(1, Math.round(fs / 16))}" opacity="0.55">` +
        `<line x1="${cx - arm}" y1="${cy}" x2="${cx + arm}" y2="${cy}"/>` +
        `<line x1="${cx}" y1="${cy - arm}" x2="${cx}" y2="${cy + arm}"/>` +
        `</g>`,
    )
  }

  if (opts.labels) {
    const pad = Math.round(fs * 0.6)
    const s = p.surface
    const lines = [
      s.name,
      `${s.pxWidth} x ${s.pxHeight} px native`,
      `${pitchLabel(p.pitch.meanMm)} pitch`,
      `canvas ${x}, ${y} -> ${x + w}, ${y + h}`,
      `${w} x ${h} canvas px`,
    ]
    parts.push(
      `<text x="${x + pad}" y="${y + pad + fs}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${fs}" fill="${INK.text}">` +
        lines
          .map(
            (t, i) =>
              `<tspan x="${x + pad}" dy="${i === 0 ? 0 : fs * 1.25}" ` +
              `fill="${i === 0 ? INK.text : INK.dim}" ` +
              `font-weight="${i === 0 ? 700 : 400}">${esc(t)}</tspan>`,
          )
          .join('') +
        `</text>`,
    )
  }
  return parts.join('\n')
}

/**
 * A gutter's shaded band. Bands and labels are drawn in SEPARATE passes.
 *
 * They have to be: a horizontal gutter spans the full canvas width and a
 * vertical one the full height, so wherever they cross, whichever is drawn
 * second paints over the other's label. Drawing every band first and every
 * label afterwards is the only ordering in which both stay readable.
 */
function gutterBand(g: Gutter, design: Design, fs: number): string {
  if (g.px <= 0) return ''
  const { widthPx, heightPx } = design.canvas
  const x = g.axis === 'x' ? g.startPx : 0
  const y = g.axis === 'x' ? 0 : g.startPx
  const w = g.axis === 'x' ? g.px : widthPx
  const h = g.axis === 'x' ? heightPx : g.px

  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hatch)" ` +
    `stroke="${INK.gutterEdge}" stroke-width="${Math.max(1, Math.round(fs / 12))}" ` +
    `stroke-dasharray="${fs} ${fs}"/>`
  )
}

function gutterLabel(g: Gutter, design: Design, fs: number, opts: GuideOptions): string {
  if (g.px <= 0 || !opts.gutterLabels) return ''
  const { widthPx, heightPx } = design.canvas
  const label = `${g.px} px  ${g.mm.toFixed(0)} mm`

  // A quarter of the way along rather than halfway. Two gutters that cross do
  // so at each other's midpoint, which is exactly where a centred label would
  // sit; a quarter along, they miss.
  const cx = g.axis === 'x' ? g.startPx + g.px / 2 : widthPx / 4
  const cy = g.axis === 'x' ? heightPx / 4 : g.startPx + g.px / 2
  const rot = g.axis === 'x' ? `rotate(-90 ${cx} ${cy})` : ''

  return (
    `<text x="${cx}" y="${cy}" transform="${rot}" text-anchor="middle" ` +
    `dominant-baseline="middle" font-family="Helvetica, Arial, sans-serif" ` +
    `font-size="${Math.round(fs * 0.85)}" fill="${INK.gutterEdge}">${esc(label)}</text>`
  )
}

export function guideSvg(design: Design, opts: GuideOptions = DEFAULT_GUIDE): string {
  const { widthPx: W, heightPx: H } = design.canvas
  if (W <= 0 || H <= 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`
  }
  const fs = typeScale(design)
  const hatchStep = Math.max(8, Math.round(fs * 0.8))

  const grid = opts.grid
    ? `<g stroke="${INK.grid}" stroke-width="1">` +
      Array.from({ length: Math.floor(W / opts.gridPx) }, (_, i) => {
        const x = (i + 1) * opts.gridPx
        return `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`
      }).join('') +
      Array.from({ length: Math.floor(H / opts.gridPx) }, (_, i) => {
        const y = (i + 1) * opts.gridPx
        return `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`
      }).join('') +
      `</g>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<pattern id="hatch" width="${hatchStep}" height="${hatchStep}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="${hatchStep}" height="${hatchStep}" fill="${INK.gap}"/>
<line x1="0" y1="0" x2="0" y2="${hatchStep}" stroke="${INK.gapHatch}" stroke-width="${Math.max(1, Math.round(hatchStep / 4))}"/>
</pattern>
</defs>
<rect width="${W}" height="${H}" fill="${INK.gap}"/>
${grid}
${design.gutters.map((g) => gutterBand(g, design, fs)).join('\n')}
${design.surfaces.map((p) => surfaceBlock(p, fs, opts)).join('\n')}
${design.gutters.map((g) => gutterLabel(g, design, fs, opts)).join('\n')}
</svg>
`
}

/**
 * Rasterise the guide to PNG at 1:1.
 *
 * Browser only — it needs an <img> decode and a canvas. The SVG is handed over
 * as a blob URL rather than a data: URL because a multi-megabyte base64 string
 * is slower to parse and, on some engines, silently truncated.
 */
export async function guidePng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('the guide SVG could not be decoded'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d canvas context')
    ctx.drawImage(img, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas produced no PNG'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
