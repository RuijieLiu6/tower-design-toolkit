// A drawn mass is an ordinary Tower (Ruijie, 17 Nov; the design is Sinnie Choi's Toolkit build, artifact
// 1794900977-6d89, and github.com/xubynii/towerdesigntool): its outline, base, floors and floor-to-floor live in
// `drawn`, and from them the tower carries an imported-style storey stack, made here by extruding the outline into a
// closed mesh and running the same slicer as an uploaded model (engine/imported.ts), so every engine (VTC rules, FSR,
// view cones, lifts, egress, energy, boards) reads it through the imported-tower path with nothing changed. The mesh
// is kept like an uploaded one (lib/import/store.ts putMesh), so the 3D view draws it as it draws imports. `part`
// groups the masses of one building (a Boolean union of masses of different heights, a Split): they move together and
// keep each their own height. A placed core sets the core share and turns the automatic core off.
import { carryTags, hullOf, meshVolume, sliceStoreys, tagByBands, towerPatch } from '../../engine/imported'
import { withAutoCore } from '../../engine/lifts'
import type { DrawnMass, ImportedMass, Tower } from '../../engine/types'
import { putMesh, useImportStore } from '../import/store'
import { breakStep } from '../project/history'
import { defaultTower, useStore } from '../../store'
import { area, bbox, inPoly, netArea, type Pt } from './geometry'
import { MIN_MASS_AREA } from './boolean'
import { drawnLocal, drawnMesh, drawnMeshId, drawnTop } from './drawnMesh'

export { MIN_MASS_AREA }
const r2 = (v: number) => Math.round(v * 100) / 100
let seq = 0
export const newMassId = () => `dm${Date.now().toString(36)}${(seq++).toString(36)}`

export const massTop = drawnTop

/**
 * The tower a drawn mass makes: centred on its outline's centroid, the box its bounding box; the storey stack sliced
 * from the extruded outline in the tower frame (metres, z up) like an uploaded model, the use tags carried from the
 * tower's previous stack when there is one.
 */
export function towerFromDrawn(base: Tower, d: DrawnMass): Tower {
  const { c } = drawnLocal(d), bb = bbox(d.pts)
  const top = massTop(d)
  // One mesh per shape (lib/draw/drawnMesh.ts): an edit makes a new one and Undo finds the old one still there.
  const meshId = drawnMeshId(d)
  const entry = useImportStore.getState().meshes[meshId] ?? drawnMesh(d)
  if (!useImportStore.getState().meshes[meshId]) putMesh(meshId, entry)
  const data = { positions: entry.positions, indices: entry.indices }
  const prev = base.imported?.storeys
  // A mass on a roof starts at its base: sliced from there (no empty storeys up from the ground), then put back.
  const lowered = { positions: data.positions.map((v, i) => (i % 3 === 2 ? v - d.base : v)), indices: data.indices }
  let storeys = sliceStoreys(lowered, { f2f: d.f2f, podiumTop: 0, podiumF2F: d.f2f, top: top - d.base }).map((s) => ({ ...s, z0: r2(s.z0 + d.base), z1: r2(s.z1 + d.base) }))
  storeys = prev?.length ? carryTags(storeys, prev) : tagByBands(storeys, base.bands, base.podiumUse)
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
export function updateDrawnMany(changes: { id: string; patch: Partial<DrawnMass> }[], add: { pts: Pt[]; base: number; floors: number; f2f: number; holes?: Pt[][]; part?: string; name?: string; /** The mass this one is made from (a copy, a split part, a cut piece): its settings come along. */ from?: string }[] = [], remove: string[] = []) {
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
    // Made from its source mass (uses, presets), never from the first mass drawn; what is the source's alone is cleared.
    const like = (a.from && towers.find((x) => x.id === a.from)) || towers.find((x) => x.drawn) || defaultTower(s.project)
    const id = newMassId()
    const d: DrawnMass = { pts: a.pts, base: a.base, floors: a.floors, f2f: a.f2f, ...(a.holes?.length ? { holes: a.holes } : {}), ...(a.part ? { part: a.part } : {}) }
    towers = [...towers, withAutoCore(towerFromDrawn({ ...like, id, name: a.name ?? `Mass ${towers.filter((x) => x.drawn).length + 1}`, imported: undefined, basement: undefined, interior: undefined, form: undefined, coreAuto: true }, d), s.liftPresets, s.egressPresets)]
  }
  if (remove.length) towers = towers.filter((x) => !remove.includes(x.id))
  towers = oneCorePerBuilding(towers, s.liftPresets, s.egressPresets)
  const sel = towers.some((x) => x.id === s.selectedTower) ? s.selectedTower : towers[0]?.id ?? ''
  useStore.setState({ towers: { ...s.towers, [s.project]: towers }, selectedTower: sel })
  breakStep()
}

/**
 * One core per building: the parts of a split or joined building share one core (the part with a placed core, else
 * the largest), the others carry none, so lifts, egress and the core share are not counted once per part.
 */
export function oneCorePerBuilding(towers: Tower[], lifts = app().liftPresets, egress = app().egressPresets): Tower[] {
  const groups = new Map<string, Tower[]>()
  for (const t of towers) if (t.drawn?.part) groups.set(t.drawn.part, [...(groups.get(t.drawn.part) ?? []), t])
  const out = new Map<string, Tower>()
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const keeper = g.find((t) => t.drawn!.core) ?? g.reduce((m, t) => (netArea(t.drawn!.pts, t.drawn!.holes ?? []) > netArea(m.drawn!.pts, m.drawn!.holes ?? []) ? t : m))
    for (const t of g) {
      if (t === keeper) { if (!t.drawn!.core && !t.coreAuto && t.coreShare === 0) out.set(t.id, withAutoCore({ ...t, coreAuto: true }, lifts, egress)) }
      else if (t.coreShare !== 0 || t.coreAuto) out.set(t.id, { ...t, coreShare: 0, coreAuto: false })
    }
  }
  return out.size ? towers.map((t) => out.get(t.id) ?? t) : towers
}

/** The outline, holes and core moved by one mapping of the plane (the core stays axis-aligned: its centre moves, its size stays). */
export function transformDrawn(d: DrawnMass, f: (p: Pt) => Pt): Partial<DrawnMass> {
  const core = d.core ? (() => { const [x, y] = f([d.core.x + d.core.w / 2, d.core.y + d.core.d / 2]); return { ...d.core, x: r2(x - d.core.w / 2), y: r2(y - d.core.d / 2) } })() : undefined
  return { pts: d.pts.map(f), ...(d.holes ? { holes: d.holes.map((h) => h.map(f)) } : {}), ...(d.core ? { core } : {}) }
}
/** Turned by `deg` about a point, holes and core with it. */
export function rotateDrawn(d: DrawnMass, deg: number, about: Pt): Partial<DrawnMass> {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return transformDrawn(d, (p) => [r2(about[0] + (p[0] - about[0]) * c - (p[1] - about[1]) * s), r2(about[1] + (p[0] - about[0]) * s + (p[1] - about[1]) * c)])
}
/** Moved by (dx, dy), holes and core with it. */
export const shiftDrawn = (d: DrawnMass, dx: number, dy: number): Partial<DrawnMass> => transformDrawn(d, (p) => [r2(p[0] + dx), r2(p[1] + dy)])
/** Would this new outline cut into one of the mass's holes (an inward offset past a courtyard)? */
export const crossesHole = (d: DrawnMass, pts: Pt[]) => (d.holes ?? []).some((h) => h.some((p) => !inPoly(p[0], p[1], pts)))

/**
 * A drawn mass moved or turned by the tower tools (Place, Align to lot, the gizmo, the toolbar's x, y and angle:
 * lib/towerEdit.ts): the outline goes with it, the parts of its building too, one undo step. Rotation is about the
 * mass's own centre; a drawn tower keeps rotation 0, its outline carries the turn.
 */
export function moveDrawn(id: string, dx: number, dy: number, dDeg: number): boolean {
  const t = list().find((x) => x.id === id)
  if (!t?.drawn) return false
  const about: Pt = [t.x, t.y]
  updateDrawnMany(partsOf(id).map((p) => {
    const turned = dDeg ? { ...p.drawn!, ...rotateDrawn(p.drawn!, dDeg, about) } : p.drawn!
    return { id: p.id, patch: dx || dy ? shiftDrawn(turned, dx, dy) : { pts: turned.pts, holes: turned.holes, core: turned.core } }
  }))
  return true
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
