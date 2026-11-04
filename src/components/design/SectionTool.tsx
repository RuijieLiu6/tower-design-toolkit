// Section design tool (Schematic, LOD 100): the block stack cut along the tower's width, edited by dragging. A block's
// top snaps to the floor lines (Shift for free) and the blocks above ride with it; a block's sides set it back; a
// click places sky lobbies, plant floors and outrigger floors; each band can have its own floor-to-floor. A drag is a
// preview until release, then one store write (one undo step). Esc cancels a drag.
import { useEffect, useMemo, useRef, useState } from 'react'
import { resizeBlockEdge, sectionChecks, preview, setBandF2f, setBlockTop, toggleLevel, type Edge, type LevelKind } from '../../engine/designEdit'
import { blockSpans, rectCorners, spanAt, towerFloors } from '../../engine/massing'
import { USES, type Tower } from '../../engine/types'
import { useStore, useTowers } from '../../store'
import { FlagChip, NumberField, StateChip } from '../ui'

type Drag = { kind: 'top'; block: number; t0: Tower } | { kind: 'side'; block: number; side: 1 | -1; start: number; t0: Tower }
const MODES: { id: LevelKind | 'none'; label: string }[] = [{ id: 'none', label: 'Select' }, { id: 'sky', label: 'Sky lobby' }, { id: 'plant', label: 'Plant floor' }, { id: 'outrigger', label: 'Outrigger' }]

/** The block edge whose outward normal points most along +x (side 1) or -x (side -1) in the tower frame. */
function sideEdge(rotation: number, side: 1 | -1): { edge: Edge; along: number } {
  const a = (rotation * Math.PI) / 180
  const n: Record<Edge, number> = { e: Math.cos(a), w: -Math.cos(a), n: -Math.sin(a), s: Math.sin(a) }
  const edge = (Object.keys(n) as Edge[]).reduce((best, k) => (n[k] * side > n[best] * side ? k : best), 'e' as Edge)
  return { edge, along: Math.abs(n[edge]) }
}

export default function SectionTool({ onClose }: { onClose?: () => void }) {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const updateTower = useStore((s) => s.updateTower)
  const liftPresets = useStore((s) => s.liftPresets)
  const egressPresets = useStore((s) => s.egressPresets)
  const stored = towers.find((x) => x.id === selected) ?? towers[0]
  const [patch, setPatch] = useState<Partial<Tower> | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [mode, setMode] = useState<LevelKind | 'none'>('none')
  const svg = useRef<SVGSVGElement>(null)
  const t = useMemo(() => (stored && patch ? preview(stored, patch) : stored), [stored, patch])
  const floors = useMemo(() => (t ? towerFloors(t) : []), [t])
  const spans = useMemo(() => (t ? blockSpans(t) : []), [t])
  const checks = useMemo(() => (t && !t.imported ? sectionChecks(t, liftPresets, egressPresets) : null), [t, liftPresets, egressPresets])

  useEffect(() => {
    if (!drag) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrag(null); setPatch(null) } }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [drag])

  if (!stored || !t) return <div className="p-6 text-sm text-muted">No tower to edit.</div>
  if (t.imported) return <div className="p-6 text-sm text-muted">Imported massing: the section follows your model. The Section tool edits parametric towers.</div>

  // Each block's extent along the tower's width axis (tower frame).
  const ext = spans.map((s) => { const xs = rectCorners(s.block.dx, s.block.dy, s.block.width, s.block.depth, s.block.rotation).map((p) => p[0]); return { u0: Math.min(...xs), u1: Math.max(...xs) } })
  const H = Math.max(t.height, spans[spans.length - 1]?.z1 ?? 0)
  const minX = Math.min(...ext.map((e) => e.u0)) - H * 0.12, maxX = Math.max(...ext.map((e) => e.u1)) + H * 0.12
  const fs = Math.max(1.5, H / 70)
  const out = new Set(t.outriggerFloors ?? [])
  const toZ = (e: { clientX: number; clientY: number }) => {
    const m = svg.current?.getScreenCTM()
    if (!m) return { x: 0, z: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, z: -p.y }
  }
  const begin = (d: Drag) => (e: React.PointerEvent) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); setDrag(d) }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const p = toZ(e)
    if (drag.kind === 'top') setPatch({ blocks: setBlockTop(drag.t0, drag.block, p.z, !e.shiftKey) })
    else {
      const b = blockSpans(drag.t0)[drag.block].block
      const { edge, along } = sideEdge(b.rotation, drag.side)
      const raw = ((p.x - drag.start) * drag.side) / Math.max(0.3, along)
      setPatch({ blocks: resizeBlockEdge(drag.t0, drag.block, edge, e.shiftKey ? raw : Math.round(raw * 2) / 2) })
    }
  }
  const end = () => { if (drag && patch) updateTower(stored.id, patch); setDrag(null); setPatch(null) }
  const place = (level: number) => { if (mode !== 'none' && !drag) updateTower(stored.id, toggleLevel(stored, level, mode)) }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f5] @min-[720px]:flex-row" data-design-tool="section">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="m-2 flex flex-wrap items-center self-start gap-1.5 rounded-md border border-line bg-panel/95 px-2 py-1 text-xs shadow-sm">
          <b className="mr-1">Section</b>
          <span className="text-muted">Click a floor to place:</span>
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={`rounded border px-1.5 py-0.5 ${mode === m.id ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-accent'}`}>{m.label}</button>
          ))}
          {onClose && <button type="button" onClick={onClose} className="ml-1 rounded border border-line px-2 py-0.5 hover:border-accent">Back to 3D</button>}
        </div>
        <svg ref={svg} role="img" aria-label="Section through the tower, editable" className="min-h-0 w-full flex-1 touch-none select-none" viewBox={`${minX} ${-(H + H * 0.08)} ${maxX - minX} ${H * 1.14}`} preserveAspectRatio="xMidYMid meet"
          onPointerMove={onMove} onPointerUp={end} onPointerCancel={() => { setDrag(null); setPatch(null) }}>
          <line x1={minX} y1={0} x2={maxX} y2={0} stroke="#1f2328" strokeWidth={fs * 0.15} />
          <rect x={minX} y={0} width={maxX - minX} height={H * 0.04} fill="#d9d4cc" />
          {floors.map((f) => {
            const s = spanAt(spans, (f.z0 + f.z1) / 2)
            const e = s ? ext[s.index] : ext[0]
            const fill = f.use === 'mechanical' ? '#a3a3a3' : f.skyLobby ? '#2a8f86' : USES[f.use].color
            return (
              <g key={f.level} data-level={f.level} onClick={() => place(f.level)} className={mode !== 'none' ? 'cursor-pointer' : undefined}>
                <rect x={e.u0} y={-f.z1} width={e.u1 - e.u0} height={f.z1 - f.z0} fill={fill} fillOpacity={f.use === 'mechanical' || f.skyLobby ? 0.75 : 0.45} stroke="#ffffff" strokeWidth={fs * 0.04} />
                {out.has(f.level) && <line x1={e.u0} y1={-f.z1} x2={e.u1} y2={-f.z1} stroke="#7a3e00" strokeWidth={fs * 0.35}><title>Outrigger floor L{f.level}</title></line>}
                <title>L{f.level} · +{f.z0.toFixed(1)} m · {(f.z1 - f.z0).toFixed(2)} m · {f.skyLobby ? 'sky lobby' : USES[f.use].label}</title>
              </g>
            )
          })}
          {/* Block outlines and grips */}
          {spans.map((s, i) => {
            const e = ext[i]
            return (
              <g key={s.block.id}>
                <rect x={e.u0} y={-s.z1} width={e.u1 - e.u0} height={s.z1 - s.z0} fill="none" stroke="#1f2328" strokeWidth={fs * 0.12} pointerEvents="none" />
                <line data-testid={`section-top-${i}`} x1={e.u0} y1={-s.z1} x2={e.u1} y2={-s.z1} stroke="#1d5fa8" strokeOpacity={0.001} strokeWidth={fs * 1.1} className="cursor-ns-resize"
                  onPointerDown={begin({ kind: 'top', block: i, t0: stored })}><title>Drag the top of {s.block.name ?? `block ${i + 1}`} (snaps to floors; Shift for free)</title></line>
                <circle cx={(e.u0 + e.u1) / 2} cy={-s.z1} r={fs * 0.35} fill="#ffffff" stroke="#1d5fa8" strokeWidth={fs * 0.1} pointerEvents="none" />
                {([1, -1] as const).map((side) => {
                  const x = side === 1 ? e.u1 : e.u0
                  return <line key={side} data-testid={`section-side-${i}-${side === 1 ? 'e' : 'w'}`} x1={x} y1={-s.z0} x2={x} y2={-s.z1} stroke="#1d5fa8" strokeOpacity={0.001} strokeWidth={fs * 1.1} className="cursor-ew-resize"
                    onPointerDown={(ev) => begin({ kind: 'side', block: i, side, start: toZ(ev).x, t0: stored })(ev)}><title>Drag to set this block back (0.5 m steps; Shift for free)</title></line>
                })}
                <text x={e.u1 + fs * 0.6} y={-s.z1 + fs * 1.1} fontSize={fs} fill="#1f2328">{s.block.name ?? (s.block.podium ? 'Podium' : `Block ${i + 1}`)} · +{s.z1.toFixed(1)} m</text>
              </g>
            )
          })}
          <text x={minX + fs} y={-H - fs * 1.5} fontSize={fs} fill="#5b6068">Section along the tower’s width, looking along its depth · LOD 100</text>
        </svg>
        <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted">Drag a block’s top or sides · tops snap to floor lines, sides to 0.5 m (Shift for free) · Esc cancels · clicks place floors in the chosen mode</p>
      </div>
      <aside aria-label="Section checks" className="max-h-[42%] w-full shrink-0 overflow-y-auto border-t border-line bg-panel p-3 @min-[720px]:max-h-none @min-[720px]:w-72 @min-[720px]:border-l @min-[720px]:border-t-0">
        <div className="text-xs font-semibold">Live checks{drag ? ' (preview)' : ''}</div>
        {checks && <div className="mt-1 text-[11px] text-slate-700">{checks.floors} floors · {checks.height.toFixed(1)} m · {Math.round(checks.gfa).toLocaleString('en-CA')} m² gross</div>}
        <div className="mt-2 text-[11px] font-semibold">Floor-to-floor by band</div>
        <div className="mt-1 grid gap-1.5">
          {t.bands.map((b, i) => (
            <div key={i} className="flex items-end gap-2">
              <span className="mb-1 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: USES[b.use].color }} />
              <div className="flex-1"><NumberField label={`${USES[b.use].label}${b.f2f ? '' : ' (tower)'}`} value={b.f2f ?? t.f2f} unit="m" step={0.1} onChange={(v) => updateTower(stored.id, setBandF2f(stored, i, v > 0 && Math.abs(v - t.f2f) > 1e-9 ? v : undefined))} /></div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2">
          {checks?.rules.map((r) => (
            <div key={r.id} className="rounded-md border border-line p-2 text-[11px]">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.label}</span><StateChip state={r.state} /></div>
              <div><b>{r.value}</b> <span className="text-muted">· {r.threshold}</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} /><span className="text-[11px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span></div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Floor heights, plant and outrigger positions are design inputs (team assumptions); the checks are the same engines as the Inspector.</p>
      </aside>
    </div>
  )
}
