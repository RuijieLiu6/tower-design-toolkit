// Import store: meshes of imported towers (kept out of the tower records), the import dialog, and the north and zero
// level last confirmed in each project (research P14-M03: stored per project, never assumed).

import { useEffect } from 'react'
import { create } from 'zustand'
import { withAutoCore } from '../../engine/lifts'
import { carryTags, sliceStoreys, towerPatch } from '../../engine/imported'
import type { HealthItem } from '../../engine/meshHealth'
import type { ImportedMass, Tower } from '../../engine/types'
import { VTC_NORTH_DEG } from '../../context'
import { useStore, type ProjectKind } from '../../store'
import type { Skipped } from './types'

export interface MeshEntry {
  /** Tower frame, metres, z up (float32 is fine here: the mesh is re-centred). */
  positions: Float32Array
  indices: Uint32Array
  /** Open edges (x, y, z pairs) and triangles next to flipped edges, for the 3D overlay. */
  openSegments: Float32Array
  flippedTriangles: Uint32Array
  health: HealthItem[]
  report: { objects: number; triangles: number; sources: string[]; skipped: Skipped[]; notes: string[]; unitNote: string; northNote: string }
}

export interface Georef {
  north: string
  fileNorthDeg: number | null
  datum: string
  datumShift: number
  at: string
}

interface ImportState {
  meshes: Record<string, MeshEntry>
  dialogOpen: boolean
  pendingFile: File | null
  /** Tower to replace instead of adding a new one. */
  replaceId: string | null
  georef: Record<ProjectKind, Georef | null>
  /** Show open edges and flipped faces on imported masses. */
  showProblems: boolean
  openDialog: (file?: File | null, replaceId?: string | null) => void
  closeDialog: () => void
  putMesh: (id: string, e: MeshEntry) => void
  set: (patch: Partial<ImportState>) => void
}

export const useImportStore = create<ImportState>((set) => ({
  meshes: {},
  dialogOpen: false,
  pendingFile: null,
  replaceId: null,
  georef: { vtc: null, city: null },
  showProblems: true,
  openDialog: (file = null, replaceId = null) => set({ dialogOpen: true, pendingFile: file, replaceId }),
  closeDialog: () => set({ dialogOpen: false, pendingFile: null, replaceId: null }),
  putMesh: (id, e) => { set((s) => ({ meshes: { ...s.meshes, [id]: e } })); void saveMesh(id, e) },
  set: (patch) => set(patch),
}))

/** Adds (or swaps in) an imported tower in the current project and selects it. */
export function addImportedTower(mass: ImportedMass, place: { x: number; y: number; rotation: number }, replaceId: string | null): string {
  const s = useStore.getState()
  const list = s.towers[s.project]
  const like = list.find((t) => t.id === (replaceId ?? s.selectedTower)) ?? list[0]
  const id = replaceId ?? `imp${Date.now().toString(36)}`
  const name = replaceId && like ? like.name : mass.fileName.replace(/\.[^.]+$/, '').slice(0, 28) || 'Imported'
  const base: Tower = {
    id, name, x: place.x, y: place.y, rotation: place.rotation,
    width: 40, depth: 40, height: mass.top, f2f: mass.f2f, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40, podiumUse: 'retail',
    bands: like ? like.bands.map((b) => ({ ...b })) : [{ use: 'office', share: 1 }],
    coreShare: like?.coreShare ?? 0.25, plantEvery: 0, coreAuto: like?.coreAuto ?? true, skyLobbies: [], skyRoom: null,
    stairPlacement: like?.stairPlacement,
  }
  const t = withAutoCore({ ...base, ...towerPatch(mass) }, s.liftPresets, s.egressPresets)
  const next = replaceId ? list.map((x) => (x.id === replaceId ? t : x)) : [...list, t]
  useStore.setState({ towers: { ...s.towers, [s.project]: next }, selectedTower: id, announce: `Imported ${mass.fileName} as ${name}` })
  useImportStore.setState((st) => ({ georef: { ...st.georef, [s.project]: { north: mass.northSource, fileNorthDeg: mass.fileNorthDeg, datum: mass.datumSource, datumShift: mass.datumShift, at: new Date().toISOString() } } }))
  return id
}

/** Re-slices an imported tower at a new storey schedule, keeping the user's tags where storeys overlap. */
export function resliceTower(t: Tower, patch: { f2f?: number; podiumTop?: number; podiumF2F?: number }): boolean {
  const m = t.imported
  const mesh = m && useImportStore.getState().meshes[m.meshId]
  if (!m || !mesh) return false
  const f2f = Math.max(2.5, patch.f2f ?? m.f2f), podiumTop = Math.max(0, patch.podiumTop ?? m.podiumTop), podiumF2F = Math.max(2.5, patch.podiumF2F ?? m.podiumF2F)
  const storeys = carryTags(sliceStoreys(mesh, { f2f, podiumTop, podiumF2F, top: m.top }), m.storeys)
  useStore.getState().updateTower(t.id, towerPatch({ ...m, f2f, podiumTop, podiumF2F, storeys }))
  return true
}

/** Changes program, void or podium flags on some storeys (by level). */
export function tagStoreys(t: Tower, levels: number[], patch: Partial<Pick<ImportedMass['storeys'][number], 'use' | 'hasFloor' | 'podium'>>) {
  const m = t.imported
  if (!m) return
  const set = new Set(levels)
  // A use set by hand replaces the one the model's program element gave, so its element id goes too.
  const retag = (s: ImportedMass['storeys'][number]) => { const { src: _src, ...rest } = s; return { ...(patch.use ? rest : s), ...patch } }
  useStore.getState().updateTower(t.id, towerPatch({ ...m, storeys: m.storeys.map((s) => (set.has(s.level) ? retag(s) : s)) }))
}

/** Meshes as plain arrays, for a project file (save/load can call this). */
export function serializeImports(ids: string[]): Record<string, { positions: number[]; indices: number[] }> {
  const m = useImportStore.getState().meshes
  return Object.fromEntries(ids.filter((id) => m[id]).map((id) => [id, { positions: Array.from(m[id].positions, (v) => Math.round(v * 1000) / 1000), indices: Array.from(m[id].indices) }]))
}

export function restoreImports(data: Record<string, { positions: number[]; indices: number[] }>) {
  for (const [id, d] of Object.entries(data)) {
    useImportStore.getState().putMesh(id, {
      positions: Float32Array.from(d.positions), indices: Uint32Array.from(d.indices), openSegments: new Float32Array(), flippedTriangles: new Uint32Array(), health: [],
      report: { objects: 0, triangles: d.indices.length / 3, sources: ['Restored from a project file'], skipped: [], notes: [], unitNote: '', northNote: '' },
    })
  }
}

/** Sets (or clears) the file's north after import: the mass turns about its own centre so file north meets project north. */
export function setTowerNorth(t: Tower, fileNorthDeg: number | null, source: string) {
  const m = t.imported
  if (!m) return
  const s = useStore.getState()
  const projectNorth = s.project === 'vtc' ? VTC_NORTH_DEG : 0
  const rotation = fileNorthDeg == null ? t.rotation : Math.round((((fileNorthDeg - projectNorth) % 360 + 540) % 360 - 180) * 1000) / 1000
  s.updateTower(t.id, { rotation, imported: { ...m, fileNorthDeg, northSource: source } })
  useImportStore.setState((st) => ({ georef: { ...st.georef, [s.project]: { north: source, fileNorthDeg, datum: m.datumSource, datumShift: m.datumShift, at: new Date().toISOString() } } }))
}

// ---------- meshes survive a reload: kept in this browser's IndexedDB, apart from the project autosave ----------
// (Project files and autosave keep the imported tower and its storeys; without the mesh the tower draws as stacked plates.)
const DB_NAME = 'tower-studio-imports', STORE = 'meshes'
let dbp: Promise<IDBDatabase | null> | null = null
function meshDb(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
  return dbp
}
async function saveMesh(id: string, e: MeshEntry) {
  const db = await meshDb()
  if (!db) return
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(e, id) } catch { /* quota or private mode: the plates still draw */ }
}
const loading = new Set<string>()
async function loadMesh(id: string) {
  if (loading.has(id) || useImportStore.getState().meshes[id]) return
  loading.add(id)
  const db = await meshDb()
  if (!db) return
  const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
  req.onsuccess = () => { const e = req.result as MeshEntry | undefined; if (e) useImportStore.setState((s) => ({ meshes: { ...s.meshes, [id]: e } })) }
}

/** The stored mesh of an imported tower; fetched from this browser's storage after a reload. */
export function useMeshEntry(id: string | undefined): MeshEntry | undefined {
  const e = useImportStore((s) => (id ? s.meshes[id] : undefined))
  useEffect(() => { if (id && !e) void loadMesh(id) }, [id, e])
  return e
}

