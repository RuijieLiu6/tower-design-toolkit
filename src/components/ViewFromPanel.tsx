// "View from here" panel (Real Vancouver; Context Model "views from cones and rooftops", research C02 and C04):
// pick a LiDAR roof, a street point or a floor of a design tower, look at eye height, capture a 360° strip, and read
// what the sightline sees: the North Shore terrain over the skyline, and the protected cones it crosses.
import { Camera, Eye, EyeOff, MousePointerClick } from './icons'
import { useMemo } from 'react'
import { sampleTerrain } from '../lib/cityLayers'
import { towerFloors, towerFootprint } from '../engine/massing'
import { castRay, compass, conesCrossed, skyline, type Obstacle, type Ray, type SkylineInput } from '../engine/viewFrom'
import { CONES } from '../engine/viewCones'
import type { RuleResult } from '../engine/types'
import { eyeZ, useViewFromStore, type Viewpoint } from '../lib/viewFromStore'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { useCityObstacles } from './CityContext'
import { rayBuildingsLabel, standableNote } from '../lib/vistaBuildings'
import { FlagChip, Section, StateChip } from './ui'
import { U } from './Units'

/** Terrain at or above this height counts as the mountains (team preset; downtown sits below 60 m, the North Shore rises to about 1,400 m). */
const FAR_MIN = 200

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b><U>{r.value}</U></b>{r.threshold && <span className="text-muted"> · <U>{r.threshold}</U></span>}</div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} /><span className="text-[10px] text-muted">{r.source.label}</span></div>
    </div>
  )
}

export default function ViewFromPanel() {
  const project = useStore((s) => s.project)
  const ground = useStore((s) => s.groundElevation)
  const towers = useTowers()
  const v = useViewFromStore()
  // Footprints hidden under the design (opt-in, CityContext) are left out of picking and the ray cast.
  const { data, error, idx, heights, hidden } = useCityObstacles()
  const vp = v.viewpoint

  const input = useMemo<SkylineInput | null>(() => {
    if (!data || !idx || !vp) return null
    const obstacles: Obstacle[] = towers.filter((t) => !(vp.kind === 'tower' && vp.towerId === t.id)).map((t) => ({ poly: towerFootprint(t), top: ground + t.height, label: t.name }))
    return { eye: [vp.x, vp.y, eyeZ(vp, v.eye)], terrain: (x, y) => sampleTerrain(data.grids, x, y), idx, heights, towers: obstacles, farMin: FAR_MIN }
  }, [data, idx, heights, vp, towers, ground, v.eye])
  const rays = useMemo(() => (input ? skyline(input, 5) : []), [input])
  const now = useMemo(() => (input ? castRay(input, v.bearing) : null), [input, v.bearing])
  const crossed = useMemo(() => (vp ? conesCrossed([vp.x, vp.y], v.bearing, 6000, CONES.map((c) => ({ id: c.id, name: c.name, ring: c.ring.map(([x, y]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]] as [number, number]) }))) : []), [vp, v.bearing])

  if (project !== 'city') return <Section title="View from here"><p className="text-[11px] text-muted">Runs in the Real Vancouver project, where City roofs and terrain are loaded.</p></Section>
  if (error) return <Section title="View from here"><p className="text-[11px] text-red-700">Context layers did not load: {error}</p></Section>

  const withHeight = heights ? Array.from(heights.roof).filter((r, i) => Number.isFinite(r) && r > heights.ground[i]).length : 0
  const pickTower = (id: string, level: number | 'top') => {
    const t = towers.find((x) => x.id === id)
    if (!t) return
    const f = level === 'top' ? null : towerFloors(t).find((x) => x.level === level)
    const stand = ground + (f ? f.z0 : t.height)
    const vpNew: Viewpoint = { kind: 'tower', x: t.x, y: t.y, stand, towerId: t.id, label: f ? `${t.name}, level ${f.level}` : `${t.name}, roof`,
      basis: `Project ground ${ground.toFixed(1)} m + ${f ? `floor at ${f.z0.toFixed(1)} m` : `top at ${t.height.toFixed(1)} m`}`, near: f ? Math.hypot(t.width, t.depth) / 2 + 1 : 0.3 }
    v.set({ viewpoint: vpNew, picking: false, note: null })
  }
  const visibleDirs = rays.filter((r) => r.farVisible)

  return (
    <>
      <Section title="Viewpoint">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => v.set({ picking: !v.picking, note: null, looking: false })} aria-pressed={v.picking}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${v.picking ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}>
            <MousePointerClick size={13} />{v.picking ? 'Click a roof or street in the 3D view…' : 'Pick a roof or street'}
          </button>
          {towers.length > 0 && (
            <select value="" onChange={(e) => { const [id, lv] = e.target.value.split('|'); pickTower(id, lv === 'top' ? 'top' : Number(lv)) }} className="rounded-md border border-line bg-panel px-1.5 py-1 text-xs" aria-label="View from a design tower">
              <option value="" disabled>From a design tower…</option>
              {towers.map((t) => (
                <optgroup key={t.id} label={t.name}>
                  <option value={`${t.id}|top`}>{t.name}: roof ({Math.round(t.height)} m)</option>
                  {towerFloors(t).filter((f, i, all) => i % Math.max(1, Math.round(all.length / 12)) === 0 || f.skyLobby).map((f) => <option key={f.level} value={`${t.id}|${f.level}`}>Level {f.level} (+{Math.round(f.z0)} m)</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        {v.note && <p role="status" className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{v.note}</p>}
        <p className="mt-1.5 text-[10px] text-muted">{withHeight.toLocaleString()} of {data?.footprints.length.toLocaleString() ?? '…'} building parts have a height ({data ? standableNote(data) : '…'}); only those can be stood on or block a view.{hidden.size > 0 && ` ${hidden.size.toLocaleString()} existing building footprint${hidden.size === 1 ? ' is' : 's are'} hidden under the design (hypothetical removal, team assumption).`}</p>
        {vp && (
          <div className="mt-2 rounded-md bg-black/[0.03] p-2 text-[11px]">
            <div className="font-semibold">{vp.label}</div>
            {vp.eyeAbs !== undefined
              ? <div>Eye at <b>{vp.eyeAbs.toFixed(2)} m</b> geodetic = the City's viewpoint elevation (Lv) at this origin; the eye-height setting does not move it</div>
              : <div>Eye at <b>{eyeZ(vp, v.eye).toFixed(1)} m</b> geodetic = standing surface {vp.stand.toFixed(1)} m + eye {v.eye} m</div>}
            <div className="text-muted">{vp.basis}</div>
            {vp.eyeAbs !== undefined
              ? <div className="mt-1 flex items-center gap-1"><FlagChip flag="verified" /><span className="text-[10px] text-muted">City ViewCone service VIEWPOINT_ELEVATION_M (research C04 r3: Lv is already an eye elevation). Heights CGVD28.</span></div>
              : <div className="mt-1 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Eye height 1.6 m, editable (research C04: ground + 1.6 m where no City Lv exists). Heights CGVD28.</span></div>}
          </div>
        )}
      </Section>

      {vp && (
        <Section title="Look">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => v.set({ looking: !v.looking })} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${v.looking ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}>{v.looking ? <EyeOff size={13} /> : <Eye size={13} />}{v.looking ? 'Back to the map' : 'Look from here'}</button>
            <button onClick={() => v.set({ captureReq: v.captureReq + 1 })} disabled={v.capturing} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:border-accent disabled:opacity-50"><Camera size={13} />Capture 360° strip</button>
          </div>
          <label className="mt-2 grid gap-0.5 text-[11px]"><span className="text-muted">Looking {compass(v.bearing)} ({Math.round(v.bearing)}° from grid north)</span>
            <input type="range" min={0} max={359} step={1} value={v.bearing} onChange={(e) => v.set({ bearing: Number(e.target.value) })} className="accent-accent" aria-label="Bearing" />
          </label>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <label className="grid gap-0.5"><span className="text-muted">Tilt</span><input type="number" min={-30} max={30} value={v.pitch} onChange={(e) => v.set({ pitch: Math.max(-30, Math.min(30, Number(e.target.value))) })} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label="Tilt" /></label>
            <label className="grid gap-0.5"><span className="text-muted">Field of view</span><input type="number" min={20} max={110} value={v.hfov} onChange={(e) => v.set({ hfov: Math.max(20, Math.min(110, Number(e.target.value))) })} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label="Field of view" /></label>
            <label className="grid gap-0.5"><span className="text-muted">Eye height</span><input type="number" min={0} max={3} step={0.1} value={v.eye} onChange={(e) => v.set({ eye: Math.max(0, Math.min(3, Number(e.target.value))) })} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label="Eye height" /></label>
          </div>
          <label className="mt-1.5 flex items-center gap-2 text-[11px]"><input type="checkbox" checked={v.overlays} onChange={() => v.set({ overlays: !v.overlays, looking: false })} />Keep map overlays (cone sheets, tints) in the view</label>
          <p className="mt-1 text-[10px] text-muted">The strip is eight 45° frames from north, clockwise, saved to the filmstrip (Present stage).</p>
        </Section>
      )}

      {vp && now && (
        <Section title="What this sightline sees">
          <Skyline rays={rays} bearing={v.bearing} onPick={(b) => v.set({ bearing: b })} />
          <div className="mt-2 grid gap-2">
            <Card r={mountainRule(now, visibleDirs.length, rays.length, hidden.size, data ? rayBuildingsLabel(data) : undefined)} />
            <Card r={{ id: 'vf-cones', label: 'Protected view cones on this sightline', value: crossed.length ? crossed.map((c) => `${c.id} ${c.name}${c.inside ? ' (you stand inside it)' : ` from ${(c.from / 1000).toFixed(1)} km`}`).join('; ') : 'None within 6 km', threshold: `looking ${compass(v.bearing)}, first 6 km`, state: 'unknown', flag: 'verified', source: { label: 'City of Vancouver ViewCone layer (OGL-Vancouver, retrieved 2026-10-21), plan polygons' }, note: 'Plan crossing only: whether the design breaks a cone is the View-cone height check.' }} />
          </div>
        </Section>
      )}
    </>
  )
}

function mountainRule(r: Ray, visible: number, total: number, hidden = 0, buildings = 'measured roofs (LiDAR 2022 P90 in the core, City 2009 heights around it)'): RuleResult {
  const value = !r.far ? `No terrain above ${FAR_MIN} m ${compass(r.bearing)} of here`
    : r.farVisible ? `Visible: the ridge (${Math.round(r.far.height)} m, ${(r.far.distance / 1000).toFixed(1)} km) clears the skyline by ${(r.far.angle - r.near.angle).toFixed(1)}°`
    : `Hidden behind ${r.near.label} ${(r.near.distance / 1000).toFixed(2)} km away (${(r.near.angle - r.far.angle).toFixed(1)}° above the ridge)`
  return {
    id: 'vf-mountains', label: `North Shore mountains, looking ${compass(r.bearing)}`, value,
    threshold: `terrain ≥ ${FAR_MIN} m above everything nearer · over the full circle: visible in ${visible} of ${total} directions`,
    state: !r.far ? 'unknown' : r.farVisible ? 'pass' : 'warn', flag: 'unverified',
    source: { label: `Ray cast over ${buildings}, the design towers and City ground / MRDEM-30 terrain (CGVD28), curvature d²/2R × (1 − 0.13) (research C02)` },
    note: `Buildings are the model shown in the Layers dock: heights come from City LiDAR 2022 or 2009 where they cover a building, else from Vista’s OpenStreetMap values (unverified; many are estimates per building type), so a view can be blocked or cleared wrongly there; in the City model, buildings without a measured height are not obstacles (optimistic). Trees and bridges are not modelled. "Mountains" means terrain at 200 m or more (team preset).${hidden ? ` ${hidden.toLocaleString()} existing building footprint${hidden === 1 ? '' : 's'} under the design ${hidden === 1 ? 'is' : 'are'} left out (hypothetical removal, team assumption; not evidence of vacancy or redevelopment eligibility).` : ''}`,
  }
}

/** Skyline profile round the circle: grey = nearer buildings and terrain, green = the mountains where they clear it. */
function Skyline({ rays, bearing, onPick }: { rays: Ray[]; bearing: number; onPick: (b: number) => void }) {
  const W = 340, H = 110, lo = -4, hi = 14
  const X = (b: number) => (b / 360) * W, Y = (a: number) => H - 14 - ((Math.max(lo, Math.min(hi, a)) - lo) / (hi - lo)) * (H - 20)
  if (!rays.length) return null
  const near = rays.map((r) => `${X(r.bearing)},${Y(r.near.angle)}`).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Skyline profile around the full circle, with the mountains where visible" className="cursor-pointer rounded-md border border-line bg-[#f4f7fa]"
      onClick={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); onPick(Math.round(((e.clientX - r.left) / r.width) * 360) % 360) }}>
      <polygon points={`0,${H - 14} ${near} ${W},${H - 14}`} fill="#b9c2cc" />
      {rays.map((r, i) => r.far && <line key={i} x1={X(r.bearing)} x2={X(r.bearing)} y1={Y(r.far.angle)} y2={Y(Math.max(r.near.angle, r.far.angle - 0.6))} stroke={r.farVisible ? '#2e8b57' : '#94a3b8'} strokeWidth={4} />)}
      <line x1={X(bearing)} x2={X(bearing)} y1={2} y2={H - 14} stroke="#d97706" strokeWidth={1.5} />
      {['N', 'E', 'S', 'W'].map((c, i) => <text key={c} x={X(i * 90) + 2} y={H - 3} fontSize={8} fill="#3d434b">{c}</text>)}
      <text x={W - 2} y={10} fontSize={7} textAnchor="end" fill="#62666d">elevation angle {lo}° to {hi}°</text>
    </svg>
  )
}
