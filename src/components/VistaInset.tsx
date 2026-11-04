// Vista's corner location map (v08 "live north-up plan inset"), shown over the 3D view while looking from a viewpoint:
// the protected cones, the view wedge, the design towers and the viewpoint, north up, with a scale bar. DOM + SVG,
// outside the canvas (no drei <Html>). Local frame: EPSG:26910 minus the City origin.
import { useMemo } from 'react'
import { towerFootprint } from '../engine/massing'
import { CONES, CONE_PARAMS } from '../engine/viewCones'
import { compass } from '../engine/viewFrom'
import { eyeZ, useViewFromStore } from '../lib/viewFromStore'
import { CITY_ORIGIN, useStore, useTowers } from '../store'

const S = 196

export default function VistaInset() {
  const v = useViewFromStore()
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const vp = v.viewpoint
  const local = useMemo(() => CONES.map((c) => ({ id: c.id, est: !!CONE_PARAMS[c.id], ring: c.ring.map(([x, y]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]] as [number, number]) })), [])
  if (!v.looking || !vp) return null
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const dT = t ? Math.hypot(t.x - vp.x, t.y - vp.y) : 0
  const R = Math.min(6000, Math.max(900, dT * 1.25))
  const k = (S / 2 - 8) / R
  const X = (x: number) => S / 2 + (x - vp.x) * k, Y = (y: number) => S / 2 - (y - vp.y) * k
  const path = (ring: [number, number][]) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ') + 'Z'
  const a0 = ((v.bearing - v.hfov / 2) * Math.PI) / 180, a1 = ((v.bearing + v.hfov / 2) * Math.PI) / 180
  const r = R * 1.5
  const wedge = `M${S / 2},${S / 2} L${X(vp.x + Math.sin(a0) * r)},${Y(vp.y + Math.cos(a0) * r)} L${X(vp.x + Math.sin(a1) * r)},${Y(vp.y + Math.cos(a1) * r)}Z`
  const bar = [100, 250, 500, 1000, 2000].reduce((b, m) => (m * k <= 70 ? m : b), 100)
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-line bg-white/80 p-1.5 text-[10px] text-slate-700 shadow-sm backdrop-blur-md" aria-label="Location map of the current view">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`Plan: looking ${compass(v.bearing)} with a ${Math.round(v.hfov)}° field from ${vp.label}`}>
        <defs><clipPath id="vista-inset-clip"><rect x={0} y={0} width={S} height={S} rx={4} /></clipPath></defs>
        <g clipPath="url(#vista-inset-clip)">
          <rect width={S} height={S} fill="#f4f6f8" />
          {local.map((c) => <path key={c.id} d={path(c.ring)} fill={c.est ? '#4f7fae' : '#7d838c'} fillOpacity={vp.coneId === c.id ? 0.28 : 0.1} stroke={c.est ? '#4f7fae' : '#7d838c'} strokeWidth={vp.coneId === c.id ? 1.4 : 0.7} strokeDasharray={c.est ? undefined : '4 3'} />)}
          <path d={wedge} fill="#d97706" fillOpacity={0.18} stroke="#d97706" strokeWidth={1} />
          {towers.map((tw) => <path key={tw.id} d={path(towerFootprint(tw))} fill={tw.id === t?.id ? '#1f2328' : '#6b7280'} />)}
          <circle cx={S / 2} cy={S / 2} r={4} fill="#d97706" stroke="#fff" strokeWidth={1.5} />
        </g>
        <g transform={`translate(${S - 16},18)`}><path d="M0 -10 L4 4 L0 1 L-4 4 Z" fill="#1f2328" /><text y={14} textAnchor="middle" fontSize={8} fontWeight={600} fill="#1f2328">N</text></g>
        <rect x={8} y={S - 12} width={bar * k} height={3} fill="#1f2328" />
        <text x={8} y={S - 15} fontSize={8} fill="#1f2328">{bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</text>
      </svg>
      <div className="mt-0.5 max-w-[196px] leading-snug"><b className="text-ink">{vp.label}</b> · eye {eyeZ(vp, v.eye).toFixed(1)} m · looking {compass(v.bearing)} ({Math.round(v.bearing)}°), field {Math.round(v.hfov)}°</div>
    </div>
  )
}
