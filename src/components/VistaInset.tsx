// Vista's corner location map (v08 "live north-up plan inset"), shown over the 3D view while looking from a viewpoint:
// the protected cones, the view beam, the design towers and the viewpoint, north up, with a scale bar. DOM + SVG,
// outside the canvas (no drei <Html>). Local frame: EPSG:26910 minus the City origin.
// Ruijie (6 Nov): "on the bottom always show where is the proposed tower and the observer, refer to how Vista build
// this function". As in Vista (explorer.js drawInset + inset-camera.js), the map is framed on both the eye and the
// proposed tower (lib/insetFit.ts), each with a marker and a word ("you", the tower's name), joined by a line; the beam
// is as wide as the field of view; the model's edge is outlined when the frame has to run past it.
import { useMemo } from 'react'
import { towerFootprint } from '../engine/massing'
import { CONES, CONE_PARAMS } from '../engine/viewCones'
import { compass } from '../engine/viewFrom'
import { fitInset } from '../lib/insetFit'
import { CITY_PLINTH } from '../lib/plinth'
import { eyeZ, useViewFromStore } from '../lib/viewFromStore'
import { CITY_ORIGIN, useStore, useTowers } from '../store'

const S = 196
/** Room for the markers and their words at the frame's edge (px). */
const PAD = 24
const BEAM_PX = 64
const BOUNDS: [number, number, number, number] = [CITY_PLINTH.x0, CITY_PLINTH.y0, CITY_PLINTH.x1, CITY_PLINTH.y1]
const EYE = '#d97706', TOWER = '#1f2328'

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`)

export default function VistaInset() {
  const v = useViewFromStore()
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const vp = v.viewpoint
  const local = useMemo(() => CONES.map((c) => ({ id: c.id, est: !!CONE_PARAMS[c.id], ring: c.ring.map(([x, y]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]] as [number, number]) })), [])
  if (!v.looking || !vp) return null
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const eye: [number, number] = [vp.x, vp.y]
  const fp = t ? towerFootprint(t) : []
  const frame = fitInset({ points: [eye, ...fp], width: S, height: S, bounds: BOUNDS, paddingPx: PAD })
  const k = S / (2 * frame.half)
  const X = (x: number) => S / 2 + (x - frame.center[0]) * k, Y = (y: number) => S / 2 - (y - frame.center[1]) * k
  const path = (ring: [number, number][]) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ') + 'Z'
  const ex = X(eye[0]), ey = Y(eye[1])
  // The beam: where you look, as wide as the horizontal field, a fixed size on screen (Vista).
  const a0 = ((v.bearing - v.hfov / 2) * Math.PI) / 180, a1 = ((v.bearing + v.hfov / 2) * Math.PI) / 180
  const beam = `M${ex},${ey} L${(ex + Math.sin(a0) * BEAM_PX).toFixed(1)},${(ey - Math.cos(a0) * BEAM_PX).toFixed(1)} A${BEAM_PX} ${BEAM_PX} 0 0 1 ${(ex + Math.sin(a1) * BEAM_PX).toFixed(1)},${(ey - Math.cos(a1) * BEAM_PX).toFixed(1)}Z`
  const tx = t ? X(t.x) : 0, ty = t ? Y(t.y) : 0
  const dist = t ? Math.hypot(t.x - eye[0], t.y - eye[1]) : 0
  const bar = [50, 100, 250, 500, 1000, 2000, 5000].reduce((b, m) => (m * k <= 64 ? m : b), 50)
  // Words over the upper marker and under the lower one (so they move apart), centred and kept inside the frame.
  const word = (x: number, y: number, text: string, up: boolean) => {
    const w = text.length * 5.3
    return { x: Math.min(Math.max(x, w / 2 + 4), S - w / 2 - 4), y: up ? y - 9 : y + 16 }
  }
  const towerUp = !t || ty <= ey
  const eyeWord = word(ex, ey, 'you', !towerUp)
  const towerWord = t ? word(tx, ty, t.name, towerUp) : null
  const [x0, y0, x1, y1] = BOUNDS
  return (
    <div data-testid="vista-inset" className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-line bg-white/85 p-1.5 text-[10px] text-slate-700 shadow-sm backdrop-blur-md">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img"
        aria-label={`Location map, north up: you at ${vp.label}${t ? `, ${t.name} ${km(dist)} away` : ''}, looking ${compass(v.bearing)} with a ${Math.round(v.hfov)}° field${frame.extentExceeded ? '. The model ends at the outlined edge.' : ''}`}>
        <defs><clipPath id="vista-inset-clip"><rect x={0} y={0} width={S} height={S} rx={4} /></clipPath></defs>
        <g clipPath="url(#vista-inset-clip)">
          <rect width={S} height={S} fill="#f4f6f8" />
          {local.map((c) => <path key={c.id} d={path(c.ring)} fill={c.est ? '#4f7fae' : '#7d838c'} fillOpacity={vp.coneId === c.id ? 0.28 : 0.1} stroke={c.est ? '#4f7fae' : '#7d838c'} strokeWidth={vp.coneId === c.id ? 1.4 : 0.7} strokeDasharray={c.est ? undefined : '4 3'} />)}
          {frame.extentExceeded && <path d={path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])} fill="none" stroke="#9a3412" strokeWidth={1.2} strokeDasharray="5 3" />}
          <path d={beam} fill={EYE} fillOpacity={0.2} stroke={EYE} strokeWidth={1} />
          {t && <line x1={ex} y1={ey} x2={tx} y2={ty} stroke={TOWER} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />}
          {towers.filter((tw) => tw.id !== t?.id).map((tw) => <path key={tw.id} d={path(towerFootprint(tw))} fill="#6b7280" />)}
          {t && (
            <g data-testid="inset-tower">
              <path d={path(fp)} fill={TOWER} />
              {/* A ring around the tower so it reads even when its footprint is a dot at this scale. */}
              <circle cx={tx} cy={ty} r={6} fill="none" stroke={TOWER} strokeWidth={1.5} />
              <text x={towerWord!.x} y={towerWord!.y} textAnchor="middle" fontSize={9} fontWeight={600} fill={TOWER} stroke="#fff" strokeWidth={2.5} paintOrder="stroke">{t.name}</text>
            </g>
          )}
          <g data-testid="inset-eye">
            <circle cx={ex} cy={ey} r={4.5} fill={EYE} stroke="#fff" strokeWidth={1.5} />
            <text x={eyeWord.x} y={eyeWord.y} textAnchor="middle" fontSize={9} fontWeight={600} fill={EYE} stroke="#fff" strokeWidth={2.5} paintOrder="stroke">you</text>
          </g>
        </g>
      </svg>
      {/* North and the scale sit under the map, so no marker or word can fall under them. */}
      <div className="mt-1 flex items-center gap-2" aria-hidden>
        <svg width={12} height={14} viewBox="-6 -11 12 14"><path d="M0 -10 L4 2 L0 -1 L-4 2 Z" fill="#1f2328" /></svg>
        <span className="font-semibold text-ink">N up</span>
        <span className="ml-auto flex items-center gap-1"><span className="inline-block h-[3px] bg-[#1f2328]" style={{ width: bar * k }} />{km(bar)}</span>
      </div>
      <div className="mt-0.5 max-w-[196px] leading-snug">
        <b className="text-ink">{vp.label}</b> · eye {eyeZ(vp, v.eye).toFixed(1)} m · looking {compass(v.bearing)} ({Math.round(v.bearing)}°), field {Math.round(v.hfov)}°
        {t && <> · <b className="text-ink">{t.name}</b> {km(dist)} away</>}
        {!t && <> · no tower placed yet</>}
        {frame.extentExceeded && <> · the model ends at the dashed edge</>}
      </div>
    </div>
  )
}
