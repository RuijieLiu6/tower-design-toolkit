// Puts a built model into the project: its towers (one undo step together with the model), their meshes in this
// browser's mesh store, the north and zero level last confirmed, and the mapping remembered for the file.
import { useStore } from '../../store'
import { useImportStore } from '../import/store'
import type { RawImport } from '../import/types'
import type { BuildResult } from './build'
import { rememberMapping } from './mapping'

export type ApplyMode = 'add' | 'replace-all' | 'replace-one'

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
  if (mode === 'replace-one' && replaceId && towers.length === 1) {
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
    announce: `Uploaded ${raw.fileName}: ${towers.length} tower${towers.length === 1 ? '' : 's'}${model.elements.some((e) => e.role === 'site') ? ', site boundary' : ''}${model.elements.some((e) => e.role === 'context') ? ', context' : ''}`,
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
