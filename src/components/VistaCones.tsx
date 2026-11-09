// Real Vancouver's protected view cones drawn as Vista draws them (Ruijie, 3 Nov: "replace the viewcone to the viewcone
// from Vista"). Ported from Vista's explorer @ 917b28e, read only: coneGeometry (plan outline, the featured cone's
// vertical corridor walls to CONE_TOP 260 m with its top outline and apex line), the origin marker (a 2.4 m box and a
// 70 m line), the observer ray and viewing-angle wedge (wedgeGeometry), and the cone-ceiling plane style, in Vista's
// Plain colours (lib/vistaLook.ts). The outlines are the same City ViewCone polygons Vista uses (checked: within
// 0.01 m through latitude/longitude), so nothing moves.
// Every cone shown is a Vista Viewcone volume (Ruijie, 3 Nov: "most of them are shown as lines"; lib/coneVolume.ts,
// from viewcone-geometry.js prepareSurface): the ceiling over the corridor, curtains standing on it along every side up
// to Vista's display cut (a scene cut, never a policy cap), and glowing edges, in Vista's Viewcone blues
// (drawViewconeOverlay): the featured cone at Vista's single-cone strength, the others at the alphas Vista uses when it
// draws many cones at once. Data rules unchanged: the ceiling of a cone with a City-sourced estimate (8) is that
// estimate; the other 16 show Vista's study surface, fainter, with dashed edges and labelled an assumption
// (engine/heightModel.ts via lib/heightData.ts, read only); a cone without a surface shows its footprint only. The
// featured cone also shows the design towers' footprints projected onto its ceiling (not the existing buildings'). In Plan, as in Vista,
// the volumes are left out and the plan outlines stay. At eye level cones are not drawn unless "Keep map overlays" is on.
// Which cones show: lib/coneVisibility.ts, shared by the Viewcone tab and the Layers dock. Display only.
import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { planeZ, type ConeSurface } from '../engine/heightModel'
import { CONES, pointInRing, type Cone } from '../engine/viewCones'
import { vfovOf } from '../engine/vista'
import { useResults } from '../hooks/useResults'
import { sampleTerrain, type HeightGrid } from '../lib/cityLayers'
import { surfacesFor } from '../lib/heightData'
import { conesOverSite, controllingCone, hasEstimate, showAllCones, showOnlyCones, shownSummary, toggleCone, useConeVisibility } from '../lib/coneVisibility'
import { eyeZ, useViewFromStore } from '../lib/viewFromStore'
import { CHROME, VISTA, useVistaLook } from '../lib/vistaLook'
import { coneVolume, displayCut, type V3 } from '../lib/coneVolume'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import Label from './Label'

/** Vista's corridor height (explorer.js CONE_TOP), metres. */
export const CONE_TOP = 260
/** Vista Plain colours with their alphas (COLLAGE_COLORS). */
const COLOR = { coneEdge: '#807d97', coneSel: '#807d97', coneEdgeSel: VISTA.cone, origin: VISTA.cone, plane: '#b68c9a', planeEdge: VISTA.plane, ray: VISTA.observer, wedge: VISTA.wedge, wedgeEdge: VISTA.observer }
/** Vista's Viewcone blues (explorer.js drawViewconeOverlay): surface, walls, glow ribbons, edge line, footprint trace. */
export const CONE_BLUE = { surface: '#0575f0', walls: '#0587ff', glow: '#0887ff', edge: '#1fb0ff', trace: '#1470ed' } as const
/**
 * Alphas. Vista shows one cone at a time at 0.22 / 0.065 (surface / walls) and many at 0.075 / 0.018. Here all 24 show
 * at once and downtown sits inside several of them, so the fills are lighter (checked on screenshots, 3 Nov: at Vista's
 * values the city under the cones washed blue); the edges and glow keep Vista's strengths, so the volumes still read.
 */
// Lighter to draw (Ruijie, 4 Nov: "can the cones be lighter so the view runs faster"; measured on the Intel UHD: glow
// ribbons about 2 ms, fat edge lines 1.5-2.5 ms, fills 1-3 ms). Glow only where the design meets a cone: the featured
// cone and the other cones over the site. Every cone is a 3D volume (Ruijie, 4 Nov: "make sure to build up the other
// viewcone as 3d geometry as well", then "now it only shows one ... until you have all the viewcone"): at the faint
// many-cone alphas (walls 1-2%, one-pixel edges) only the featured cone could be seen, so every cone now has curtains
// that read (4-6%), a ceiling, and screen-pixel edges at 0.65-0.9 (solid: City-sourced estimate; dashed: study surface).
const STRENGTH = {
  featured: { surface: 0.15, walls: 0.07, edge: 0.95, width: 1.4, glow: [[9, 0.035], [5, 0.07], [2, 0.22]] as [number, number][] },
  site: { surface: 0.09, walls: 0.06, edge: 0.9, width: 1.3, glow: [[4, 0.04], [1.5, 0.14]] as [number, number][] },
  estimate: { surface: 0.07, walls: 0.05, edge: 0.85, width: 1.2, glow: [] as [number, number][] },
  study: { surface: 0.05, walls: 0.04, edge: 0.7, width: 1.1, glow: [] as [number, number][] },
}
type Strength = keyof typeof STRENGTH
/** Drawing order of the kinds: every kind's edges are screen-pixel (fat) lines, one line set per kind. */
const KINDS: Strength[] = ['study', 'estimate', 'site', 'featured']

type P2 = [number, number]
const local = (p: P2): P2 => [p[0] - CITY_ORIGIN[0], p[1] - CITY_ORIGIN[1]]
const openRing = (r: P2[]) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r)

/** The cone that is featured: picked in Observer, else the one controlling the selected tower. */
export function useFeaturedCone(): string | null {
  const picked = useConeVisibility((s) => s.picked)
  const { cones } = useResults()
  const sel = useStore((s) => s.selectedTower)
  const towers = useTowers()
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const checks = cones.find((c) => c.tower.id === t?.id)?.checks ?? []
  return picked ?? controllingCone(checks)
}

/**
 * Every shown cone's volume in one merged mesh (surfaces and walls, per-vertex colour and alpha: one draw call), with
 * the edges grouped by strength for the glow ribbons and edge lines (screen-pixel widths, as Vista's ribbons).
 */
function volumeGeometry(surfaces: ConeSurface[], shown: (id: string) => boolean, featured: string | null, over: ReadonlySet<string>, cut: number) {
  const pos: number[] = [], col: number[] = []
  const edges: Record<Strength, [number, number, number][]> = { featured: [], site: [], estimate: [], study: [] }
  const sc = new THREE.Color(CONE_BLUE.surface), wc = new THREE.Color(CONE_BLUE.walls)
  const toLocal = (p: V3): [number, number, number] => [p[0] - CITY_ORIGIN[0], p[1] - CITY_ORIGIN[1], p[2]]
  const fan = (poly: V3[], c: THREE.Color, a: number) => {
    for (let i = 1; i + 1 < poly.length; i++) for (const p of [poly[0], poly[i], poly[i + 1]]) { pos.push(...toLocal(p)); col.push(c.r, c.g, c.b, a) }
  }
  for (const s of surfaces) {
    if (!shown(s.cone.id)) continue
    // A study surface over the site stays a plain dashed study cone: only City-sourced estimates get the stronger look.
    const k: Strength = s.cone.id === featured ? 'featured' : s.kind !== 'estimate' ? 'study' : over.has(s.cone.id) ? 'site' : 'estimate', st = STRENGTH[k]
    const v = coneVolume(openRing(s.cone.ring as P2[]), (p) => planeZ(s.plane, p), -100, cut)
    for (const poly of v.surface) fan(poly, sc, st.surface)
    // Every cone stands as a volume: its curtains, and the curtains' edges (ceiling line, uprights, display cut).
    for (const poly of v.walls) fan(poly, wc, st.walls)
    for (const [a, b] of v.edges) edges[k].push(toLocal(a), toLocal(b))
  }
  const mesh = new THREE.BufferGeometry()
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  mesh.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  return { mesh, edges }
}

/**
 * The design towers' footprints under the featured cone, projected onto its ceiling (blue outlines on the surface).
 * Vista also traced every existing building there; Ruijie (4 Nov): "you dont need to show line overlap of the building
 * footprint from underneath", so the existing buildings are left out (with the OpenStreetMap fill they covered the
 * ceiling in lines). One line set; nothing is computed from it.
 */
function traceGeometry(surface: ConeSurface | undefined, cut: number, towers: { x: number; y: number; width: number; depth: number; rotation: number }[]) {
  if (!surface) return null
  const ring = openRing(surface.cone.ring as P2[]), pts: number[] = []
  const z = (x: number, y: number) => planeZ(surface.plane, [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]])
  const add = (outer: P2[]) => {
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i], b = outer[(i + 1) % outer.length], za = z(a[0], a[1]), zb = z(b[0], b[1])
      if (za < -100 || zb < -100 || za > cut || zb > cut) continue
      pts.push(a[0], a[1], za + 0.3, b[0], b[1], zb + 0.3)
    }
  }
  const inside = (x: number, y: number) => pointInRing([x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]], ring as [number, number][])
  for (const t of towers) {
    if (!inside(t.x, t.y)) continue
    const r = (t.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), hw = t.width / 2, hd = t.depth / 2
    add([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c] as P2))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

/** Plan outline draped on the ground, as Vista's ground outline (sampled every 20 m so it follows the hills). */
function draped(cone: Cone, ground: (x: number, y: number) => number): [number, number, number][] {
  const ring = openRing(cone.ring as P2[]).map(local), pts: [number, number, number][] = []
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 20))
    for (let s = 0; s < steps; s++) { const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps; pts.push([x, y, ground(x, y) + 0.8]) }
  }
  pts.push(pts[0])
  return pts
}

/** The featured cone's marks: the apex line, Vista's origin marker (a box and a 70 m line) and its label. The volume is drawn with the others. */
function FeaturedCone({ cone, surface, ground, cut }: { cone: Cone; surface: ConeSurface | undefined; ground: (x: number, y: number) => number; cut: number }) {
  const g = useMemo(() => {
    const [ax, ay] = local(openRing(cone.ring as P2[])[0])
    return { apex: [ax, ay] as P2, g0: ground(ax, ay) }
  }, [cone, ground])
  const [ax, ay] = g.apex
  const est = hasEstimate(cone.id)
  const text = `View ${cone.id} — ${cone.name} · ${est ? 'City-sourced estimate' : surface ? 'Vista study surface (assumption)' : 'no height known: footprint only'}`
  return (
    <group>
      <Line points={[[ax, ay, g.g0], [ax, ay, cut]]} color={CONE_BLUE.edge} lineWidth={1.4} transparent opacity={0.8} />
      {/* Origin marker: a 2.4 m box at the ground and a 70 m line (Vista); the City's eye Lv is the cone's apex height. */}
      <mesh position={[ax, ay, g.g0 + 1.5]} raycast={() => null}><boxGeometry args={[2.4 * 4, 2.4 * 4, 3 * 4]} /><meshBasicMaterial color={COLOR.origin} toneMapped={false} /></mesh>
      <Line points={[[ax, ay, g.g0], [ax, ay, g.g0 + 70]]} color={COLOR.origin} lineWidth={2} />
      <Label text={text} position={[ax, ay, Math.max(g.g0 + 75, cone.Lv + 20)]} size={0.015} color={CHROME.plateInk} background="rgba(25,105,174,0.94)" bold keepInView />
    </group>
  )
}

/** Vista's observer ray (eye to the tower) and viewing-angle wedge (the view's frustum to 1.1 × that distance). */
function ObserverMarks() {
  const vp = useViewFromStore((s) => s.viewpoint)
  const looking = useViewFromStore((s) => s.looking)
  const eyeH = useViewFromStore((s) => s.eye)
  const bearing = useViewFromStore((s) => s.bearing), pitch = useViewFromStore((s) => s.pitch), hfov = useViewFromStore((s) => s.hfov)
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const ground = useStore((s) => s.groundElevation)
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const geo = useMemo(() => {
    if (!vp || looking) return null
    const eye = new THREE.Vector3(vp.x, vp.y, eyeZ(vp, eyeH))
    const b = (bearing * Math.PI) / 180, p = (pitch * Math.PI) / 180
    const f = new THREE.Vector3(Math.sin(b) * Math.cos(p), Math.cos(b) * Math.cos(p), Math.sin(p))
    const tgt = t ? new THREE.Vector3(t.x, t.y, ground + t.height / 2) : null
    const L = tgt ? tgt.distanceTo(eye) * 1.1 : 120
    let r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 0, 1)); if (r.lengthSq() < 1e-12) r = new THREE.Vector3(1, 0, 0); r.normalize()
    const u = new THREE.Vector3().crossVectors(r, f).normalize()
    const aspect = 1.6, vf = (vfovOf(hfov, aspect) * Math.PI) / 180, hh = L * Math.tan(vf / 2), hw = hh * aspect
    const c = eye.clone().addScaledVector(f, L)
    const q = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => c.clone().addScaledVector(r, x).addScaledVector(u, y))
    const wedge = new THREE.BufferGeometry().setFromPoints([eye, ...q])
    wedge.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1])
    const edges = new THREE.BufferGeometry().setFromPoints([eye, q[0], eye, q[1], eye, q[2], eye, q[3], q[0], q[1], q[1], q[2], q[2], q[3], q[3], q[0]])
    return { eye, tgt, wedge, edges }
  }, [vp, looking, eyeH, bearing, pitch, hfov, t, ground])
  useEffect(() => () => { geo?.wedge.dispose(); geo?.edges.dispose() }, [geo])
  if (!geo) return null
  const e = geo.eye
  return (
    <group>
      {geo.tgt && <Line points={[e.toArray() as [number, number, number], geo.tgt.toArray() as [number, number, number]]} color={COLOR.ray} lineWidth={1.6} />}
      <Line points={[[e.x, e.y, e.z], [e.x, e.y, e.z + 40]]} color={COLOR.ray} lineWidth={2} />
      <mesh geometry={geo.wedge} raycast={() => null} renderOrder={2}><meshBasicMaterial color={COLOR.wedge} transparent opacity={0.09 * 2} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <lineSegments geometry={geo.edges} raycast={() => null}><lineBasicMaterial color={COLOR.wedgeEdge} transparent opacity={0.65} toneMapped={false} /></lineSegments>
    </group>
  )
}

/** The cones over the Real Vancouver scene (z-up model frame). */
export default function VistaCones({ grids }: { grids: HeightGrid[] }) {
  const hidden = useConeVisibility((s) => s.hidden)
  const featured = useFeaturedCone()
  const looking = useViewFromStore((s) => s.looking)
  const overlays = useViewFromStore((s) => s.overlays)
  const { cones } = useResults()
  const sel = useStore((s) => s.selectedTower)
  const towers = useTowers()
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const overKey = conesOverSite(cones.find((c) => c.tower.id === t?.id)?.checks ?? []).join(',')
  const ground = useMemo(() => (x: number, y: number) => Math.max(0, sampleTerrain(grids, x, y) ?? 0), [grids])
  // The same 24 surfaces the height readouts and the suggestion use (lib/heightData.ts), so the drawing never disagrees.
  const surfaces = useMemo(() => surfacesFor(grids), [grids])
  const outlines = useMemo(() => CONES.map((c) => ({ cone: c, pts: draped(c, ground) })), [ground])
  const plan = useVistaLook((s) => s.mode === 'plan')
  const baseZ = useStore((s) => s.groundElevation)
  const cut = displayCut(towers.length ? baseZ + Math.max(...towers.map((k) => k.height)) : null)
  const vol = useMemo(() => volumeGeometry(surfaces, (id) => !hidden[id], featured, new Set(overKey ? overKey.split(',') : []), cut), [surfaces, hidden, featured, overKey, cut])
  useEffect(() => () => { vol.mesh.dispose() }, [vol])
  const fs = featured && !hidden[featured] ? surfaces.find((s) => s.cone.id === featured) : undefined
  const trace = useMemo(() => traceGeometry(fs, cut, towers), [fs, cut, towers])
  useEffect(() => () => trace?.dispose(), [trace])
  const fc = featured && !hidden[featured] ? CONES.find((c) => c.id === featured) : undefined
  if (looking && !overlays) return null
  return (
    <>
      {outlines.filter((o) => !hidden[o.cone.id] && (plan || !surfaces.some((s) => s.cone.id === o.cone.id))).map(({ cone, pts }) => {
        // Plan (no volumes, as in Vista) and any cone without a surface: the plan outline on the ground.
        const on = cone.id === featured, est = hasEstimate(cone.id)
        return <Line key={cone.id} name="cone:outline" points={pts} color={on ? CONE_BLUE.edge : COLOR.coneEdge} lineWidth={on ? 2.4 : 1.3} transparent opacity={on ? 1 : 0.75} dashed={!est} dashSize={40} gapSize={25} />
      })}
      {!plan && <>
        <mesh name="cone:fill" geometry={vol.mesh} raycast={() => null} renderOrder={1}>
          <meshBasicMaterial vertexColors transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        {KINDS.map((k) => vol.edges[k].length > 0 && (
          <group key={k}>
            {STRENGTH[k].glow.map(([w, a], i) => <Line key={i} name="cone:glow" points={vol.edges[k]} segments color={CONE_BLUE.glow} lineWidth={w} transparent opacity={a} depthWrite={false} renderOrder={2} toneMapped={false} />)}
            <Line name="cone:edge" points={vol.edges[k]} segments color={CONE_BLUE.edge} lineWidth={STRENGTH[k].width} transparent opacity={STRENGTH[k].edge}
              dashed={k === 'study'} dashSize={24} gapSize={16} depthWrite={false} renderOrder={3} toneMapped={false} />
          </group>
        ))}
        {trace && <lineSegments name="cone:trace" geometry={trace} raycast={() => null} renderOrder={2}><lineBasicMaterial color={CONE_BLUE.trace} transparent opacity={0.45} depthWrite={false} toneMapped={false} /></lineSegments>}
      </>}
      {fc && !looking && <FeaturedCone cone={fc} surface={surfaces.find((s) => s.cone.id === fc.id)} ground={ground} cut={cut} />}
      <ObserverMarks />
    </>
  )
}

// ---------- show / hide (the Viewcone tab's panel and the Layers dock) ----------
/** By number, as the City numbers its views (3.2.1 before 10, then the lettered views). */
const SORTED = [...CONES].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
/** All on, all off, only the cones over the site, and each cone by number with its own switch. */
export function ConeVisibilityPanel({ compact = false }: { compact?: boolean }) {
  const hidden = useConeVisibility((s) => s.hidden)
  const { cones } = useResults()
  const sel = useStore((s) => s.selectedTower)
  const towers = useTowers()
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const over = conesOverSite(cones.find((c) => c.tower.id === t?.id)?.checks ?? [])
  const btn = 'rounded-lg border px-2 py-0.5 text-meta hover:bg-subtle outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#426b61]'
  const style = { borderColor: CHROME.border, color: CHROME.ink, background: '#ffffff' }
  return (
    <div className="space-y-1.5" role="group" aria-label="View cone layers">
      <p className="text-meta" style={{ color: CHROME.ink }}>{shownSummary(hidden)} · solid: City-sourced estimate; dashed: Vista study surface (assumption)</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn} style={style} onClick={() => showAllCones(true)}>All on</button>
        <button type="button" className={btn} style={style} onClick={() => showAllCones(false)}>All off</button>
        <button type="button" className={btn} style={style} disabled={!over.length} onClick={() => showOnlyCones(over)}
          title={over.length ? `The cones over ${t?.name ?? 'the tower'}: ${over.join(', ')}` : 'The selected tower is outside every cone'}>Only over the site{over.length ? ` (${over.length})` : ''}</button>
      </div>
      <ul className={`${compact ? 'max-h-56' : 'max-h-72'} space-y-0.5 overflow-y-auto pr-1`}>
        {SORTED.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-1.5 text-meta" style={{ color: CHROME.ink }}>
              <input type="checkbox" checked={!hidden[c.id]} onChange={() => toggleCone(c.id)} />
              <span className="tabular-nums font-semibold">{c.id}</span><span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 text-meta">{hasEstimate(c.id) ? 'estimate' : 'study'}{over.includes(c.id) ? ' · over site' : ''}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
