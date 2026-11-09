// What the Toolkit can bring in and take out, as one list the transfer centre reads (Ruijie's Result B brief, 9 Nov,
// §10: "Use a shared capability registry to determine enabled options … It must not disguise unavailable features with
// polished controls"). Every entry names the reader or writer that does the work and whether a person has verified it;
// a purpose with no implemented route is listed as unavailable, never as a working control. Nothing here moves a file.
export type ImportPurpose = 'model' | 'project' | 'package' | 'site' | 'tool'
export type ExportPurpose = 'geometry' | 'backup' | 'workflow' | 'results' | 'tool'

export interface Capability {
  /** The choice as the person reads it. */
  title: string
  /** One line: what it is for. */
  purpose: string
  /** File types, as the picker's accept list; empty when there is no file. */
  accept: string
  /** Implemented in this build. */
  available: boolean
  /** A person has checked the route end to end (an unverified one is implemented but says so). */
  verified: boolean
  /** The module that does the work, or what is missing. */
  via: string
  /** Which projects it works in (undefined: both). */
  projects?: ('vtc' | 'city')[]
}

export const IMPORTS: Record<ImportPurpose, Capability> = {
  model: { title: 'Bring in a 3D model', purpose: 'Proposal geometry, existing context or a reference model from Rhino, SketchUp, Blender or IFC.', accept: '.3dm,.obj,.glb,.gltf,.ifc', available: true, verified: true, via: 'lib/import/load.ts (rhino3dm, OBJ, glTF, web-ifc); alignment and roles in components/ImportDialog.tsx' },
  project: { title: 'Open a saved project', purpose: 'Continue a whole Tower Design Toolkit project (.json) in place of the open one.', accept: '.json,application/json', available: true, verified: true, via: 'lib/project/projectFile.ts readProject → session.ts openText (Ctrl+Z takes it back)' },
  package: { title: 'Load a workflow or phase package', purpose: 'Reuse one phase’s tools, settings and results (tower-studio-phase@1), merged or replacing that phase.', accept: '.json,application/json', available: true, verified: true, via: 'lib/workflow/phasePackage.ts readPhasePackage + planImport; preview in components/workflow/PhasePorting.tsx' },
  site: { title: 'Add a site boundary', purpose: 'A study-site boundary as GeoJSON (a Polygon in WGS84, BC Albers or UTM 10N), Real Vancouver only.', accept: '.geojson,.json', available: true, verified: true, via: 'engine/geoLocate.ts siteFromGeoJson, in the Site step’s Site boundary section', projects: ['city'] },
  tool: { title: 'Add my tool', purpose: 'Install a custom tool package (tower-studio-node@1); it then appears under My tools and can be added to the workflow.', accept: '.json,application/json', available: true, verified: true, via: 'lib/nodeValidate.ts in the node builder’s Import tab (validation, preview, explicit install)' },
}

export const EXPORTS: Record<ExportPurpose, Capability> = {
  geometry: { title: 'Continue modelling elsewhere', purpose: 'The massing as a geometry file: Rhino .3dm, OBJ + MTL (SketchUp and most tools) or glTF .glb. Metres; one closed solid per storey.', accept: '', available: true, verified: true, via: 'lib/export/writers.ts (3dm, OBJ), lib/export/gltf.ts; IFC has no writer yet' },
  backup: { title: 'Back up this project', purpose: 'The whole project with its editable state, imported meshes and decision trace, as a .json that opens again here.', accept: '', available: true, verified: true, via: 'lib/project/session.ts currentText (tower-studio-project@1)' },
  workflow: { title: 'Reuse or share this workflow', purpose: 'The open phase as a package: its tools, connections and return paths, settings, units, origin and north, and results with their model revision. No geometry of other phases.', accept: '', available: true, verified: true, via: 'lib/workflow/phasePackage.ts buildPhasePackage (tower-studio-phase@1)' },
  results: { title: 'Export results or evidence', purpose: 'The decision trace as PROV (.jsonld), or the model for Sun & Wind Studio. Boards and drawings export from the Present phase.', accept: '', available: true, verified: false, via: 'lib/trace/prov.ts traceToProv; components/SunWindSend.tsx (the Studio link is unverified on the live site)' },
  tool: { title: 'Package my tool', purpose: 'Save one of My tools as a package to share.', accept: '', available: false, verified: false, via: 'No writer yet: the node builder keeps packages in this browser only' },
}

/** The entries a person may choose from in the open project (an unavailable one is shown, disabled, with its reason). */
export const forProject = <K extends string>(all: Record<K, Capability>, project: 'vtc' | 'city') =>
  (Object.entries(all) as [K, Capability][]).map(([key, c]) => ({ key, ...c, enabled: c.available && (!c.projects || c.projects.includes(project)) }))
