import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from './components/Canvas'
import { arrange, respaceGutter, solve } from './lib/geometry'
import { download, slug } from './lib/download'
import { DEFAULT_GUIDE, guidePng, guideSvg, type GuideOptions } from './lib/guide'
import { buildPptx, slideGeometry } from './lib/office'
import { exportResolumeXml } from './lib/resolume'
import { fromProjectFile, toCsv, toProjectFile } from './lib/exports'
import { PANEL_PRESETS, wallFromPanels } from './lib/panels'
import { planLivePremier, referenceRects } from './lib/livepremier'
import { int, pct, pitchLabel } from './lib/units'
import type { CanvasPitch, Gutter, Project, Surface } from './types'

const STORAGE_KEY = 'negative-space.project.v1'

const STARTER: Project = {
  name: 'Untitled array',
  units: 'metric',
  pitch: { mode: 'finest' },
  surfaces: [
    wallFromPanels('a', 'Left', PANEL_PRESETS[2], 3, 2, 0, 0),
    wallFromPanels('b', 'Centre', PANEL_PRESETS[2], 3, 2, 1600, 0),
    wallFromPanels('c', 'Right', PANEL_PRESETS[2], 3, 2, 3200, 0),
  ],
}

function load(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return fromProjectFile(raw)
  } catch {
    // A corrupt or superseded saved project must never stop the tool opening.
  }
  return STARTER
}

let nextId = 100
const newId = () => `s${nextId++}`

export default function App() {
  const [project, setProject] = useState<Project>(load)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapMm, setSnapMm] = useState(1)
  const [guide, setGuide] = useState<GuideOptions>(DEFAULT_GUIDE)
  const [gutterEdit, setGutterEdit] = useState<{ gutter: Gutter; value: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const design = useMemo(() => solve(project), [project])
  const livePremier = useMemo(() => planLivePremier(design), [design])
  const lpRects = useMemo(
    () => (livePremier ? referenceRects(design, livePremier) : []),
    [design, livePremier],
  )
  const geom = useMemo(() => slideGeometry(design), [design])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, toProjectFile(project))
    } catch {
      // Private browsing, or a full quota. Losing the autosave is not worth
      // interrupting anyone over; the project can still be exported by hand.
    }
  }, [project])

  const patch = useCallback((id: string, changes: Partial<Surface>) => {
    setProject((p) => ({
      ...p,
      surfaces: p.surfaces.map((s) => (s.id === id ? { ...s, ...changes } : s)),
    }))
  }, [])

  const move = useCallback(
    (id: string, xMm: number, yMm: number) => patch(id, { xMm, yMm }),
    [patch],
  )

  const addWall = (cols: number, rows: number, presetIndex: number) => {
    const preset = PANEL_PRESETS[presetIndex]
    const rightEdge = project.surfaces.reduce((m, s) => Math.max(m, s.xMm + s.widthMm), 0)
    const id = newId()
    setProject((p) => ({
      ...p,
      surfaces: [
        ...p.surfaces,
        wallFromPanels(
          id,
          `Surface ${p.surfaces.length + 1}`,
          preset,
          cols,
          rows,
          rightEdge > 0 ? rightEdge + 100 : 0,
          0,
        ),
      ],
    }))
    setSelectedId(id)
  }

  const remove = (id: string) => {
    setProject((p) => ({ ...p, surfaces: p.surfaces.filter((s) => s.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  const duplicate = (id: string) => {
    const s = project.surfaces.find((x) => x.id === id)
    if (!s) return
    const copy: Surface = { ...s, id: newId(), name: `${s.name} copy`, xMm: s.xMm + s.widthMm + 100 }
    setProject((p) => ({ ...p, surfaces: [...p.surfaces, copy] }))
    setSelectedId(copy.id)
  }

  const commitGutter = () => {
    if (!gutterEdit) return
    const mm = Number(gutterEdit.value)
    if (Number.isFinite(mm) && mm >= 0) setProject((p) => respaceGutter(p, gutterEdit.gutter, mm))
    setGutterEdit(null)
  }

  /* ------------------------------- exports ------------------------------ */

  const stem = slug(project.name)

  const doExport = async (what: string) => {
    setBusy(what)
    try {
      switch (what) {
        case 'xml-pref':
          download(
            exportResolumeXml(design, { name: project.name, target: 'preferences' }),
            'AdvancedOutput.xml',
            'application/xml',
          )
          break
        case 'xml-preset':
          download(
            exportResolumeXml(design, { name: project.name, target: 'preset' }),
            `${stem}-advanced-output.xml`,
            'application/xml',
          )
          break
        case 'svg':
          download(guideSvg(design, guide), `${stem}-guide.svg`, 'image/svg+xml')
          break
        case 'png': {
          const png = await guidePng(
            guideSvg(design, guide),
            design.canvas.widthPx,
            design.canvas.heightPx,
          )
          download(png, `${stem}-guide.png`)
          break
        }
        case 'pptx':
          download(
            new Blob([buildPptx(design, geom, project.name) as BlobPart], {
              type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            }),
            `${stem}.pptx`,
          )
          break
        case 'csv':
          download(toCsv(design), `${stem}.csv`, 'text/csv')
          break
        case 'json':
          download(toProjectFile(project), `${stem}.json`, 'application/json')
          break
        case 'pdf': {
          const { buildPdf } = await import('./lib/pdf')
          download(await buildPdf(design), `${stem}-report.pdf`)
          break
        }
      }
    } catch (e) {
      alert(`That export failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const openProject = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        setProject(fromProjectFile(String(reader.result)))
        setSelectedId(null)
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
      }
    }
    reader.readAsText(file)
  }

  const selected = project.surfaces.find((s) => s.id === selectedId) ?? null

  return (
    <div className="app">
      <header className="top">
        <h1>
          Negative <span>Space</span>
        </h1>
        <input
          type="text"
          style={{ width: 220 }}
          value={project.name}
          aria-label="Project name"
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--dim)' }}>Canvas pitch</span>
          <select
            style={{ width: 190 }}
            value={project.pitch.mode}
            onChange={(e) => {
              const mode = e.target.value as CanvasPitch['mode']
              setProject((p) => ({
                ...p,
                pitch:
                  mode === 'manual' ? { mode, pitchMm: design.canvas.pitchMm } : { mode },
              }))
            }}
          >
            <option value="finest">Finest pitch present</option>
            <option value="coarsest">Coarsest pitch present</option>
            <option value="manual">Set manually</option>
          </select>
        </label>
        {project.pitch.mode === 'manual' && (
          <input
            type="number"
            step="0.001"
            style={{ width: 100 }}
            value={project.pitch.pitchMm}
            aria-label="Canvas pitch in millimetres"
            onChange={(e) =>
              setProject((p) => ({
                ...p,
                pitch: { mode: 'manual', pitchMm: Number(e.target.value) || 1 },
              }))
            }
          />
        )}
        <div className="grow" />
        <button className="ghost" onClick={() => setProject(STARTER)}>
          Reset
        </button>
        <label className="ghost" style={{ cursor: 'pointer' }}>
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) openProject(f)
              e.target.value = ''
            }}
          />
          <span
            style={{
              padding: '6px 10px',
              border: '1px solid var(--edge)',
              borderRadius: 6,
              display: 'inline-block',
            }}
          >
            Open…
          </span>
        </label>
      </header>

      <main className="body">
        {/* ------------------------- surfaces -------------------------- */}
        <div className="col-left">
          <section className="block">
            <h2>Add a surface</h2>
            <AddWall onAdd={addWall} />
          </section>

          <section className="block">
            <h2>Arrange</h2>
            <ArrangeControls
              onArrange={(cols, h, v) =>
                setProject((p) => ({ ...p, surfaces: arrange(p.surfaces, cols, h, v) }))
              }
            />
          </section>

          <section className="block">
            <h2>Surfaces ({project.surfaces.length})</h2>
            {project.surfaces.length === 0 && <p className="empty">No surfaces yet.</p>}
            {project.surfaces.map((s) => {
              const placed = design.surfaces.find((p) => p.surface.id === s.id)
              return (
                <div
                  key={s.id}
                  className={`surface-card${s.id === selectedId ? ' selected' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <header>
                    <input
                      type="text"
                      value={s.name}
                      aria-label="Surface name"
                      onChange={(e) => patch(s.id, { name: e.target.value })}
                    />
                    <button className="ghost" title="Duplicate" onClick={() => duplicate(s.id)}>
                      ⧉
                    </button>
                    <button className="ghost danger" title="Delete" onClick={() => remove(s.id)}>
                      ×
                    </button>
                  </header>
                  <div className="row">
                    <Num label="Width mm" value={s.widthMm} onChange={(v) => patch(s.id, { widthMm: v })} />
                    <Num label="Height mm" value={s.heightMm} onChange={(v) => patch(s.id, { heightMm: v })} />
                  </div>
                  <div className="row">
                    <Num label="Pixels across" value={s.pxWidth} onChange={(v) => patch(s.id, { pxWidth: v })} />
                    <Num label="Pixels down" value={s.pxHeight} onChange={(v) => patch(s.id, { pxHeight: v })} />
                  </div>
                  <div className="row">
                    <Num label="X mm" value={s.xMm} onChange={(v) => patch(s.id, { xMm: v })} />
                    <Num label="Y mm" value={s.yMm} onChange={(v) => patch(s.id, { yMm: v })} />
                  </div>
                  {placed && (
                    <div className="pitch">
                      <span>{pitchLabel(placed.pitch.meanMm)} pitch</span>
                      <span>
                        {placed.rect.w} × {placed.rect.h} px on canvas
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        </div>

        {/* --------------------------- canvas -------------------------- */}
        <div className="col-mid">
          <div className="canvas-bar">
            <label>
              Snap
              <select
                value={snapMm}
                style={{ width: 92 }}
                onChange={(e) => setSnapMm(Number(e.target.value))}
              >
                <option value={0}>Off</option>
                <option value={1}>1 mm</option>
                <option value={5}>5 mm</option>
                <option value={10}>10 mm</option>
                <option value={50}>50 mm</option>
              </select>
            </label>
            {gutterEdit ? (
              <label>
                Gap (mm)
                <input
                  type="number"
                  autoFocus
                  value={gutterEdit.value}
                  onChange={(e) => setGutterEdit({ ...gutterEdit, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitGutter()
                    if (e.key === 'Escape') setGutterEdit(null)
                  }}
                />
                <button className="primary" onClick={commitGutter}>
                  Set
                </button>
                <button className="ghost" onClick={() => setGutterEdit(null)}>
                  Cancel
                </button>
              </label>
            ) : (
              <span style={{ color: 'var(--dim)' }}>
                Drag a surface to move it. Click a gap to set its spacing.
              </span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ color: 'var(--dim)' }}>
              {design.canvas.widthPx} × {design.canvas.heightPx} px ·{' '}
              {pitchLabel(design.canvas.pitchMm)}
            </span>
          </div>
          <Canvas
            design={design}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={move}
            onGutterClick={(g) => setGutterEdit({ gutter: g, value: g.mm.toFixed(1) })}
            snapMm={snapMm}
          />
        </div>

        {/* -------------------------- results -------------------------- */}
        <div className="col-right">
          <section className="block">
            <h2>Canvas</h2>
            <div className="stat-grid">
              <div className="stat">
                <span>Composite canvas</span>
                <b>
                  {design.canvas.widthPx} × {design.canvas.heightPx}
                </b>
              </div>
              <div className="stat">
                <span>Canvas pitch</span>
                <b>{pitchLabel(design.canvas.pitchMm)}</b>
              </div>
              <div className="stat">
                <span>Active pixels</span>
                <b>{int(design.budget.activePx)}</b>
              </div>
              <div className="stat">
                <span>Blank pixels</span>
                <b>
                  <em>{int(design.budget.blankPx)}</em>
                </b>
              </div>
              <div className="stat wide">
                <span>Negative space</span>
                <b>
                  <em>{pct(design.budget.blankFraction)}</em> of the canvas is gap
                </b>
              </div>
              <div className="stat wide">
                <span>Physical extent</span>
                <b>
                  {(design.canvas.widthMm / 1000).toFixed(2)} ×{' '}
                  {(design.canvas.heightMm / 1000).toFixed(2)} m
                </b>
              </div>
            </div>
          </section>

          <section className="block">
            <h2>Gaps</h2>
            {design.gutters.length === 0 ? (
              <p className="empty">No gaps — the surfaces are contiguous.</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Axis</th>
                    <th className="num">Gap</th>
                    <th className="num">Blank px</th>
                    <th className="num">Error</th>
                    <th className="num">Canvas</th>
                  </tr>
                </thead>
                <tbody>
                  {design.gutters.map((g, i) => (
                    <tr
                      key={i}
                      className="clickable"
                      onClick={() => setGutterEdit({ gutter: g, value: g.mm.toFixed(1) })}
                    >
                      <td>{g.axis === 'x' ? 'Vertical' : 'Horizontal'}</td>
                      <td className="num">{g.mm.toFixed(0)} mm</td>
                      <td className="num">{g.px}</td>
                      <td className="num">
                        {g.residualMm > 0 ? '+' : ''}
                        {g.residualMm.toFixed(1)}
                      </td>
                      <td className="num">
                        {g.startPx}–{g.endPx}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="block">
            <h2>Slices — Resolume input rects</h2>
            {design.surfaces.length === 0 ? (
              <p className="empty">No surfaces.</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Surface</th>
                    <th className="num">Input X, Y</th>
                    <th className="num">W × H</th>
                    <th className="num">Output</th>
                  </tr>
                </thead>
                <tbody>
                  {design.surfaces.map((p) => (
                    <tr
                      key={p.surface.id}
                      className="clickable"
                      onClick={() => setSelectedId(p.surface.id)}
                    >
                      <td>{p.surface.name}</td>
                      <td className="num">
                        {p.rect.x}, {p.rect.y}
                      </td>
                      <td className="num">
                        {p.rect.w} × {p.rect.h}
                      </td>
                      <td className="num">
                        {p.surface.pxWidth} × {p.surface.pxHeight}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint">
              Set the Resolume composition to {design.canvas.widthPx} × {design.canvas.heightPx}.
              Each input rect already carries the gap offsets.
            </p>
          </section>

          <section className="block">
            <h2>PowerPoint</h2>
            <div className="stat-grid">
              <div className="stat">
                <span>Slide size</span>
                <b>
                  {geom.widthCm.toFixed(1)} × {geom.heightCm.toFixed(1)} cm
                </b>
              </div>
              <div className="stat">
                <span>In inches</span>
                <b>
                  {geom.widthIn.toFixed(2)} × {geom.heightIn.toFixed(2)}
                </b>
              </div>
            </div>
            <p className="hint">
              {geom.clamped
                ? 'Scaled to fit PowerPoint’s 56-inch limit. The aspect ratio, and every surface and gap position on it, is exact.'
                : 'One canvas pixel per 1/96 inch — the slide is 1:1 with the canvas.'}
            </p>
          </section>

          {livePremier && livePremier.result.groups.length > 1 && (
            <section className="block">
              <h2>LivePremier pitch compensation</h2>
              <p className="hint">
                What to type into an Analog Way LivePremier at{' '}
                <b>Preconfig &gt; Canvas &gt; Pitch</b> so one screen can span these
                surfaces without a layer changing size as it crosses between them.
              </p>
              <table className="lp-table">
                <thead>
                  <tr>
                    <th>Surface</th>
                    <th>Raster</th>
                    <th>H Ratio</th>
                    <th>V Ratio</th>
                    <th>Canvas rect</th>
                  </tr>
                </thead>
                <tbody>
                  {livePremier.result.groups.map((g) => {
                    const rect = lpRects.find((r) => r.id === g.group.id)
                    const bad = g.h.outOfRange || g.v.outOfRange
                    return (
                      <tr key={g.group.id} className={g.isReference ? 'is-ref' : undefined}>
                        <td>
                          {g.group.name}
                          {g.isReference && <span className="tag note">ref</span>}
                        </td>
                        <td>
                          {g.group.pxWidth} × {g.group.pxHeight}
                        </td>
                        <td className={bad ? 'bad' : undefined}>
                          {g.h.outOfRange ? `${g.h.exact.toFixed(3)} ✕` : g.h.ratio.toFixed(3)}
                        </td>
                        <td className={bad ? 'bad' : undefined}>
                          {g.v.outOfRange ? `${g.v.exact.toFixed(3)} ✕` : g.v.ratio.toFixed(3)}
                        </td>
                        <td>
                          {bad || !rect
                            ? '—'
                            : `${rect.w} × ${rect.h} at ${rect.x}, ${rect.y}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!livePremier.canvasesAgree && (
                <p className="hint warn">
                  These ratios are built on the finest pitch ({pitchLabel(livePremier.referencePitchMm)}),
                  not this project&rsquo;s canvas pixel ({pitchLabel(livePremier.projectPitchMm)}) — a
                  reference below 1.000 would set the whole screen upscaling. The canvas
                  rectangles above are rescaled to match the ratios, so they are{' '}
                  <b>not</b> the pixel numbers shown elsewhere on this page.
                </p>
              )}
              <p className="hint">
                The ratios are right; the <b>positions</b> are still yours to set. This tool
                cannot reach into the outputs&rsquo; own areas of interest, and the gaps that
                make up a Negative Space canvas have to be built there by hand.
              </p>
              {/* Notes included on purpose: when every ratio is 1.000 the engine
                  says so, and a section that explained nothing would read as a
                  feature that had not worked. */}
              {livePremier.result.warnings
                .map((w, i) => (
                  <p key={i} className={`hint ${w.level === 'error' ? 'bad' : 'warn'}`}>
                    {w.message}
                  </p>
                ))}
            </section>
          )}

          {design.diagnostics.length > 0 && (
            <section className="block">
              <h2>Checks</h2>
              <ul className="diags">
                {design.diagnostics.map((d, i) => (
                  <li key={i}>
                    <span className={`tag ${d.severity}`}>{d.severity}</span>
                    <span>{d.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="block">
            <h2>Guide image</h2>
            <Check
              label="Surface labels"
              on={guide.labels}
              set={(v) => setGuide({ ...guide, labels: v })}
            />
            <Check
              label="Gap dimensions"
              on={guide.gutterLabels}
              set={(v) => setGuide({ ...guide, gutterLabels: v })}
            />
            <Check
              label="Filled surfaces"
              on={guide.fill}
              set={(v) => setGuide({ ...guide, fill: v })}
            />
            <Check
              label="Centre marks"
              on={guide.centreMarks}
              set={(v) => setGuide({ ...guide, centreMarks: v })}
            />
            <Check label="Grid" on={guide.grid} set={(v) => setGuide({ ...guide, grid: v })} />
          </section>

          <section className="block">
            <h2>Export</h2>
            <div className="btn-grid">
              <button disabled={!!busy} onClick={() => doExport('pdf')}>
                {busy === 'pdf' ? 'Building…' : 'PDF report'}
              </button>
              <button disabled={!!busy} onClick={() => doExport('png')}>
                {busy === 'png' ? 'Rendering…' : 'Guide PNG'}
              </button>
              <button disabled={!!busy} onClick={() => doExport('svg')}>
                Guide SVG
              </button>
              <button disabled={!!busy} onClick={() => doExport('pptx')}>
                PowerPoint
              </button>
              <button disabled={!!busy} onClick={() => doExport('xml-preset')}>
                Resolume preset
              </button>
              <button disabled={!!busy} onClick={() => doExport('xml-pref')}>
                AdvancedOutput.xml
              </button>
              <button disabled={!!busy} onClick={() => doExport('csv')}>
                CSV
              </button>
              <button disabled={!!busy} onClick={() => doExport('json')}>
                Save project
              </button>
            </div>
            <p className="hint">
              Back up your existing AdvancedOutput.xml before replacing it — Arena rewrites it
              on quit. The preset form is safer: drop it in Presets/Advanced Output/ and load it
              from inside Arena.
            </p>
          </section>
        </div>
      </main>

      <footer className="foot">
        {selected
          ? `${selected.name} — ${selected.widthMm} × ${selected.heightMm} mm, ${selected.pxWidth} × ${selected.pxHeight} px`
          : 'Everything runs in your browser. Nothing you type is uploaded.'}
      </footer>
    </div>
  )
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Check({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  )
}

function AddWall({ onAdd }: { onAdd: (cols: number, rows: number, preset: number) => void }) {
  const [preset, setPreset] = useState(2)
  const [cols, setCols] = useState(3)
  const [rows, setRows] = useState(2)
  const p = PANEL_PRESETS[preset]
  return (
    <>
      <label className="field">
        <span>Cabinet</span>
        <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
          {PANEL_PRESETS.map((x, i) => (
            <option key={x.label} value={i}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <Num label="Panels across" value={cols} onChange={setCols} />
        <Num label="Panels down" value={rows} onChange={setRows} />
      </div>
      <button className="primary" style={{ width: '100%' }} onClick={() => onAdd(cols, rows, preset)}>
        Add {p.panelWMm * cols} × {p.panelHMm * rows} mm wall
      </button>
      <p className="hint">
        {p.panelWPx * cols} × {p.panelHPx * rows} px at{' '}
        {pitchLabel(p.panelWMm / p.panelWPx)}. Edit any surface below to enter real cabinet
        numbers.
      </p>
    </>
  )
}

function ArrangeControls({
  onArrange,
}: {
  onArrange: (cols: number, hGap: number, vGap: number) => void
}) {
  const [cols, setCols] = useState(3)
  const [h, setH] = useState(100)
  const [v, setV] = useState(100)
  return (
    <>
      <div className="row">
        <Num label="Columns" value={cols} onChange={setCols} />
        <Num label="Gap across mm" value={h} onChange={setH} />
        <Num label="Gap down mm" value={v} onChange={setV} />
      </div>
      <button style={{ width: '100%' }} onClick={() => onArrange(cols, h, v)}>
        Lay out with these gaps
      </button>
      <p className="hint">
        Repositions every surface on a grid, in list order. Drag afterwards to adjust.
      </p>
    </>
  )
}
