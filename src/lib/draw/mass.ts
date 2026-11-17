// A drawn mass is an ordinary Tower (Ruijie, 17 Nov; the design is Sinnie Choi's Toolkit build, artifact
// 1794900977-6d89, and github.com/xubynii/towerdesigntool): its outline, base, floors and floor-to-floor live in
// `drawn`, and from them the tower carries an imported-style storey stack, made here by extruding the outline into a
// closed mesh and running the same slicer as an uploaded model (engine/imported.ts), so every engine (VTC rules, FSR,
// view cones, lifts, egress, energy, boards) reads it through the imported-tower path with nothing changed. The mesh
// is kept like an uploaded one (lib/import/store.ts putMesh), so the 3D view draws it as it draws imports. `part`
// groups the masses of one building (a Boolean union of masses of different heights, a Split): they move together and
// keep each their own height. A placed core sets the core share and turns the automatic core off.
import * as THREE from 'three'
import { carryTags, hullOf, meshVolume, sliceStoreys, tagByBands, towerPatch } from '../../engine/imported'
import { withAutoCore } from '../../engine/lifts'
import type { DrawnMass, ImportedMass, Tower } from '../../engine/types'
import { putMesh } from '../import/store'
import { breakStep } from '../project/history'
import { defaultTower, useStore } from '../../store'
import { area, bbox, centroid, inPoly, netArea, prismMesh, type Pt } from './geometry'

export const MIN_MASS_AREA = 4
const r2 = (v: number) => Math.round(v * 100) / 100
let seq = 0
export const newMassId = () => `dm${Date.now().toString(36)}${(seq++).toString(36)}`

/** The cap triangles of an outline with holes, as indices into [outline, ...holes] (three's ear clipping). */
function cap(pts: Pt[], holes: Pt[][]): number[] {
  const tri = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))))
  return tri.flat()
}

export const massTop = (d: DrawnMass) => r2(d.base + d.floors * d.f2f)

/**
 * The tower a drawn mass makes: centred on its outline's centroid, the box its bounding box; the storey stack sliced
 * from the extruded outline in the tower frame (metres, z up) like an uploaded model, the use tags carried from the
 * tower's previous stack when there is one.
 */
export function towerFromDrawn(base: Tower, d: DrawnMass): Tower {
  const c = centroid(d.pts), bb = bbox(d.pts)
  const local = (r: Pt[]): Pt[] => r.map((p) => [r2(p[0] - c[0]), r2(p[1] - c[1])])
  const pts = local(d.pts), holes = (d.holes ?? []).map(local)
  const top = massTop(d)
  const mesh = prismMesh(pts, holes, d.base, top, cap)
  const data = { positions: new Float32Array(mesh.positions), indices: new Uint32Array(mesh.indices) }
  const prev = base.imported?.storeys
  let storeys = sliceStoreys(data, { f2f: d.f2f, podiumTop: 0, podiumF2F: d.f2f, top })
  storeys = prev?.length ? carryTags(storeys, prev) : tagByBands(storeys, base.bands, base.podiumUse)
  const meshId = `drawn:${base.id}`
  putMesh(meshId, { positions: data.positions, indices: data.indices, openSegments: new Float32Array(0), flippedTriangles: new Uint32Array(0), health: [], report: { objects: 1, triangles: mesh.indices.length / 3, sources: ['drawn in the Toolkit'], skipped: [], notes: [], unitNote: 'metres', northNote: 'project north' } })
  const imported: ImportedMass = {
    meshId, fileName: `${base.name}.drawn`, format: 'drawn', unit: 'm', unitSource: 'file', fileNorthDeg: 0, northSource: 'Drawn in the project frame',
    datumShift: 0, datumSource: 'Drawn at the project datum', f2f: d.f2f, podiumTop: 0, podiumF2F: d.f2f, storeys, hull: hullOf(data),
    volume: Math.round(meshVolume(data, true) ?? 0), top, health: { block: 0, warn: 0 }, source: base.imported?.source,
  }
  const t: Tower = { ...base, x: r2(c[0]), y: r2(c[1]), rotation: 0, width: r2(Math.max(1, bb.w)), depth: r2(Math.max(1, bb.d)), f2f: d.f2f, podiumHeight: 0, blocks: undefined, boxFromBlocks: undefined, ...towerPatch(imported), imported, drawn: d }
  if (d.core) { const share = Math.min(0.6, Math.max(0.05, (d.core.w * d.core.d) / Math.max(1, netArea(d.pts, d.holes ?? [])))); return { ...t, coreShare: r2(share), coreAuto: false } }
  return t
}

const app = () => useStore.getState()
const list = () => app().towers[app().project]
export const drawnOf = (id: string) => list().find((t) => t.id === id)?.drawn ?? null
export const drawnTowers = () => list().filter((t) => t.drawn)

/** A new mass from an outline (and holes), on the ground or on a roof: six floors at 3.6 m, the project's own use bands. */
export function addDrawnMass(pts: Pt[], base = 0, holes?: Pt[][], name?: string): Tower | null {
  if (area(pts) < MIN_MASS_AREA) return null
  const s = app()
  const like = defaultTower(s.project)
  const n = list().filter((t) => t.drawn).length + 1
  const d: DrawnMass = { pts: pts.map((p) => [r2(p[0]), r2(p[1])]), base: r2(base), floors: 6, f2f: 3.6, ...(holes?.length ? { holes: holes.map((h) => h.map((p): Pt => [r2(p[0]), r2(p[1])])) } : {}) }
  const id = newMassId()
  const t = withAutoCore(towerFromDrawn({ ...like, id, name: name ?? `Mass ${n}`, podiumHeight: 0 }, d), s.liftPresets, s.egressPresets)
  breakStep()
  useStore.setState({ towers: { ...s.towers, [s.project]: [...list(), t] }, selectedTower: id, placing: false, announce: `${t.name} drawn, ${d.floors} storeys` })
  breakStep()
  return t
}

/** Change a drawn mass (one undo step): the outline, base, floors, floor-to-floor, holes, core or part. */
export function updateDrawnMass(id: string, patch: Partial<DrawnMass>, opts: { step?: boolean } = {}): boolean {
  const s = app(), t = list().find((x) => x.id === id)
  if (!t?.drawn) return false
  const d: DrawnMass = { ...t.drawn, ...patch }
  if (patch.pts && area(d.pts) < MIN_MASS_AREA) return false
  if (opts.step !== false) breakStep()
  const next = withAutoCore(towerFromDrawn(t, d), s.liftPresets, s.egressPresets)
  useStore.setState({ towers: { ...s.towers, [s.project]: list().map((x) => (x.id === id ? next : x)) } })
  if (opts.step !== false) breakStep()
  return true
}

/** Several masses changed together (a move of a building's parts, a Boolean, a Split): one undo step. */
export function updateDrawnMany(changes: { id: string; patch: Partial<DrawnMass> }[], add: { pts: Pt[]; base: number; floors: number; f2f: number; holes?: Pt[][]; part?: string; name?: string }[] = [], remove: string[] = []) {
  const s = app()
  breakStep()
  let towers = list()
  for (const c of changes) {
    const t = towers.find((x) => x.id === c.id)
    if (!t?.drawn) continue
    const d = { ...t.drawn, ...c.patch }
    if (area(d.pts) < MIN_MASS_AREA) continue
    const next = withAutoCore(towerFromDrawn(t, d), s.liftPresets, s.egressPresets)
    towers = towers.map((x) => (x.id === c.id ? next : x))
  }
  for (const a of add) {
    const like = towers.find((x) => x.drawn) ?? defaultTower(s.project)
    const id = newMassId()
    const d: DrawnMass = { pts: a.pts, base: a.base, floors: a.floors, f2f: a.f2f, ...(a.holes?.length ? { holes: a.holes } : {}), ...(a.part ? { part: a.part } : {}) }
    towers = [...towers, withAutoCore(towerFromDrawn({ ...like, id, name: a.name ?? `Mass ${towers.filter((x) => x.drawn).length + 1}`, imported: undefined }, d), s.liftPresets, s.egressPresets)]
  }
  if (remove.length) towers = towers.filter((x) => !remove.includes(x.id))
  const sel = towers.some((x) => x.id === s.selectedTower) ? s.selectedTower : towers[0]?.id ?? ''
  useStore.setState({ towers: { ...s.towers, [s.project]: towers }, selectedTower: sel })
  breakStep()
}

/** The masses that move with this one: itself and the parts of its building. */
export function partsOf(id: string): Tower[] {
  const t = list().find((x) => x.id === id)
  if (!t?.drawn) return t ? [t] : []
  const part = t.drawn.part
  return part ? list().filter((x) => x.drawn && x.drawn.part === part) : [t]
}

/** Is the point inside the mass's placed core? */
export const inCore = (d: DrawnMass, x: number, y: number) => !!d.core && x >= d.core.x && x <= d.core.x + d.core.w && y >= d.core.y && y <= d.core.y + d.core.d
export const coreInside = (d: DrawnMass, core: NonNullable<DrawnMass['core']>) => [[core.x, core.y], [core.x + core.w, core.y], [core.x + core.w, core.y + core.d], [core.x, core.y + core.d]].every(([x, y]) => inPoly(x, y, d.pts))
