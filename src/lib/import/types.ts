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
  /** Id of the object in its file (Rhino object GUID) when the format has one. */
  objectId?: string
  /** Attribute user text (Rhino user strings), as read. */
  userStrings?: Record<string, string>
  /** Layer display colour (#rrggbb) when the file has one. */
  layerColor?: string
  /** Block path when the object was placed through block instances ("Tree > Trunk"). */
  block?: string
  /** Brep faces left out (saved without render meshes): curved faces, and planar faces that could not be rebuilt exactly. */
  facesNotImported?: { curved: number; invalid: number; total: number }
}

/** A curve (polyline or sampled curve) in file units: kept so a site boundary drawn in Rhino can be used. */
export interface RawCurve {
  name: string
  layer: string
  kind: string
  points: [number, number, number][]
  closed: boolean
  objectId?: string
  userStrings?: Record<string, string>
  layerColor?: string
  block?: string
}

export interface Skipped { name: string; layer: string; kind: string; reason: string; objectId?: string }

export interface RawImport {
  format: ImportFormat
  fileName: string
  objects: RawObject[]
  /** Curves (Rhino only so far). The role mapping decides whether they are a site boundary or ignored. */
  curves?: RawCurve[]
  /** Layer table in file order, with colours (Rhino only so far). */
  layers?: { path: string; color: string }[]
  /** Size of the file (bytes) and a short content fingerprint, so a mapping can be remembered per file. */
  fileSize?: number
  fingerprint?: string
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
  /** Rhino Earth anchor: the latitude and longitude of the model base point (file units), when the file sets a location. */
  earthAnchor?: { lat: number; lon: number; basePoint: [number, number, number] }
}

export const FORMAT_LABEL: Record<ImportFormat, string> = { '3dm': 'Rhino 3DM', obj: 'OBJ', gltf: 'glTF / GLB', ifc: 'IFC' }

/** Supported-formats table for the import dialog (research P14-M02, dated 22 Oct 2026). */
export const FORMATS: { ext: string; route: string; keeps: string; loses: string }[] = [
  { ext: '.3dm', route: 'Rhino 7-8 file, read in the browser (rhino3dm)', keeps: 'Units, layers and colours, object names and ids, user strings, blocks, closed curves (site), Earth anchor north', loses: 'Curved Breps saved without render meshes, SubD' },
  { ext: '.obj', route: 'Any modeller; SketchUp Pro: File > Export > 3D Model > OBJ', keeps: 'Groups and object names', loses: 'Units (you choose them), north, layers' },
  { ext: '.glb / .gltf', route: 'Blender, SketchUp (extension), Revit (add-in)', keeps: 'Node names; metres and y-up by the standard', loses: 'North, layers' },
  { ext: '.ifc', route: 'Revit: File > Export > IFC (IFC4, export the mass); ArchiCAD', keeps: 'IFC classes, names, TrueNorth, metres', loses: 'Detailed models: walls are sliced too (export the mass only)' },
  { ext: '.skp / .rvt', route: 'Not readable in a browser: export OBJ (SketchUp) or IFC (Revit) first', keeps: '', loses: '' },
]
