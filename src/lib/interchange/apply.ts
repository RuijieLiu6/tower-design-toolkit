// Puts a built model into the project: its towers (one undo step together with the model), their meshes in this
// browser's mesh store, the north and zero level last confirmed, and the mapping remembered for the file.
import { MIN_FLOOR_AREA, towerPatch } from '../../engine/imported'
import type { ImportedStorey, Tower } from '../../engine/types'
import { useStore } from '../../store'
import { useImportStore } from '../import/store'
import type { RawImport } from '../import/types'
import type { BuildResult } from './build'
import { rememberMapping } from './mapping'
import type { InterchangeModel } from './model'

/**
 * add: next to the towers already there; replace-all: instead of every tower; replace-one: instead of one tower (re-import);
 * update: a new version of the uploaded model, instead of that model's towers only (the person's own towers stay).
 */
export type ApplyMode = 'add' | 'replace-all' | 'replace-one' | 'update'

/** Towers in the list that came from this model. */
const ofModel = (list: Tower[], m: InterchangeModel | null) => (m ? list.filter((t) => t.imported?.source?.modelId === m.id) : [])

/**
 * A new version of an uploaded tower, onto the tower it replaces (same key in the model, T1, T2, …): it keeps the old
 * tower's id, name and design inputs (program bands, sky lobbies, plant floors, interior, stairs), takes the new
 * geometry and placement, and keeps the uses the person set by hand on storeys the file does not tag.
 */
export function updateTower(old: Tower, next: Tower): Tower {
  const m = next.imported!, prev = old.imported
  const storeys: ImportedStorey[] = prev ? m.storeys.map((s) => {
    if (s.src) return s
    const mid = (s.z0 + s.z1) / 2
    const o = prev.storeys.find((p) => mid >= p.z0 && mid < p.z1)
    return o && !o.src ? { ...s, use: o.use, hasFloor: o.hasFloor && s.area >= MIN_FLOOR_AREA } : s
  }) : m.storeys
  const core = next.coreAuto === false ? { coreShare: next.coreShare, coreAuto: false } : {}
  return { ...old, ...towerPatch({ ...m, storeys }), x: next.x, y: next.y, rotation: next.rotation, ...core, id: old.id, name: old.name }
}

export function applyModel(b: BuildResult, raw: RawImport, mode: ApplyMode, replaceId: string | null = null): string[] {
  const s = useStore.getState()
  const project = s.project
  const list = s.towers[project]
  for (const t of b.towers) {
    useImportStore.getState().putMesh(t.tower.imported!.meshId, {
      positions: Float32Array.from(t.mesh.positions), indices: Uint32Array.from(t.mesh.indices),
      openSegments: Float32Array.from(t.topo.openSegments), flippedTriangles: Uint32Array.from(t.topo.flippedTriangles), health: t.health,
      report: {
        objects: t.tower.imported!.source?.elementIds.length ?? 0, triangles: t.mesh.indices.length / 3, sources: b.massing?.sources ?? [],
        skipped: raw.skipped, notes: raw.notes, unitNote: raw.unitNote, northNote: raw.northNote,
      },
    })
  }
  let towers = b.towers.map((t) => t.tower)
  let next = list
  let model = b.model
  if (mode === 'update') {
    // Same tower key, same tower record; new keys are added, keys gone from the file are removed.
    const prior = ofModel(list, s.models[project])
    const byKey = new Map(prior.map((t) => [t.imported!.source!.towerKey, t]))
    const renamed = new Map<string, Tower>()
    towers = towers.map((t) => { const old = byKey.get(t.imported!.source!.towerKey); const u = old ? updateTower(old, t) : t; renamed.set(t.id, u); return u })
    const first = list.findIndex((t) => prior.includes(t))
    const rest = list.filter((t) => !prior.includes(t))
    next = first < 0 ? [...list, ...towers] : [...rest.slice(0, first), ...towers, ...rest.slice(first)]
    model = { ...model, towers: model.towers.map((mt) => { const u = renamed.get(mt.id)!; return { ...mt, id: u.id, name: u.name } }),
      elements: model.elements.map((e) => (e.tags.towerId && renamed.has(e.tags.towerId) ? { ...e, tags: { ...e.tags, towerId: renamed.get(e.tags.towerId)!.id } } : e)) }
  } else if (mode === 'replace-one' && replaceId && towers.length === 1) {
    // Re-import of one tower: it keeps its id and name, so selections, sky rooms and traces still point at it.
    const old = list.find((t) => t.id === replaceId)
    const t = { ...towers[0], id: replaceId, name: old?.name ?? towers[0].name }
    towers = [t]
    model = { ...model, towers: model.towers.map((mt) => ({ ...mt, id: replaceId, name: t.name })), elements: model.elements.map((e) => ({ ...e, tags: { ...e.tags, ...(e.tags.towerId ? { towerId: replaceId } : {}) } })) }
    next = list.map((x) => (x.id === replaceId ? t : x))
  } else if (mode === 'replace-all') next = towers
  else next = [...list, ...towers]
  if (!next.length) return []
  useStore.setState({
    towers: { ...s.towers, [project]: next },
    models: { ...s.models, [project]: model },
    selectedTower: towers[0]?.id ?? next[0].id,
    announce: `${mode === 'update' ? 'Updated from' : 'Uploaded'} ${raw.fileName}: ${towers.length} tower${towers.length === 1 ? '' : 's'}${model.elements.some((e) => e.role === 'site') ? ', site boundary' : ''}${model.elements.some((e) => e.role === 'context') ? ', context' : ''}`,
  })
  const f = model.frame
  useImportStore.setState((st) => ({ georef: { ...st.georef, [project]: { north: f.north.label, fileNorthDeg: f.north.fileNorthDeg, datum: f.datum.label, datumShift: f.datum.shift, at: new Date().toISOString() } } }))
  rememberMapping(raw, model.mapping)
  return towers.map((t) => t.id)
}

/** Takes the uploaded model out of the project (its towers stay, as imported towers, until removed). */
export function forgetModel() {
  const s = useStore.getState()
  useStore.setState({ models: { ...s.models, [s.project]: null }, announce: 'Uploaded model removed from the project; its towers stay' })
}
