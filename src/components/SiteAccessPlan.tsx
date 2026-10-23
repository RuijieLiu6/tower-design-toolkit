// Site-access sketch for the competition block (research P09-M05 viz): streets coloured by class, the massing at
// grade, the station corner, and draggable pins for loading, the parking ramp and drop-off. Loading bays are dashed
// outlines "pending Section 5": the by-law bay sizes were not opened, so no dimension is claimed.
import { useRef, type PointerEvent } from 'react'
import { accessXY, STREET_STATE, type AccessPoint } from '../engine/mobility'
import { masses, STATION_CORNER, VTC_EDGES, VTC_SITE, type EdgeId } from '../engine/publicRealm'
import { useMobilityStore } from '../lib/mobilityStore'
import { useTowers } from '../store'

const STREET_FILL = { retail: '#f3c9c4', arterial: '#f6dfb0', local: '#cfe7c9' }
const STATE_COLOR = { pass: '#2e8b57', warn: '#c98a14', fail: '#d0453a', unknown: '#8a8f98' }
const LETTER = { loading: 'L', ramp: 'R', dropoff: 'D' }
const PAD = 34

/** Nearest point on the block boundary: which edge, and where along it (0..1). */
function snap(x: number, y: number): { edge: EdgeId; at: number } {
  const { xMin, xMax, yMin, yMax } = VTC_SITE
  const cx = Math.max(xMin, Math.min(xMax, x)), cy = Math.max(yMin, Math.min(yMax, y))
  const c: [EdgeId, number, number][] = [
    ['south', Math.abs(y - yMin) + Math.abs(x - cx), (cx - xMin) / (xMax - xMin)],
    ['north', Math.abs(y - yMax) + Math.abs(x - cx), (cx - xMin) / (xMax - xMin)],
    ['west', Math.abs(x - xMin) + Math.abs(y - cy), (cy - yMin) / (yMax - yMin)],
    ['east', Math.abs(x - xMax) + Math.abs(y - cy), (cy - yMin) / (yMax - yMin)],
  ]
  c.sort((a, b) => a[1] - b[1])
  return { edge: c[0][0], at: Math.max(0.03, Math.min(0.97, c[0][2])) }
}

export default function SiteAccessPlan({ bays }: { bays: number }) {
  const towers = useTowers()
  const { access, selected, set, moveAccess } = useMobilityStore()
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<string | null>(null)
  const { xMin, xMax, yMin, yMax } = VTC_SITE
  const vb = `${xMin - PAD} ${-(yMax + PAD)} ${xMax - xMin + 2 * PAD} ${yMax - yMin + 2 * PAD}`
  const toModel = (e: PointerEvent): [number, number] | null => {
    const s = svg.current, m = s?.getScreenCTM()
    if (!s || !m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [p.x, -p.y]
  }
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return
    const p = toModel(e)
    if (p) moveAccess(drag.current, snap(p[0], p[1]))
  }
  const band = (id: EdgeId, row: number) => {
    const w = Math.min(row, PAD - 4)
    if (id === 'south') return { x: xMin - PAD, y: -yMin, w: xMax - xMin + 2 * PAD, h: w }
    if (id === 'north') return { x: xMin - PAD, y: -yMax - w, w: xMax - xMin + 2 * PAD, h: w }
    if (id === 'west') return { x: xMin - w, y: -yMax - PAD, w, h: yMax - yMin + 2 * PAD }
    return { x: xMax, y: -yMax - PAD, w, h: yMax - yMin + 2 * PAD }
  }
  return (
    <div>
      <svg ref={svg} viewBox={vb} className="w-full touch-none select-none rounded-md border border-line bg-[#f7f6f2]" role="img" aria-label="Site access plan of the competition block"
        onPointerMove={onMove} onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
        {VTC_EDGES.map((e) => {
          const b = band(e.id, e.row)
          const vertical = e.id === 'west' || e.id === 'east'
          return (
            <g key={e.id} onPointerDown={(ev) => { if (!selected) return; const p = toModel(ev); if (p) moveAccess(selected, snap(p[0], p[1])) }} className={selected ? 'cursor-crosshair' : ''}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={STREET_FILL[e.type]} />
              <text x={vertical ? b.x + b.w / 2 : 0} y={vertical ? 0 : b.y + b.h / 2 + 1.6} fontSize={4.2} textAnchor="middle" fill="#3d434b"
                transform={vertical ? `rotate(-90 ${b.x + b.w / 2} 0)` : undefined}>{e.street} · {e.row} m</text>
            </g>
          )
        })}
        <rect x={xMin} y={-yMax} width={xMax - xMin} height={yMax - yMin} fill="#ffffff" stroke="#1f5f8b" strokeWidth={0.8} />
        {masses(towers).map((m, i) => (
          <polygon key={i} points={m.poly.map(([x, y]) => `${x},${-y}`).join(' ')} fill={m.kind === 'podium' ? '#d9d4ca' : '#a7b4c2'} stroke="#59636e" strokeWidth={0.4} opacity={0.9} />
        ))}
        <g>
          <circle cx={STATION_CORNER[0]} cy={-STATION_CORNER[1]} r={3.5} fill="#1f5f8b" />
          <text x={STATION_CORNER[0] - 2} y={-STATION_CORNER[1] + 9} fontSize={3.6} fill="#1f5f8b">Station (next block)</text>
        </g>
        {access.map((a) => <Pin key={a.id} a={a} bays={a.kind === 'loading' ? Math.max(1, bays) : 0} selected={selected === a.id}
          onDown={(ev) => { ev.stopPropagation(); drag.current = a.id; set({ selected: a.id }); (ev.target as Element).setPointerCapture?.(ev.pointerId) }} />)}
        <text x={xMax + PAD - 2} y={-yMax - PAD + 5} fontSize={3.4} textAnchor="end" fill="#6b6f76">Plan, model grid up · no lane on this block</text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted">
        <span><i className="mr-1 inline-block h-2 w-3 align-middle" style={{ background: STREET_FILL.retail }} />Retail high street: no access</span>
        <span><i className="mr-1 inline-block h-2 w-3 align-middle" style={{ background: STREET_FILL.arterial }} />Arterial: avoid</span>
        <span><i className="mr-1 inline-block h-2 w-3 align-middle" style={{ background: STREET_FILL.local }} />Local street: preferred</span>
        <span>Dashed bays: pending Section 5 (size not confirmed)</span>
      </div>
    </div>
  )
}

function Pin({ a, bays, selected, onDown }: { a: AccessPoint; bays: number; selected: boolean; onDown: (e: PointerEvent<SVGGElement>) => void }) {
  const [x, y] = accessXY(a)
  const e = VTC_EDGES.find((v) => v.id === a.edge)!
  const color = STATE_COLOR[STREET_STATE[e.type]]
  // Inward direction (into the site) and the along-edge direction.
  const inx = -e.out[0], iny = -e.out[1], alx = Math.abs(e.out[1]), aly = Math.abs(e.out[0])
  // Indicative bay outline (10.2 × 3.4 m from an unverified May 2026 extract), drawn dashed with no dimension label.
  const L = 10.2, W = 3.4
  return (
    <g onPointerDown={onDown} className="cursor-grab">
      {Array.from({ length: Math.min(bays, 6) }, (_, k) => {
        const off = (k - (Math.min(bays, 6) - 1) / 2) * (W + 0.6)
        const cx = x + alx * off + inx * (L / 2), cy = y + aly * off + iny * (L / 2)
        const w = alx ? W : L, h = alx ? L : W
        return <rect key={k} x={cx - w / 2} y={-cy - h / 2} width={w} height={h} fill="none" stroke={color} strokeWidth={0.5} strokeDasharray="1.2 0.8" />
      })}
      {a.kind === 'ramp' && <line x1={x} y1={-y} x2={x + inx * 16} y2={-(y + iny * 16)} stroke={color} strokeWidth={2.2} strokeDasharray="2 1" />}
      <circle cx={x} cy={-y} r={selected ? 4.4 : 3.6} fill={color} stroke={selected ? '#1f2328' : '#ffffff'} strokeWidth={selected ? 1 : 0.6} />
      <text x={x} y={-y + 1.4} fontSize={3.8} textAnchor="middle" fill="#ffffff" fontWeight={700} pointerEvents="none">{LETTER[a.kind]}</text>
    </g>
  )
}
