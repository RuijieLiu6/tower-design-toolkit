// Picks the reader for a dropped file. The rhino3dm and web-ifc WebAssembly modules load only when a file needs them.

import { readObj } from './obj'
import type { RawImport } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
let rhino: Promise<any> | null = null
let ifc: Promise<{ api: any; ctx: number }> | null = null

export type LoadedImport = RawImport & { unitScaleOverride?: number }

export async function readModelFile(file: File): Promise<LoadedImport> {
  const name = file.name
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const head = new TextDecoder().decode(bytes.slice(0, 32))
  if (ext === 'skp') throw new Error('SketchUp files cannot be read in a browser. In SketchUp Pro: File > Export > 3D Model > OBJ, then import the OBJ.')
  if (ext === 'rvt' || ext === 'rfa') throw new Error('Revit files cannot be read in a browser. In Revit: File > Export > IFC (IFC4, the mass only), then import the IFC.')
  if (ext === 'dwg' || ext === 'dxf') throw new Error('2D plans (DWG/DXF) are not massing. Export the 3D mass as 3DM, OBJ or IFC.')
  if (ext === '3dm' || head.startsWith('3D Geometry File Format')) {
    rhino ??= (async () => {
      const [{ default: rhino3dm }, { default: wasmUrl }] = await Promise.all([import('rhino3dm/rhino3dm.module.js'), import('rhino3dm/rhino3dm.wasm?url')])
      return rhino3dm({ locateFile: () => wasmUrl })
    })()
    const [rh, { read3dmWith }] = await Promise.all([rhino, import('./rhino')])
    return read3dmWith(rh, bytes, name)
  }
  if (ext === 'ifc' || head.startsWith('ISO-10303-21')) {
    ifc ??= (async () => {
      const [webIfc, { default: wasmUrl }] = await Promise.all([import('web-ifc'), import('web-ifc/web-ifc.wasm?url')])
      const api = new webIfc.IfcAPI()
      await api.Init(() => wasmUrl, true)
      return { api, ctx: webIfc.IFCGEOMETRICREPRESENTATIONCONTEXT }
    })()
    const [{ api, ctx }, { readIfcWith }] = await Promise.all([ifc, import('./ifc')])
    return readIfcWith(api, bytes, name, ctx)
  }
  if (ext === 'glb' || ext === 'gltf' || head.startsWith('glTF')) {
    const { readGltf } = await import('./gltf')
    return readGltf(bytes, name)
  }
  if (ext === 'obj') return readObj(new TextDecoder().decode(bytes), name)
  throw new Error(`.${ext || '?'} is not a format Tower Design Toolkit reads. Use 3DM, OBJ, glTF/GLB or IFC.`)
}

export const ACCEPT = '.3dm,.obj,.glb,.gltf,.ifc,.skp,.rvt'
