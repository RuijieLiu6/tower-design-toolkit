// Phase packages (Ruijie, 8 Nov: "Import and Export consistently in each phase header. Phase packages should preserve the
// relevant context, workflow configuration, settings, results and supported files. Preview imports and distinguish
// merging from replacing phase content"). A package is one JSON file, `tower-studio-phase@1`:
//   the phase's tool nodes, the connections among them and the ones that leave it (as references);
//   the phase's settings and geometry from the shared project (PHASE_SLICES), with the units, origin, north and datum;
//   the results as they stood, with the model revision that produced them;
//   the tool versions and where its numbers come from (each result keeps its source and evidence flag).
// It is not a geometry exchange: "Model snapshot" (Rhino .3dm, OBJ, glTF, from Export model) moves the model to other
// software and keeps no tool settings or connections. Inside the project, phases share data on their own; packages are for
// saved hand-offs.
import { edgeKey, type Board, type Edge } from '../workflowGraph'
import type { PhaseId } from '../phases'
import type { Digest } from '../trace/digest'

export const PHASE_FORMAT = 'tower-studio-phase@1'

/** The shared-project data each phase carries (store keys). Towers carry their program bands. */
export const PHASE_SLICES: Record<PhaseId, string[]> = {
  site: ['citySite', 'groundMode', 'groundElevation', 'transitLink'],
  form: ['towers', 'sun', 'windPresets'],
  program: ['towers', 'fsrTier', 'publicRealm', 'cityInNature'],
  schematic: ['liftPresets', 'egressPresets', 'systemsPresets', 'anatomy'],
  present: ['presentRep', 'boardView', 'planLevel', 'planGrid'],
}
/** What each slice is, in words, for the import preview. */
export const SLICE_WORDS: Record<string, string> = {
  citySite: 'the study site', groundMode: 'how the ground is set', groundElevation: 'the ground elevation', transitLink: 'the transit link',
  towers: 'the towers (geometry and program bands)', sun: 'the sun date and hour', windPresets: 'the wind presets', fsrTier: 'the FSR tier',
  publicRealm: 'the public-realm inputs', cityInNature: 'the City in Nature inputs', liftPresets: 'the lift presets', egressPresets: 'the egress presets',
  systemsPresets: 'the systems presets', anatomy: 'the anatomy view', presentRep: 'the representation', boardView: 'the board view', planLevel: 'the plan level', planGrid: 'the plan grid',
}

export interface PhasePackage {
  format: typeof PHASE_FORMAT
  phase: PhaseId
  exportedAt: string
  app: { name: 'Tower Design Toolkit'; version: string }
  project: 'vtc' | 'city'
  frame: { units: string; origin: string; north: string; datum: string }
  workflow: { nodes: string[]; edges: Edge[]; links: { edge: Edge; other: string; out: boolean }[] }
  /** Tool versions: built-in tools follow the app's version; custom tools their package's. */
  tools: Record<string, string>
  settings: Record<string, unknown>
  results: { modelRevision: string; digest: Digest | null }
  notes: string[]
}

/** A short, stable fingerprint of the model (FNV-1a over the towers' JSON), so results say which model they belong to. */
export function modelRevision(towers: unknown): string {
  const t = JSON.stringify(towers ?? null)
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

export interface PackageInput {
  phase: PhaseId; project: 'vtc' | 'city'; units: string; nodes: string[]; internal: Edge[]; crossing: { edge: Edge; other: string; out: boolean }[]
  state: Record<string, unknown>; digest: Digest | null; versions: Record<string, string>; appVersion: string
}
export function buildPhasePackage(i: PackageInput): PhasePackage {
  const pick = PHASE_SLICES[i.phase]
  const settings: Record<string, unknown> = {}
  for (const k of pick) {
    const v = k === 'towers' ? (i.state.towers as Record<string, unknown> | undefined)?.[i.project] : i.state[k]
    if (v !== undefined) settings[k] = JSON.parse(JSON.stringify(v))
  }
  return {
    format: PHASE_FORMAT, phase: i.phase, exportedAt: new Date().toISOString(), app: { name: 'Tower Design Toolkit', version: i.appVersion }, project: i.project,
    frame: i.project === 'city'
      ? { units: i.units, origin: 'EPSG:26910 (UTM 10N), City of Vancouver model origin', north: 'grid north = true north (to 0.1°)', datum: 'CGVD28 (assumed)' }
      : { units: i.units, origin: 'competition block, local origin', north: 'true north 45° from the model grid', datum: 'local grade' },
    workflow: { nodes: [...i.nodes], edges: i.internal.map((e) => ({ a: e.a, b: e.b })), links: i.crossing.map((c) => ({ edge: { a: c.edge.a, b: c.edge.b }, other: c.other, out: c.out })) },
    tools: Object.fromEntries(i.nodes.map((id) => [id, i.versions[id] ?? i.appVersion])),
    settings,
    results: { modelRevision: modelRevision(settings.towers ?? i.state.towers), digest: i.digest },
    notes: ['Results are as computed for the model revision above; reopening recomputes them from the settings.', 'Geometry exchange (Rhino, OBJ, glTF) is under Export model and keeps no tool settings or connections.'],
  }
}

/** Reads a package file: problems in words (empty when it can be imported). */
export function readPhasePackage(text: string): { pkg?: PhasePackage; problems: string[] } {
  let v: unknown
  try { v = JSON.parse(text) } catch { return { problems: ['This is not a JSON file.'] } }
  const p = v as Partial<PhasePackage>
  const problems: string[] = []
  if (!p || p.format !== PHASE_FORMAT) problems.push(`This is not a phase package (format "${PHASE_FORMAT}").`)
  if (p && (!p.phase || !['site', 'form', 'program', 'schematic', 'present'].includes(p.phase))) problems.push('The package names no phase.')
  if (p && (!p.workflow || !Array.isArray(p.workflow.nodes) || !Array.isArray(p.workflow.edges))) problems.push('The package has no workflow.')
  if (p && (!p.settings || typeof p.settings !== 'object')) problems.push('The package has no settings.')
  return problems.length ? { problems } : { pkg: p as PhasePackage, problems }
}

export type ImportMode = 'merge' | 'replace'
/**
 * What an import would do to the project workflow and data, before it is applied.
 * Merge: the package's tools and connections are added; nothing is removed; settings stay as they are unless `takeSettings`.
 * Replace: the phase's tools and connections become the package's (other phases untouched); its settings replace the
 * project's for this phase. The model (towers) is replaced only in Replace, or when the user ticks it in Merge.
 */
export function planImport(board: Board, phaseNodes: string[], pkg: PhasePackage, mode: ImportMode, known: (id: string) => boolean) {
  const incoming = pkg.workflow.nodes.filter(known)
  const unknown = pkg.workflow.nodes.filter((id) => !known(id))
  const keep = new Set([...incoming, 'start', 'enter'])
  let nodes = [...board.nodes], edges = [...board.edges]
  if (mode === 'replace') {
    const drop = new Set(phaseNodes.filter((id) => !incoming.includes(id)))
    // the phase's own wiring is replaced; a wire into or out of a dropped node is reconnected around it
    const ins = edges.filter((e) => drop.has(e.b) && !drop.has(e.a)), outs = edges.filter((e) => drop.has(e.a) && !drop.has(e.b))
    edges = edges.filter((e) => !(drop.has(e.a) || drop.has(e.b)) && !(phaseNodes.includes(e.a) && phaseNodes.includes(e.b)))
    nodes = nodes.filter((id) => !drop.has(id))
    if (ins[0] && outs[0]) edges.push({ a: ins[0].a, b: outs[0].b })
  }
  const add = incoming.filter((id) => !nodes.includes(id))
  nodes = [...nodes, ...add]
  const have = new Set(edges.map(edgeKey))
  const wires = pkg.workflow.edges.filter((e) => keep.has(e.a) && keep.has(e.b) && !have.has(edgeKey(e)))
  edges = [...edges, ...wires]
  // the phase's way out leaves from its last tool, so the phase runs through before the next phase starts
  const inPhase = new Set([...phaseNodes, ...incoming])
  const last = incoming[incoming.length - 1]
  const exit = edges.find((e) => inPhase.has(e.a) && !inPhase.has(e.b) && e.b !== 'start')
  if (last && exit && exit.a !== last && !edges.some((e) => e.a === last && !inPhase.has(e.b))) {
    edges = edges.filter((e) => e !== exit)
    if (!edges.some((e) => e.a === last && e.b === exit.b)) edges.push({ a: last, b: exit.b })
  }
  // a tool new to the project with no way in yet joins after the phase's last node
  const after = phaseNodes[phaseNodes.length - 1]
  for (const id of add) if (!edges.some((e) => e.b === id) && after) {
    const out = edges.find((e) => e.a === after && !phaseNodes.includes(e.b))
    edges = edges.filter((e) => e !== out)
    edges.push({ a: after, b: id })
    if (out) edges.push({ a: id, b: out.b })
  }
  const settingKeys = Object.keys(pkg.settings)
  return { board: { nodes, edges }, added: add, unknown, wires: wires.length, settingKeys, removed: mode === 'replace' ? phaseNodes.filter((id) => !incoming.includes(id)) : [] }
}
