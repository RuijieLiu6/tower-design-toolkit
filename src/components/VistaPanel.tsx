// Vista view studies (Real Vancouver): Ruijie Liu's earlier view-cone tool, Vista v10.1, brought into Tower Design Toolkit on
// its own data (audit: 04 Tool Plan/research/vista-audit-2026-10-22.md). One view-cone system: the City cones and the
// View-cone height check's estimates, seen through Vista's exact clipping kernel; one camera: View from here, which now
// also stands at protected-view origins (eye = City Lv); the North Shore mountains are the MRDEM-30 terrain.
import { Camera, Eye, FileDown, FileUp, Layers, MapPin, Mountain, Plus } from './icons'
import { useMemo, useRef, useState } from 'react'
import origins from '../data/vistaOrigins.json'
import { towerFootprint } from '../engine/massing'
import type { Flag, Tower } from '../engine/types'
import { CONES, CONE_PARAMS, STATE_LABEL, type Cone } from '../engine/viewCones'
import { EYE_HEIGHT, compass, elevAngle, pickAt } from '../engine/viewFrom'
import {
  VISTA_EXAMPLES, VISTA_FALSE_ASSUMPTIONS, axisBearing, cityToVista, coneCamera, coneFitHfov, coneFitPitch, convertBlock, exactCones, frameDistances,
  frameScaleError, nearbyRoofs, parseVistaHash, parseVistaStudy, planeFunction, studySentence, vfovOf, vistaFrameSpread, vistaToCity, whatIfCeiling,
  type ConvertedBlock, type ExactCone, type Pt, type VistaStudy,
} from '../engine/vista'
import { groundUnder, sampleTerrain } from '../lib/cityLayers'
import { buildingLabel, buildingSource, buildingsNote, rayBuildingsLabel } from '../lib/vistaBuildings'
import { useViewFromStore, type Viewpoint } from '../lib/viewFromStore'
import { requestCaptures, useVistaStore, type CaptureSpec } from '../lib/vistaStore'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { HideUnderDesignCard, useCityData, useCityObstacles, useRemoval } from './CityContext'
import { REMOVAL_CAVEAT, removalNote } from '../lib/cityRemoval'
import { CONE_STYLE, FlagChip, Section } from './ui'
import EnvelopeSection from './EnvelopeSection'
import SitePanel from './SitePanel'

const ORIGINS = (origins as unknown as { cones: Record<string, { vistaEye: number | null }> }).cones
const REPORT_ASPECT = 2.1
const LIVE_ASPECT = 1.8
const fmt = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d }))
const abs = (p: Pt): Pt => [p[0] + CITY_ORIGIN[0], p[1] + CITY_ORIGIN[1]]
const loc = (p: Pt): Pt => [p[0] - CITY_ORIGIN[0], p[1] - CITY_ORIGIN[1]]

function Note({ flag, children }: { flag: Flag; children: React.ReactNode }) {
  return <div className="mt-1 flex items-start gap-1.5"><span className="shrink-0"><FlagChip flag={flag} /></span><span className="text-meta leading-snug text-muted">{children}</span></div>
}

/** Camera at a protected origin with Vista's cone-fit field and pitch, through the View from here rig. */
export function lookFromCone(cone: Cone, target: { x: number; y: number; top: number } | null) {
  const cam = coneCamera(cone)
  const o = loc(cam.origin)
  const d = target ? Math.hypot(target.x - o[0], target.y - o[1]) : 0
  const top = target && d > 1 ? elevAngle(target.top, cam.eye, d) : 0
  const pitch = coneFitPitch(vfovOf(cam.hfov, LIVE_ASPECT), top)
  const vp: Viewpoint = { kind: 'cone', x: o[0], y: o[1], stand: cam.eye - EYE_HEIGHT, eyeAbs: cam.eye, coneId: cone.id, near: 1,
    label: `View ${cone.id} origin (${cone.name})`, basis: `City ViewCone service: origin = cone apex, eye = VIEWPOINT_ELEVATION_M ${cone.Lv} m (Lv)` }
  useViewFromStore.getState().set({ viewpoint: vp, bearing: cam.bearing, hfov: Math.round(cam.hfov * 10) / 10, pitch: Math.round(pitch * 10) / 10, picking: false, note: null, looking: true })
}

export default function VistaPanel() {
  const project = useStore((s) => s.project)
  if (project !== 'city') return <Section title="Vista view studies"><p className="text-meta text-muted">Runs in the Real Vancouver project, where the City cones, roofs and terrain are loaded.</p></Section>
  return <VistaCity />
}

function VistaCity() {
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const ground = useStore((s) => s.groundElevation)
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const fp = useMemo(() => (t ? towerFootprint(t).map(abs) : null), [t])
  const top = ground + (t?.height ?? 0)
  const exact = useMemo(() => (fp ? exactCones(fp, top) : []), [fp, top])
  if (!t || !fp) return <Section title="Vista view studies"><p className="text-meta text-muted">Add a tower to study its protected views.</p></Section>
  const inside = exact.filter((e) => e.overlapM2 > 0)
  return (
    <>
      <Section title="Vista view study">
        <p className="text-meta leading-snug text-ink">{studySentence(t.name, t.height, exact)}</p>
        <Note flag="verified">Plan relations from the City ViewCone polygons (OGL-Vancouver, retrieved 2026-10-21), clipped exactly with Vista's kernel. Heights: the View-cone height check's estimates; the City View Cone Assessment governs.</Note>
        <p className="mt-1.5 text-meta text-muted">Vista (Ruijie Liu, v10.1) rebuilt on Real Vancouver data: City origins and Lv, Vista's own OpenStreetMap buildings on the City ground, at City LiDAR 2022 or 2009 heights where measured (the City LiDAR model is one switch away in the Layers dock), and the MRDEM-30 North Shore mountains instead of Vista's SRTM backdrop. Audit: <code>04 Tool Plan/research/vista-audit-2026-10-22.md</code>.</p>
      </Section>
      <SitePanel />
      <OverlapTable exact={exact} top={top} />
      <EnvelopeSection />
      <Viewpoints exact={exact} tower={t} ground={ground} />
      <RoofViews tower={t} ground={ground} />
      <WhatIf exact={inside} fp={fp} ground={ground} top={top} />
      <Studies />
      <FrameRule tower={t} exact={exact} />
      <Report tower={t} fp={fp} ground={ground} exact={exact} />
    </>
  )
}

/** Vista's plan overlap, exact, beside Tower Design Toolkit's sampled check: both numbers, and why they can differ. */
function OverlapTable({ exact, top }: { exact: ExactCone[]; top: number }) {
  const rows = exact.filter((e) => e.overlapM2 > 0 || (e.gapM ?? Infinity) <= 60)
  return (
    <Section title="Plan overlap, exact (Vista kernel)">
      {!rows.length && <p className="text-meta text-muted">No protected view within 60 m of this footprint. Outside the cones does not mean unlimited height.</p>}
      <div className="grid gap-1.5">
        {rows.map((e) => {
          const prm = CONE_PARAMS[e.cone.id]
          const sliver = e.overlapM2 > 0 && (e.state === 'near_edge' || e.state === 'outside')
          return (
            <div key={e.cone.id} className="rounded-md border border-line p-1.5 text-meta">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{e.cone.id} · {e.cone.name}</span>
                <span className={`rounded border px-1.5 py-0.5 text-meta font-semibold ${CONE_STYLE[e.state].chip}`}>{STATE_LABEL[e.state]}</span>
              </div>
              <div>{e.overlapM2 > 0
                ? <>Inside: <b>{fmt(e.overlapM2, 0)} m²</b> of the footprint <span className="text-muted">(Vista's frame would say {fmt(e.vistaFrameM2, 0)} m²)</span></>
                : <>Outside by <b>{fmt(e.gapM, 1)} m</b>{(e.gapM ?? 9) < 1.5 ? ' (inside the 1.5 m near-edge band)' : ''}</>}</div>
              {e.overlapM2 > 0 && (prm
                ? <div>Limit: exact <b>{fmt(e.exactLimit, 2)} m</b> · sampled {fmt(e.sampledLimit, 2)} m{e.difference != null && e.difference >= 0.005 ? <span className="text-muted"> (the 2 m / 5 m samples miss the lowest corner by {fmt(e.difference, 2)} m)</span> : <span className="text-muted"> (agree)</span>} · top {top - (e.exactLimit ?? 0) >= 0 ? '+' : ''}{fmt(top - (e.exactLimit ?? 0), 1)} m</div>
                : <div className="text-muted">No height estimate for this view: no number is given.</div>)}
              {sliver && <div className="mt-0.5 text-amber-800">The exact clip finds {fmt(e.overlapM2, 1)} m² inside; the sampled check reads "{STATE_LABEL[e.state]}". Treat the footprint as inside.</div>}
              {e.overlapM2 > 0 && <Note flag={prm ? prm.flag : 'unresolved'}>{prm ? `${prm.source}; ±${prm.u95} m (95%)` : 'Slope not found in any opened City source (City Request 0)'}</Note>}
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-meta text-muted">A plane is lowest at a corner of the overlap, so the exact limit is the lowest value at the clipped vertices; the sampled check can only read the same or higher.</p>
    </Section>
  )
}

/** Vista's "view from the protected origin", from the City's origin and eye (Lv), with Vista's cone-fit field. */
function Viewpoints({ exact, tower, ground }: { exact: ExactCone[]; tower: Tower; ground: number }) {
  const v = useViewFromStore()
  const haze = useVistaStore((s) => s.haze)
  const [all, setAll] = useState(false)
  const near = exact.filter((e) => e.overlapM2 > 0 || (e.gapM ?? Infinity) <= 60).map((e) => e.cone)
  const list = all ? [...near, ...CONES.filter((c) => !near.includes(c))] : near.length ? near : CONES.slice().sort((a, b) => Math.hypot(a.ring[0][0] - CITY_ORIGIN[0] - tower.x, a.ring[0][1] - CITY_ORIGIN[1] - tower.y) - Math.hypot(b.ring[0][0] - CITY_ORIGIN[0] - tower.x, b.ring[0][1] - CITY_ORIGIN[1] - tower.y)).slice(0, 3)
  const active = v.viewpoint?.kind === 'cone' ? CONES.find((c) => c.id === v.viewpoint?.coneId) ?? null : null
  const target = { x: tower.x, y: tower.y, top: ground + tower.height }
  return (
    <Section title="From the protected viewpoints" right={<button type="button" onClick={() => setAll(!all)} className="text-meta text-accent underline">{all ? 'Fewer' : 'All 24 views'}</button>}>
      <div className="grid gap-1">
        {list.map((c) => {
          const cam = coneCamera(c)
          const on = active?.id === c.id && v.looking
          return (
            <div key={c.id} className="flex items-center justify-between gap-2 text-meta">
              <span className="min-w-0 truncate"><b>{c.id}</b> {c.name} <span className="text-muted">· {c.subject}</span></span>
              <button type="button" onClick={() => (on ? v.set({ looking: false }) : lookFromCone(c, target))} aria-pressed={on}
                className={`flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-meta ${on ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}>
                <Eye size={12} />{on ? 'Back to map' : `Look (${Math.round(cam.hfov)}°)`}
              </button>
            </div>
          )
        })}
      </div>
      {active && <ConeCompare cone={active} />}
      <label className="mt-2 flex items-center gap-2 text-meta"><input type="checkbox" checked={haze} onChange={() => useVistaStore.getState().set({ haze: !haze })} />Light haze in eye-level views (visual only; off = evidence view)</label>
      <p className="mt-1 flex items-center gap-1 text-meta text-muted"><Mountain size={11} />Mountains: NRCan MRDEM-30 to 25 km, CGVD28; far plane 60 km while looking, so no peak is clipped.</p>
    </Section>
  )
}

/** Where Vista and Tower Design Toolkit disagree at an origin: both numbers and why. */
function ConeCompare({ cone }: { cone: Cone }) {
  const cam = coneCamera(cone)
  const ve = ORIGINS[cone.id]?.vistaEye ?? null
  const vs = vistaFrameSpread(cone)
  return (
    <div className="mt-2 rounded-md bg-black/[0.03] p-2 text-meta">
      <div className="font-semibold">View {cone.id}: Tower Design Toolkit vs Vista</div>
      <div>Eye <b>{fmt(cone.Lv, 2)} m</b> (City Lv) · Vista {fmt(ve, 1)} m{ve != null && <span className="text-muted"> (Δ {ve - cone.Lv >= 0 ? '+' : ''}{fmt(ve - cone.Lv, 1)} m)</span>}</div>
      <Note flag="verified">Lv: City ViewCone service VIEWPOINT_ELEVATION_M, already an eye elevation (research C04 r3).</Note>
      <Note flag="unverified">Vista: SRTM 60 m ground (EGM96) at the polygon apex + 1.6 m, reconstructed from Vista's grid (tools/build_vista_compare.py); Vista's water mask is not reproduced.</Note>
      <div className="mt-1">Field <b>{fmt(cam.hfov, 1)}°</b> from a {fmt(cam.spread, 2)}° spread in the grid · Vista {fmt(coneFitHfov(vs), 1)}° from {fmt(vs, 2)}° in its frame</div>
      <Note flag="team_assumption">Vista's cone-fit rule clamp(1.5 × spread + 8, 24, 100) (report.js); a framing preset, not a City rule.</Note>
    </div>
  )
}

/** Vista v08's nearby roofs and "face the proposal", on City LiDAR roofs. */
function RoofViews({ tower, ground }: { tower: Tower; ground: number }) {
  // Roofs hidden under the design (opt-in, CityContext) are neither offered nor block the sightline.
  const { data, idx, heights, hidden } = useCityObstacles()
  const v = useViewFromStore()
  const roofs = useMemo(() => {
    if (!data || !idx) return []
    const r = Math.hypot(tower.width, tower.depth) / 2
    const all = nearbyRoofs({ idx, heights, terrain: (x, y) => sampleTerrain(data.grids, x, y) }, { centre: [tower.x, tower.y], base: ground, top: ground + tower.height, radius: r }, { max: 24, within: 1500, eye: v.eye, minDistance: 120 })
    // One suggestion per direction (Vista listed roofs by distance): the nearest roof that sees the tower, else the nearest.
    const bySide = new Map<string, (typeof all)[number]>()
    for (const k of all.sort((a, b) => (b.visibleM > 0 ? 1 : 0) - (a.visibleM > 0 ? 1 : 0) || a.distance - b.distance)) {
      const side = compass((k.bearing + 180) % 360).replace(/^(N|E|S|W)(N|E|S|W)(N|E|S|W)$/, '$2$3')
      if (!bySide.has(side)) bySide.set(side, k)
    }
    return [...bySide.values()].sort((a, b) => (b.visibleM > 0 ? 1 : 0) - (a.visibleM > 0 ? 1 : 0) || a.distance - b.distance).slice(0, 6)
  }, [data, idx, heights, tower.x, tower.y, tower.width, tower.depth, tower.height, ground, v.eye])
  const stand = (r: (typeof roofs)[number]) => {
    if (!data) return
    // Aim between the tower's base and top as seen from the roof (Vista's face-the-proposal framing).
    const pitch = Math.max(-30, Math.min(30, (elevAngle(ground, r.eye, r.distance) + elevAngle(ground + tower.height, r.eye, r.distance)) / 2))
    v.set({ viewpoint: { kind: 'roof', x: r.at[0], y: r.at[1], stand: r.roof, footprint: r.index, label: buildingLabel(data, r.index), basis: `${buildingSource(data, r.index)}: roof ${r.roof.toFixed(1)} m CGVD28 (chosen by Vista's nearby-roof list)` },
      bearing: Math.round(r.bearing), pitch: Math.round(pitch * 10) / 10, hfov: 60, looking: true, picking: false, note: null })
  }
  return (
    <Section title="Rooftop views of the tower">
      {!data && <p className="text-meta text-muted">Loading City roofs…</p>}
      {data && !roofs.length && <p className="text-meta text-muted">No roof with a height within 1.5 km of this tower. View from here can still stand on the street.</p>}
      <div className="grid gap-1">
        {roofs.map((r) => (
          <div key={r.index} className="flex items-center justify-between gap-2 text-meta">
            <span className="min-w-0"><b>{fmt(r.distance, 0)} m {compass((r.bearing + 180) % 360)}</b> · roof {fmt(r.roof, 1)} m · {r.visibleM > 0 ? <>sees the upper <b>{fmt(r.visibleM, 0)} m</b></> : <span className="text-muted">tower hidden behind {r.blockedBy}</span>}</span>
            <button type="button" onClick={() => stand(r)} className="flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 hover:border-accent"><MapPin size={12} />Stand here</button>
          </div>
        ))}
      </div>
      {roofs.length > 0 && <Note flag="unverified">One sightline from each roof (eye = roof + {v.eye} m) to the tower, over {data ? rayBuildingsLabel(data) : 'the city buildings'} and terrain, curvature with k = 0.13. Optimistic: buildings without a height do not block. "Stand here" faces the tower, aimed between its base and top (Vista's face-the-proposal).</Note>}
      {hidden.size > 0 && <Note flag="team_assumption">{hidden.size} existing building footprint{hidden.size === 1 ? ' is' : 's are'} hidden under the design: not offered as roofs and not blocking. Hypothetical removal; not evidence of vacancy or redevelopment eligibility.</Note>}
    </Section>
  )
}

/** Vista v10 study planes: the team's own sloping planes, evaluated exactly; never a City limit. */
function WhatIf({ exact, fp, ground, top }: { exact: ExactCone[]; fp: Pt[]; ground: number; top: number }) {
  const planes = useVistaStore((s) => s.planes)
  const showPlanes = useVistaStore((s) => s.showPlanes)
  const setPlane = useVistaStore((s) => s.setPlane)
  const res = useMemo(() => whatIfCeiling(fp, planes, ground, top), [fp, planes, ground, top])
  if (!exact.length) return null
  const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s))
  return (
    <Section title="What-if study planes (Vista v10)" help="Enter a lower boundary you want to test for a view this footprint is in: its elevation at the City origin, its slope and the bearing of the slope. Blank = no plane (the view then stays unknown)." right={<label className="flex items-center gap-1 text-meta"><input type="checkbox" checked={showPlanes} onChange={() => useVistaStore.getState().set({ showPlanes: !showPlanes })} /><Layers size={11} />3D</label>}>
      <div className="grid gap-2">
        {exact.map((e) => {
          const p = planes[e.cone.id]
          const prm = CONE_PARAMS[e.cone.id]
          return (
            <div key={e.cone.id} className="rounded-md border border-line p-1.5 text-meta">
              <div className="flex items-center justify-between"><b>{e.cone.id} · {e.cone.name}</b>
                <span className="flex gap-2">{prm && <button type="button" className="text-meta text-accent underline" onClick={() => setPlane(e.cone.id, { elevation: e.cone.Lv, pitch: Math.round((Math.atan(prm.k) * 180) / Math.PI * 10000) / 10000, bearing: Math.round(axisBearing(e.cone) * 100) / 100, note: `Start from Tower Design Toolkit's estimate (${prm.source})` })}>Start from the estimate</button>}
                  {p && <button type="button" className="text-meta text-muted underline" onClick={() => setPlane(e.cone.id, null)}>Clear</button>}</span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                <label className="grid gap-0.5"><span className="text-muted">At origin (m)</span><input type="number" step={0.1} value={p?.elevation ?? ''} placeholder={String(e.cone.Lv)} onChange={(ev) => setPlane(e.cone.id, { elevation: num(ev.target.value) })} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label={`What-if elevation at origin, view ${e.cone.id}`} /></label>
                <label className="grid gap-0.5"><span className="text-muted">Slope (°)</span><input type="number" step={0.01} value={p?.pitch ?? ''} placeholder="0" onChange={(ev) => setPlane(e.cone.id, { pitch: num(ev.target.value) })} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label={`What-if slope, view ${e.cone.id}`} /></label>
                <label className="grid gap-0.5"><span className="text-muted">Bearing (°)</span><input type="number" step={0.1} value={p?.bearing ?? ''} placeholder={axisBearing(e.cone).toFixed(1)} onChange={(ev) => setPlane(e.cone.id, { bearing: num(ev.target.value) })} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label={`What-if bearing, view ${e.cone.id}`} /></label>
              </div>
              <input type="text" value={p?.note ?? ''} placeholder="Source of these numbers" maxLength={300} onChange={(ev) => setPlane(e.cone.id, { note: ev.target.value })} className="mt-1 w-full rounded border border-line bg-panel px-1 py-0.5" aria-label={`Source of the what-if plane, view ${e.cone.id}`} />
            </div>
          )
        })}
      </div>
      <div className="mt-2 rounded-md border border-orange-300 bg-orange-50 p-2 text-meta">
        {res.status === 'ready' || res.status === 'partial'
          ? <>Lowest plane <b>{fmt(res.ceilingElevationM, 2)} m</b> CGVD28 (view {res.limitingView}) · <b>{fmt(res.maxHeightM, 1)} m</b> above the base · clearance <b className={res.clearanceM != null && res.clearanceM < 0 ? 'text-red-700' : ''}>{fmt(res.clearanceM, 1)} m</b>{res.missingViews.length ? <span> · no plane for {res.missingViews.join(', ')}: partial</span> : null}</>
          : res.status === 'unknown' ? <>No plane entered for {res.missingViews.join(', ')}: unknown. A missing plane never means unlimited height.</> : <>Outside every view.</>}
        <Note flag="team_assumption">Your plane, your source: a what-if, never a City limit, and it does not change the View-cone height check. Exact over the footprint (Vista's clipped vertices); heights CGVD28, so Vista's datum offset is 0.</Note>
      </div>
    </Section>
  )
}

/** Vista's three real-tower examples and saved Vista studies, converted from Vista's frame into the grid. */
function Studies() {
  const { data, idx, heights } = useCityObstacles()
  const fileRef = useRef<HTMLInputElement>(null)
  const [last, setLast] = useState<{ name: string; blocks: ConvertedBlock[]; warnings: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = (s: VistaStudy, label: string) => {
    setError(null)
    if (!s.site || !s.blocks.length) { setError('The study has no site or no blocks: nothing to add.'); return }
    const conv = s.blocks.map((b) => convertBlock(s.site!, b))
    const warnings = [...s.warnings]
    // Vista stacks blocks; Tower Design Toolkit has one tower over an optional podium. Keep the top block as the tower, the
    // bottom block as the podium when it is larger, and the total height.
    const topB = conv[conv.length - 1], bottom = conv[0]
    const height = s.blocks.reduce((sum, b) => sum + b.h, 0)
    const podium = conv.length > 1 && bottom.block.w * bottom.block.d > topB.block.w * topB.block.d ? bottom : null
    if (conv.length > 2) warnings.push(`${conv.length} stacked blocks became one tower (top block, ${Math.round(height)} m total)${podium ? ' over a podium (bottom block)' : ''}.`)
    if (podium && Math.hypot(podium.centre[0] - topB.centre[0], podium.centre[1] - topB.centre[1]) > 0.5) warnings.push('The podium is centred on the tower here; Vista offset it.')
    const st = useStore.getState()
    st.addTower()
    const id = useStore.getState().selectedTower
    const c = loc(topB.centre)
    st.updateTower(id, { name: label.slice(0, 60), x: c[0], y: c[1], rotation: Math.round(topB.rotation * 1000) / 1000, width: topB.block.w, depth: topB.block.d, height,
      podiumHeight: podium ? podium.block.h : 0, podiumWidth: podium ? podium.block.w : topB.block.w, podiumDepth: podium ? podium.block.d : topB.block.d,
      imported: undefined, interior: undefined, skyLobbies: [], skyRoom: null, outriggerFloors: [] })
    // Vista's study planes: origin moved to the City apex (plane evaluated there in Vista's frame), slope and bearing kept.
    for (const [view, plane] of Object.entries(s.planes)) {
      const cone = CONES.find((k) => k.id === view)
      const f = planeFunction(plane)
      if (!cone || !f) continue
      useVistaStore.getState().setPlane(view, { elevation: Math.round(f(cityToVista(cone.ring[0])) * 100) / 100, pitch: plane.pitchDeg, bearing: plane.bearingDeg, note: `${plane.source || 'Vista study plane'} (from ${label}; moved to the City origin)` })
    }
    if (s.observer && data && idx) {
      const o = loc(vistaToCity(s.observer.xy))
      const pk = pickAt(idx, heights, o[0], o[1])
      const g = sampleTerrain(data.grids, o[0], o[1])
      const vp: Viewpoint = pk.kind === 'roof'
        ? { kind: 'roof', x: o[0], y: o[1], stand: pk.roof, footprint: pk.index, label: `${label}: Vista's viewpoint (roof)`, basis: `${buildingSource(data, pk.index)}: roof ${pk.roof.toFixed(1)} m CGVD28 at Vista's observer` }
        : { kind: 'street', x: o[0], y: o[1], stand: g ?? 0, label: `${label}: Vista's viewpoint`, basis: `Terrain ${g == null ? '–' : g.toFixed(1)} m CGVD28 at Vista's observer${s.observer.source === 'rooftop' ? ' (Vista stood on a studio-model roof; no LiDAR roof here yet)' : ''}` }
      const tc = loc(topB.centre)
      useViewFromStore.getState().set({ viewpoint: vp, bearing: Math.round(((Math.atan2(tc[0] - o[0], tc[1] - o[1]) * 180) / Math.PI + 360) % 360), hfov: s.observer.fov, looking: false, picking: false, note: null })
    }
    setLast({ name: label, blocks: conv, warnings })
    useStore.getState().set({ announce: `${label} added from Vista` })
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      if (f.size > 2_000_000) throw new Error('The file is larger than a Vista study (2 MB)')
      const s = parseVistaStudy(JSON.parse(await f.text()))
      open(s, s.name.replace(/^Example - /, ''))
    } catch (e) { setError((e as Error).message) }
    if (fileRef.current) fileRef.current.value = ''
  }
  return (
    <Section title="Vista examples and studies">
      <div className="grid gap-1">
        {VISTA_EXAMPLES.map((ex) => (
          <div key={ex.key} className="flex items-center justify-between gap-2 text-meta">
            <span className="min-w-0"><b>{ex.name}</b> <span className="text-muted">· {ex.address} · {ex.facts}</span></span>
            <button type="button" onClick={() => open(parseVistaHash(ex.hash), ex.name)} className="flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 hover:border-accent"><Plus size={12} />Add</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:border-accent"><FileUp size={13} />Open a Vista study (.json)</button>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Vista study file" />
      {error && <p role="alert" className="mt-1 text-meta text-red-700">{error}</p>}
      {last && (
        <div className="mt-2 rounded-md bg-black/[0.03] p-2 text-meta">
          <div className="font-semibold">{last.name} added</div>
          {last.blocks.map((b, i) => (
            <div key={i}>{b.block.name}: Vista drew {b.block.w} × {b.block.d} m in its short frame, which covers <b>{fmt(b.gridArea, 1)} m²</b> of real ground (what Vista's overlap test used). Tower Design Toolkit keeps the {b.block.w} × {b.block.d} m you typed ({fmt(b.vistaArea, 0)} m²) on the converted site point; rotation {b.block.rotation}° → {fmt(b.rotation, 3)}° (grid convergence).</div>
          ))}
          {last.warnings.map((w) => <div key={w} className="text-amber-800">{w}</div>)}
          <Note flag="false_assumption">Vista's frame shortens metres (0.58% north–south); each corner was converted through latitude/longitude into EPSG:26910. Heights are the published tower heights; the base is the project base.</Note>
        </div>
      )}
      <p className="mt-1.5 text-meta text-muted">Only the site point, block sizes, observer and study planes are read; Vista's context model, building ids and imported models are not. Nothing leaves this browser.</p>
      <HideUnderDesignCard inline />
    </Section>
  )
}

function FrameRule({ tower, exact }: { tower: Tower; exact: ExactCone[] }) {
  const fe = frameScaleError()
  const c = exact.find((e) => e.overlapM2 > 0)?.cone ?? CONES.find((k) => k.id === '3.2.1')!
  const d = frameDistances(c.ring[0], abs([tower.x, tower.y]))
  return (
    <Section title="Frame rule">
      <div className="rounded-md border-l-2 border-flag-false bg-[#fdf0f7] p-2 text-meta">
        <span className="font-semibold text-flag-false">False assumption: </span>{VISTA_FALSE_ASSUMPTIONS[0].claim}.
        <div className="mt-0.5">At 49.28 N it reads north–south <b>{fmt(-fe.northSouth * 100, 2)}%</b> short and east–west <b>{fmt(-fe.eastWest * 100, 2)}%</b> short. Here: {c.id} origin to {tower.name} is <b>{fmt(d.grid, 1)} m</b> in the grid, {fmt(d.vista, 1)} m in Vista's frame ({fmt(d.grid - d.vista, 1)} m short).</div>
        <div className="mt-0.5 text-muted">Corrected: Vista coordinates go through latitude/longitude into EPSG:26910; nothing is computed in the legacy frame. (Research C04; C04 printed 0.198% east–west, which GRS80 puts at {fmt(-fe.eastWest * 100, 3)}%.)</div>
        <div className="mt-1"><FlagChip flag="false_assumption" /></div>
      </div>
    </Section>
  )
}

/** Vista's PDF report on Tower Design Toolkit results, with renders from the real context. */
function Report({ tower, fp, ground, exact }: { tower: Tower; fp: Pt[]; ground: number; exact: ExactCone[] }) {
  const { data } = useCityData()
  const { hidden, byTower } = useRemoval(data)
  // What the renders leave out, stated in the PDF (view pages and sources): towers that hide something, and the study site's own.
  const underTowers = byTower.filter((b) => b.indices.length)
  const bySite = hidden.size - new Set(underTowers.flatMap((b) => b.indices)).size
  const removal = hidden.size ? { hidden: hidden.size, note: removalNote(hidden.size, underTowers.map((b) => b.name), bySite)! } : null
  const planes = useVistaStore((s) => s.planes)
  const defaults = useMemo(() => {
    const ids = exact.filter((e) => e.overlapM2 > 0 || (e.gapM ?? Infinity) < 1.5).map((e) => e.cone.id)
    return ids.length ? ids.slice(0, 6) : exact.filter((e) => e.gapM != null).sort((a, b) => (a.gapM ?? 0) - (b.gapM ?? 0)).slice(0, 2).map((e) => e.cone.id)
  }, [exact])
  const [picked, setPicked] = useState<string[] | null>(null)
  const ids = picked ?? defaults
  const [busy, setBusy] = useState<string | null>(null)
  const candidates = exact.filter((e) => e.overlapM2 > 0 || (e.gapM ?? Infinity) <= 60).map((e) => e.cone.id)
  const run = async () => {
    setBusy('Rendering the views from the protected origins…')
    try {
      const cones = ids.map((id) => CONES.find((c) => c.id === id)!).filter(Boolean)
      const top = ground + tower.height
      const specs: CaptureSpec[] = cones.map((c) => {
        const cam = coneCamera(c), o = loc(cam.origin)
        const d = Math.hypot(tower.x - o[0], tower.y - o[1])
        return { key: c.id, x: o[0], y: o[1], eye: cam.eye, bearing: cam.bearing, hfov: cam.hfov, pitch: coneFitPitch(vfovOf(cam.hfov, REPORT_ASPECT), d > 1 ? elevAngle(top, cam.eye, d) : 0), aspect: REPORT_ASPECT }
      })
      const shots = await requestCaptures(specs)
      setBusy('Writing the PDF…')
      const { buildVistaReport } = await import('../lib/vistaReport')
      const g = data ? groundUnder(data.grids, towerFootprint(tower)) : null
      const blob = buildVistaReport({
        towerName: tower.name, height: tower.height, ground, groundBasis: g ? `project base; terrain under the footprint ${g.value.toFixed(1)} m` : 'project base',
        footprint: fp, sentence: studySentence(tower.name, tower.height, exact), exact,
        whatIf: Object.keys(planes).length ? { result: whatIfCeiling(fp, planes, ground, top), entries: planes } : null,
        views: cones.map((c, i) => { const cam = coneCamera(c); const vs = vistaFrameSpread(c); return { cone: c, shot: shots[i], eye: cam.eye, vistaEye: ORIGINS[c.id]?.vistaEye ?? null, hfov: cam.hfov, vistaHfov: coneFitHfov(vs), spread: cam.spread, vistaSpread: vs, bearing: cam.bearing, pitch: specs[i].pitch, aspect: REPORT_ASPECT } }),
        terrain: (x, y) => (data ? sampleTerrain(data.grids, x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]) : null),
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' }),
        buildings: data ? buildingsNote(data) : undefined,
        removal,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${tower.name.replace(/[^\w-]+/g, '-')}-view-study.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setBusy(`Saved: ${shots.filter(Boolean).length} of ${shots.length} renders included.`)
    } catch (e) { setBusy(`Could not write the report: ${(e as Error).message}`) }
  }
  return (
    <Section title="View-study report (PDF)" help="Vista's report, on these results: cover sentence, key plan, one page per view (render from the City origin with the real mountains, section along the cone axis, both Vista and Tower Design Toolkit numbers with their flags), sources.">
      <div className="flex flex-wrap gap-1">
        {candidates.map((id) => {
          const on = ids.includes(id)
          return <button key={id} type="button" aria-pressed={on} onClick={() => setPicked(on ? ids.filter((k) => k !== id) : [...ids, id].slice(0, 8))} className={`rounded border px-1.5 py-0.5 text-meta ${on ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted'}`}>{id}</button>
        })}
        {!candidates.length && <span className="text-meta text-muted">Pages for the two nearest views: {ids.join(', ')}</span>}
      </div>
      <button type="button" disabled={!!busy && busy.endsWith('…')} onClick={run} className="mt-2 flex items-center gap-1 rounded-md border border-accent bg-accent px-2 py-1 text-xs font-medium text-white disabled:opacity-60"><FileDown size={13} />Export view study PDF</button>
      {busy && <p role="status" className="mt-1 text-meta text-muted"><Camera size={11} className="mr-1 inline" />{busy}</p>}
      <p className="mt-1 text-meta text-muted">Renders need the 3D view on screen. The PDF is made in this browser; nothing is uploaded.</p>
      {hidden.size > 0 && <Note flag="team_assumption">The renders leave out the {hidden.size} existing building footprint{hidden.size === 1 ? '' : 's'} hidden under the design; the PDF states it on every view page and in its sources. {REMOVAL_CAVEAT} For the existing-context view, choose "Show the existing buildings again" before exporting.</Note>}
    </Section>
  )
}
