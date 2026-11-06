// Project files (tower-studio-project@1): the Layer 0 design as deterministic JSON (research P14-M01).
// Same design → same bytes: keys in a fixed order, numbers rounded to 6 decimals, no timestamps (save times live
// outside the file, in the browser's project list). Validated with Ajv against project.schema.json on the way in.
// Loaded on demand (Ajv), so the first paint doesn't pay for it.
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import schema from './project.schema.json'
import { VTC_NORTH_DEG } from '../../context'
import { DEFAULT_EGRESS_PRESETS } from '../../engine/egress'
import { DEFAULT_LIFT_PRESETS, withAutoCore } from '../../engine/lifts'
import { migrateTower } from '../../engine/massing'
import { DEFAULT_PUBLIC_REALM } from '../../engine/publicRealm'
import { DEFAULT_NATURE } from '../../engine/cityInNature'
import { DEFAULT_WIND_PRESETS } from '../../engine/windStructure'
import { DEFAULT_SYSTEMS_PRESETS } from '../../engine/lifeSafety'
import type { Tower } from '../../engine/types'
import { DEFAULT_ON } from '../../data/registry'
import type { NodePackage } from '../nodePackages'
import type { Trace } from '../trace/trace'
import type { InterchangeModel } from '../interchange/model'
import type { StudySite } from '../../engine/site'
import { CITY_ORIGIN, type GroundMode, type ProjectKind } from '../../store'
import { DESIGN_KEYS, type Design } from './design'
import { stableStringify } from './stable'

export { stableStringify }

export const PROJECT_FORMAT = 'tower-studio-project@1'
import { APP_LABEL } from './appLabel'
export { APP_LABEL }

interface Site { north: { deg: number; basis: string }; datum: { vertical: string; groundElevation: number | null; groundMode?: GroundMode; basis: string }; frame: string }
export interface ProjectFile {
  format: typeof PROJECT_FORMAT
  app: string
  project: ProjectKind
  site: Record<ProjectKind, Site>
  towers: Record<ProjectKind, Tower[]>
  selectedTower: string
  rules: { fsrTier: 1 | 2 | 3; transitLink: boolean }
  sun: { month: number; day: number; hour: number }
  presets: { lifts: Record<string, number | boolean | string>; egress: Record<string, number | boolean | string> }
  publicRealm?: Record<string, unknown>
  cityInNature?: Record<string, unknown>
  windPresets?: { tunnelDefaultHeight?: number; f1?: number | null }
  /** Code & life safety presets (team assumptions, research P11-M03). */
  systemsPresets?: Record<string, number | boolean>
  nodes: { enabled: string[]; known?: string[] }
  communityNodes?: { packages: NodePackage[]; params: Record<string, Record<string, number>> }
  /** Decision trace; optional, and the only part of the file with times in it. */
  trace?: Trace
  /** Meshes of imported towers (Export and Save as only; autosave leaves them to the import store). */
  importedMeshes?: Record<string, { positions: number[]; indices: number[] }>
  /** Uploaded models (tower-studio-interchange@1, INTERCHANGE.md): elements by role, provenance, units, north and datum. Optional: files without it load as before. */
  models?: Partial<Record<ProjectKind, InterchangeModel>>
  /** Real Vancouver study site (engine/site.ts): 2D ring in the local frame, with how it was made. Optional: files without it open with none. */
  citySite?: StudySite
}

/** North and datum as the app uses them; written into every file so a reader knows the frame. */
export function siteInfo(groundElevation: number, groundMode: GroundMode = 'manual'): Record<ProjectKind, Site> {
  return {
    vtc: {
      north: { deg: VTC_NORTH_DEG, basis: "Read from the VTC model's drawn north arrow; the file's own north setting is the grid (false assumption corrected)" },
      datum: { vertical: 'Local grade (0 m = site grade)', groundElevation: null, basis: 'VTC model heights above grade; no geodetic datum supplied' },
      frame: 'VTC model grid, metres, origin at the block centre',
    },
    city: {
      north: { deg: 0, basis: 'EPSG:26910 grid north (UTM 10N); grid convergence not applied' },
      datum: {
        vertical: 'CGVD28 (assumed, as City LiDAR 2022)', groundElevation, groundMode,
        basis: groundMode === 'terrain'
          ? 'Ground elevation follows the terrain under the selected tower (City LiDAR 2022 ground or NRCan MRDEM-30, unverified); cone heights are geodetic'
          : 'Ground elevation entered by the user (editable); cone heights are geodetic',
      },
      frame: `EPSG:26910, local origin E ${CITY_ORIGIN[0]} N ${CITY_ORIGIN[1]}`,
    },
  }
}

export function toProjectFile(d: Design, community?: ProjectFile['communityNodes'], trace?: Trace, meshes?: ProjectFile['importedMeshes']): ProjectFile {
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    app: APP_LABEL,
    project: d.project,
    site: siteInfo(d.groundElevation, d.groundMode),
    towers: d.towers,
    selectedTower: d.selectedTower,
    rules: { fsrTier: d.fsrTier, transitLink: d.transitLink },
    sun: d.sun,
    presets: { lifts: d.liftPresets as unknown as Record<string, number>, egress: d.egressPresets as unknown as Record<string, number> },
    publicRealm: d.publicRealm as unknown as Record<string, unknown>,
    cityInNature: d.cityInNature as unknown as Record<string, unknown>,
    windPresets: d.windPresets,
    systemsPresets: d.systemsPresets as unknown as Record<string, number | boolean>,
    nodes: { enabled: Object.keys(d.enabled).filter((k) => d.enabled[k]).sort(), known: [...DEFAULT_ON].sort() },
  }
  if (community && community.packages.length) file.communityNodes = community
  if (trace && (trace.iterations.length || trace.decisions.length || trace.reviews?.length)) file.trace = trace
  if (meshes && Object.keys(meshes).length) file.importedMeshes = meshes
  const models = Object.fromEntries((['vtc', 'city'] as const).filter((k) => d.models?.[k]).map((k) => [k, d.models[k]]))
  if (Object.keys(models).length) file.models = models
  if (d.citySite) file.citySite = d.citySite
  return file
}

export const exportProject = (d: Design, community?: ProjectFile['communityNodes'], trace?: Trace, meshes?: ProjectFile['importedMeshes']) => stableStringify(toProjectFile(d, community, trace, meshes))

/** Mesh ids of imported towers in both projects. */
export const importedMeshIds = (d: Design) => [...new Set([...d.towers.vtc, ...d.towers.city].map((t) => t.imported?.meshId).filter((x): x is string => !!x))]

// --- Reading ------------------------------------------------------------------------------------------------------

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
const validateSchema = ajv.compile(schema)

export interface ReadResult { ok: boolean; file?: ProjectFile; problems: string[]; notes: string[] }

/** Parse and check a project file. Problems are in plain words; notes are things fixed on the way in. */
export function readProject(text: string): ReadResult {
  let data: unknown
  try { data = JSON.parse(text.replace(/^﻿/, '')) } catch { return { ok: false, problems: ["This isn't a valid project file (not JSON). Choose a .json file exported from Tower Design Toolkit."], notes: [] } }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, problems: ['This file is not a Tower Design Toolkit project.'], notes: [] }
  const fmt = (data as { format?: unknown }).format
  if (fmt !== PROJECT_FORMAT) {
    const node = typeof fmt === 'string' && fmt.startsWith('tower-studio-node@')
    return { ok: false, problems: [node ? 'This is a node package, not a project. Import it from the node library (My nodes → Import node).' : `This file is not a Tower Design Toolkit project (format ${JSON.stringify(fmt ?? 'missing')}, expected "${PROJECT_FORMAT}").`], notes: [] }
  }
  if (!validateSchema(data)) return { ok: false, problems: explain(validateSchema.errors ?? []), notes: [] }
  const file = data as unknown as ProjectFile
  const problems: string[] = [], notes: string[] = []
  for (const kind of ['vtc', 'city'] as const) {
    const ids = file.towers[kind].map((t) => t.id)
    const dup = ids.find((id, i) => ids.indexOf(id) !== i)
    if (dup) problems.push(`Two towers in the ${kind === 'vtc' ? 'competition site' : 'Real Vancouver'} project share the id "${dup}".`)
  }
  if (file.towers[file.project].length && !file.towers[file.project].some((t) => t.id === file.selectedTower)) notes.push('The selected tower was missing; the first tower is selected instead.')
  const site = siteInfo(file.site.city.datum.groundElevation ?? 15)
  if (file.site.vtc.north.deg !== site.vtc.north.deg) notes.push(`The file records true north at ${file.site.vtc.north.deg}° for the competition site; this version uses ${site.vtc.north.deg}°.`)
  return { ok: !problems.length, file: problems.length ? undefined : file, problems, notes }
}

function explain(errors: ErrorObject[]): string[] {
  const out = new Set<string>()
  for (const e of errors) {
    if (e.keyword === 'if' || e.keyword === 'anyOf') continue
    const where = e.instancePath ? e.instancePath.slice(1).replace(/\//g, ' › ') : 'The file'
    const p = e.params as Record<string, unknown>
    if (e.keyword === 'required') out.add(`${where} is missing "${p.missingProperty}".`)
    else if (e.keyword === 'additionalProperties') out.add(`${where} has "${p.additionalProperty}", which this version doesn't know.`)
    else out.add(`${where} ${e.message}.`)
    if (out.size >= 12) break
  }
  return [...out]
}

/** The design a file describes. Presets are merged over today's defaults; auto cores are re-sized with today's engine. */
export function toDesign(file: ProjectFile): Design {
  const liftPresets = { ...DEFAULT_LIFT_PRESETS, ...file.presets.lifts } as Design['liftPresets']
  const egressPresets = { ...DEFAULT_EGRESS_PRESETS, ...file.presets.egress } as Design['egressPresets']
  // Old saves (no blocks) become two explicit blocks, podium and tower, with the same floors (engine/massing.ts).
  const towers = (list: Tower[]) => list.map((t) => withAutoCore(migrateTower(t), liftPresets, egressPresets))
  const t = { vtc: towers(file.towers.vtc), city: towers(file.towers.city) }
  const design: Design = {
    project: file.project,
    towers: t,
    models: { vtc: file.models?.vtc ?? null, city: file.models?.city ?? null },
    citySite: file.citySite ?? null,
    selectedTower: t[file.project].some((x) => x.id === file.selectedTower) ? file.selectedTower : t[file.project][0]?.id ?? '',
    // Built nodes added after the file was saved start switched on, like in a new project.
    enabled: Object.fromEntries([...file.nodes.enabled, ...(file.nodes.known ? DEFAULT_ON.filter((id) => !file.nodes.known!.includes(id)) : [])].map((id) => [id, true])),
    fsrTier: file.rules.fsrTier,
    transitLink: file.rules.transitLink,
    groundElevation: file.site.city.datum.groundElevation ?? 15,
    // Files from before 27 Oct have no mode: keep their saved base, so they reopen exactly as saved.
    groundMode: file.site.city.datum.groundMode ?? 'manual',
    sun: file.sun,
    liftPresets,
    egressPresets,
    publicRealm: { ...DEFAULT_PUBLIC_REALM, ...(file.publicRealm ?? {}) } as Design['publicRealm'],
    cityInNature: { ...DEFAULT_NATURE, ...(file.cityInNature ?? {}) } as Design['cityInNature'],
    windPresets: { ...DEFAULT_WIND_PRESETS, ...(file.windPresets ?? {}) },
    systemsPresets: { ...DEFAULT_SYSTEMS_PRESETS, ...(file.systemsPresets ?? {}) } as Design['systemsPresets'],
  }
  return Object.fromEntries(DESIGN_KEYS.map((k) => [k, design[k]])) as Design
}
