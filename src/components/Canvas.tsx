import { useCallback, useEffect, useRef, useState } from 'react'
import type { Design, Gutter } from '../types'

/**
 * The plan view: the composite canvas, drawn in canvas-pixel space.
 *
 * The SVG viewBox IS the canvas, so every coordinate on screen is a canvas
 * pixel and there is no second coordinate system to keep in step. Dragging
 * converts a screen delta back through the same scale into millimetres, which
 * is the only place the two frames meet.
 *
 * Surfaces are draggable; gutters are clickable and carry their blank-pixel
 * count, because the gap is the thing this tool is about and it should be the
 * thing you can reach for.
 */

type Props = {
  design: Design
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, xMm: number, yMm: number) => void
  onGutterClick: (g: Gutter) => void
  snapMm: number
}

const PAD = 0.06 // fraction of the canvas left as margin around the plan

export function Canvas({ design, selectedId, onSelect, onMove, onGutterClick, snapMm }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{
    id: string
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const { widthPx: W, heightPx: H, pitchMm } = design.canvas

  /** Canvas pixels per screen pixel — the one conversion factor in here. */
  const scale = useCallback(() => {
    const el = svgRef.current
    if (!el || W <= 0) return 1
    const r = el.getBoundingClientRect()
    const padX = W * PAD
    const padY = H * PAD
    const vbW = W + padX * 2
    const vbH = H + padY * 2
    // preserveAspectRatio="xMidYMid meet": the limiting axis sets the scale.
    return Math.max(vbW / r.width, vbH / r.height)
  }, [W, H])

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const k = scale()
      const dxMm = (e.clientX - drag.startX) * k * pitchMm
      const dyMm = (e.clientY - drag.startY) * k * pitchMm
      const snap = (v: number) => (snapMm > 0 ? Math.round(v / snapMm) * snapMm : Math.round(v))
      onMove(drag.id, snap(drag.originX + dxMm), snap(drag.originY + dyMm))
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [drag, onMove, pitchMm, scale, snapMm])

  if (W <= 0 || H <= 0) {
    return (
      <div className="canvas-wrap">
        <p className="empty">Add a surface to see the canvas.</p>
      </div>
    )
  }

  const padX = W * PAD
  const padY = H * PAD
  // Type that stays legible whatever the canvas size, same idea as the guide.
  const fs = Math.max(W, H) / 55

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        viewBox={`${-padX} ${-padY} ${W + padX * 2} ${H + padY * 2}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          if (e.target === svgRef.current) onSelect(null)
        }}
      >
        {/* The canvas itself: everything inside it that is not a surface is blank. */}
        <rect x={0} y={0} width={W} height={H} fill="#0b0e13" stroke="#24374f" strokeWidth={fs / 12} />

        {/* Bands first, then labels. A horizontal gutter spans the whole
            width and a vertical one the whole height, so wherever two cross,
            the second band drawn paints over the first one's label. */}
        {design.gutters.map((g, i) =>
          g.px <= 0 ? null : (
            <rect
              key={`gb${i}`}
              x={g.axis === 'x' ? g.startPx : 0}
              y={g.axis === 'x' ? 0 : g.startPx}
              width={g.axis === 'x' ? g.px : W}
              height={g.axis === 'x' ? H : g.px}
              fill="rgba(249,199,79,0.14)"
              stroke="#f9c74f"
              strokeWidth={fs / 16}
              strokeDasharray={`${fs / 2} ${fs / 2}`}
              style={{ cursor: 'pointer' }}
              onClick={() => onGutterClick(g)}
            />
          ),
        )}

        {design.surfaces.map((p) => {
          const sel = p.surface.id === selectedId
          return (
            <g
              key={p.surface.id}
              className="surface-rect"
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelect(p.surface.id)
                setDrag({
                  id: p.surface.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  originX: p.surface.xMm,
                  originY: p.surface.yMm,
                })
              }}
            >
              <rect
                x={p.rect.x}
                y={p.rect.y}
                width={p.rect.w}
                height={p.rect.h}
                fill={sel ? 'rgba(76,201,240,0.22)' : 'rgba(22,32,46,0.95)'}
                stroke={sel ? '#4cc9f0' : '#3f6d8c'}
                strokeWidth={sel ? fs / 6 : fs / 12}
              />
              <text
                x={p.rect.x + p.rect.w / 2}
                y={p.rect.y + p.rect.h / 2}
                textAnchor="middle"
                fontSize={fs}
                fill="#e8eef6"
                fontWeight={600}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {p.surface.name}
                <tspan
                  x={p.rect.x + p.rect.w / 2}
                  dy={fs * 1.3}
                  fontSize={fs * 0.72}
                  fontWeight={400}
                  fill="#93a4b8"
                >
                  {p.rect.w} × {p.rect.h} px
                </tspan>
                <tspan
                  x={p.rect.x + p.rect.w / 2}
                  dy={fs * 1.1}
                  fontSize={fs * 0.72}
                  fontWeight={400}
                  fill="#93a4b8"
                >
                  at {p.rect.x}, {p.rect.y}
                </tspan>
              </text>
            </g>
          )
        })}

        {design.gutters.map((g, i) =>
          g.px <= 0 ? null : (
            <text
              key={`gl${i}`}
              // A quarter along, not halfway: two crossing gutters meet at each
              // other's midpoint, which is where a centred label would sit.
              x={g.axis === 'x' ? g.startPx + g.px / 2 : W / 4}
              y={g.axis === 'x' ? H / 4 : g.startPx + g.px / 2}
              transform={
                g.axis === 'x'
                  ? `rotate(-90 ${g.startPx + g.px / 2} ${H / 4})`
                  : undefined
              }
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fs * 0.8}
              fill="#f9c74f"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {g.px} px · {g.mm.toFixed(0)} mm
            </text>
          ),
        )}
      </svg>
    </div>
  )
}
