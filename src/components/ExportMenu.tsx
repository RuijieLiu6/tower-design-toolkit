// The massing out to Rhino (.3dm), SketchUp and most tools (OBJ + MTL), glTF (.glb); IFC has no writer yet. Files are
// made in the browser; nothing is uploaded. The project bar's Export opens the transfer centre (components/porting/
// TransferDialog.tsx), which calls exportModel after showing what the file will hold.
import { VTC_NORTH_DEG } from '../context'
import { toExportScene } from '../lib/interchange/converters'
import { useImportStore } from '../lib/import/store'
import { CITY_ORIGIN, useStore } from '../store'

/* eslint-disable @typescript-eslint/no-explicit-any */
let rhino: Promise<any> | null = null
const loadRhino = () => (rhino ??= (async () => {
  const [{ default: rhino3dm }, { default: wasmUrl }] = await Promise.all([import('rhino3dm/rhino3dm.module.js'), import('rhino3dm/rhino3dm.wasm?url')])
  return rhino3dm({ locateFile: () => wasmUrl })
})())

function save(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export type ModelFormat = '3dm' | 'obj' | 'glb'
/** The massing as the writers take it (the transfer centre shows its counts before anything is written). */
export function exportScene() {
  const s = useStore.getState()
  const meshes = useImportStore.getState().meshes
  // Roles, uses, levels and provenance travel as user strings, so uploading the export reads back the same model.
  return toExportScene(s.towers[s.project], s.models[s.project], { project: s.project, northDeg: s.project === 'vtc' ? VTC_NORTH_DEG : 0, groundElevation: s.groundElevation, utmOrigin: s.project === 'city' ? CITY_ORIGIN : null, meshOf: (id) => meshes[id] })
}
/** The massing as a file for other software (.3dm, OBJ + MTL zip, .glb), made in this browser; the outcome in words. */
export async function exportModel(kind: ModelFormat): Promise<string> {
  const s = useStore.getState()
  const sc = exportScene()
  const base = `massing-${s.project}-${new Date().toISOString().slice(0, 10)}`
  const north = s.project === 'vtc' ? VTC_NORTH_DEG : 0
  try {
    if (kind === '3dm') {
      const [rh, { to3dm }] = await Promise.all([loadRhino(), import('../lib/export/writers')])
      // Approximate downtown location, only so Rhino reads the model north vector (not a survey position).
      save(to3dm(rh, sc, { northDeg: north, lat: 49.2827, lon: -123.1207 }) as BlobPart, `${base}.3dm`, 'application/octet-stream')
    } else if (kind === 'obj') {
      const [{ toObj }, { zipSync, strToU8 }] = await Promise.all([import('../lib/export/writers'), import('fflate')])
      const { obj, mtl } = toObj(sc, `${base}.mtl`)
      save(zipSync({ [`${base}.obj`]: strToU8(obj), [`${base}.mtl`]: strToU8(mtl) }) as BlobPart, `${base}-obj.zip`, 'application/zip')
    } else {
      const { toGlb } = await import('../lib/export/gltf')
      save(await toGlb(sc), `${base}.glb`, 'model/gltf-binary')
    }
    return `${sc.solids.length} objects on ${sc.layers.length} layers.`
  } catch (e) { return `Export failed: ${(e as Error).message}` }
}
