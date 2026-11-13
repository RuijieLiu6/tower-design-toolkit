// Drawn masses as toolkit towers (engine/drawn.ts). A drawn mass is a Tower with `drawn` (the workspace's mass record)
// and an imported-mass record built from it, so every check, drawing and export reads it as it reads an imported model.
// Its mesh (an extruded footprint) is rebuilt from `drawn` whenever it changes and is never saved: a reopened project
// gets it back from the record.
import * as THREE from 'three'
import { withAutoCore } from '../engine/lifts'
import { towerPatch } from '../engine/imported'
import { bb, drawnImported, mArea, topOf, type DrawnMass, type Pt } from '../engine/drawn'
import type { Tower, UseId } from '../engine/types'
import { useImportStore, type MeshEntry } from './import/store'
import { useStore } from '../store'

export const isDrawn = (t: Tower | undefined): t is Tower & { drawn: DrawnMass } => !!t?.drawn
const meshIdOf = (id: string) => `drawn:${id}`
const uid = () => Math.random().toString(36).slice(2, 9)

/** Every field of the tower that follows from its drawn mass (centre, size, height, storeys, core). */
function drawnFields(t: Pick<Tower, 'id' | 'bands' | 'coreShare' | 'coreAuto'>, m: DrawnMass): Partial<Tower> {
  const b = bb(m.pts), c: Pt = [+b.cx.toFixed(3), +b.cy.toFixed(3)]
  const use: UseId = t.bands[0]?.use ?? 'residential'
  const imported = drawnImported(m, c, use, meshIdOf(t.id))
  const plate = Math.max(1, mArea(m))
  const core = m.core ? { coreShare: Math.min(0.6, (m.core.w * m.core.d) / plate), coreAuto: false } : t.coreAuto === false && t.coreShare && !m.core ? { coreAuto: true } : {}
  return {
    ...towerPatch(imported), imported, drawn: m, x: c[0], y: c[1], rotation: 0, width: Math.max(1, b.w), depth: Math.max(1, b.d),
    height: +topOf(m).toFixed(3), f2f: m.f2f, podiumHeight: 0, podiumWidth: Math.max(1, b.w), podiumDepth: Math.max(1, b.d), ...core,
  }
}

/** Adds a drawn mass as a new tower and selects it (the workspace's newMass). */
export function addDrawnTower(m: DrawnMass, from?: Tower): string {
  const s = useStore.getState()
  const list = s.towers[s.project]
  const id = `d${Date.now().toString(36)}${uid().slice(0, 3)}`
  const n = list.filter((t) => t.drawn).length + 1
  const base: Tower = {
    id, name: from ? `${from.name} copy` : `Mass ${n}`, x: 0, y: 0, rotation: 0, width: 10, depth: 10, height: 10, f2f: m.f2f,
    podiumHeight: 0, podiumWidth: 10, podiumDepth: 10, podiumUse: from?.podiumUse ?? 'retail',
    bands: from ? from.bands.map((b) => ({ ...b })) : [{ use: 'residential', share: 1 }], coreShare: from?.coreShare ?? 0.25, plantEvery: 0,
    coreAuto: from?.coreAuto ?? true, skyLobbies: [], skyRoom: null, material: from?.material ?? 'concrete',
  }
  const t = withAutoCore({ ...base, ...drawnFields(base, m) } as Tower, s.liftPresets, s.egressPresets)
  useStore.setState({ towers: { ...s.towers, [s.project]: [...list, t] }, selectedTower: id, placing: false })
  return id
}

/** Writes several drawn masses at once (one undo step when wrapped in breakStep). */
export function setDrawn(patches: { id: string; m: DrawnMass }[]) {
  if (!patches.length) return
  const s = useStore.getState()
  const by = new Map(patches.map((p) => [p.id, p.m]))
  const list = s.towers[s.project].map((t) => {
    const m = by.get(t.id)
    return m ? withAutoCore({ ...t, ...drawnFields(t, m) } as Tower, s.liftPresets, s.egressPresets) : t
  })
  useStore.setState({ towers: { ...s.towers, [s.project]: list } })
}

export function removeTowers(ids: string[]) {
  const s = useStore.getState(), gone = new Set(ids)
  const list = s.towers[s.project].filter((t) => !gone.has(t.id))
  useStore.setState({ towers: { ...s.towers, [s.project]: list }, selectedTower: gone.has(s.selectedTower) ? list[0]?.id ?? '' : s.selectedTower })
}

export const cloneDrawn = (m: DrawnMass): DrawnMass => JSON.parse(JSON.stringify(m))
export const newPart = () => `p${uid()}`

// ------------------------------------------------------------------ the mesh
/** The extruded footprint as a closed mesh in the tower frame (walls of every ring, roof and floor caps). */
export function drawnMesh(m: DrawnMass, c: Pt): MeshEntry {
  const loc = (r: Pt[]) => r.map(([x, y]) => new THREE.Vector2(x - c[0], y - c[1]))
  const outer = loc(m.pts), holes = (m.holes ?? []).map(loc)
  if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse()
  holes.forEach((h) => { if (!THREE.ShapeUtils.isClockWise(h)) h.reverse() })
  const z0 = m.base, z1 = topOf(m)
  const pos: number[] = [], idx: number[] = []
  const v = (x: number, y: number, z: number) => { pos.push(x, y, z); return pos.length / 3 - 1 }
  // caps
  const tris = THREE.ShapeUtils.triangulateShape(outer, holes)
  const all = [...outer, ...holes.flat()]
  const top = all.map((p) => v(p.x, p.y, z1)), bot = all.map((p) => v(p.x, p.y, z0))
  tris.forEach(([a, b, d]) => { idx.push(top[a], top[b], top[d]); idx.push(bot[a], bot[d], bot[b]) })
  // walls
  const wall = (r: THREE.Vector2[]) => r.forEach((p, i) => {
    const q = r[(i + 1) % r.length]
    const a = v(p.x, p.y, z0), b = v(q.x, q.y, z0), d = v(q.x, q.y, z1), e = v(p.x, p.y, z1)
    idx.push(a, b, d, a, d, e)
  })
  wall(outer); holes.forEach(wall)
  return {
    positions: new Float32Array(pos), indices: new Uint32Array(idx), openSegments: new Float32Array(0), flippedTriangles: new Uint32Array(0), health: [],
    report: { objects: 1, triangles: idx.length / 3, sources: ['Drawn in the toolkit'], skipped: [], notes: [], unitNote: 'metres', northNote: 'plan north' },
  }
}

/** Keeps every drawn tower's mesh in step with its record, and its record with the tower's own position and turn. */
let watching = false
const built = new WeakMap<DrawnMass, string>()
export function watchDrawn() {
  if (watching) return
  watching = true
  const sync = () => {
    const s = useStore.getState()
    const fix: { id: string; m: DrawnMass }[] = []
    const meshes: Record<string, MeshEntry> = {}
    for (const list of Object.values(s.towers)) for (const t of list) {
      const m = t.drawn
      if (!m) continue
      // Moved or turned by the toolkit's own tools (Position fields, the move gizmo): carry the drawn outline along.
      const b = bb(m.pts), dx = t.x - b.cx, dy = t.y - b.cy, rot = t.rotation
      if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3 || Math.abs(rot) > 1e-6) {
        const a = (rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a), cx = b.cx, cy = b.cy
        const tf = (p: Pt): Pt => { const x = p[0] - cx, y = p[1] - cy; return [+(cx + dx + x * co - y * si).toFixed(3), +(cy + dy + x * si + y * co).toFixed(3)] }
        const n = cloneDrawn(m); n.pts = n.pts.map(tf); if (n.holes) n.holes = n.holes.map((h) => h.map(tf))
        if (n.core) { const k = tf([n.core.x + n.core.w / 2, n.core.y + n.core.d / 2]); n.core = { ...n.core, x: k[0] - n.core.w / 2, y: k[1] - n.core.d / 2 } }
        if (list === s.towers[s.project]) fix.push({ id: t.id, m: n })
        continue
      }
      const id = meshIdOf(t.id), key = `${t.x},${t.y}`
      if (built.get(m) === key && useImportStore.getState().meshes[id]) continue
      built.set(m, key)
      meshes[id] = drawnMesh(m, [t.x, t.y])
    }
    if (Object.keys(meshes).length) useImportStore.setState((st) => ({ meshes: { ...st.meshes, ...meshes } }))
    if (fix.length) setDrawn(fix)
  }
  sync()
  useStore.subscribe((st, prev) => { if (st.towers !== prev.towers) sync() })
}

// Development only: the store on window for browser tests.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __tdt: unknown }).__tdt = { useStore }
