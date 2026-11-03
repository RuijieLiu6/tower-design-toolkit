// In-canvas part of the study site (Real Vancouver, inside CityScene via VistaRig; x east, y north, z up, CGVD28).
// After Vista v34 step 1 (Ruijie Liu): draw a site boundary on the plan, or click existing City buildings to take
// their footprints as the site; shows the boundary, the parcels under it, the buildings it replaces (demolished
// unless kept) and the address or coordinate marker. Clicks are taken only while a site tool is on, so tower
// placing and the tower gizmo keep their clicks otherwise.
import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ringMetrics, siteFromFootprints, validateRing, normalizeRing, type Pt } from '../engine/site'
import { footprintAt, indexFootprints } from '../engine/viewFrom'
import { sampleTerrain } from '../lib/cityLayers'
import { useSiteAnalysis } from '../lib/siteParcels'
import { newSite, useSiteStore } from '../lib/siteStore'
import { useViewFromStore } from '../lib/viewFromStore'
import { useStore } from '../store'
import { useCityData } from './CityContext'
import Label from './Label'

const COLORS = { site: '#ea580c', draft: '#c2410c', picked: '#2563eb', demolished: '#dc2626', inside: '#16a34a', partial: '#d97706', marker: '#7c3aed' }

/** Close the drawn ring when a click lands this near the first vertex (screen pixels). */
const CLOSE_PX = 12
/** A click that moved more than this between press and release was an orbit, not a click (pixels). */
const CLICK_SLOP = 6

/** Footprint indices by City id (ids are kept in the site, indices are per data load). */
export function idsToIndices(footprints: { id: number }[], ids: number[]): number[] {
  if (!ids.length) return []
  const want = new Set(ids), out: number[] = []
  footprints.forEach((f, i) => { if (want.has(f.id)) out.push(i) })
  return out
}

export default function SiteRig() {
  const { data } = useCityData()
  const { gl, camera, scene } = useThree()
  const tool = useSiteStore((s) => s.tool)
  const idx = useMemo(() => (data ? indexFootprints(data.footprints) : null), [data])
  const down = useRef<{ x: number; y: number } | null>(null)
  const frame = useRef(0)
  useSiteAnalysis() // keeps the tower tools' site and parcels in step even when the panel is closed

  useEffect(() => {
    if (!tool || !data || !idx) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = (e: MouseEvent) => { const r = el.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) }
    const groundZ = () => useStore.getState().groundElevation
    /** Plan point under the cursor: the first visible mesh hit, else the plane at the project base. */
    const planAt = (e: MouseEvent, precise: boolean): Pt | null => {
      ray.setFromCamera(ndc(e), camera)
      if (precise) {
        const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && !h.object.userData.siteOverlay)
        if (hit) return [hit.point.x, -hit.point.z]
      }
      const p = new THREE.Vector3()
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundZ()), p) ? [p.x, -p.z] : null
    }
    const toScreen = (q: Pt) => { const v = new THREE.Vector3(q[0], groundZ(), -q[1]).project(camera); const r = el.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width + r.left, (1 - v.y) / 2 * r.height + r.top] }
    const finish = () => {
      const s = useSiteStore.getState()
      if (s.draft.length < 3) { s.set({ message: { text: 'Add at least three corners, then close the boundary.', kind: 'error' } }); return }
      const ring = normalizeRing(s.draft), err = validateRing(ring)
      if (err) { s.set({ message: { text: `${err} Move or remove the last corner (Backspace).`, kind: 'error' } }); return }
      s.setSite(newSite(ring, 'drawn', `Drawn on the plan (${ring.length} corners)`))
      s.set({ tool: null, draft: [], hover: null, message: { text: `Site drawn: ${Math.round(ringMetrics(ring).area).toLocaleString('en-CA')} m². A study boundary, not a legal parcel.`, kind: 'info' } })
    }
    const onDown = (e: PointerEvent) => { if (e.target === el) down.current = { x: e.clientX, y: e.clientY } }
    const onClick = (e: MouseEvent) => {
      if (e.target !== el || !down.current || Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > CLICK_SLOP) return
      e.stopPropagation(); e.preventDefault()
      const s = useSiteStore.getState()
      const p = planAt(e, true)
      if (!p) return
      if (s.tool === 'draw') {
        if (s.draft.length >= 3) { const [sx, sy] = toScreen(s.draft[0]); if (Math.hypot(sx - e.clientX, sy - e.clientY) <= CLOSE_PX) { finish(); return } }
        const last = s.draft[s.draft.length - 1]
        if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.3) return
        s.set({ draft: [...s.draft, [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]], message: null })
      } else if (s.tool === 'pick') {
        const i = footprintAt(idx, p[0], p[1])
        if (i === null) { s.set({ message: { text: 'No City building there. Click a building outline or roof.', kind: 'error' } }); return }
        s.set({ picked: s.picked.includes(i) ? s.picked.filter((k) => k !== i) : [...s.picked, i].slice(-40), message: null })
      }
    }
    const onDbl = (e: MouseEvent) => { if (e.target === el && useSiteStore.getState().tool === 'draw') { e.stopPropagation(); finish() } }
    const onMove = (e: PointerEvent) => {
      if (e.target !== el || useSiteStore.getState().tool !== 'draw') return
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => useSiteStore.setState({ hover: planAt(e, false) }))
    }
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName ?? '')) return
      const s = useSiteStore.getState()
      if (e.key === 'Escape') { s.set({ tool: null, draft: [], hover: null, picked: [], message: { text: 'Site tool cancelled; the site is unchanged.', kind: 'info' } }); e.stopPropagation() }
      else if (e.key === 'Enter' && s.tool === 'draw') { finish(); e.preventDefault() }
      else if (e.key === 'Backspace' && s.tool === 'draw' && s.draft.length) { s.set({ draft: s.draft.slice(0, -1) }); e.preventDefault() }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('dblclick', onDbl, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('keydown', onKey, true)
    el.style.cursor = 'crosshair'
    useStore.getState().set({ placing: false })
    return () => {
      window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('click', onClick, true); window.removeEventListener('dblclick', onDbl, true)
      window.removeEventListener('pointermove', onMove, true); window.removeEventListener('keydown', onKey, true)
      cancelAnimationFrame(frame.current); el.style.cursor = ''
    }
  }, [tool, data, idx, gl, camera, scene])

  const looking = useViewFromStore((s) => s.looking)
  if (!data || looking) return null
  return <SiteLayer data={data} />
}

type CityData = NonNullable<ReturnType<typeof useCityData>['data']>

/** A ring draped on the terrain, densified every `step` metres so it follows the ground. */
function drape(grids: CityData['grids'], ring: Pt[], lift: number, closed = true, step = 4): [number, number, number][] {
  const pts: [number, number, number][] = []
  const n = closed ? ring.length : ring.length - 1
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let s = 0; s < k; s++) { const x = a[0] + ((b[0] - a[0]) * s) / k, y = a[1] + ((b[1] - a[1]) * s) / k; pts.push([x, y, (sampleTerrain(grids, x, y) ?? 0) + lift]) }
  }
  const last = closed ? ring[0] : ring[ring.length - 1]
  pts.push([last[0], last[1], (sampleTerrain(grids, last[0], last[1]) ?? 0) + lift])
  return pts
}

function SiteLayer({ data }: { data: CityData }) {
  const { site, match, area, layer } = useSiteAnalysis()
  const s = useSiteStore()
  const grids = data.grids
  const replaced = useMemo(() => (site && !site.keepReplaced ? idsToIndices(data.footprints, site.replaced) : []), [site, data])
  const preview = useMemo(() => (s.tool === 'pick' && s.picked.length ? siteFromFootprints(s.picked.map((i) => data.footprints[i])) : null), [s.tool, s.picked, data])
  const ringOk = !!site && !validateRing(site.ring)
  const centre = ringOk ? ringMetrics(site!.ring).centre : null
  const L = (pts: [number, number, number][], color: string, width: number, dashed = false) => (
    <Line points={pts} color={color} lineWidth={width} dashed={dashed} dashSize={3} gapSize={2} depthTest={false} renderOrder={20} transparent opacity={0.95} userData={{ siteOverlay: true }} />
  )
  return (
    <group>
      {ringOk && L(drape(grids, site!.ring, 1.2), COLORS.site, 3.5)}
      {ringOk && centre && area && <Label text={`Study site · ${Math.round(area.area).toLocaleString('en-CA')} m² (${area.basis === 'parcels' ? 'parcels' : 'boundary'})`} position={[centre[0], centre[1], (sampleTerrain(grids, centre[0], centre[1]) ?? 0) + 18]} size={0.016} color="#ffffff" background="rgba(234,88,12,0.92)" bold />}
      {match && layer && match.hits.filter((h) => h.kind !== 'touching').map((h) => (
        <group key={h.index}>{L(drape(grids, layer.polys[h.index].outer as Pt[], 0.9), match.included.includes(h.index) ? COLORS.inside : COLORS.partial, match.included.includes(h.index) ? 2 : 1.5, !match.included.includes(h.index))}</group>
      ))}
      {replaced.map((i) => <group key={i}>{L(drape(grids, data.footprints[i].outer as Pt[], 0.7), COLORS.demolished, 2, true)}</group>)}
      {s.tool === 'pick' && s.picked.map((i) => <group key={i}>{L(drape(grids, data.footprints[i].outer as Pt[], 1), COLORS.picked, 2.5)}</group>)}
      {preview && L(drape(grids, preview.ring, 1.6), COLORS.picked, 1.5, true)}
      {s.tool === 'draw' && s.draft.length > 0 && L(drape(grids, s.hover ? [...s.draft, s.hover] : s.draft, 1.4, false), COLORS.draft, 2.5)}
      {s.tool === 'draw' && s.draft.length > 0 && (
        <mesh position={[s.draft[0][0], s.draft[0][1], (sampleTerrain(grids, s.draft[0][0], s.draft[0][1]) ?? 0) + 1.4]} userData={{ siteOverlay: true }} renderOrder={21}>
          <sphereGeometry args={[2.2, 12, 12]} /><meshBasicMaterial color={COLORS.draft} depthTest={false} />
        </mesh>
      )}
      {s.marker && (() => {
        const g = sampleTerrain(grids, s.marker.at[0], s.marker.at[1]) ?? 0
        return (
          <group>
            {L([[s.marker.at[0], s.marker.at[1], g], [s.marker.at[0], s.marker.at[1], g + 60]], COLORS.marker, 3)}
            <Label text={s.marker.label} position={[s.marker.at[0], s.marker.at[1], g + 70]} size={0.016} color="#ffffff" background="rgba(124,58,237,0.92)" bold />
          </group>
        )
      })()}
    </group>
  )
}
