// The design software a model comes from (Ruijie, 6 Nov: "merge 'import' and 'upload' … choose to upload from multiple
// platforms, for each include the icon of their software … Archicad, Revit, AutoCAD, and SketchUp, and for each one
// include an instructions just like how you did with rhino"). Each platform says what file to upload, and how its live
// link works:
//   - server: a script inside the app serves the model on this computer, the Toolkit connects (Rhino, SketchUp);
//   - file:   a script inside the app writes one file again and again (IFC or OBJ), the Toolkit links that file and
//             re-reads it when it changes (Revit, Archicad, AutoCAD: lib/interchange/live.ts, Chrome and Edge).
// Scripts are served from public/ (rhino/, plugins/<app>/). Only the Rhino link has been run inside its app (Rhino 8 on
// the team laptop, 6 Nov); the others are written to each app's documented API and are unverified until someone runs them.
export type PlatformId = 'rhino' | 'revit' | 'archicad' | 'autocad' | 'sketchup' | 'other'

/** One step of a link; `download` puts the script's Download button there (else on the first step). */
export interface PlatformStep { text: string; code?: string; download?: boolean }
export interface Platform {
  id: PlatformId
  name: string
  versions: string
  /** A drawn monogram badge (not the maker's logo: those are their trademarks and their artwork is not ours to copy). */
  badge: { text: string; bg: string; fg: string }
  /** What to upload, and how to get it out of the app. */
  upload: { accept: string; how: string }
  link: null | {
    kind: 'server' | 'file'
    /** File name of the script and where the page serves it. */
    script: string
    href: string
    steps: PlatformStep[]
    /** Server links: the ports the script tries, the copy it serves, and how the link names itself. */
    ports?: number[]
    model?: string
    linkName?: string
    /** File links: the file the script writes. */
    writes?: string
  }
  /** Whether the link has run inside the app itself. */
  tested: { ok: boolean; text: string }
}

export const PLATFORMS: Platform[] = [
  {
    id: 'rhino', name: 'Rhino', versions: 'Rhino 7 and 8', badge: { text: 'Rh', bg: '#2f3237', fg: '#ffffff' },
    upload: { accept: '.3dm', how: 'Save the .3dm and upload it. Layers become roles; units, north and the Earth anchor come with it.' },
    link: { kind: 'server', script: 'tdt_link.py', href: 'rhino/tdt_link.py', ports: [8798, 8799, 8800], model: 'model.3dm', linkName: 'Rhino (live link)', steps: [] },
    tested: { ok: true, text: 'Run in Rhino 8 on the team laptop (6 Nov).' },
  },
  {
    id: 'revit', name: 'Revit', versions: 'Revit 2021 and later', badge: { text: 'Rvt', bg: '#1b5fbf', fg: '#ffffff' },
    upload: { accept: '.ifc', how: 'File › Export › IFC (IFC 2x3 Coordination View 2.0), then upload the .ifc. Masses come as building element proxies.' },
    link: {
      kind: 'file', script: 'tdt_link_revit.py', href: 'plugins/revit/tdt_link_revit.py', writes: 'Documents\\TowerDesignToolkit\\<model>.ifc',
      steps: [
        { text: 'Download the script for pyRevit or RevitPythonShell (free Revit add-ins that run Python).' },
        { text: 'In Revit, run it (pyRevit: a button in your extension, or Run script; RevitPythonShell: Run script). It exports the model as IFC to', code: 'Documents\\TowerDesignToolkit\\<model>.ifc' },
        { text: 'Link that file here once. Run the script again whenever you want the Toolkit to update: it re-reads the file by itself. No add-in? File › Export › IFC to the same file works too.' },
      ],
    },
    tested: { ok: false, text: 'Not yet run inside Revit (not installed on the team laptop): unverified.' },
  },
  {
    id: 'archicad', name: 'Archicad', versions: 'Archicad 25 and later', badge: { text: 'AC', bg: '#0f7d8c', fg: '#ffffff' },
    upload: { accept: '.ifc', how: 'File › Save as › IFC (General Translator), then upload the .ifc.' },
    link: {
      kind: 'file', script: 'tdt_link_archicad.py', href: 'plugins/archicad/tdt_link_archicad.py', writes: 'Documents\\TowerDesignToolkit\\<set>.ifc',
      steps: [
        { text: 'In Archicad, make a Publisher Set named exactly', code: 'Tower Design Toolkit' },
        { text: 'Add your 3D view to it, Format IFC (General Translator), path Documents\\TowerDesignToolkit. Download the script and run it from the Python palette (Window › Palettes › Python Palette), or just press Publish on the set.', download: true },
        { text: 'Link the published IFC here once. Each Publish (or run of the script; add --every 30 to repeat) updates the Toolkit by itself.' },
      ],
    },
    tested: { ok: false, text: 'Not yet run inside Archicad (not installed on the team laptop): unverified.' },
  },
  {
    id: 'autocad', name: 'AutoCAD', versions: 'AutoCAD 2015 and later (not LT)', badge: { text: 'CAD', bg: '#b3262d', fg: '#ffffff' },
    upload: { accept: '.obj', how: 'DWG cannot be read in the browser: the link script writes an OBJ of your 3D solids, surfaces and meshes. Upload that .obj.' },
    link: {
      kind: 'file', script: 'tdt_link.lsp', href: 'plugins/autocad/tdt_link.lsp', writes: '<drawing>_toolkit.obj, next to the drawing',
      steps: [
        { text: 'Download the AutoLISP script. In AutoCAD, type APPLOAD and pick it (add it to the Startup Suite to keep it).' },
        { text: 'Type this command: it writes <drawing>_toolkit.obj next to the drawing now and after every save.', code: 'TDTLINK' },
        { text: 'Link that .obj here once. Each save in AutoCAD updates the Toolkit by itself. TDTSEND writes it now; TDTSTOP stops.' },
      ],
    },
    tested: { ok: false, text: 'Not yet run inside AutoCAD (not installed on the team laptop): unverified.' },
  },
  {
    id: 'sketchup', name: 'SketchUp', versions: 'SketchUp 2017 and later (desktop)', badge: { text: 'SU', bg: '#d2462f', fg: '#ffffff' },
    upload: { accept: '.obj', how: 'File › Export › 3D Model › OBJ (SketchUp Pro), or use the link below. Tags become roles; check units and the up axis.' },
    link: {
      kind: 'server', script: 'tdt_link.rb', href: 'plugins/sketchup/tdt_link.rb', ports: [8797, 8796, 8795], model: 'model.obj', linkName: 'SketchUp (live link)',
      steps: [
        { text: 'Download the link script (one Ruby file, nothing to install).' },
        { text: 'In SketchUp, open Window › Ruby Console and type (with the folder you saved it in):', code: "load 'C:/Users/you/Downloads/tdt_link.rb'" },
        { text: 'An Extensions › Tower Design Toolkit menu appears (Start link, Send now, Instant sync, Stop link). Connect here, then map the tags.' },
      ],
    },
    tested: { ok: false, text: 'Not yet run inside SketchUp (not installed on the team laptop): unverified.' },
  },
  {
    id: 'other', name: 'Other file', versions: 'OBJ, glTF, IFC, 3DM', badge: { text: '…', bg: '#6b7280', fg: '#ffffff' },
    upload: { accept: '.3dm,.obj,.glb,.gltf,.ifc', how: 'Any closed volumes as .3dm, OBJ, glTF/GLB or IFC. Blender, Grasshopper, Vectorworks and most tools export one of these.' },
    link: null,
    tested: { ok: true, text: 'The readers are tested on sample files.' },
  },
]

export const platformById = (id: string): Platform => PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]
