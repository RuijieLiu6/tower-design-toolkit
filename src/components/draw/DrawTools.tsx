// The Tower Workspace's design tools in the toolkit's 3D view (Sinnie, 12 Nov: "properly import the design tools from the
// tower design tool to design toolkit. exactly the same"). A port of the workspace's model pointer logic: Line (with
// inference, typed length / angle, Freeform / Offset), Rectangle, Circle, Erase, Move, Copy / array, Rotate, Offset,
// Push / pull (hover face, teal old face, yellow new face, guide, dimension box, click-move-click or drag, typed value),
// Split (snapping to corners / middles / edges, the dashed line, the chord, a floor split in a side view), Boolean
// (union / subtract / intersect with polygon-clipping), Edit length, Core, Tape and Place. The plan frame is the toolkit's:
// x east, y north, z up; heights are above this scene's ground (`baseZ`). Shape tools act on drawn masses only
// (Sinnie's choice); Move, Copy, Rotate and Erase also take the toolkit's parametric towers.
import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import { area, bb, cen, chordEnds, clamp, inPoly, offsetPoly, pathPoly, rectPts, segDist, sgn, topOf, type DrawnMass, type Pt } from '../../engine/drawn'
import { towerFootprint } from '../../engine/massing'
import type { Tower } from '../../engine/types'
import { SITE } from '../../engine/vtcRules'
import { addDrawnTower, cloneDrawn, newPart, removeTowers, setDrawn, watchDrawn } from '../../lib/drawn'
import { EMPTY_OVERLAY, HINTS, hint, setTool, toast, TOOLS, useDraw, type OvDot, type OvFace, type OvLine, type ToolId, type V3 } from '../../lib/drawTools'
import { breakStep } from '../../lib/project/history'
import { useTowerPosition } from '../../lib/towerPosition'
import { useStore } from '../../store'
import { towerOf } from '../TowerGizmo'

const SNAPC: Record<string, string> = { corner: '#2e9e6b', mid: '#19a7c3', edge: '#cf4f58', align: '#7a7f85', par: '#b53bd0', dir: '#b53bd0' }
const PULLC = { hover: '#2f63e0', hoverFill: '#c7d3f6', newFace: '#f6f2a4', newLine: '#8c8640', oldFace: '#38b6c3', guide: '#3a3a3a' }
const ACC = '#5f8f72'
const n1 = (v: number) => (Math.round(v * 10) / 10).toString()
const fmS = (v: number) => String(Math.round(v * 100) / 100)
const SHAPE_ONLY: ToolId[] = ['off', 'pull', 'split', 'bool', 'len', 'core']
const ONLY_DRAWN = 'works on drawn masses: draw one with Line, Rectangle or Circle. This tower keeps its own tools (Height, Massing).'

type Ent = { t: Tower; m: DrawnMass | null }
type Inf = { x: number; y: number; kind: string; label: string; guides: { a: Pt; b: Pt; col: string; dashed: boolean }[]; marker: Pt | null; rel: { kind: string; name: string } | null }
type Draft = { pts: Pt[]; cur: Pt | null; len: string; ang: string; field: 'len' | 'ang'; y: number; info: { len: number; ang: number } | null; closing: boolean; inf: Inf | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Drag = Record<string, any> & { k: string }

const tools = () => useDraw.getState()
const project = () => useStore.getState()
const towersNow = () => project().towers[project().project]
const towerBy = (id: string) => towersNow().find((t) => t.id === id)
const massOf = (id: string) => towerBy(id)?.drawn ?? null

export default function DrawTools({ baseZ }: { baseZ: number }) {
  const { gl, camera, scene, controls } = useThree()
  const setEvents = useThree((s) => s.setEvents)
  const R = useRef({
    drag: null as Drag | null, draft: null as Draft | null, sticky: null as Drag | null, cut: null as Drag | null, boolA: null as string | null,
    edge: null as { id: string; i: number } | null, lastCopy: null as { id: string; dx: number; dy: number } | null, meas: [] as Pt[], hfKey: null as string | null, ptr: [0, 0] as [number, number],
  })
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const G = useRef<THREE.Group>(null)
  const reset = useDraw((s) => s.reset)

  useEffect(() => { watchDrawn() }, [])
  // A new tool drops what the last one was doing (the workspace's setTool).
  useEffect(() => {
    const r = R.current
    if (r.sticky) endPull(true)
    r.cut = null; r.boolA = null; r.edge = null; r.draft = null; r.meas = []; r.hfKey = null
    if (tools().tool === 'place') useStore.getState().set({ placing: true })
    if (tools().tool === 'line') hint(lineHint())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset])
  // While a design tool works, the scene's own clicks (pick the site, select or drag a tower) stay out of its way; Select
  // and Place keep them.
  const toolNow = useDraw((s) => s.tool)
  useEffect(() => { setEvents({ enabled: toolNow === 'select' || toolNow === 'place' }); return () => setEvents({ enabled: true }) }, [toolNow, setEvents])
  // Place hands over to the toolkit's own placing; when it is done the tool goes back to Select.
  useEffect(() => useStore.subscribe((s, p) => { if (p.placing && !s.placing && tools().tool === 'place') setTool('select') }), [])

  // ------------------------------------------------------------ the scene
  const el = gl.domElement
  const ndc = (e: PointerEvent | MouseEvent) => { const r = el.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1) }
  const cast = (e: PointerEvent | MouseEvent) => { ray.setFromCamera(ndc(e), camera) }
  // Everything is worked out in the frame of the group the towers sit in (G, the tools' own group): plan x, y, z up,
  // whatever turns the scene puts above it (the y-up swap, the competition site's grid turn).
  const inv = () => { const g = G.current; g?.updateWorldMatrix(true, false); return g ? g.matrixWorld.clone().invert() : new THREE.Matrix4() }
  const localRay = () => ray.ray.clone().applyMatrix4(inv())
  const ground = (e: PointerEvent | MouseEvent, h = 0): { x: number; y: number; h: number } | null => {
    cast(e)
    const p = new THREE.Vector3()
    return localRay().intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(baseZ + h)), p) ? { x: p.x, y: p.y, h } : null
  }
  type Hit = { id: string; ent: Ent; x: number; y: number; h: number; n: THREE.Vector3 }
  const hit = (e: PointerEvent | MouseEvent, only?: string): Hit | null => {
    cast(e)
    for (const h of ray.intersectObjects(scene.children, true)) {
      if (!(h.object as THREE.Mesh).isMesh || !h.object.visible) continue
      const id = towerOf(h.object)
      if (!id || (only && id !== only)) continue
      const t = towerBy(id); if (!t) continue
      const I = inv(), q = h.point.clone().applyMatrix4(I)
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(I) : new THREE.Vector3(0, 0, 1)
      return { id, ent: { t, m: t.drawn ?? null }, x: q.x, y: q.y, h: q.z - baseZ, n }
    }
    return null
  }
  const mpp = () => {
    const target = (controls as unknown as { target?: THREE.Vector3 })?.target ?? new THREE.Vector3()
    const d = camera.position.distanceTo(target), fov = ((camera as THREE.PerspectiveCamera).fov ?? 50) * Math.PI / 180
    return (2 * d * Math.tan(fov / 2)) / Math.max(1, el.clientHeight)
  }
  const elev = () => { const d = new THREE.Vector3(); camera.getWorldDirection(d); d.transformDirection(inv()); return Math.asin(clamp(-d.z, -1, 1)) }
  const sideView = () => elev() < 0.25
  const gridG = () => (tools().grid ? tools().sn.gs : 0.1)
  const snap = (v: number) => (tools().grid ? Math.round(v / tools().sn.gs) * tools().sn.gs : Math.round(v * 10) / 10)
  const tolS = () => Math.max(0.8, 9 * mpp())
  const Z = (h: number) => baseZ + h
  const orbit = (on: boolean) => { const c = controls as unknown as { enabled: boolean } | null; if (c) c.enabled = on }
  const setOv = (o: { lines?: OvLine[]; faces?: OvFace[]; dots?: OvDot[] }) => useDraw.setState({ overlay: { lines: o.lines ?? [], faces: o.faces ?? [], dots: o.dots ?? [] } })
  const clearOv = () => useDraw.setState({ overlay: EMPTY_OVERLAY, tag: null })
  const setTag = (text: string, x = 0, y = 0, h = 0) => useDraw.setState({ tag: text ? { text, at: [x, y, Z(h)] } : null })
  const showDim = (text: string | null, typing = false) => useDraw.setState({ dim: text == null ? null : { text, x: R.current.ptr[0] + 16, y: R.current.ptr[1] - 30, typing } })
  const commitStart = () => breakStep()
  // Select is the resting tool (16 Nov, Sinnie: "it should always be defaulted as select, unless i choose the push pull
  // function"): every finished edit goes back to Select; Push / pull stays on until another tool or Esc.
  const commit = (msg?: string) => { breakStep(); if (msg) toast(msg); if (tools().tool !== 'pull') setTool('select') }

  // ------------------------------------------------------------ inference (the workspace's inferPoint)
  const sceneEdges = () => {
    const out: { a: Pt; b: Pt; name: string; y: number }[] = []
    const add = (ring: Pt[], name: string, y: number) => ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05) out.push({ a, b, name, y }) })
    const s = project()
    if (s.project === 'city' && s.citySite?.ring.length) add(s.citySite.ring as Pt[], 'the site boundary', 0.1)
    if (s.project === 'vtc') add(rectPts(0, 0, SITE.width, SITE.depth), 'the site boundary', 0.1)
    towersNow().forEach((t) => add(t.drawn ? t.drawn.pts : (towerFootprint(t) as Pt[]), t.name, t.height))
    return out
  }
  const inferPoint = (raw: Pt, opt: { from?: Pt | null; alt?: boolean } = {}): Inf => {
    const sn = tools().sn, q = raw, tl = tolS() * 1.2, ES = sceneEdges()
    const inf: Inf = { x: raw[0], y: raw[1], kind: 'free', label: '', guides: [], marker: null, rel: null }
    if (opt.alt) { inf.x = Math.round(raw[0] * 10) / 10; inf.y = Math.round(raw[1] * 10) / 10; return inf }
    let best: { pt: Pt; k: string; e: (typeof ES)[number] } | null = null, bd = tl
    ES.forEach((e) => ([[e.a, 'corner'], [e.b, 'corner'], [[(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], 'mid']] as [Pt, 'corner' | 'mid'][]).forEach(([pt, k]) => {
      if (!sn[k]) return
      const d = Math.hypot(pt[0] - q[0], pt[1] - q[1]) + (k === 'mid' ? 0.15 : 0)
      if (d < bd) { bd = d; best = { pt, k, e } }
    }))
    if (best) { const b = best as { pt: Pt; k: string; e: (typeof ES)[number] }; inf.x = b.pt[0]; inf.y = b.pt[1]; inf.kind = b.k; inf.label = (b.k === 'corner' ? 'Endpoint · ' : 'Midpoint · ') + b.e.name; inf.marker = [inf.x, inf.y] }
    else {
      let be: { e: (typeof ES)[number]; t: number } | null = null; bd = tl
      if (sn.edge) ES.forEach((e) => { const r = segDist(q, e.a, e.b); if (r[0] < bd) { bd = r[0]; be = { e, t: r[1] } } })
      if (be) {
        const { e, t } = be as { e: (typeof ES)[number]; t: number }
        inf.x = +(e.a[0] + (e.b[0] - e.a[0]) * t).toFixed(2); inf.y = +(e.a[1] + (e.b[1] - e.a[1]) * t).toFixed(2); inf.kind = 'edge'; inf.label = 'On edge · ' + e.name; inf.marker = [inf.x, inf.y]
        inf.guides.push({ a: e.a, b: e.b, col: SNAPC.edge, dashed: false })
      } else {
        let ax: { pt: Pt; e: (typeof ES)[number] } | null = null, ay: { pt: Pt; e: (typeof ES)[number] } | null = null, dx = tl, dy = tl
        if (sn.align) ES.forEach((e) => [e.a, e.b].forEach((pt) => { const ddx = Math.abs(pt[0] - q[0]), ddy = Math.abs(pt[1] - q[1]); if (ddx < dx && ddy > tl) { dx = ddx; ax = { pt, e } } if (ddy < dy && ddx > tl) { dy = ddy; ay = { pt, e } } }))
        const AX = ax as { pt: Pt; e: (typeof ES)[number] } | null, AY = ay as { pt: Pt; e: (typeof ES)[number] } | null
        inf.x = AX ? AX.pt[0] : Math.round(raw[0] / gridG()) * gridG(); inf.y = AY ? AY.pt[1] : Math.round(raw[1] / gridG()) * gridG()
        if (AX) inf.guides.push({ a: AX.pt, b: [inf.x, inf.y], col: SNAPC.align, dashed: true })
        if (AY) inf.guides.push({ a: AY.pt, b: [inf.x, inf.y], col: SNAPC.align, dashed: true })
        if (AX || AY) { inf.kind = 'align'; inf.label = 'In line with ' + (AX && AY && AX.e.name !== AY.e.name ? AX.e.name + ' and ' + AY.e.name : (AX || AY)!.e.name); inf.marker = [inf.x, inf.y] } else inf.kind = 'grid'
      }
    }
    if (opt.from && sn.dir) {
      const f = opt.from, loose = inf.kind === 'free' || inf.kind === 'grid', dx = (loose ? raw[0] : inf.x) - f[0], dy = (loose ? raw[1] : inf.y) - f[1], len = Math.hypot(dx, dy)
      if (len > 0.5) {
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI
        let bestE: (typeof ES)[number] | null = null, bdev = loose ? 3 : 0.6, rel = ''
        ES.forEach((e) => {
          const ea = (Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180) / Math.PI
          let d = Math.abs((((ang - ea) % 180) + 180) % 180); d = Math.min(d, 180 - d); const dp = Math.abs(d - 90)
          if (d < bdev - 1e-6) { bdev = d; bestE = e; rel = 'parallel' } else if (dp < bdev - 1e-6) { bdev = dp; bestE = e; rel = 'perpendicular' }
        })
        if (bestE) {
          const E = bestE as (typeof ES)[number]
          const ea = Math.atan2(E.b[1] - E.a[1], E.b[0] - E.a[0]), ta = rel === 'parallel' ? ea : ea + Math.PI / 2, u: Pt = [Math.cos(ta), Math.sin(ta)]
          if (loose) { const k = Math.round((dx * u[0] + dy * u[1]) / gridG()) * gridG(); inf.x = +(f[0] + u[0] * k).toFixed(2); inf.y = +(f[1] + u[1] * k).toFixed(2); inf.kind = 'dir'; inf.marker = null }
          inf.rel = { kind: rel, name: E.name }; inf.label = (inf.label ? inf.label + ' · ' : '') + (rel === 'parallel' ? 'Parallel to ' : 'Perpendicular to ') + E.name
          const G = Math.max(14, 40 * mpp())
          inf.guides.push({ a: [inf.x - u[0] * G, inf.y - u[1] * G], b: [inf.x + u[0] * G, inf.y + u[1] * G], col: SNAPC.par, dashed: true }, { a: E.a, b: E.b, col: SNAPC.par, dashed: false })
        }
      }
    }
    return inf
  }
  const guideOv = (inf: Inf | null, h: number): { lines: OvLine[]; dots: OvDot[] } => {
    if (!inf) return { lines: [], dots: [] }
    const lines = inf.guides.map((g) => ({ pts: [[g.a[0], g.a[1], Z(h)], [g.b[0], g.b[1], Z(h)]] as V3[], col: g.col, dashed: g.dashed, order: 8 }))
    const dots = inf.marker ? [{ p: [inf.marker[0], inf.marker[1], Z(h) + 0.05] as V3, col: SNAPC[inf.kind] ?? SNAPC.align, px: 10, kind: (inf.kind === 'mid' ? 'sphere' : inf.kind === 'edge' || inf.kind === 'align' ? 'wire' : 'box') as OvDot['kind'] }] : []
    return { lines, dots }
  }

  // ------------------------------------------------------------ Line (the workspace's draft)
  const snapAngle = (a: number, lock: boolean) => { const step = lock ? 90 : tools().sn.angle; if (!step) return a; const k = Math.round(a / step) * step; return lock || Math.abs(a - k) < Math.min(4, step / 2) ? k : a }
  const lineHint = () => {
    const d = R.current.draft, off = tools().line.mode === 'offset'
    return '<b>Line</b> ' + (d ? d.pts.length + ' point' + (d.pts.length > 1 ? 's' : '') + ' · type a length, Tab for the angle, Enter to place it · Shift locks 90° · Alt turns snapping off · Backspace removes the last point · Esc cancels'
      : off ? 'Click points along the line · it becomes a ' + fmS(tools().line.width) + ' m deep building · double-click or Enter to finish · click the first point to close a loop · start on a roof to stack'
        : 'Click the corners of the footprint · click the first point (or press Enter) to close the shape · start on a roof to stack')
  }
  const draftCursor = (raw: Pt, shift: boolean, alt: boolean) => {
    const d = R.current.draft!, last = d.pts.length ? d.pts[d.pts.length - 1] : null
    const tA = d.ang !== '' && isFinite(+d.ang), tL = d.len !== '' && isFinite(+d.len) && +d.len > 0
    const inf = inferPoint(raw, { from: last, alt }); d.inf = inf
    let x = inf.x, y = inf.y
    if (last) {
      const [px, py] = last, loose = inf.kind === 'grid' || inf.kind === 'free', a0 = (Math.atan2(y - py, x - px) * 180) / Math.PI   // anticlockwise from east
      let ang = a0, len = Math.hypot(x - px, y - py)
      if (tA) ang = +d.ang; else if (shift || loose) ang = snapAngle(ang, shift)
      if (tL) len = +d.len; else if (!tA && loose && ang === Math.round(ang)) len = Math.round(len / gridG()) * gridG()
      if (tA || tL || Math.abs(ang - a0) > 1e-6) { x = px + len * Math.cos((ang * Math.PI) / 180); y = py + len * Math.sin((ang * Math.PI) / 180); if (tA || tL || shift) d.inf = null }
      d.info = { len, ang }
    }
    const f = d.pts[0]
    d.closing = d.pts.length >= 3 && Math.hypot(x - f[0], y - f[1]) < tolS() * 1.2
    if (d.closing) { x = f[0]; y = f[1] }
    d.cur = [x, y]
  }
  const applyDraftTyped = () => {
    const d = R.current.draft; if (!d || !d.pts.length) return
    const q = d.pts[d.pts.length - 1], b = d.info ?? { len: 0, ang: 0 }
    const len = d.len !== '' && isFinite(+d.len) ? +d.len : b.len, ang = d.ang !== '' && isFinite(+d.ang) ? +d.ang : b.ang
    d.cur = [q[0] + len * Math.cos((ang * Math.PI) / 180), q[1] + len * Math.sin((ang * Math.PI) / 180)]; d.info = { len, ang }; d.closing = false
  }
  const drawDraft = () => {
    const d = R.current.draft
    if (!d) { clearOv(); return }
    const pts = d.cur && !d.closing ? d.pts.concat([d.cur]) : d.pts.slice(), h = d.y + 0.12, off = tools().line.mode === 'offset', L = tools().line
    const ring = off ? (pts.length >= 2 ? pathPoly(pts, L.width, L.align, d.closing).pts : null) : pts.length >= 3 ? pts : null
    const faces: OvFace[] = [], lines: OvLine[] = [], dots: OvDot[] = []
    if (ring) { faces.push({ ring: ring.map((q) => [q[0], q[1], Z(h - 0.02)] as V3), col: ACC, op: 0.22 }); lines.push({ pts: ring.concat([ring[0]]).map((q) => [q[0], q[1], Z(h)] as V3), col: ACC }) }
    if (pts.length > 1) lines.push({ pts: (d.closing && pts.length > 2 ? pts.concat([pts[0]]) : pts).map((q) => [q[0], q[1], Z(h + 0.01)] as V3), col: ACC, order: 7 })
    pts.forEach((q, i) => dots.push({ p: [q[0], q[1], Z(h)], col: ACC, px: i === 0 && d.closing ? 14 : 7, kind: 'sphere' }))
    const g = d.cur && !d.closing ? guideOv(d.inf, h) : { lines: [], dots: [] }
    setOv({ faces, lines: [...lines, ...g.lines], dots: [...dots, ...g.dots] })
    if (d.cur) {
      const f = d.info
      const t = f ? (d.field === 'len' && d.len !== '' ? '[' + d.len + ']' : fmS(f.len)) + ' m · ' + (d.field === 'ang' ? '[' + (d.ang || fmS(f.ang)) + ']' : fmS(f.ang)) + '°' + (d.closing ? ' · close' : '') : 'Click to start'
      setTag(t + (d.inf && d.inf.label && !d.closing ? ' · ' + d.inf.label : ''), d.cur[0], d.cur[1], h)
    }
    hint(lineHint())
  }
  const hoverSnap = (p: Pt, alt: boolean) => { const inf = inferPoint(p, { alt }); setOv(guideOv(inf, 0.12)); setTag(inf.label, inf.x, inf.y, 0.12) }
  const startDraft = (p: Pt, y0: number, alt: boolean) => {
    R.current.draft = { pts: [], cur: null, len: '', ang: '', field: 'len', y: y0, info: null, closing: false, inf: null }
    draftCursor(p, false, alt); const d = R.current.draft!; d.pts.push(d.cur!.slice() as Pt); d.len = ''; drawDraft()
  }
  const draftClick = () => {
    const d = R.current.draft; if (!d || !d.cur) return
    if (d.closing) { finishDraft(true); return }
    const last = d.pts[d.pts.length - 1]
    if (Math.hypot(d.cur[0] - last[0], d.cur[1] - last[1]) < 0.25) { finishDraft(false); return }   // a second click on the same spot ends the line
    d.pts.push(d.cur.slice() as Pt); d.len = ''; d.ang = ''; d.field = 'len'; drawDraft()
  }
  const cancelDraft = () => { if (!R.current.draft) return; R.current.draft = null; drawDraft() }
  const finishDraft = (closed: boolean) => {
    const d = R.current.draft; if (!d) return
    R.current.draft = null; drawDraft()
    const pts = d.pts.map((q) => [+q[0].toFixed(2), +q[1].toFixed(2)] as Pt), L = tools().line, off = L.mode === 'offset'
    if (pts.length < (off ? 2 : 3)) { toast(off ? 'An offset line needs at least two points.' : 'A freeform shape needs at least three points.'); hint(lineHint()); return }
    if (off) { const pg = pathPoly(pts, L.width, L.align, closed); newMass(pg.pts, d.y, pg.holes) } else newMass(pts, d.y)
  }
  const newMass = (pts: Pt[], base: number, holes?: Pt[][]) => {
    if (area(pts) < 4) { toast('That shape is too small to be a mass'); return }
    commitStart()
    addDrawnTower({ pts, base: base || 0, floors: 6, f2f: 3.6, ...(holes && holes.length ? { holes } : {}) })
    commit()
  }
  const startBase = (e: PointerEvent) => { const h = hit(e); return h && h.ent.m && h.n.z > 0.9 ? Math.round(h.h * 10) / 10 : 0 }

  // ------------------------------------------------------------ overlays for Push / pull and Split
  const ovTop = (m: DrawnMass, h: number, st: { fill: string; op: number; line: string; order: number }, out: { faces: OvFace[]; lines: OvLine[] }) => {
    out.faces.push({ ring: m.pts.map((q) => [q[0], q[1], Z(h + 0.04)] as V3), holes: m.holes?.map((r) => r.map((q) => [q[0], q[1], Z(h + 0.04)] as V3)), col: st.fill, op: st.op, order: st.order })
    out.lines.push({ pts: m.pts.concat([m.pts[0]]).map((q) => [q[0], q[1], Z(h + 0.05)] as V3), col: st.line, order: st.order + 1 })
  }
  const ovSide = (a: Pt, b: Pt, h0: number, h1: number, st: { fill: string; op: number; line: string; order: number }, out: { faces: OvFace[]; lines: OvLine[] }) => {
    out.faces.push({ ring: [[a[0], a[1], Z(h0)], [b[0], b[1], Z(h0)], [b[0], b[1], Z(h1)], [a[0], a[1], Z(h1)]], col: st.fill, op: st.op, order: st.order })
    out.lines.push({ pts: [[a[0], a[1], Z(h0)], [b[0], b[1], Z(h0)], [b[0], b[1], Z(h1)], [a[0], a[1], Z(h1)], [a[0], a[1], Z(h0)]], col: st.line, order: st.order + 1 })
  }
  const roofBand = (m: DrawnMass) => Math.min(Math.max(1.2, 4 * mpp()), (m.floors * m.f2f) / 4)
  const edgeAt = (m: DrawnMass, h: Hit) => {
    let bi = 0, bs = -9
    const s = sgn(m.pts), n = h.n
    m.pts.forEach((a, i) => {
      const b = m.pts[(i + 1) % m.pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1, d = (ey / l) * s * n.x - (ex / l) * s * n.y
      const tt = clamp(((h.x - a[0]) * ex + (h.y - a[1]) * ey) / (l * l), 0, 1), dist = Math.hypot(h.x - a[0] - ex * tt, h.y - a[1] - ey * tt)
      if (d - dist > bs) { bs = d - dist; bi = i }
    })
    return bi
  }
  const faceAtPull = (e: PointerEvent) => {
    const h = hit(e); if (!h || !h.ent.m) return null
    const m = h.ent.m, top = topOf(m)
    if (h.n.z > 0.5 || Math.abs(h.h - top) < roofBand(m)) return { id: h.id, m, top: true as const }
    if (h.n.z < -0.5) return null
    return { id: h.id, m, top: false as const, i: edgeAt(m, h) }
  }
  const drawHoverFace = (e: PointerEvent) => {
    const F = faceAtPull(e), key = F ? F.id + ':' + (F.top ? 't' : F.i) : ''
    if (key === R.current.hfKey) return
    R.current.hfKey = key
    if (!F) { clearOv(); return }
    const st = { fill: PULLC.hoverFill, op: 0.45, line: PULLC.hover, order: 10 }, out = { faces: [] as OvFace[], lines: [] as OvLine[] }, m = F.m, top = topOf(m)
    if (F.top) ovTop(m, top, st, out); else ovSide(m.pts[F.i], m.pts[(F.i + 1) % m.pts.length], m.base, top, st, out)
    setOv(out)
  }
  const showPull = (d: Drag) => {
    R.current.hfKey = null
    const m = massOf(d.id); if (!m) return
    const OLD = { fill: PULLC.oldFace, op: 0.42, line: PULLC.oldFace, order: 10 }, NEW = { fill: PULLC.newFace, op: 0.85, line: PULLC.newLine, order: 12 }
    const out = { faces: [] as OvFace[], lines: [] as OvLine[] }
    let v: number, a: V3, n: V3
    if (d.k === 'pullTop') { const y0 = m.base + d.f0 * m.f2f, y1 = topOf(m), c = cen(m.pts); v = y1 - y0; ovTop(m, y0, OLD, out); ovTop(m, y1, NEW, out); a = [c[0], c[1], y0]; n = [0, 0, 1] }
    else {
      const k = d.pts0.length, a0 = d.pts0[d.i], b0 = d.pts0[(d.i + 1) % k], a1 = m.pts[d.i], b1 = m.pts[(d.i + 1) % k], y0 = m.base, y1 = topOf(m)
      v = (a1[0] - a0[0]) * d.nx + (a1[1] - a0[1]) * d.ny; ovSide(a0, b0, y0, y1, OLD, out); ovSide(a1, b1, y0, y1, NEW, out)
      a = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2, (y0 + y1) / 2]; n = [d.nx, d.ny, 0]
    }
    const lo = Math.min(0, v) - 3, hi = Math.max(0, v) + 3
    out.lines.push({ pts: [[a[0] + n[0] * lo, a[1] + n[1] * lo, Z(a[2] + n[2] * lo)], [a[0] + n[0] * hi, a[1] + n[1] * hi, Z(a[2] + n[2] * hi)]], col: PULLC.guide, order: 14 })
    setOv(out)
    const typed = tools().typed
    showDim(typed ? typed : (v > 0 ? '+' : '') + (Math.round(v * 100) / 100).toFixed(2) + ' m' + (d.k === 'pullTop' ? ' · ' + m.floors + ' storeys' : ''), !!typed)
  }
  const endPull = (cancel: boolean) => {
    const d = R.current.sticky; R.current.sticky = null; R.current.hfKey = null; clearOv(); showDim(null)
    if (!d) return
    if (cancel) { const m = massOf(d.id); if (m) setDrawn([{ id: d.id, m: { ...m, ...(d.k === 'pullTop' ? { floors: d.f0 } : { pts: d.pts0 }) } }]); return }
    if (d.moved) commit()
  }

  // ------------------------------------------------------------ Split
  const splitSnap = (p: Pt, m: DrawnMass): Pt & { on?: string } => {
    const sn = tools().sn, ring = m.pts, tl = Math.max(1.3, 7 * mpp())
    let best: { pt: Pt; on: string } | null = null, bd = tl
    ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length]; ([[a, 'corner'], [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'mid']] as [Pt, 'corner' | 'mid'][]).forEach(([pt, k]) => { if (!sn[k]) return; const d = Math.hypot(pt[0] - p[0], pt[1] - p[1]); if (d < bd) { bd = d; best = { pt: pt.slice() as Pt, on: k } } }) })
    if (!best && sn.edge) ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length], r = segDist(p, a, b)
      if (r[0] < bd) {
        bd = r[0]; let px = a[0] + (b[0] - a[0]) * r[1], py = a[1] + (b[1] - a[1]) * r[1]
        if (Math.abs(a[0] - b[0]) < 1e-6) py = clamp(Math.round(py / gridG()) * gridG(), Math.min(a[1], b[1]), Math.max(a[1], b[1]))
        if (Math.abs(a[1] - b[1]) < 1e-6) px = clamp(Math.round(px / gridG()) * gridG(), Math.min(a[0], b[0]), Math.max(a[0], b[0]))
        best = { pt: [+px.toFixed(2), +py.toFixed(2)], on: 'edge' }
      }
    })
    const B = best as { pt: Pt; on: string } | null
    return B ? Object.assign(B.pt, { on: B.on }) : [Math.round(p[0] / gridG()) * gridG(), Math.round(p[1] / gridG()) * gridG()]
  }
  const splitPt = (e: PointerEvent, id: string, m: DrawnMass) => { const h = hit(e, id); if (h) return { x: h.x, y: h.y, h: h.h }; const q = ground(e, topOf(m)); return q ? { x: q.x, y: q.y, h: q.h } : null }
  const massNear = (e: PointerEvent): { id: string; m: DrawnMass } | null => {
    const h = hit(e); if (h && h.ent.m) return { id: h.id, m: h.ent.m }
    const q = ground(e, 0); if (!q) return null
    let best: { id: string; m: DrawnMass } | null = null, bd = tolS() * 1.6
    towersNow().forEach((t) => { const m = t.drawn; if (!m) return; m.pts.forEach((a, i) => { const r = segDist([q.x, q.y], a, m.pts[(i + 1) % m.pts.length]); if (r[0] < bd) { bd = r[0]; best = { id: t.id, m } } }) })
    return best
  }
  const floorAt = (e: PointerEvent, m: DrawnMass) => {
    const c = cen(m.pts), n = new THREE.Vector3(), p = new THREE.Vector3(); cast(e); camera.getWorldDirection(n); n.transformDirection(inv()); n.z = 0
    if (n.length() < 0.2) return null
    n.normalize()
    return localRay().intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(c[0], c[1], 0)), p) ? clamp(Math.round((p.z - baseZ - m.base) / m.f2f), 1, m.floors - 1) : null
  }
  const ringLine = (ring: Pt[], h: number, col: string, dashed = false): OvLine => ({ pts: ring.concat([ring[0]]).map((q) => [q[0], q[1], Z(h)] as V3), col, dashed })
  const dot = (x: number, y: number, h: number): OvDot => ({ p: [x, y, Z(h)], col: ACC, px: 8, kind: 'sphere' })
  const drawSplit = () => {
    const A = R.current.cut, m = A && massOf(A.id); if (!A || !m) { clearOv(); return }
    const y = topOf(m) + 0.08, on = (q: { on?: string }) => (q.on === 'corner' ? 'on the corner' : q.on === 'mid' ? 'on the middle of the edge' : q.on === 'edge' ? 'on the edge' : '')
    const lines: OvLine[] = [], dots: OvDot[] = [dot(A.a[0], A.a[1], y)]
    if (!A.b) { lines.push(ringLine(m.pts, y, ACC, true)); setOv({ lines, dots }); setTag((on(A.a) ? on(A.a) + ' · ' : '') + 'click the other end of the cut', A.a[0], A.a[1], y); return }
    const B = bb(m.pts), Rr = Math.hypot(B.w, B.d) + 2, L = Math.hypot(A.b[0] - A.a[0], A.b[1] - A.a[1]) || 1, ux = (A.b[0] - A.a[0]) / L, uy = (A.b[1] - A.a[1]) / L, t = (B.cx - A.a[0]) * ux + (B.cy - A.a[1]) * uy
    lines.push({ pts: [[A.a[0] + ux * (t - Rr), A.a[1] + uy * (t - Rr), Z(y)], [A.a[0] + ux * (t + Rr), A.a[1] + uy * (t + Rr), Z(y)]], col: ACC, dashed: true }); dots.push(dot(A.b[0], A.b[1], y))
    const X = chordEnds(m.pts, A.a, A.b)
    if (X) { lines.push({ pts: [[X[0][0], X[0][1], Z(y)], [X[1][0], X[1][1], Z(y)]], col: ACC }); X.forEach((q) => lines.push({ pts: [[q[0], q[1], Z(m.base)], [q[0], q[1], Z(y)]], col: ACC })) }
    setOv({ lines, dots })
    const ax = Math.abs(A.b[1] - A.a[1]) < 1e-6 ? ' E–W' : Math.abs(A.b[0] - A.a[0]) < 1e-6 ? ' N–S' : ''
    setTag(X ? (on(A.b) ? on(A.b) + ' · ' : '') + fmS(Math.hypot(X[1][0] - X[0][0], X[1][1] - X[0][1])) + ' m line' + ax + ' on the surface · click or Enter' : 'the cut misses the mass', A.b[0], A.b[1], y)
  }
  const splitMove = (e: PointerEvent) => {
    const A = R.current.cut
    if (!A) {
      const M = massNear(e); if (!M) { clearOv(); return }
      const m = M.m, top = topOf(m), c = cen(m.pts)
      if (sideView()) { const k = m.floors > 1 ? floorAt(e, m) : null; if (k == null) { clearOv(); return } const y = m.base + k * m.f2f; setOv({ lines: [ringLine(m.pts, y, ACC)] }); setTag('floor ' + k + ' of ' + m.floors + ' · ' + fmS(y) + ' m · a line round the mass · click', c[0], c[1], y); return }
      setOv({ lines: [ringLine(m.pts, top + 0.05, ACC, true)] }); setTag('click where the cut starts', c[0], c[1], top); return
    }
    const m = massOf(A.id); if (!m) return
    const q = splitPt(e, A.id, m); if (!q) return
    A.b = splitSnap([q.x, q.y], m); drawSplit()
  }
  const fpOf = (m: DrawnMass) => [m.pts.concat([m.pts[0]]), ...(m.holes ?? []).map((h) => h.concat([h[0]]))]
  const openRing = (r: number[][]) => r.slice(0, -1).map((q) => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100] as Pt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pclip = (op: 'union' | 'difference' | 'intersection', A: any, B: any): Pt[][][] => { try { return (polygonClipping[op](A, B) as number[][][][]).map((pg) => pg.map(openRing)).filter((pg) => area(pg[0]) > 1) } catch { return [] } }
  const setFp = (m: DrawnMass, pg: Pt[][]): DrawnMass => {
    const n = { ...m, pts: pg[0] } as DrawnMass
    if (pg.length > 1) n.holes = pg.slice(1); else delete n.holes
    if (n.core && !inPoly(n.core.x + n.core.w / 2, n.core.y + n.core.d / 2, n.pts)) delete n.core
    return n
  }
  const commitSplit = () => {
    const A = R.current.cut, t = A && towerBy(A.id), m = t?.drawn; if (!A || !t || !m) return
    const done = (msg: string) => { R.current.cut = null; clearOv(); commit(msg) }
    if (A.side) {
      const k = A.fl as number, up: DrawnMass = { ...cloneDrawn(m), base: +(m.base + k * m.f2f).toFixed(3), floors: m.floors - k }
      delete up.part; delete up.seams; delete up.core
      commitStart(); setDrawn([{ id: t.id, m: { ...m, floors: k } }])
      const nid = addDrawnTower(up, t); useStore.getState().updateTower(nid, { name: t.name + ' upper' })
      done(t.name + ' split at floor ' + k + ': ' + k + ' floors below, ' + up.floors + ' above. Each is its own mass now; push or pull either.'); return
    }
    if (!A.b) return
    const X = chordEnds(m.pts, A.a, A.b), miss = 'The cut has to run across the mass. Draw it from one side to the other.'
    if (!X) { toast(miss); return }
    const L = Math.hypot(X[1][0] - X[0][0], X[1][1] - X[0][1]), ux = (X[1][0] - X[0][0]) / L, uy = (X[1][1] - X[0][1]) / L, Bg = 1e4
    const half = (k: number) => [[[X[0][0] - ux * Bg, X[0][1] - uy * Bg], [X[0][0] + ux * Bg, X[0][1] + uy * Bg], [X[0][0] + ux * Bg - uy * Bg * k, X[0][1] + uy * Bg + ux * Bg * k], [X[0][0] - ux * Bg - uy * Bg * k, X[0][1] - uy * Bg + ux * Bg * k]]]
    const Pa = pclip('intersection', fpOf(m), half(1)), Pb = pclip('intersection', fpOf(m), half(-1))
    if (Pa.length !== 1 || Pb.length !== 1) { toast(miss); return }
    const d0 = Math.hypot(X[0][0] - A.a[0], X[0][1] - A.a[1]), d1 = Math.hypot(X[1][0] - A.a[0], X[1][1] - A.a[1])
    const seam = { a: X[0], b: X[1], on: (A.h != null && A.h < topOf(m) - 0.3 ? 'side' : 'top') as 'side' | 'top', keep: d0 <= d1 ? X[0] : X[1] }
    const big = area(Pa[0][0]) >= area(Pb[0][0]) ? [Pa[0], Pb[0]] : [Pb[0], Pa[0]], part = m.part ?? newPart()
    const keep = { ...setFp({ ...m, part }, big[0]), seams: [...(m.seams ?? []), seam] }
    const other: DrawnMass = { ...setFp({ ...cloneDrawn(m), part }, big[1]), seams: [...(m.seams ?? []), seam] }; delete other.core
    commitStart(); setDrawn([{ id: t.id, m: keep }]); const nid = addDrawnTower(other, t); useStore.getState().updateTower(nid, { name: t.name })
    useStore.getState().selectTower(t.id)
    done(t.name + ' cut into ' + Math.round(area(big[0][0])) + ' and ' + Math.round(area(big[1][0])) + ' m² parts. Push or pull either part on its own; they move together.')
  }
  const splitDown = (e: PointerEvent) => {
    const A = R.current.cut
    if (A) {
      const m = massOf(A.id), pt = m && splitPt(e, A.id, m); if (!m || !pt) return
      const b = splitSnap([pt.x, pt.y], m)
      if (Math.hypot(b[0] - A.a[0], b[1] - A.a[1]) < 0.3) { toast('Click a second point further along to set the cut.'); return }
      A.b = b; commitSplit(); return
    }
    const M = massNear(e)
    if (!M) { const h = hit(e); toast(h ? 'Split ' + ONLY_DRAWN : sideView() ? 'Click a mass at the height where it should split.' : 'Click a mass where the cut starts: on its edge, a corner or the middle of a side.'); return }
    const t = towerBy(M.id)!, m = M.m
    if (sideView()) { if (m.floors < 2) { toast(t.name + ' has one floor: nothing to split. Pull it up first.'); return } const k = floorAt(e, m); if (k == null) return; R.current.cut = { k: 'side', side: true, id: M.id, fl: k }; commitSplit(); return }
    const pt = splitPt(e, M.id, m); if (!pt) return
    R.current.cut = { k: 'cut', side: false, id: M.id, a: splitSnap([pt.x, pt.y], m), b: null, h: pt.h }; drawSplit()
  }

  // ------------------------------------------------------------ Boolean
  const doBool = (aId: string, bId: string) => {
    const At = towerBy(aId), Bt = towerBy(bId), A = At?.drawn, B = Bt?.drawn; if (!At || !Bt || !A || !B) return
    const mode = tools().bmode, aT = topOf(A), bT = topOf(B), stacked = A.base >= bT - 0.01 || B.base >= aT - 0.01
    if (mode === 'union') {
      commitStart()
      if (Math.abs(A.base - B.base) < 0.01 && Math.abs(aT - bT) < 0.01) {
        const r = pclip('union', fpOf(A), fpOf(B)); if (r.length !== 1) { toast('These two masses do not touch'); return }
        setDrawn([{ id: aId, m: setFp(A, r[0]) }]); removeTowers([bId])
      } else {
        const part = A.part ?? newPart(), patches: { id: string; m: DrawnMass }[] = [{ id: aId, m: { ...A, part } }]
        if (!stacked) {
          const r = pclip('difference', fpOf(B), fpOf(A)); if (!r.length) { toast('The second mass sits inside the first'); return }
          patches.push({ id: bId, m: { ...setFp(B, r[0]), part } })
          r.slice(1).forEach((pg) => { const nid = addDrawnTower({ ...setFp(cloneDrawn(B), pg), part }, Bt); useStore.getState().updateTower(nid, { name: At.name }) })
        }
        towersNow().forEach((t) => { if (t.drawn && t.id !== aId && (t.id === bId || (B.part && t.drawn.part === B.part)) && !patches.some((p) => p.id === t.id)) patches.push({ id: t.id, m: { ...t.drawn, part } }) })
        if (stacked) patches.push({ id: bId, m: { ...B, part } })
        setDrawn(patches); useStore.getState().updateTower(bId, { name: At.name })
      }
      useStore.getState().selectTower(aId); commit('Joined as one building. Each part keeps its own height.'); return
    }
    if (stacked) { toast('Stacked masses cannot be cut this way'); return }
    const r = pclip(mode === 'subtract' ? 'difference' : 'intersection', fpOf(A), fpOf(B))
    if (!r.length) { toast(mode === 'subtract' ? 'Nothing would be left of the first mass' : 'These two masses do not overlap'); return }
    commitStart(); setDrawn([{ id: aId, m: setFp(A, r[0]) }]); r.slice(1).forEach((pg) => addDrawnTower(setFp(cloneDrawn(A), pg), At)); removeTowers([bId])
    useStore.getState().selectTower(aId); commit(mode === 'subtract' ? 'Subtracted. The first mass keeps its height.' : 'Kept the overlap. The first mass keeps its height.')
  }

  // ------------------------------------------------------------ typed values
  const hintTyped = () => { const t = tools(); hint(HINTS[t.tool] + (t.typed ? ' · <b>' + t.typed + '</b> then Enter' : '')); if (R.current.sticky) showPull(R.current.sticky) }
  const applyTyped = () => {
    const v = parseFloat(tools().typed); useDraw.setState({ typed: '' })
    if (!(v === v)) { hintTyped(); return }
    const tool = tools().tool, sel = useStore.getState().selectedTower, m = massOf(sel)
    if (tool === 'pull') {
      const d = R.current.sticky
      if (d && d.k === 'pullSide') {
        const k = d.pts0.length, q: Pt[] = d.pts0.map((r: Pt) => r.slice() as Pt);[d.i, (d.i + 1) % k].forEach((j: number) => { q[j][0] += d.nx * v; q[j][1] += d.ny * v })
        if (area(q) < 4) { toast('That would leave nothing of the mass'); return }
        const cur = massOf(d.id)!; setDrawn([{ id: d.id, m: { ...cur, pts: q } }]); d.moved = true; endPull(false); toast('Wall moved ' + v + ' m'); return
      }
      const target = d ? massOf(d.id) : m, tid = d ? d.id : sel
      if (d) { R.current.sticky = null; clearOv(); showDim(null) }
      if (!target || v <= 0) { toast('Select a mass, then type its height in metres'); return }
      const floors = Math.max(1, Math.round(v / target.f2f)); commitStart(); setDrawn([{ id: tid, m: { ...target, floors } }]); commit('Height set to ' + n1(floors * target.f2f) + ' m, ' + floors + ' storeys')
    } else if (tool === 'off') {
      if (!m) { toast('Click a mass first'); return }
      const q = offsetPoly(m.pts, v); if (area(q) < 4) { toast('That offset leaves nothing'); return }
      commitStart(); setDrawn([{ id: sel, m: { ...m, pts: q } }]); commit('Outline offset by ' + v + ' m')
    } else if (tool === 'len') {
      const g = R.current.edge, em = g && massOf(g.id); if (!g || !em || v <= 0) { toast('Click a wall first'); return }
      const pts = em.pts.map((q) => q.slice() as Pt), n = pts.length, a = pts[g.i], b = pts[(g.i + 1) % n], c = pts[(g.i + 2) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const dx = ((b[0] - a[0]) / l) * (v - l), dy = ((b[1] - a[1]) / l) * (v - l)
      b[0] += dx; b[1] += dy; if (n > 3) { c[0] += dx; c[1] += dy }
      R.current.edge = null; clearOv(); commitStart(); setDrawn([{ id: g.id, m: { ...em, pts } }]); commit('Wall set to ' + v + ' m')
    } else if (tool === 'copy') {
      const c = R.current.lastCopy, src = c && towerBy(c.id), n = Math.round(v)
      if (!c || !src || n < 2) { toast('Drag a copy first, then type how many'); return }
      commitStart()
      for (let i = 1; i < n; i++) copyTower(src, c.dx * i, c.dy * i)
      commit(n + ' copies in a row')
    }
  }
  const shiftMass = (m: DrawnMass, dx: number, dy: number): DrawnMass => {
    const n = cloneDrawn(m); n.pts = n.pts.map((q) => [+(q[0] + dx).toFixed(3), +(q[1] + dy).toFixed(3)])
    if (n.holes) n.holes = n.holes.map((h) => h.map((q) => [+(q[0] + dx).toFixed(3), +(q[1] + dy).toFixed(3)]))
    if (n.core) n.core = { ...n.core, x: n.core.x + dx, y: n.core.y + dy }
    if (n.seams) n.seams = n.seams.map((s) => ({ ...s, a: [s.a[0] + dx, s.a[1] + dy], b: [s.b[0] + dx, s.b[1] + dy], keep: [s.keep[0] + dx, s.keep[1] + dy] }))
    return n
  }
  const copyTower = (src: Tower, dx: number, dy: number): string => {
    if (src.drawn) { const c = shiftMass(src.drawn, dx, dy); delete c.part; delete c.seams; return addDrawnTower(c, src) }
    const s = useStore.getState(), id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const t: Tower = { ...JSON.parse(JSON.stringify(src)), id, name: src.name + ' copy', x: src.x + dx, y: src.y + dy }
    useStore.setState({ towers: { ...s.towers, [s.project]: [...s.towers[s.project], t] }, selectedTower: id })
    return id
  }

  // ------------------------------------------------------------ pointer and keys
  useEffect(() => {
    const r = R.current
    const down = (e: PointerEvent) => {
      let t = tools().tool
      if (useStore.getState().phase === 'present') return
      // Select, Mass: a press on a mass picks it and a drag moves it (as Move); empty space orbits. Face is the
      // block editor's (components/MassingEdit3D.tsx) for box towers and Push / pull for drawn masses.
      if (t === 'select') {
        if (e.button !== 0 || e.ctrlKey || e.metaKey) return
        const sh = hit(e)
        if (!sh) return
        if (tools().selMode === 'mass') t = 'move'
        else if (sh.ent.m) t = 'pull'
        else return
      }
      if (r.sticky) { e.stopImmediatePropagation(); endPull(false); return }   // the second click of a picked-up face sets it
      if (e.button !== 0) return
      const sx = e.clientX, sy = e.clientY
      if (t === 'rect' || t === 'circle') { const b = startBase(e), p = ground(e, b); if (p) { orbit(false); r.drag = { k: t, b, x0: snap(p.x), y0: snap(p.y), pts: [] } } return }
      if (t === 'line' || t === 'measure' || t === 'place') { r.drag = { k: 'click', x: sx, y: sy }; return }
      if (t === 'split') { splitDown(e); return }
      const h = hit(e)
      if (!h) return   // empty space: the view orbits as usual
      const { ent } = h
      if (SHAPE_ONLY.includes(t) && !ent.m) { toast(toolName(t) + ' ' + ONLY_DRAWN); return }
      orbit(false)
      if (t === 'erase') { commitStart(); removeTowers([h.id]); commit('Deleted'); r.drag = { k: 'none' }; return }
      if (t === 'copy') {
        const p0 = ground(e, 0); if (!p0) return
        commitStart(); const nid = copyTower(ent.t, 0, 0); const c = towerBy(nid)!
        r.drag = { k: 'move', id: nid, p0, grp: [{ id: nid, m: c.drawn ? cloneDrawn(c.drawn) : null, x: c.x, y: c.y }], moved: true, copy: true, mx: 0, my: 0 }; return
      }
      if (t === 'bool') {
        const A = r.boolA && towerBy(r.boolA)
        if (!A || A.id === h.id) { r.boolA = h.id; useStore.getState().selectTower(h.id); hint('<b>Boolean</b> ' + ent.t.name + ' is the first mass. Now click the second'); r.drag = { k: 'none' }; return }
        r.boolA = null; doBool(A.id, h.id); r.drag = { k: 'none' }; return
      }
      const m = ent.m
      if (t === 'core' && m) {
        const y = Math.round(h.h * 10) / 10, q = ground(e, y); if (!q) return
        const c = m.core
        if (c && q.x >= c.x && q.x <= c.x + c.w && q.y >= c.y && q.y <= c.y + c.d) { const n = { ...m }; delete n.core; commitStart(); setDrawn([{ id: h.id, m: n }]); commit('Core removed'); r.drag = { k: 'none' }; return }
        useStore.getState().selectTower(h.id); r.drag = { k: 'core', id: h.id, y, a: [Math.round(q.x * 2) / 2, Math.round(q.y * 2) / 2], r: null }; return
      }
      if (t === 'off' && m) { useStore.getState().selectTower(h.id); commitStart(); r.drag = { k: 'off', id: h.id, x: sx, pts0: m.pts.map((q) => q.slice()) }; return }
      if (t === 'len' && m) {
        if (Math.abs(h.n.z) > 0.5) { toast('Click a wall of a mass'); return }
        const i = edgeAt(m, h), a2 = m.pts[i], b2 = m.pts[(i + 1) % m.pts.length]
        r.edge = { id: h.id, i }; useStore.getState().selectTower(h.id)
        setOv({ lines: [{ pts: [[a2[0], a2[1], Z(Math.round(h.h))], [b2[0], b2[1], Z(Math.round(h.h))]], col: ACC }] })
        hint('<b>Edit length</b> This wall is ' + n1(Math.hypot(b2[0] - a2[0], b2[1] - a2[1])) + ' m. Type the new length and press Enter'); r.drag = { k: 'none' }; return
      }
      useStore.getState().selectTower(h.id)
      if (t === 'pull' && m) {
        commitStart()
        if (Math.abs(h.n.z) > 0.5 || Math.abs(h.h - topOf(m)) < roofBand(m)) r.drag = { k: 'pullTop', id: h.id, y: sy, f0: m.floors }
        else {
          let bi = -1, bs = -2; const s = sgn(m.pts)
          m.pts.forEach((a, i) => {
            const b = m.pts[(i + 1) % m.pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1, nx = (ey / l) * s, ny = (-ex / l) * s, d = nx * h.n.x + ny * h.n.y
            const tt = clamp(((h.x - a[0]) * ex + (h.y - a[1]) * ey) / (l * l), 0, 1), dist = Math.hypot(h.x - a[0] - ex * tt, h.y - a[1] - ey * tt)
            if (d - dist > bs) { bs = d - dist; bi = i }
          })
          const hn = new THREE.Vector2(h.n.x, h.n.y).normalize()
          r.drag = { k: 'pullSide', id: h.id, i: bi, nx: hn.x, ny: hn.y, p0: { x: h.x, y: h.y, h: h.h }, pts0: m.pts.map((p) => p.slice()) }
        }
        showPull(r.drag); return
      }
      if (t === 'rotate') { commitStart(); r.drag = m ? { k: 'rot', id: h.id, x: sx, pts0: m.pts.map((p) => p.slice()), m0: cloneDrawn(m) } : { k: 'rotT', id: h.id, x: sx, r0: ent.t.rotation }; return }
      // Move: the mass and the other parts of its building
      const p = ground(e, 0); if (!p) return
      commitStart()
      const grp = towersNow().filter((q) => q.id === h.id || (m?.part && q.drawn?.part === m.part)).map((q) => ({ id: q.id, m: q.drawn ? cloneDrawn(q.drawn) : null, x: q.x, y: q.y }))
      r.drag = { k: 'move', id: h.id, p0: p, grp, moved: false, mx: 0, my: 0 }
    }
    const move = (e: PointerEvent) => {
      const t = tools().tool
      { const rc = el.getBoundingClientRect(); r.ptr = [e.clientX - rc.left, e.clientY - rc.top] }
      if (t === 'select' && !r.drag && !r.sticky) return
      if (t === 'line' && (!r.drag || r.drag.k === 'click')) { const y0 = r.draft ? r.draft.y : 0, p = ground(e, y0); if (p) { if (r.draft) { draftCursor([p.x, p.y], e.shiftKey, e.altKey); drawDraft() } else hoverSnap([p.x, p.y], e.altKey) } }
      if (!r.drag && !r.sticky) { if (t === 'pull') drawHoverFace(e); else if (t === 'split') splitMove(e) }
      const d = r.drag ?? r.sticky; if (!d) return
      const m = d.id ? massOf(d.id) : null
      if (d.k === 'rect') { const p = ground(e, d.b); if (!p) return; const x = snap(p.x), y = snap(p.y); d.pts = [[d.x0, d.y0], [x, d.y0], [x, y], [d.x0, y]]; setOv({ lines: [ringLine(d.pts, d.b + 0.12, ACC)] }); hint('<b>Rectangle</b> ' + fmS(Math.abs(x - d.x0)) + ' × ' + fmS(Math.abs(y - d.y0)) + ' m') }
      else if (d.k === 'circle') { const p = ground(e, d.b); if (!p) return; const rr = Math.max(1, Math.round(Math.hypot(p.x - d.x0, p.y - d.y0))); d.pts = []; for (let i = 0; i < 28; i++) d.pts.push([d.x0 + rr * Math.cos((i / 28) * 6.2832), d.y0 + rr * Math.sin((i / 28) * 6.2832)]); setOv({ lines: [ringLine(d.pts, d.b + 0.12, ACC)] }); hint('<b>Circle</b> radius ' + rr + ' m') }
      else if (d.k === 'move') {
        const p = ground(e, 0); if (!p) return
        const mx = snap(p.x - d.p0.x), my = snap(p.y - d.p0.y); if (!mx && !my && !d.moved) return
        d.moved = true; d.mx = mx; d.my = my
        const patches: { id: string; m: DrawnMass }[] = [], others: { id: string; x: number; y: number }[] = []
        d.grp.forEach((q: { id: string; m: DrawnMass | null; x: number; y: number }) => { if (q.m) patches.push({ id: q.id, m: shiftMass(q.m, mx, my) }); else others.push({ id: q.id, x: q.x + mx, y: q.y + my }) })
        setDrawn(patches); others.forEach((o) => useStore.getState().updateTower(o.id, { x: o.x, y: o.y }))
      }
      else if (d.k === 'core' && m) { const q = ground(e, d.y); if (!q) return; const x = Math.round(q.x * 2) / 2, y = Math.round(q.y * 2) / 2; d.r = { x: Math.min(d.a[0], x), y: Math.min(d.a[1], y), w: Math.abs(x - d.a[0]), d: Math.abs(y - d.a[1]) }; setOv({ lines: [ringLine(rectPts(d.r.x + d.r.w / 2, d.r.y + d.r.d / 2, d.r.w, d.r.d), d.y + 0.12, ACC)] }); hint('<b>Core</b> ' + d.r.w + ' × ' + d.r.d + ' m') }
      else if (d.k === 'off' && m) { const v = Math.round((e.clientX - d.x) * mpp() * 2) / 2, q = offsetPoly(d.pts0, v); if (area(q) > 4) { setDrawn([{ id: d.id, m: { ...m, pts: q } }]); d.moved = true; hint('<b>Offset</b> ' + (v > 0 ? '+' : '') + v + ' m') } }
      else if (d.k === 'pullTop' && m) {
        const f = Math.max(1, d.f0 + Math.round((-(e.clientY - d.y) * mpp()) / Math.max(0.25, Math.cos(elev())) / m.f2f))
        if (f !== m.floors) { setDrawn([{ id: d.id, m: { ...m, floors: f } }]); d.moved = true; hint('<b>Push / pull</b> ' + f + ' storeys · ' + n1(f * m.f2f) + ' m') }
        showPull(d)
      }
      else if (d.k === 'pullSide' && m) {
        const p = ground(e, d.p0.h); if (!p) return
        const dl = snap((p.x - d.p0.x) * d.nx + (p.y - d.p0.y) * d.ny), n = d.pts0.length, pts: Pt[] = d.pts0.map((q: Pt) => q.slice() as Pt)
        ;[d.i, (d.i + 1) % n].forEach((j: number) => { pts[j][0] += d.nx * dl; pts[j][1] += d.ny * dl })
        if (area(pts) > 4) { setDrawn([{ id: d.id, m: { ...m, pts } }]); d.moved = true; hint('<b>Push / pull</b> ' + (dl > 0 ? '+' : '') + fmS(dl) + ' m') }
        showPull(d)
      }
      else if (d.k === 'rot' && m) {
        const a = (Math.round(((e.clientX - d.x) * 0.5) / 5) * 5 * Math.PI) / 180, c = cen(d.pts0), co = Math.cos(a), si = Math.sin(a)
        const tf = (q: Pt): Pt => [+(c[0] + (q[0] - c[0]) * co - (q[1] - c[1]) * si).toFixed(3), +(c[1] + (q[0] - c[0]) * si + (q[1] - c[1]) * co).toFixed(3)]
        const n = cloneDrawn(d.m0); n.pts = d.pts0.map(tf); if (n.holes) n.holes = n.holes.map((hh) => hh.map(tf)); delete n.core
        setDrawn([{ id: d.id, m: n }]); d.moved = true
      }
      else if (d.k === 'rotT') { const deg = Math.round(((e.clientX - d.x) * 0.5) / 5) * 5; useStore.getState().updateTower(d.id, { rotation: ((d.r0 + deg) % 360 + 360) % 360 }); d.moved = true }
    }
    const up = (e: PointerEvent) => {
      const d = r.drag; r.drag = null; orbit(true)
      if (!d) return
      if (d.k === 'rect' || d.k === 'circle') { clearOv(); if (d.pts.length) newMass(d.pts, d.b); return }
      if (d.k === 'core') {
        clearOv(); const m = massOf(d.id); if (!m) return
        let c = d.r; if (!c || c.w < 1 || c.d < 1) c = { x: d.a[0] - 4.5, y: d.a[1] - 4.5, w: 9, d: 9 }
        if (rectPts(c.x + c.w / 2, c.y + c.d / 2, c.w, c.d).every((q) => inPoly(q[0], q[1], m.pts))) { commitStart(); setDrawn([{ id: d.id, m: { ...m, core: c } }]); commit('Core placed, ' + c.w + ' × ' + c.d + ' m') } else toast('Keep the core inside the mass')
        return
      }
      if (d.copy) r.lastCopy = { id: d.id, dx: d.mx, dy: d.my }
      if (d.k === 'click') {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return
        const tool = tools().tool
        if (tool === 'line') { const y0 = r.draft ? r.draft.y : startBase(e), p = ground(e, y0); if (!p) return; if (!r.draft) startDraft([p.x, p.y], y0, e.altKey); else { draftCursor([p.x, p.y], e.shiftKey, e.altKey); draftClick() } return }
        if (tool === 'measure') {
          const p = ground(e, 0); if (!p) return
          if (r.meas.length >= 2) r.meas = []
          r.meas.push([p.x, p.y])
          setOv({ lines: r.meas.length > 1 ? [{ pts: r.meas.map((q) => [q[0], q[1], Z(0.12)] as V3), col: ACC }] : [], dots: r.meas.map((q) => dot(q[0], q[1], 0.12)) })
          if (r.meas.length === 2) hint('<b>Measure</b> ' + n1(Math.hypot(r.meas[1][0] - r.meas[0][0], r.meas[1][1] - r.meas[0][1])) + ' m')
          return
        }
        return
      }
      if (d.k === 'pullTop' || d.k === 'pullSide') {
        if (!d.moved && !d.sticky) { d.sticky = true; r.sticky = d; hint('<b>Push / pull</b> Move the pointer, then click to set it · or type a value and press Enter · Esc cancels'); return }
        clearOv(); showDim(null); r.hfKey = null
      }
      if (d.moved) commit()
    }
    const dbl = () => { if (r.draft) finishDraft(false) }
    el.addEventListener('pointerdown', down, { capture: true })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('dblclick', dbl)
    return () => { el.removeEventListener('pointerdown', down, { capture: true }); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.removeEventListener('dblclick', dbl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, camera, scene, controls, baseZ])

  useEffect(() => {
    const r = R.current
    const onKey = (e: KeyboardEvent) => {
      const tg = (e.target as HTMLElement)?.tagName, typing = tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT'
      if (typing || useStore.getState().phase === 'present') return
      const tool = tools().tool
      if (e.key === 'Escape') { r.meas = []; if (r.sticky) endPull(true); if (tool !== 'select') setTool('select'); return }
      const d = r.draft
      if (d) {   // while drafting a line: typed length / angle, Tab, Enter, Backspace
        const k = e.key
        if (/^[0-9.]$/.test(k) || (k === '-' && d.field === 'ang')) { e.preventDefault(); d[d.field] += k; applyDraftTyped(); drawDraft(); return }
        if (k === 'Tab') { e.preventDefault(); d.field = d.field === 'len' ? 'ang' : 'len'; drawDraft(); return }
        if (k === 'Enter') { e.preventDefault(); if (d.len !== '' || d.ang !== '') draftClick(); else finishDraft(tools().line.mode === 'free' && d.pts.length >= 3); return }
        if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); if (d[d.field] !== '') { d[d.field] = d[d.field].slice(0, -1); applyDraftTyped() } else if (d.pts.length > 1) d.pts.pop(); else { cancelDraft(); hint(lineHint()); return } drawDraft(); return }
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const typed = tools().typed
      if (e.key === 'Backspace' && typed) { useDraw.setState({ typed: typed.slice(0, -1) }); hintTyped(); return }
      // Delete / Backspace removes the selected mass with any tool, Select included (16 Nov, Sinnie: "i should be able
      // to select and delete the mass with delete button"); only from the 3D view (or nothing focused), so a key in a
      // panel, list or the workflow canvas keeps its own meaning. One Undo step.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const at = e.target as HTMLElement | null
        if (at && at !== document.body && !at.closest?.('[data-viewport]')) return
        const sel = useStore.getState().selectedTower
        if (sel) { e.preventDefault(); commitStart(); removeTowers([sel]); commit('Deleted') }
        return
      }
      if (['pull', 'off', 'len', 'copy'].includes(tool)) {
        if (/^[0-9.-]$/.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); useDraw.setState({ typed: typed + e.key }); hintTyped(); return }
        if (e.key === 'Enter' && typed) { applyTyped(); return }
      }
      if (e.key === 'Enter' && tool === 'split' && r.cut && r.cut.b) { commitSplit(); return }
      if (e.key.toLowerCase() === 'f' && e.shiftKey) { useTowerPosition.setState((s) => ({ frame: s.frame + 1 })); return }
      const t = TOOLS.find((q) => q && q.key && q.key.toLowerCase() === e.key.toLowerCase())
      if (t && !typed && !r.sticky) setTool(t.id)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseZ])

  return <group ref={G}><Overlays /></group>
}

const toolName = (t: ToolId) => (TOOLS.find((q) => q && q.id === t) as { label: string } | undefined)?.label.split(':')[0] ?? 'This tool'

/** The tools' drawings over the model (the workspace's T.dg) and the words by the cursor (#dtag). */
function Overlays() {
  const ov = useDraw((s) => s.overlay)
  const tag = useDraw((s) => s.tag)
  const { camera, size } = useThree()
  const px = (p: V3) => { const d = camera.position.distanceTo(new THREE.Vector3(...p)), fov = ((camera as THREE.PerspectiveCamera).fov ?? 50) * Math.PI / 180; return (2 * d * Math.tan(fov / 2)) / Math.max(1, size.height) }
  const faces = useMemo(() => ov.faces.map((f) => {
    const flat = f.ring.every((q) => Math.abs(q[2] - f.ring[0][2]) < 1e-3)
    const g = new THREE.BufferGeometry()
    if (flat) {
      const shape = f.ring.map((q) => new THREE.Vector2(q[0], q[1])), holes = (f.holes ?? []).map((h) => h.map((q) => new THREE.Vector2(q[0], q[1])))
      const tris = THREE.ShapeUtils.triangulateShape(shape, holes), all = [...f.ring, ...(f.holes ?? []).flat()]
      g.setAttribute('position', new THREE.Float32BufferAttribute(all.flat(), 3)); g.setIndex(tris.flat())
    } else { g.setAttribute('position', new THREE.Float32BufferAttribute(f.ring.flat(), 3)); g.setIndex([0, 1, 2, 0, 2, 3]) }
    return { g, f }
  }), [ov.faces])
  return (
    <group>
      {faces.map(({ g, f }, i) => (
        <mesh key={`f${i}`} geometry={g} renderOrder={f.order ?? 10}>
          <meshBasicMaterial color={f.col} transparent opacity={f.op} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {ov.lines.map((l, i) => {
        const s = px(l.pts[0])
        return <Line key={`l${i}`} points={l.pts} color={l.col} lineWidth={1.5} dashed={!!l.dashed} dashSize={6 * s} gapSize={4 * s} depthTest={false} transparent renderOrder={l.order ?? 12} />
      })}
      {ov.dots.map((d, i) => {
        const s = px(d.p) * d.px
        return (
          <mesh key={`d${i}`} position={d.p} renderOrder={13}>
            {d.kind === 'sphere' ? <sphereGeometry args={[s * 0.55, 10, 8]} /> : <boxGeometry args={[s, s, s * 0.3]} />}
            <meshBasicMaterial color={d.col} depthTest={false} transparent wireframe={d.kind === 'wire'} />
          </mesh>
        )
      })}
      {tag && (
        <Html position={tag.at} style={{ pointerEvents: 'none' }} zIndexRange={[30, 20]}>
          <div className="whitespace-nowrap rounded-md border border-line bg-panel/95 px-1.5 py-0.5 text-meta text-ink shadow-sm" style={{ transform: 'translate(12px, -28px)' }}>{tag.text}</div>
        </Html>
      )}
    </group>
  )
}
