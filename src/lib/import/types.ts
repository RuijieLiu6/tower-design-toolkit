// What every format reader returns (research P14-M02: one ImportedObject list per file, nothing dropped silently).

import type { MeshData } from '../../engine/importGeom'
import type { Unit } from '../../engine/meshHealth'

export type ImportFormat = '3dm' | 'obj' | 'gltf' | 'ifc'

export interface RawObject {
  name: string
  /** Rhino layer path, OBJ group, glTF node path or IFC class: what the layer filter lists. */
  layer: string
  kind: string
  mesh: MeshData
  /** How the mesh was made: saved render mesh, mesh object, prism from an extrusion, IFC tessellation. */
  meshSource: string
}

export interface Skipped { name: string; layer: string; kind: string; reason: string }

export interface RawImport {
  format: ImportFormat
  fileName: string
  objects: RawObject[]
  skipped: Skipped[]
  /** Unit the file declares; null when the format has none (OBJ). */
  unit: Unit | null
  unitNote: string
  /** Up axis the format fixes; null when it is unknown (OBJ). */
  upAxis: 'z' | 'y' | null
  upNote: string
  /** True north, degrees clockwise from the file's +Y; null when the file does not say. */
  fileNorthDeg: number | null
  northNote: string
  notes: string[]
}

export const FORMAT_LABEL: Record<ImportFormat, string> = { '3dm': 'Rhino 3DM', obj: 'OBJ', gltf: 'glTF / GLB', ifc: 'IFC' }

/** Supported-formats table for the import dialog (research P14-M02, dated 22 Oct 2026). */
export const FORMATS: { ext: string; route: string; keeps: string; loses: string }[] = [
  { ext: '.3dm', route: 'Rhino 7-8 file, read in the browser (rhino3dm)', keeps: 'Units, layers, object names, Earth anchor north', loses: 'Breps saved without render meshes, SubD, blocks' },
  { ext: '.obj', route: 'Any modeller; SketchUp Pro: File > Export > 3D Model > OBJ', keeps: 'Groups and object names', loses: 'Units (you choose them), north, layers' },
  { ext: '.glb / .gltf', route: 'Blender, SketchUp (extension), Revit (add-in)', keeps: 'Node names; metres and y-up by the standard', loses: 'North, layers' },
  { ext: '.ifc', route: 'Revit: File > Export > IFC (IFC4, export the mass); ArchiCAD', keeps: 'IFC classes, names, TrueNorth, metres', loses: 'Detailed models: walls are sliced too (export the mass only)' },
  { ext: '.skp / .rvt', route: 'Not readable in a browser: export OBJ (SketchUp) or IFC (Revit) first', keeps: '', loses: '' },
]
