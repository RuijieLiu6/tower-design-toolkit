// Plan design tool (Schematic, LOD 100): the plate of the block at a chosen level, edited by dragging. Edges resize
// the block (the opposite edge stays), the plate moves it, the round grip turns it, the core's edges size the core.
// Lifts and stairs come from engine/plan.ts and engine/egress.ts. A drag shows a preview and is written to the store
// once, on release: one undo step, nothing committed mid-drag (the gizmo's rule). Esc cancels a drag.
import { RotateCcw } from '../icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { coreSideEdit, moveBlock, planChecks, preview, resizeBlockEdge, rotateBlock, type Edge } from '../../engine/designEdit'
import { stairEnclosure, stairSpots, storeyLoads } from '../../engine/egress'
import { liftCheck } from '../../engine/lifts'
import { blockSpans, coreSide, rectCorners, spanAt, towerFloors } from '../../engine/massing'
import { coreLayout, typicalFloor } from '../../engine/plan'
import { USES, type Tower } from '../../engine/types'
import { useStore, useTowers } from '../../store'
import { FlagChip, StateChip } from '../ui'
import Help from '../Help'

type P = [number, number]
type Drag =
  | { kind: 'edge'; edge: Edge; block: number; start: P; t0: Tower }
  | { kind: 'move'; block: number; start: P; t0: Tower }
  | { kind: 'rotate'; block: number; centre: P; a0: number; r0: number; t0: Tower }
  | { kind: 'core'; edge: Edge; t0: Tower }

const STEP = 0.5 // m: edges and offsets snap to 0.5 m; hold Shift for free
const TURN = 5 // degrees: hold Shift for free
const snap = (v: number, step: number, free: boolean) => (free ? v : Math.round(v / step) * step)
const NORMAL: Record<Edge, P> = { e: [1, 0], w: [-1, 0], n: [0, 1], s: [0, -1] }

export default function PlanTool({ onClose }: { onClose?: () => void }) {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const updateTower = useStore((s) => s.updateTower)
  const liftPresets = useStore((s) => s.liftPresets)
  const egressPresets = useStore((s) => s.egressPresets)
  const stored = towers.find((x) => x.id === selected) ?? towers[0]
  const [patch, setPatch] = useState<Partial<Tower> | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const t = useMemo(() => (stored && patch ? preview(stored, patch) : stored), [stored, patch])

  const floors = useMemo(() => (t ? towerFloors(t) : []), [t])
  const lv = level ?? (stored ? typicalFloor(stored)?.level ?? null : null)
  const floor = floors.find((f) => f.level === lv) ?? floors[0]
  const spans = useMemo(() => (t ? blockSpans(t) : []), [t])
  const span = floor ? spanAt(spans, (floor.z0 + floor.z1) / 2) : null
  const bi = span?.index ?? 0
  const b = span?.block

  // Layout from the engines (lifts and stairs in the core at this level).
  const layout = useMemo(() => {
    if (!t || t.imported) return null
    const lift = liftCheck(t, liftPresets, egressPresets, { skipDirect: true })
    const core = coreLayout(t, lift, liftPresets, egressPresets)
    const st = storeyLoads(t, egressPresets, { homeM2: liftPresets.homeM2, hotelM2PerKey: liftPresets.hotelM2PerKey }).find((s) => s.level === floor?.level)
    const enc = stairEnclosure(st?.stairMm ?? 1100, st?.f2f ?? t.f2f, egressPresets)
    const stairs = stairSpots(t, Math.max(2, Math.round(egressPresets.stairs)), enc.a, enc.b)
    return { core, enc, stairs }
  }, [t, liftPresets, egressPresets, floor?.level])
  const checks = useMemo(() => (t && !t.imported ? planChecks(t, floor?.level ?? null, liftPresets, egressPresets) : null), [t, floor?.level, liftPresets, egressPresets])

  useEffect(() => {
    if (!drag) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrag(null); setPatch(null) } }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [drag])

  if (!stored || !t) return <div className="p-6 text-sm text-muted">No tower to edit.</div>
  if (t.imported) return <div className="p-6 text-sm text-muted">Imported massing: edit the plate in your modelling tool and import it again. The Plan tool edits parametric towers.</div>
  if (!b || !floor) return <div className="p-6 text-sm text-muted">No floor to draw.</div>

  // Drawing frame: the tower's own frame (block offsets and turns relative to it), y up.
  const ring = rectCorners(b.dx, b.dy, b.width, b.depth, b.rotation)
  const below = spans[bi - 1]?.block, above = spans[bi + 1]?.block
  const ghosts = [below, above].filter(Boolean).map((g) => rectCorners(g!.dx, g!.dy, g!.width, g!.depth, g!.rotation))
  const pts = [...ring, ...ghosts.flat()]
  const pad = 14
  const minX = Math.min(...pts.map((p) => p[0])) - pad, maxX = Math.max(...pts.map((p) => p[0])) + pad
  const minY = Math.min(...pts.map((p) => p[1])) - pad, maxY = Math.max(...pts.map((p) => p[1])) + pad
  const c = coreSide(t)
  const poly = (r: P[]) => r.map(([x, y]) => `${x},${-y}`).join(' ')
  const toModel = (e: { clientX: number; clientY: number }): P => {
    const m = svg.current?.getScreenCTM()
    if (!m) return [0, 0]
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [p.x, -p.y]
  }
  const begin = (d: Drag) => (e: React.PointerEvent) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); setDrag(d) }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const p = toModel(e), free = e.shiftKey
    if (drag.kind === 'edge') {
      const blk = blockSpans(drag.t0)[drag.block].block
      const a = (blk.rotation * Math.PI) / 180
      const [nx0, ny0] = NORMAL[drag.edge]
      const n: P = [nx0 * Math.cos(a) - ny0 * Math.sin(a), nx0 * Math.sin(a) + ny0 * Math.cos(a)]
      const d = snap((p[0] - drag.start[0]) * n[0] + (p[1] - drag.start[1]) * n[1], STEP, free)
      setPatch({ blocks: resizeBlockEdge(drag.t0, drag.block, drag.edge, d) })
    } else if (drag.kind === 'move') {
      setPatch({ blocks: moveBlock(drag.t0, drag.block, snap(p[0] - drag.start[0], STEP, free), snap(p[1] - drag.start[1], STEP, free)) })
    } else if (drag.kind === 'rotate') {
      const a = (Math.atan2(p[1] - drag.centre[1], p[0] - drag.centre[0]) * 180) / Math.PI
      setPatch({ blocks: rotateBlock(drag.t0, drag.block, snap(drag.r0 + a - drag.a0, TURN, free)) })
    } else {
      // The core stays centred on the tower: its side is twice the distance from the centre to the pointer along the edge's normal.
      const [nx, ny] = NORMAL[drag.edge]
      setPatch(coreSideEdit(drag.t0, Math.max(4, snap(2 * Math.abs(p[0] * nx + p[1] * ny), STEP, free))))
    }
  }
  const end = () => {
    if (drag && patch) updateTower(stored.id, patch)
    setDrag(null)
    setPatch(null)
  }

  const a = (b.rotation * Math.PI) / 180
  const edgeMid = (edge: Edge): P => { const [nx, ny] = NORMAL[edge]; const h = edge === 'e' || edge === 'w' ? b.width / 2 : b.depth / 2; return [b.dx + (nx * Math.cos(a) - ny * Math.sin(a)) * h, b.dy + (nx * Math.sin(a) + ny * Math.cos(a)) * h] }
  const edgeLine = (edge: Edge): [P, P] => {
    const i = { s: 0, e: 1, n: 2, w: 3 }[edge]
    return [ring[i], ring[(i + 1) % 4]]
  }
  const rot: P = [b.dx + -Math.sin(a) * (b.depth / 2 + 6), b.dy + Math.cos(a) * (b.depth / 2 + 6)]
  const levels = floors.filter((f) => !f.podium || f.level === 1)
  const fill = floor.use === 'mechanical' ? '#c9ccd1' : USES[floor.use].color

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f5] @min-[720px]:flex-row" data-design-tool="plan">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="m-2 flex flex-wrap items-center self-start gap-2 rounded-md border border-line bg-panel/95 px-2 py-1 text-xs shadow-sm">
          <b>Plan</b>
          <label className="flex items-center gap-1">Level
            <select aria-label="Plan level" value={floor.level} onChange={(e) => setLevel(Number(e.target.value))} className="rounded border border-line bg-panel px-1 py-0.5">
              {levels.map((f) => <option key={f.level} value={f.level}>L{f.level} · {f.skyLobby ? 'sky lobby' : USES[f.use].label}{f.podium ? ' (podium)' : ''}</option>)}
            </select>
          </label>
          <span className="text-muted">Block: {b.name ?? (b.podium ? 'Podium' : `Block ${bi + 1}`)} · {b.width.toFixed(1)} × {b.depth.toFixed(1)} m{b.rotation ? ` · ${b.rotation.toFixed(0)}°` : ''}</span>
          {onClose && <button type="button" onClick={onClose} className="rounded border border-line px-2 py-0.5 hover:border-accent">Back to 3D</button>}
        </div>
        <svg ref={svg} role="img" aria-label={`Plan of level ${floor.level}, editable`} className="min-h-0 w-full flex-1 touch-none select-none" viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet"
          onPointerMove={onMove} onPointerUp={end} onPointerCancel={() => { setDrag(null); setPatch(null) }}>
          {/* 1 m grid, 9 m bays darker */}
          <g stroke="#e3e5e8" strokeWidth={0.06}>
            {Array.from({ length: Math.ceil(maxX - minX) }, (_, k) => Math.floor(minX) + k).map((x) => <line key={`x${x}`} x1={x} y1={-maxY} x2={x} y2={-minY} stroke={x % 9 === 0 ? '#cfd3d8' : undefined} />)}
            {Array.from({ length: Math.ceil(maxY - minY) }, (_, k) => Math.floor(minY) + k).map((y) => <line key={`y${y}`} x1={minX} y1={-y} x2={maxX} y2={-y} stroke={y % 9 === 0 ? '#cfd3d8' : undefined} />)}
          </g>
          {ghosts.map((g, k) => <polygon key={k} points={poly(g)} fill="none" stroke="#8a9099" strokeWidth={0.25} strokeDasharray={k === 0 && below ? '1.2 0.8' : '0.4 0.6'} />)}
          {/* The plate: drag to move the block */}
          <polygon data-testid="plan-plate" points={poly(ring)} fill={fill} fillOpacity={0.35} stroke="#1f2328" strokeWidth={0.5} className="cursor-move"
            onPointerDown={(e) => begin({ kind: 'move', block: bi, start: toModel(e), t0: stored })(e)} />
          {/* Core with lifts and stairs (centred on the tower) */}
          <rect x={-c / 2} y={-c / 2} width={c} height={c} fill="#2b3f55" fillOpacity={0.18} stroke="#2b3f55" strokeWidth={0.4} />
          {layout?.core.shafts.filter((s) => s.z0 <= floor.z0 + 0.1 && s.z1 >= floor.z1 - 0.1).map((s, k) => (
            <rect key={k} x={s.x - layout.core.side / 2} y={-s.y - layout.core.side / 2} width={layout.core.side} height={layout.core.side} fill={s.outside ? '#f3c4c0' : '#ffffff'} stroke={s.outside ? '#c0392b' : '#4a5563'} strokeWidth={0.12}>
              <title>{s.group}{s.outside ? ' (outside the core)' : ''}</title>
            </rect>
          ))}
          {layout?.stairs.map((s, k) => <rect key={`st${k}`} x={s.x - layout.enc.a / 2} y={-s.y - layout.enc.b / 2} width={layout.enc.a} height={layout.enc.b} fill="#d0453a" fillOpacity={0.25} stroke="#d0453a" strokeWidth={0.15}><title>Exit stair</title></rect>)}
          {/* Core edge grips */}
          {(['e', 'w', 'n', 's'] as Edge[]).map((edge) => {
            const [nx, ny] = NORMAL[edge], h = c / 2
            const p0: P = edge === 'e' || edge === 'w' ? [nx * h, -h] : [-h, ny * h], p1: P = edge === 'e' || edge === 'w' ? [nx * h, h] : [h, ny * h]
            return <line key={`core-${edge}`} data-testid={`plan-core-${edge}`} x1={p0[0]} y1={-p0[1]} x2={p1[0]} y2={-p1[1]} stroke="#2b3f55" strokeOpacity={0.001} strokeWidth={1.6}
              className={edge === 'e' || edge === 'w' ? 'cursor-ew-resize' : 'cursor-ns-resize'} onPointerDown={begin({ kind: 'core', edge, t0: stored })}><title>Drag to size the core (switches it to manual)</title></line>
          })}
          {/* Block edge grips */}
          {(['e', 'w', 'n', 's'] as Edge[]).map((edge) => {
            const [p0, p1] = edgeLine(edge), m = edgeMid(edge)
            return (
              <g key={edge}>
                <line data-testid={`plan-edge-${edge}`} x1={p0[0]} y1={-p0[1]} x2={p1[0]} y2={-p1[1]} stroke="#1d5fa8" strokeOpacity={0.001} strokeWidth={2.4} className="cursor-pointer"
                  onPointerDown={(e) => begin({ kind: 'edge', edge, block: bi, start: toModel(e), t0: stored })(e)}><title>Drag to move this facade (the opposite one stays)</title></line>
                <circle cx={m[0]} cy={-m[1]} r={0.9} fill="#ffffff" stroke="#1d5fa8" strokeWidth={0.3} pointerEvents="none" />
              </g>
            )
          })}
          <line x1={b.dx} y1={-b.dy} x2={rot[0]} y2={-rot[1]} stroke="#1d5fa8" strokeWidth={0.15} strokeDasharray="0.5 0.4" pointerEvents="none" />
          <circle data-testid="plan-rotate" cx={rot[0]} cy={-rot[1]} r={1.2} fill="#1d5fa8" className="cursor-grab"
            onPointerDown={(e) => { const p = toModel(e); begin({ kind: 'rotate', block: bi, centre: [b.dx, b.dy], a0: (Math.atan2(p[1] - b.dy, p[0] - b.dx) * 180) / Math.PI, r0: b.rotation, t0: stored })(e) }}><title>Drag to turn this block (5° steps; Shift for free)</title></circle>
          {/* Dimensions */}
          <text x={edgeMid('s')[0]} y={-edgeMid('s')[1] + 3} fontSize={1.6} textAnchor="middle" fill="#1f2328">{b.width.toFixed(1)} m</text>
          <text x={edgeMid('e')[0] + 3.2} y={-edgeMid('e')[1]} fontSize={1.6} textAnchor="middle" fill="#1f2328" transform={`rotate(-90 ${edgeMid('e')[0] + 3.2} ${-edgeMid('e')[1]})`}>{b.depth.toFixed(1)} m</text>
          <text x={0} y={c / 2 + 2} fontSize={1.3} textAnchor="middle" fill="#2b3f55">core {c.toFixed(1)} m{t.coreAuto ? ' (sized to the lifts)' : ''}</text>
        </svg>
        <div className="absolute bottom-2 left-3 flex items-center gap-1 text-meta text-muted"><Help label="How to edit the plan">Drag a facade, the plate, the round grip or the core’s edges · 0.5 m and 5° steps, Shift for free · Esc cancels · LOD 100 space reservation (team assumptions)</Help>How to edit</div>
      </div>
      <aside aria-label="Plan checks" className="max-h-[42%] w-full shrink-0 overflow-y-auto border-t border-line bg-panel p-3 @min-[720px]:max-h-none @min-[720px]:w-72 @min-[720px]:border-l @min-[720px]:border-t-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold">Live checks{drag ? ' (preview)' : ''}<Help label="About the plan checks">The core stays on the tower centre (an off-centre core is not modelled yet). Lifts and stairs are laid out by the engine; red cells don’t fit in the core.</Help></div>
        <div className="mt-1 text-meta text-slate-700">L{floor.level}: {Math.round(floor.area).toLocaleString('en-CA')} m² gross, core {(c * c).toFixed(0)} m²{checks?.ntgFloor != null ? ` · ${(checks.ntgFloor * 100).toFixed(0)}% net of the core` : ''}</div>
        <div className="mt-2 grid gap-2">
          {checks?.rules.map((r) => (
            <div key={r.id} className="rounded-md border border-line p-2 text-meta">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.label}</span><StateChip state={r.state} /></div>
              <div><b>{r.value}</b> <span className="text-muted">· {r.threshold}</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} /><span className="text-meta text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span></div>
            </div>
          ))}
        </div>
        {!t.coreAuto && <button type="button" onClick={() => updateTower(stored.id, { coreAuto: true })} className="mt-2 flex items-center gap-1 rounded border border-line px-2 py-1 text-meta hover:border-accent"><RotateCcw size={11} />Size the core to the lifts again</button>}
      </aside>
    </div>
  )
}
