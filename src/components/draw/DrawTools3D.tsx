// The drawing tools on the model (Ruijie, 17 Nov: "the series of modelling icons she developed … build them all into
// our tool"). The interaction is Sinnie Choi's, rewritten for the Toolkit: her Toolkit build (artifact
// 1794900977-6d89) and her plain-JS Tower Workspace, github.com/xubynii/towerdesigntool (index.html, "model: pointer
// tools"). Mounted inside the scene's z-up group, so everything is in the project frame (x east, y north, z up); the
// pointer ray is built like MassingEdit3D.tsx. Masses are towers with a `drawn` field (lib/draw/mass.ts); each edit is
// one undo step (Ctrl+Z), with no confirm. The tool, its modes and the snapping settings are lib/draw/drawStore.ts; the
// geometry lib/draw/geometry.ts. Previews are lines over the model; the live dimension tag is an HTML label at the
// pointer's point; typed values commit on Enter; Esc ends the tool.
import { Html, Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Tower } from '../../engine/types'
import { area, arrayCopies, asPoly, centroid, chordEnds, circlePts, clip, hitPrisms, inPoly, nearestWall, offsetPoly, pathPoly, planeHit, pushWall, rotatePts, segDist, setWallLength, shiftPts, splitPoly, type Prism, type Pt, type Ray3 } from '../../lib/draw/geometry'
import { addDrawnMass, coreInside, inCore, massTop, newMassId, partsOf, updateDrawnMany, updateDrawnMass } from '../../lib/draw/mass'
import { drawToolDef, setTag, snapTo, toast, typedNumber, useDraw, type DrawTool, type SnapSettings } from '../../lib/draw/drawStore'
import { breakStep } from '../../lib/project/history'
import { pickTower } from '../../lib/towerEdit'
import { useStore, useTowers } from '../../store'

const ACCENT = '#1f5f8b', HOVER = '#2f63e0', NEW = '#c9a800', OLD = '#38b6c3', SNAP: Record<string, string> = { corner: '#2e9e6b', mid: '#19a7c3', edge: '#cf4f58', align: '#7a7f85', dir: '#b53bd0' }
const DRAG_PX = 4
type Controls = { enabled: boolean }
type V3 = [number, number, number]
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
const r2 = (v: number) => Math.round(v * 100) / 100
const fm = (v: number) => String(Math.round(v * 100) / 100)

interface Draft { pts: Pt[]; cur: Pt | null; z: number; len: string; ang: string; field: 'len' | 'ang'; closing: boolean; info: { len: number; ang: number } | null; guides: { a: Pt; b: Pt; col: string }[]; marker: Pt | null; label: string }
type Drag =
  | { k: 'rect' | 'circle'; z: number; x0: number; y0: number; pts: Pt[] }
  | { k: 'move' | 'copy'; id: string; p0: Pt; parts: { id: string; pts: Pt[]; holes?: Pt[][]; core?: Tower['drawn'] extends infer D ? (D extends { core?: infer C } ? C : never) : never }[]; dx: number; dy: number; moved: boolean }
  | { k: 'rotate'; id: string; x: number; pts0: Pt[]; deg: number }
  | { k: 'offset'; id: string; x: number; pts0: Pt[]; v: number }
  | { k: 'pullTop'; id: string; y: number; f0: number; floors: number; sticky: boolean; moved: boolean }
  | { k: 'pullSide'; id: string; i: number; n: Pt; p0: Pt; pts0: Pt[]; v: number; sticky: boolean; moved: boolean }
  | { k: 'core'; id: string; z: number; a: Pt; r: { x: number; y: number; w: number; d: number } | null }
  | { k: 'click'; x: number; y: number }

/** The snapping of a point to the masses' corners, middles and edges, in line with corners, else the grid (hers, inferPoint). */
function inferPoint(raw: Pt, prisms: Prism[], site: Pt[] | null, snap: SnapSettings, tol: number, alt: boolean, from?: Pt | null) {
  const inf = { x: raw[0], y: raw[1], kind: 'free', label: '', guides: [] as { a: Pt; b: Pt; col: string }[], marker: null as Pt | null }
  if (alt) { inf.x = Math.round(raw[0] * 10) / 10; inf.y = Math.round(raw[1] * 10) / 10; return inf }
  const edges: { a: Pt; b: Pt; name: string }[] = []
  const add = (ring: Pt[], name: string) => ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05) edges.push({ a, b, name }) })
  if (site) add(site, 'the site boundary')
  for (const p of prisms) add(p.pts, p.id)
  let best: { pt: Pt; k: 'corner' | 'mid'; name: string } | null = null, bd = tol * 1.2
  for (const e of edges) {
    const cands: [Pt, 'corner' | 'mid'][] = [[e.a, 'corner'], [e.b, 'corner'], [[(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], 'mid']]
    for (const [pt, k] of cands) { if (!snap[k]) continue; const d = Math.hypot(pt[0] - raw[0], pt[1] - raw[1]) + (k === 'mid' ? 0.15 : 0); if (d < bd) { bd = d; best = { pt, k, name: e.name } } }
  }
  if (best) { inf.x = best.pt[0]; inf.y = best.pt[1]; inf.kind = best.k; inf.label = best.k === 'corner' ? 'Endpoint' : 'Midpoint'; inf.marker = [inf.x, inf.y] }
  else {
    let be: { e: typeof edges[number]; t: number } | null = null
    bd = tol * 1.2
    if (snap.edge) for (const e of edges) { const r = segDist(raw, e.a, e.b); if (r.dist < bd) { bd = r.dist; be = { e, t: r.t } } }
    if (be) { inf.x = r2(be.e.a[0] + (be.e.b[0] - be.e.a[0]) * be.t); inf.y = r2(be.e.a[1] + (be.e.b[1] - be.e.a[1]) * be.t); inf.kind = 'edge'; inf.label = 'On edge'; inf.marker = [inf.x, inf.y]; inf.guides.push({ a: be.e.a, b: be.e.b, col: SNAP.edge }) }
    else {
      let ax: Pt | null = null, ay: Pt | null = null, dx = tol * 1.2, dy = tol * 1.2
      if (snap.align) for (const e of edges) for (const pt of [e.a, e.b]) { const ddx = Math.abs(pt[0] - raw[0]), ddy = Math.abs(pt[1] - raw[1]); if (ddx < dx && ddy > tol) { dx = ddx; ax = pt } if (ddy < dy && ddx > tol) { dy = ddy; ay = pt } }
      inf.x = ax ? ax[0] : snapTo(raw[0], snap); inf.y = ay ? ay[1] : snapTo(raw[1], snap)
      if (ax) inf.guides.push({ a: ax, b: [inf.x, inf.y], col: SNAP.align })
      if (ay) inf.guides.push({ a: ay, b: [inf.x, inf.y], col: SNAP.align })
      if (ax || ay) { inf.kind = 'align'; inf.label = 'In line with a corner'; inf.marker = [inf.x, inf.y] } else inf.kind = 'grid'
    }
  }
  // a direction parallel or perpendicular to an edge, from the last point
  if (from && snap.dir) {
    const loose = inf.kind === 'free' || inf.kind === 'grid', ddx = (loose ? raw[0] : inf.x) - from[0], ddy = (loose ? raw[1] : inf.y) - from[1], len = Math.hypot(ddx, ddy)
    if (len > 0.5) {
      const ang = (Math.atan2(ddy, ddx) * 180) / Math.PI
      let bestE: typeof edges[number] | null = null, bdev = loose ? 3 : 0.6, rel: 'parallel' | 'perpendicular' = 'parallel'
      for (const e of edges) { const ea = (Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180) / Math.PI; let d = Math.abs((((ang - ea) % 180) + 180) % 180); d = Math.min(d, 180 - d); const dp = Math.abs(d - 90); if (d < bdev) { bdev = d; bestE = e; rel = 'parallel' } else if (dp < bdev) { bdev = dp; bestE = e; rel = 'perpendicular' } }
      if (bestE) {
        const ea = Math.atan2(bestE.b[1] - bestE.a[1], bestE.b[0] - bestE.a[0]), ta = rel === 'parallel' ? ea : ea + Math.PI / 2, u: Pt = [Math.cos(ta), Math.sin(ta)]
        if (loose) { const k = snapTo(ddx * u[0] + ddy * u[1], snap); inf.x = r2(from[0] + u[0] * k); inf.y = r2(from[1] + u[1] * k); inf.kind = 'dir'; inf.marker = null }
        inf.label = `${inf.label ? `${inf.label} · ` : ''}${rel === 'parallel' ? 'Parallel' : 'Perpendicular'} to an edge`
        const G = Math.max(14, 40 * tol / 9)
        inf.guides.push({ a: [inf.x - u[0] * G, inf.y - u[1] * G], b: [inf.x + u[0] * G, inf.y + u[1] * G], col: SNAP.dir }, { a: bestE.a, b: bestE.b, col: SNAP.dir })
      }
    }
  }
  return inf
}

export default function DrawTools3D() {
  const tool = useDraw((s) => s.tool)
  const snap = useDraw((s) => s.snap)
  const lineMode = useDraw((s) => s.lineMode)
  const lineWidth = useDraw((s) => s.lineWidth)
  const lineAlign = useDraw((s) => s.lineAlign)
  const boolMode = useDraw((s) => s.boolMode)
  const typed = useDraw((s) => s.typed)
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const present = useStore((s) => s.phase === 'present')
  const site = useStore((s) => (s.project === 'city' ? s.citySite?.ring ?? null : null)) as Pt[] | null
  const { gl, camera, get } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [hover, setHover] = useState<{ id: string; face: 'top' | 'wall'; wall: number } | null>(null)
  const [cut, setCut] = useState<{ id: string; a: Pt & { on?: string }; b: (Pt & { on?: string }) | null } | null>(null)
  const [guides, setGuides] = useState<{ a: Pt; b: Pt; col: string }[]>([])
  const [marker, setMarker] = useState<{ at: Pt; kind: string } | null>(null)
  const [preview, setPreview] = useState<{ pts: Pt[]; z: number; holes?: Pt[][] } | null>(null)
  const live = useRef({ tool, snap, lineMode, lineWidth, lineAlign, boolMode, typed, towers, drag, draft, cut })
  live.current = { tool, snap, lineMode, lineWidth, lineAlign, boolMode, typed, towers, drag, draft, cut }
  const prisms = (): Prism[] => live.current.towers.filter((t) => t.drawn).map((t) => ({ id: t.id, pts: t.drawn!.pts, base: t.drawn!.base, top: massTop(t.drawn!) }))
  const massOf = (id: string) => live.current.towers.find((t) => t.id === id) ?? null

  /** The pointer's ray in the project frame (three's x, -z, y). */
  const rayAt = (clientX: number, clientY: number): Ray3 => {
    const r = gl.domElement.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const o = raycaster.ray.origin, d = raycaster.ray.direction
    return { o: [o.x, -o.z, o.y], d: [d.x, -d.z, d.y] }
  }
  /** Metres per screen pixel at a point (for snapping reach and dimension steps). */
  const mpp = (p: V3) => { const v = new THREE.Vector3(p[0], p[2], -p[1]); const d = camera.position.distanceTo(v); const fov = (camera as THREE.PerspectiveCamera).fov; return fov ? (2 * d * Math.tan((fov * Math.PI) / 360)) / gl.domElement.clientHeight : 0.2 }
  const ground = (e: PointerEvent, z: number) => planeHit(rayAt(e.clientX, e.clientY), z)
  const tolAt = (p: Pt, z: number) => Math.max(0.8, 9 * mpp([p[0], p[1], z]))
  const sideView = () => { const d = new THREE.Vector3(); camera.getWorldDirection(d); return Math.abs(d.y) < 0.25 }

  // Clear everything of the old tool when the tool changes.
  useEffect(() => { setDrag(null); setDraft(null); setHover(null); setCut(null); setGuides([]); setMarker(null); setPreview(null); setTag(null); useDraw.setState({ typed: '' }) }, [tool])

  // ---- the pointer
  useEffect(() => {
    if (!tool || present) return
    const el = gl.domElement
    let saved: boolean | null = null
    const controls = () => get().controls as unknown as Controls | null
    const lock = () => { const c = controls(); if (c && saved === null) { saved = c.enabled; c.enabled = false } }
    const release = () => { const c = controls(); if (c && saved !== null) c.enabled = saved; saved = null }
    const finishDrag = () => { setDrag(null); release(); el.style.cursor = '' }
    const pointerIn = (e: PointerEvent) => e.target === el

    const onDown = (e: PointerEvent) => {
      if (!pointerIn(e) || e.button !== 0 || e.ctrlKey || e.metaKey) return
      const L = live.current, t = L.tool!
      // a picked-up face: the second click sets it
      if (L.drag && (L.drag.k === 'pullTop' || L.drag.k === 'pullSide') && L.drag.sticky) { endPull(false); return }
      const ray = rayAt(e.clientX, e.clientY), hit = hitPrisms(prisms(), ray)
      const m = hit ? massOf(hit.id) : null
      if (t === 'rect' || t === 'circle') {
        const z = hit && hit.face === 'top' ? hit.point[2] : 0, p = planeHit(ray, z)
        if (!p) return
        lock(); setDrag({ k: t, z, x0: snapTo(p[0], L.snap, e.altKey), y0: snapTo(p[1], L.snap, e.altKey), pts: [] }); return
      }
      if (t === 'line' || t === 'tape' || t === 'select') { setDrag({ k: 'click', x: e.clientX, y: e.clientY }); return }
      if (t === 'split') { splitDown(e, ray); return }
      if (!m?.drawn) {
        // a parametric tower under Erase: it goes too
        const anyHit = raycaster.intersectObjects(get().scene.children, true).find((h) => h.object.userData?.towerId)
        if (t === 'erase' && anyHit) { const id = anyHit.object.userData.towerId as string; breakStep(); useStore.getState().removeTower(id); breakStep(); toast('Deleted'); }
        return
      }
      const d = m.drawn
      if (t === 'erase') { updateDrawnMany([], [], partsOf(m.id).map((x) => x.id)); toast(`${m.name} deleted`); return }
      lock()
      useStore.getState().selectTower(m.id); pickTower(m.id)
      if (t === 'copy' || t === 'move') {
        const p0 = planeHit(ray, 0) ?? [hit!.point[0], hit!.point[1]]
        const parts = (t === 'move' ? partsOf(m.id) : [m]).map((x) => ({ id: x.id, pts: x.drawn!.pts, holes: x.drawn!.holes, core: x.drawn!.core }))
        setDrag({ k: t, id: m.id, p0, parts, dx: 0, dy: 0, moved: false }); return
      }
      if (t === 'bool') {
        const first = useDraw.getState().boolFirst
        if (!first || first === m.id) { useDraw.setState({ boolFirst: m.id }); toast(`${m.name} is the first mass. Now click the second.`); release(); return }
        useDraw.setState({ boolFirst: null }); doBool(first, m.id); release(); return
      }
      if (t === 'core') {
        const z = hit!.face === 'top' ? hit!.point[2] : d.base, q = planeHit(ray, z)
        if (!q) { release(); return }
        if (inCore(d, q[0], q[1])) { updateDrawnMass(m.id, { core: undefined }); toast('Core removed'); release(); return }
        setDrag({ k: 'core', id: m.id, z, a: [Math.round(q[0] * 2) / 2, Math.round(q[1] * 2) / 2], r: null }); return
      }
      if (t === 'offset') { setDrag({ k: 'offset', id: m.id, x: e.clientX, pts0: d.pts, v: 0 }); return }
      if (t === 'rotate') { setDrag({ k: 'rotate', id: m.id, x: e.clientX, pts0: d.pts, deg: 0 }); return }
      if (t === 'length') {
        if (hit!.face !== 'wall') { toast('Click a wall of a mass'); release(); return }
        const i = hit!.wall, a = d.pts[i], b = d.pts[(i + 1) % d.pts.length]
        useDraw.setState({ edge: { id: m.id, i } }); setPreview({ pts: [a, b], z: hit!.point[2] })
        toast(`This wall is ${fm(Math.hypot(b[0] - a[0], b[1] - a[1]))} m. Type the new length and press Enter.`); release(); return
      }
      if (t === 'pull') {
        const top = massTop(d)
        if (hit!.face === 'top' || Math.abs(hit!.point[2] - top) < Math.min(Math.max(1.2, 4 * mpp(hit!.point)), (d.floors * d.f2f) / 4)) setDrag({ k: 'pullTop', id: m.id, y: e.clientY, f0: d.floors, floors: d.floors, sticky: false, moved: false })
        else { const i = hit!.wall, n = ((): Pt => { const a = d.pts[i], b = d.pts[(i + 1) % d.pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1, s = area(d.pts) > 0 ? 1 : 1; return [(ey / l) * s, (-ex / l) * s] })(); const sgn = (() => { let a = 0; for (let k = 0; k < d.pts.length; k++) { const p = d.pts[k], q = d.pts[(k + 1) % d.pts.length]; a += p[0] * q[1] - q[0] * p[1] } return a >= 0 ? 1 : -1 })(); const nn: Pt = [n[0] * sgn, n[1] * sgn]; setDrag({ k: 'pullSide', id: m.id, i, n: nn, p0: [hit!.point[0], hit!.point[1]], pts0: d.pts, v: 0, sticky: false, moved: false }) }
        return
      }
      release()
    }
    const onMove = (e: PointerEvent) => {
      const L = live.current, t = L.tool!, D = L.drag
      if (t === 'line' && !D) { lineHover(e); return }
      if (!D) { if (t === 'pull') hoverFace(e); else if (t === 'split') splitMove(e); return }
      const ray = rayAt(e.clientX, e.clientY)
      if (D.k === 'rect' || D.k === 'circle') {
        const p = planeHit(ray, D.z); if (!p) return
        const x = snapTo(p[0], L.snap, e.altKey), y = snapTo(p[1], L.snap, e.altKey)
        const pts: Pt[] = D.k === 'rect' ? [[D.x0, D.y0], [x, D.y0], [x, y], [D.x0, y]] : circlePts(D.x0, D.y0, Math.max(1, Math.round(Math.hypot(x - D.x0, y - D.y0))))
        setDrag({ ...D, pts }); setPreview({ pts, z: D.z })
        setTag({ text: D.k === 'rect' ? `${fm(Math.abs(x - D.x0))} × ${fm(Math.abs(y - D.y0))} m` : `radius ${Math.max(1, Math.round(Math.hypot(x - D.x0, y - D.y0)))} m`, at: [x, y, D.z] })
      } else if (D.k === 'move' || D.k === 'copy') {
        const p = planeHit(ray, 0); if (!p) return
        const dx = snapTo(p[0] - D.p0[0], L.snap, e.altKey), dy = snapTo(p[1] - D.p0[1], L.snap, e.altKey)
        if (!dx && !dy && !D.moved) return
        setDrag({ ...D, dx, dy, moved: true })
        const m = massOf(D.id)!; setPreview({ pts: shiftPts(D.parts[0].pts, dx, dy), z: massTop(m.drawn!) }); setTag({ text: `${fm(dx)}, ${fm(dy)} m`, at: [p[0], p[1], massTop(m.drawn!)] })
      } else if (D.k === 'rotate') {
        const deg = Math.round(((e.clientX - D.x) * 0.5) / 5) * 5, m = massOf(D.id)!
        setDrag({ ...D, deg }); setPreview({ pts: rotatePts(D.pts0, deg), z: massTop(m.drawn!) }); const c = centroid(D.pts0); setTag({ text: `${deg}°`, at: [c[0], c[1], massTop(m.drawn!)] })
      } else if (D.k === 'offset') {
        const m = massOf(D.id)!, v = Math.round((e.clientX - D.x) * mpp([m.x, m.y, massTop(m.drawn!)]) * 2) / 2, q = offsetPoly(D.pts0, v)
        if (area(q) > 4) { setDrag({ ...D, v }); setPreview({ pts: q, z: massTop(m.drawn!) }); const c = centroid(q); setTag({ text: `${v > 0 ? '+' : ''}${fm(v)} m`, at: [c[0], c[1], massTop(m.drawn!)] }) }
      } else if (D.k === 'pullTop') {
        const m = massOf(D.id)!, d = m.drawn!, k = mpp([m.x, m.y, massTop(d)]), dir = new THREE.Vector3(); camera.getWorldDirection(dir)
        const floors = Math.max(1, D.f0 + Math.round((-(e.clientY - D.y) * k) / Math.max(0.25, Math.sqrt(1 - dir.y * dir.y)) / d.f2f))
        if (floors !== D.floors) { setDrag({ ...D, floors, moved: true }); const c = centroid(d.pts); setTag({ text: `${floors} storeys · ${fm(d.base + floors * d.f2f)} m`, at: [c[0], c[1], d.base + floors * d.f2f] }); setPreview({ pts: d.pts, z: d.base + floors * d.f2f }) }
      } else if (D.k === 'pullSide') {
        const m = massOf(D.id)!, d = m.drawn!, p = planeHit(ray, hitZ(D)); if (!p) return
        const v = snapTo((p[0] - D.p0[0]) * D.n[0] + (p[1] - D.p0[1]) * D.n[1], L.snap, e.altKey), q = pushWall(D.pts0, D.i, v)
        if (area(q) > 4) { setDrag({ ...D, v, moved: true }); setPreview({ pts: q, z: massTop(d) }); const a = D.pts0[D.i], b = D.pts0[(D.i + 1) % D.pts0.length]; setTag({ text: `${v > 0 ? '+' : ''}${fm(v)} m`, at: [(a[0] + b[0]) / 2 + D.n[0] * v, (a[1] + b[1]) / 2 + D.n[1] * v, massTop(d)] }) }
      } else if (D.k === 'core') {
        const q = planeHit(ray, D.z); if (!q) return
        const x = Math.round(q[0] * 2) / 2, y = Math.round(q[1] * 2) / 2, r = { x: Math.min(D.a[0], x), y: Math.min(D.a[1], y), w: Math.abs(x - D.a[0]), d: Math.abs(y - D.a[1]) }
        setDrag({ ...D, r }); setPreview({ pts: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]], z: D.z }); setTag({ text: `core ${fm(r.w)} × ${fm(r.d)} m`, at: [x, y, D.z] })
      }
    }
    const hitZ = (D: Extract<Drag, { k: 'pullSide' }>) => { const m = massOf(D.id)!; return (m.drawn!.base + massTop(m.drawn!)) / 2 }
    const onUp = (e: PointerEvent) => {
      const L = live.current, D = L.drag, t = L.tool!
      if (!D) return
      if (D.k === 'rect' || D.k === 'circle') { finishDrag(); setPreview(null); setTag(null); if (D.pts.length) { const made = addDrawnMass(D.pts, D.z); if (!made) toast('That shape is too small to be a mass'); else { toast(`${made.name}: ${fm(area(D.pts))} m², 6 storeys`); useDraw.setState({ tool: 'pull' }) } } return }
      if (D.k === 'click') {
        finishDrag()
        if (Math.hypot(e.clientX - D.x, e.clientY - D.y) > 5) return
        const ray = rayAt(e.clientX, e.clientY)
        if (t === 'line') { lineClick(e, ray); return }
        if (t === 'tape') { const p = planeHit(ray, 0); if (!p) return; const tp = useDraw.getState().tape.length >= 2 ? [] : useDraw.getState().tape; const next = [...tp, [r2(p[0]), r2(p[1])] as Pt]; useDraw.setState({ tape: next }); setPreview(next.length === 2 ? { pts: next, z: 0.1 } : null); if (next.length === 2) setTag({ text: `${fm(Math.hypot(next[1][0] - next[0][0], next[1][1] - next[0][1]))} m`, at: [(next[0][0] + next[1][0]) / 2, (next[0][1] + next[1][1]) / 2, 0.2] }); return }
        if (t === 'select') { const hit = hitPrisms(prisms(), ray); if (hit) { useStore.getState().selectTower(hit.id); pickTower(hit.id) } }
        return
      }
      if (D.k === 'move' || D.k === 'copy') {
        finishDrag(); setPreview(null); setTag(null)
        if (!D.moved) return
        if (D.k === 'move') updateDrawnMany(D.parts.map((p) => ({ id: p.id, patch: { pts: shiftPts(p.pts, D.dx, D.dy), holes: p.holes?.map((h) => shiftPts(h, D.dx, D.dy)), core: p.core ? { ...p.core, x: p.core.x + D.dx, y: p.core.y + D.dy } : undefined } })))
        else { const m = massOf(D.id)!; updateDrawnMany([], [{ pts: shiftPts(m.drawn!.pts, D.dx, D.dy), holes: m.drawn!.holes?.map((h) => shiftPts(h, D.dx, D.dy)), base: m.drawn!.base, floors: m.drawn!.floors, f2f: m.drawn!.f2f, name: `${m.name} copy` }]); useDraw.setState({ lastCopy: { id: m.id, dx: D.dx, dy: D.dy } }); toast('Copied. Type a number and Enter for that many copies in a row.') }
        return
      }
      if (D.k === 'rotate') { finishDrag(); setPreview(null); setTag(null); if (D.deg) updateDrawnMass(D.id, { pts: rotatePts(D.pts0, D.deg) }); return }
      if (D.k === 'offset') { finishDrag(); setPreview(null); setTag(null); if (D.v) updateDrawnMass(D.id, { pts: offsetPoly(D.pts0, D.v) }); return }
      if (D.k === 'core') {
        finishDrag(); setPreview(null); setTag(null)
        const m = massOf(D.id)!, d = m.drawn!
        let r = D.r; if (!r || r.w < 1 || r.d < 1) r = { x: D.a[0] - 4.5, y: D.a[1] - 4.5, w: 9, d: 9 }
        if (coreInside(d, r)) { updateDrawnMass(D.id, { core: r }); toast(`Core placed, ${fm(r.w)} × ${fm(r.d)} m`) } else toast('Keep the core inside the mass')
        return
      }
      if (D.k === 'pullTop' || D.k === 'pullSide') {
        if (!D.moved && !D.sticky) { setDrag({ ...D, sticky: true }); toast('Move the pointer, then click to set it · or type a value and press Enter · Esc cancels'); return }
        endPull(false)
      }
    }
    const endPull = (cancel: boolean) => {
      const D = live.current.drag
      finishDrag(); setPreview(null); setTag(null)
      if (!D || (D.k !== 'pullTop' && D.k !== 'pullSide') || cancel) return
      if (D.k === 'pullTop' && D.floors !== D.f0) updateDrawnMass(D.id, { floors: D.floors })
      if (D.k === 'pullSide' && D.v) updateDrawnMass(D.id, { pts: pushWall(D.pts0, D.i, D.v) })
    }
    const hoverFace = (e: PointerEvent) => {
      const hit = hitPrisms(prisms(), rayAt(e.clientX, e.clientY))
      const next = hit ? { id: hit.id, face: hit.face, wall: hit.wall } : null
      const cur = hover
      if ((cur?.id ?? null) !== (next?.id ?? null) || cur?.face !== next?.face || cur?.wall !== next?.wall) setHover(next)
    }
    // ---- Line: click corners with snapping; a typed length and angle; close on the first point or Enter
    const lineHover = (e: PointerEvent) => {
      const L = live.current, d = L.draft, z = d?.z ?? 0, p = ground(e, z); if (!p) return
      const inf = inferPoint(p, prisms(), site, L.snap, tolAt(p, z), e.altKey, d?.pts[d.pts.length - 1] ?? null)
      setGuides(inf.guides); setMarker(inf.marker ? { at: inf.marker, kind: inf.kind } : null)
      if (!d) { setTag(inf.label ? { text: inf.label, at: [inf.x, inf.y, z] } : null); return }
      const last = d.pts[d.pts.length - 1]
      let x = inf.x, y = inf.y, len = Math.hypot(x - last[0], y - last[1]), ang = (Math.atan2(y - last[1], x - last[0]) * 180) / Math.PI
      const tA = d.ang !== '' && Number.isFinite(+d.ang), tL = d.len !== '' && Number.isFinite(+d.len) && +d.len > 0
      if (tA) ang = +d.ang
      else if (e.shiftKey || inf.kind === 'grid' || inf.kind === 'free') { const step = e.shiftKey ? 90 : L.snap.angle; if (step) { const k = Math.round(ang / step) * step; if (e.shiftKey || Math.abs(ang - k) < Math.min(4, step / 2)) ang = k } }
      if (tL) len = +d.len
      if (tA || tL || e.shiftKey) { x = last[0] + len * Math.cos((ang * Math.PI) / 180); y = last[1] + len * Math.sin((ang * Math.PI) / 180) }
      const f = d.pts[0], closing = d.pts.length >= 3 && Math.hypot(x - f[0], y - f[1]) < tolAt(p, z) * 1.2
      if (closing) { x = f[0]; y = f[1] }
      const nd: Draft = { ...d, cur: [r2(x), r2(y)], closing, info: { len, ang }, guides: inf.guides, marker: inf.marker, label: inf.label }
      setDraft(nd); drawDraft(nd)
    }
    const drawDraft = (d: Draft) => {
      const L = live.current, pts = d.cur && !d.closing ? [...d.pts, d.cur] : d.pts
      const ring = L.lineMode === 'offset' ? (pts.length >= 2 ? pathPoly(pts, L.lineWidth, L.lineAlign, d.closing).pts : null) : pts.length >= 3 ? pts : null
      setPreview(ring ? { pts: ring, z: d.z } : pts.length >= 2 ? { pts, z: d.z } : null)
      if (d.cur && d.info) setTag({ text: `${d.field === 'len' && d.len !== '' ? `[${d.len}]` : fm(d.info.len)} m · ${d.field === 'ang' ? `[${d.ang || fm(d.info.ang)}]` : fm(d.info.ang)}°${d.closing ? ' · close' : ''}${d.label && !d.closing ? ` · ${d.label}` : ''}`, at: [d.cur[0], d.cur[1], d.z] })
    }
    const lineClick = (e: PointerEvent, ray: Ray3) => {
      const L = live.current, d = L.draft
      if (!d) {
        const hit = hitPrisms(prisms(), ray), z = hit && hit.face === 'top' ? hit.point[2] : 0, p = planeHit(ray, z); if (!p) return
        const inf = inferPoint(p, prisms(), site, L.snap, tolAt(p, z), e.altKey, null)
        const nd: Draft = { pts: [[r2(inf.x), r2(inf.y)]], cur: null, z, len: '', ang: '', field: 'len', closing: false, info: null, guides: [], marker: null, label: '' }
        setDraft(nd); drawDraft(nd); return
      }
      if (!d.cur) return
      if (d.closing) { finishDraft(d, true); return }
      const last = d.pts[d.pts.length - 1]
      if (Math.hypot(d.cur[0] - last[0], d.cur[1] - last[1]) < 0.25) { finishDraft(d, false); return }
      const nd: Draft = { ...d, pts: [...d.pts, d.cur], len: '', ang: '', field: 'len' }
      setDraft(nd); drawDraft(nd)
    }
    const finishDraft = (d: Draft, closed: boolean) => {
      const L = live.current
      setDraft(null); setPreview(null); setTag(null); setGuides([]); setMarker(null)
      const off = L.lineMode === 'offset'
      if (d.pts.length < (off ? 2 : 3)) { toast(off ? 'An offset line needs at least two points.' : 'A freeform shape needs at least three points.'); return }
      const made = off ? (() => { const pg = pathPoly(d.pts, L.lineWidth, L.lineAlign, closed); return addDrawnMass(pg.pts, d.z, pg.holes) })() : addDrawnMass(d.pts, d.z)
      if (!made) toast('That shape is too small to be a mass'); else { toast(`${made.name}: ${fm(area(made.drawn!.pts))} m², 6 storeys`); useDraw.setState({ tool: 'pull' }) }
    }
    // ---- Split: two clicks across a mass (snapping to its corners, middles, edges), or a floor in a side view
    const massNear = (ray: Ray3): Tower | null => {
      const hit = hitPrisms(prisms(), ray); if (hit) return massOf(hit.id)
      const q = planeHit(ray, 0); if (!q) return null
      let best: Tower | null = null, bd = tolAt(q, 0) * 1.6
      for (const t of live.current.towers) if (t.drawn) t.drawn.pts.forEach((a, i) => { const r = segDist(q, a, t.drawn!.pts[(i + 1) % t.drawn!.pts.length]); if (r.dist < bd) { bd = r.dist; best = t } })
      return best
    }
    const splitSnap = (p: Pt, pts: Pt[], z: number): Pt & { on?: string } => {
      const L = live.current, tl = Math.max(1.3, 7 * mpp([p[0], p[1], z]))
      const found: { pt: Pt; on: string }[] = []
      let bd = tl
      pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; for (const [c, on] of [[a, 'corner'], [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'mid']] as [Pt, 'corner' | 'mid'][]) { if (!L.snap[on]) continue; const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; found[0] = { pt: [c[0], c[1]], on } } } })
      if (!found[0] && L.snap.edge) pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], r = segDist(p, a, b); if (r.dist < bd) { bd = r.dist; found[0] = { pt: [r2(a[0] + (b[0] - a[0]) * r.t), r2(a[1] + (b[1] - a[1]) * r.t)], on: 'edge' } } })
      const best = found[0]
      return best ? Object.assign(best.pt, { on: best.on }) : [snapTo(p[0], L.snap), snapTo(p[1], L.snap)]
    }
    const splitDown = (e: PointerEvent, ray: Ray3) => {
      const C = live.current.cut
      if (C) {
        const m = massOf(C.id); if (!m?.drawn) { setCut(null); return }
        const hit = hitPrisms(prisms(), ray), p = hit && hit.id === m.id ? [hit.point[0], hit.point[1]] as Pt : planeHit(ray, massTop(m.drawn)); if (!p) return
        const b = splitSnap(p, m.drawn.pts, massTop(m.drawn))
        if (Math.hypot(b[0] - C.a[0], b[1] - C.a[1]) < 0.3) { toast('Click a second point further along to set the cut.'); return }
        commitSplit(m, C.a, b); return
      }
      const m = massNear(ray)
      if (!m?.drawn) { toast(sideView() ? 'Click a mass at the height where it should split.' : 'Click a mass where the cut starts: on its edge, a corner or the middle of a side.'); return }
      if (sideView()) {
        const d = m.drawn; if (d.floors < 2) { toast(`${m.name} has one floor: nothing to split. Pull it up first.`); return }
        const k = floorAt(ray, m); if (k == null) return
        const upper = { pts: d.pts, holes: d.holes, base: r2(d.base + k * d.f2f), floors: d.floors - k, f2f: d.f2f, part: d.part ?? newMassId(), name: `${m.name} upper` }
        updateDrawnMany([{ id: m.id, patch: { floors: k, part: upper.part } }], [upper])
        toast(`${m.name} split at floor ${k}: ${k} below, ${upper.floors} above. Each is its own mass now.`); return
      }
      const hit = hitPrisms(prisms(), ray), p = hit && hit.id === m.id ? [hit.point[0], hit.point[1]] as Pt : planeHit(ray, massTop(m.drawn)); if (!p) return
      setCut({ id: m.id, a: splitSnap(p, m.drawn.pts, massTop(m.drawn)), b: null })
    }
    const floorAt = (ray: Ray3, m: Tower): number | null => {
      const d = m.drawn!, c = centroid(d.pts), n = new THREE.Vector3(); camera.getWorldDirection(n); n.y = 0
      if (n.length() < 0.2) return null
      n.normalize()
      // the vertical plane through the mass centre facing the camera: where the ray crosses it, its height
      const nx = n.x, ny = -n.z, denom = nx * ray.d[0] + ny * ray.d[1]
      if (Math.abs(denom) < 1e-9) return null
      const k = (nx * (c[0] - ray.o[0]) + ny * (c[1] - ray.o[1])) / denom, z = ray.o[2] + ray.d[2] * k
      return Math.min(d.floors - 1, Math.max(1, Math.round((z - d.base) / d.f2f)))
    }
    const splitMove = (e: PointerEvent) => {
      const C = live.current.cut, ray = rayAt(e.clientX, e.clientY)
      if (!C) { const m = massNear(ray); if (!m?.drawn) { setPreview(null); setTag(null); return } const c = centroid(m.drawn.pts); if (sideView()) { const k = m.drawn.floors > 1 ? floorAt(ray, m) : null; if (k == null) { setTag(null); return } const z = m.drawn.base + k * m.drawn.f2f; setPreview({ pts: m.drawn.pts, z }); setTag({ text: `floor ${k} of ${m.drawn.floors} · ${fm(z)} m · click`, at: [c[0], c[1], z] }); return } setPreview({ pts: m.drawn.pts, z: massTop(m.drawn) + 0.05 }); setTag({ text: 'click where the cut starts', at: [c[0], c[1], massTop(m.drawn)] }); return }
      const m = massOf(C.id); if (!m?.drawn) return
      const hit = hitPrisms(prisms(), ray), p = hit && hit.id === m.id ? [hit.point[0], hit.point[1]] as Pt : planeHit(ray, massTop(m.drawn)); if (!p) return
      const b = splitSnap(p, m.drawn.pts, massTop(m.drawn)), X = chordEnds(m.drawn.pts, C.a, b)
      setCut({ ...C, b })
      setPreview(X ? { pts: X, z: massTop(m.drawn) + 0.08 } : null)
      setTag({ text: X ? `${fm(Math.hypot(X[1][0] - X[0][0], X[1][1] - X[0][1]))} m cut · click or Enter` : 'the cut misses the mass', at: [b[0], b[1], massTop(m.drawn)] })
    }
    const commitSplit = (m: Tower, a: Pt, b: Pt) => {
      const d = m.drawn!, r = splitPoly(d.pts, d.holes ?? [], a, b)
      setCut(null); setPreview(null); setTag(null)
      if (!r) { toast('The cut has to run across the mass. Draw it from one side to the other.'); return }
      const part = d.part ?? newMassId()
      updateDrawnMany([{ id: m.id, patch: { pts: r.big.pts, holes: r.big.holes, part } }], [{ pts: r.small.pts, holes: r.small.holes, base: d.base, floors: d.floors, f2f: d.f2f, part, name: `${m.name} part` }])
      toast(`${m.name} cut into ${Math.round(area(r.big.pts))} and ${Math.round(area(r.small.pts))} m² parts. It still reads as one building; push or pull either part on its own.`)
    }
    // ---- Boolean: union, subtract, intersect; each part keeps its height
    const doBool = (aId: string, bId: string) => {
      const A = massOf(aId), B = massOf(bId); if (!A?.drawn || !B?.drawn) return
      const mode = live.current.boolMode, da = A.drawn, db = B.drawn, aT = massTop(da), bT = massTop(db), stacked = da.base >= bT - 0.01 || db.base >= aT - 0.01
      if (mode === 'union') {
        if (Math.abs(da.base - db.base) < 0.01 && Math.abs(aT - bT) < 0.01) {
          const r = clip('union', asPoly(da.pts, da.holes ?? []), asPoly(db.pts, db.holes ?? []))
          if (r.length !== 1) { toast('These two masses do not touch'); return }
          updateDrawnMany([{ id: A.id, patch: { pts: r[0].pts, holes: r[0].holes } }], [], [B.id]); toast('Joined as one mass.'); return
        }
        const part = da.part ?? newMassId()
        if (!stacked) {
          const r = clip('difference', asPoly(db.pts, db.holes ?? []), asPoly(da.pts, da.holes ?? []))
          if (!r.length) { toast('The second mass sits inside the first'); return }
          updateDrawnMany([{ id: A.id, patch: { part } }, { id: B.id, patch: { pts: r[0].pts, holes: r[0].holes, part } }], r.slice(1).map((pg) => ({ pts: pg.pts, holes: pg.holes, base: db.base, floors: db.floors, f2f: db.f2f, part })))
        } else updateDrawnMany([{ id: A.id, patch: { part } }, { id: B.id, patch: { part } }])
        toast('Joined as one building. Each part keeps its own height.'); return
      }
      if (stacked) { toast('Stacked masses cannot be cut this way'); return }
      const r = clip(mode === 'subtract' ? 'difference' : 'intersection', asPoly(da.pts, da.holes ?? []), asPoly(db.pts, db.holes ?? []))
      if (!r.length) { toast(mode === 'subtract' ? 'Nothing would be left of the first mass' : 'These two masses do not overlap'); return }
      updateDrawnMany([{ id: A.id, patch: { pts: r[0].pts, holes: r[0].holes } }], r.slice(1).map((pg) => ({ pts: pg.pts, holes: pg.holes, base: da.base, floors: da.floors, f2f: da.f2f })), [B.id])
      toast(mode === 'subtract' ? 'Subtracted. The first mass keeps its height.' : 'Kept the overlap. The first mass keeps its height.')
    }
    // ---- keys: typed values, Enter, Tab, Backspace, Esc, Delete
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      const L = live.current, t = L.tool!, d = L.draft
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        if (L.drag && (L.drag.k === 'pullTop' || L.drag.k === 'pullSide')) { endPull(true); return }
        if (d) { setDraft(null); setPreview(null); setTag(null); setGuides([]); setMarker(null); return }
        if (L.cut) { setCut(null); setPreview(null); setTag(null); return }
        if (useDraw.getState().boolFirst || useDraw.getState().edge || L.typed) { useDraw.setState({ boolFirst: null, edge: null, typed: '' }); setPreview(null); return }
        useDraw.setState({ tool: null }); return
      }
      if (d && t === 'line') {
        if (/^[0-9.]$/.test(e.key) || (e.key === '-' && d.field === 'ang')) { e.preventDefault(); e.stopImmediatePropagation(); const nd = { ...d, [d.field]: d[d.field] + e.key } as Draft; setDraft(nd); return }
        if (e.key === 'Tab') { e.preventDefault(); setDraft({ ...d, field: d.field === 'len' ? 'ang' : 'len' }); return }
        if (e.key === 'Enter') { e.preventDefault(); if (d.len !== '' || d.ang !== '') { if (d.cur) { const nd: Draft = { ...d, pts: [...d.pts, d.cur], len: '', ang: '', field: 'len' }; setDraft(nd); drawDraft(nd) } } else finishDraft(d, L.lineMode === 'free' && d.pts.length >= 3); return }
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (d[d.field] !== '') setDraft({ ...d, [d.field]: d[d.field].slice(0, -1) }); else if (d.pts.length > 1) { const nd = { ...d, pts: d.pts.slice(0, -1) }; setDraft(nd); drawDraft(nd) } else { setDraft(null); setPreview(null); setTag(null) } return }
        return
      }
      if (e.key === 'Delete' && (t === 'select' || t === 'erase')) { const id = useStore.getState().selectedTower, m = massOf(id); if (m?.drawn) { updateDrawnMany([], [], partsOf(id).map((x) => x.id)); toast(`${m.name} deleted`) } return }
      // Typed values are the tool's: the app's stage keys (1, 2, 3) must not see them.
      if (/^[0-9.]$/.test(e.key) || e.key === '-') { e.preventDefault(); e.stopImmediatePropagation(); useDraw.setState({ typed: L.typed + e.key }); return }
      if (e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); useDraw.setState({ typed: L.typed.slice(0, -1) }); return }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopImmediatePropagation()
        if (t === 'split' && L.cut?.b) { const m = massOf(L.cut.id); if (m?.drawn) commitSplit(m, L.cut.a, L.cut.b); return }
        const v = typedNumber(useDraw.getState()); useDraw.setState({ typed: '' })
        if (v == null) return
        const sel = useStore.getState().selectedTower, m = massOf(sel)
        if (t === 'pull') {
          const D = L.drag
          if (D && D.k === 'pullSide') { const q = pushWall(D.pts0, D.i, v); if (area(q) < 4) { toast('That would leave nothing of the mass'); return } finishDrag(); setPreview(null); setTag(null); updateDrawnMass(D.id, { pts: q }); toast(`Wall moved ${fm(v)} m`); return }
          if (D && D.k === 'pullTop') { finishDrag(); setPreview(null); setTag(null) }
          if (!m?.drawn || v <= 0) { toast('Select a mass, then type its height in metres'); return }
          const floors = Math.max(1, Math.round(v / m.drawn.f2f)); updateDrawnMass(m.id, { floors }); toast(`Height set to ${fm(floors * m.drawn.f2f)} m, ${floors} storeys`); return
        }
        if (t === 'offset') { if (!m?.drawn) { toast('Click a mass first'); return } const q = offsetPoly(m.drawn.pts, v); if (area(q) < 4) { toast('That offset leaves nothing'); return } updateDrawnMass(m.id, { pts: q }); toast(`Outline offset by ${fm(v)} m`); return }
        if (t === 'length') { const g = useDraw.getState().edge, em = g ? massOf(g.id) : null; if (!g || !em?.drawn || v <= 0) { toast('Click a wall first'); return } updateDrawnMass(em.id, { pts: setWallLength(em.drawn.pts, g.i, v) }); useDraw.setState({ edge: null }); setPreview(null); toast(`Wall set to ${fm(v)} m`); return }
        if (t === 'copy') { const c = useDraw.getState().lastCopy, src = c ? massOf(c.id) : null, n = Math.round(v); if (!c || !src?.drawn || n < 2) { toast('Drag a copy first, then type how many'); return } const d0 = src.drawn; updateDrawnMany([], arrayCopies(d0.pts, c.dx, c.dy, n + 1).slice(1).map((pts, i) => ({ pts, holes: d0.holes?.map((h) => shiftPts(h, c.dx * (i + 2), c.dy * (i + 2))), base: d0.base, floors: d0.floors, f2f: d0.f2f, name: `${src.name} copy ${i + 2}` }))); toast(`${n} copies in a row`); return }
      }
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey, true)
    el.style.cursor = tool === 'select' ? '' : 'crosshair'
    return () => { el.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('keydown', onKey, true); release(); el.style.cursor = '' }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, present, gl, camera, get, site])

  // Alt suspends snapping for the typed value's display: the typed text shows in the tag in the accent colour.
  const tag = useDraw((s) => s.tag)
  if (!tool || present) return null
  const toV3 = (p: Pt, z: number): V3 => [p[0], p[1], z]
  const ring = (pts: Pt[], z: number): V3[] => [...pts, pts[0]].map((p) => toV3(p, z + 0.08))
  const hoverMass = hover ? towers.find((t) => t.id === hover.id) : null
  return (
    <group>
      {preview && preview.pts.length >= 2 && <Line points={preview.pts.length >= 3 ? ring(preview.pts, preview.z) : preview.pts.map((p) => toV3(p, preview.z + 0.08))} color={NEW} lineWidth={2} depthTest={false} />}
      {preview?.holes?.map((h, i) => <Line key={i} points={ring(h, preview.z)} color={NEW} lineWidth={1.5} depthTest={false} />)}
      {guides.map((g, i) => <Line key={i} points={[toV3(g.a, 0.1), toV3(g.b, 0.1)]} color={g.col} lineWidth={1} dashed dashSize={1.2} gapSize={0.8} depthTest={false} />)}
      {marker && <mesh position={[marker.at[0], marker.at[1], 0.1]}><boxGeometry args={[0.8, 0.8, 0.2]} /><meshBasicMaterial color={SNAP[marker.kind] ?? SNAP.align} depthTest={false} /></mesh>}
      {draft?.pts.map((p, i) => <mesh key={i} position={[p[0], p[1], draft.z + 0.1]}><sphereGeometry args={[i === 0 && draft.closing ? 0.9 : 0.45, 10, 8]} /><meshBasicMaterial color={ACCENT} depthTest={false} /></mesh>)}
      {hoverMass?.drawn && tool === 'pull' && !drag && hover && (hover.face === 'top'
        ? <Line points={ring(hoverMass.drawn.pts, massTop(hoverMass.drawn))} color={HOVER} lineWidth={3} depthTest={false} />
        : (() => { const d = hoverMass.drawn, a = d.pts[hover.wall], b = d.pts[(hover.wall + 1) % d.pts.length], top = massTop(d); return <Line points={[toV3(a, d.base), toV3(b, d.base), toV3(b, top), toV3(a, top), toV3(a, d.base)]} color={HOVER} lineWidth={3} depthTest={false} /> })())}
      {drag && (drag.k === 'pullTop' || drag.k === 'pullSide') && (() => { const m = towers.find((t) => t.id === drag.id); if (!m?.drawn) return null; const d = m.drawn; return drag.k === 'pullTop' ? <Line points={ring(d.pts, massTop(d))} color={OLD} lineWidth={2} depthTest={false} /> : <Line points={[toV3(d.pts[drag.i], d.base), toV3(d.pts[(drag.i + 1) % d.pts.length], d.base), toV3(d.pts[(drag.i + 1) % d.pts.length], massTop(d)), toV3(d.pts[drag.i], massTop(d)), toV3(d.pts[drag.i], d.base)]} color={OLD} lineWidth={2} depthTest={false} /> })()}
      {cut && <mesh position={[cut.a[0], cut.a[1], (towers.find((t) => t.id === cut.id)?.drawn ? massTop(towers.find((t) => t.id === cut.id)!.drawn!) : 0) + 0.1]}><sphereGeometry args={[0.6, 10, 8]} /><meshBasicMaterial color={ACCENT} depthTest={false} /></mesh>}
      {tag && (
        <Html position={[tag.at[0], tag.at[1], tag.at[2] + 0.3]} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }} transform={false}>
          <div data-testid="draw-tag" className={`-translate-y-full whitespace-nowrap rounded-md border border-line bg-panel px-2 py-0.5 text-meta shadow-sm ${typed ? 'font-semibold text-accent' : 'text-ink'}`}>{typed ? `${typed}` : tag.text}</div>
        </Html>
      )}
      {typed && !tag && <Html position={[0, 0, 0]} style={{ pointerEvents: 'none' }}><div data-testid="draw-tag" className="rounded-md border border-line bg-panel px-2 py-0.5 text-meta font-semibold text-accent">{typed} · Enter</div></Html>}
      {/* the project name keeps the component honest about where it draws */}
      <group name={`draw-tools-${project}-${drawToolDef(tool).id}`} />
    </group>
  )
}
