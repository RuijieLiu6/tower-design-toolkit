// Imagine Vancouver (after Vista v37 explorer/imagine-city-engine.js, Ruijie Liu): every Vista building under three
// scenarios, compared building by building.
//   existing  the model's own heights (each part's height source said: LiDAR 2022, City 2009, OSM tag or floors, or a
//             type estimate that never reads as measured).
//   zoning    "Height references": the whole-footprint basic zoning height Vista computed for the building
//             (public/data/vista/imagine_zoning.json, from Vista's imagine_city.json); where any member has no number
//             the existing height is kept (Vista's 213.36 m scenario fallback is not used: never a guessed height).
//   views     "With view cones": the zoning scenario clipped below every cone surface over each part (the 8 City-sourced
//             estimates and the 16 Vista study surfaces), 0.1 m clearance.
// Connected parts scale together about their common base (Vista's assemblies, else the parts of one OSM building):
// a part's permitted scale is (lowest surface over it − base − 0.1) / (its top − base). Pure functions; EPSG:26910 for
// the cone surfaces, the Real Vancouver local frame for footprints.
import { STUDY, surfacesOver, type ConeSurface, type SurfaceKind } from './heightModel'
import { earTriangles } from './site'
import type { Pt } from './vista'

export interface ImagineTable {
  version: number
  source: { repo: string; commit: string; file: string; sha256: string; generatedDate: string; algorithm: string; heightPolicySha256: string }
  attribution: string
  statusCodes: string[]
  assemblyMethod: string
  ruleSets: string[][]
  /** OSM way numbers, one row per Vista building. */
  osm: number[]
  /** Basic zoning height in decimetres, -1 none. */
  zoningDm: number[]
  /** 0 ready, 1 no number, 2 partial, 3 invalid geometry. */
  status: number[]
  ruleSet: number[]
  /** Vista assembly id, -1 none. */
  assembly: number[]
}
export type Scenario = 'existing' | 'zoning' | 'views'
export const SCENARIO_LABEL: Record<Scenario, string> = { existing: 'Existing', zoning: 'Height references', views: 'With view cones' }

export interface ImagineInput {
  /** City building parts (local frame); `id` is the OSM way number. */
  footprints: { id: number; outer: readonly (readonly [number, number])[] }[]
  /** Part underside and roof (geodetic m), NaN where unseated. */
  ground: Float32Array
  roof: Float32Array
}

interface Group { parts: number[]; rows: number[]; base: number; top: number; resolved: boolean; zoningH: number | null }
type Hit = { surface: ConeSurface; z: number; at: Pt }
export interface ImaginePrep {
  table: ImagineTable
  input: ImagineInput
  groups: Group[]
  /** Row of each part in the table, -1 when the building is not in Vista's table. */
  partRow: Int32Array
  partGroup: Int32Array
  /** Cone surfaces over each part, lowest first (empty outside every cone). */
  hits: Hit[][]
  /** Vista buildings with at least one part on the model (Vista's table also lists 5 objects under 1 m² that have none). */
  buildings: number
}

/** Join the table to the parts and find every cone over every part (the slow step: several seconds for 62,000 parts). */
export function prepareImagine(table: ImagineTable, input: ImagineInput, surfaces: ConeSurface[], origin: Pt): ImaginePrep {
  const run = prepareSteps(table, input, surfaces, origin)
  let step = run.next()
  while (!step.done) step = run.next()
  return step.value
}

/** The same, yielding to the browser every `batch` parts and reporting progress (0–1). */
export async function prepareImagineAsync(table: ImagineTable, input: ImagineInput, surfaces: ConeSurface[], origin: Pt, onProgress?: (share: number) => void, batch = 1500): Promise<ImaginePrep> {
  const run = prepareSteps(table, input, surfaces, origin, batch)
  let step = run.next()
  while (!step.done) { onProgress?.(step.value); await new Promise((r) => setTimeout(r, 0)); step = run.next() }
  return step.value
}

function* prepareSteps(table: ImagineTable, input: ImagineInput, surfaces: ConeSurface[], origin: Pt, batch = Infinity): Generator<number, ImaginePrep> {
  const rowOf = new Map<number, number>()
  table.osm.forEach((id, r) => rowOf.set(id, r))
  const n = input.footprints.length
  const partRow = new Int32Array(n).fill(-1), partGroup = new Int32Array(n).fill(-1)
  const groups: Group[] = [], byKey = new Map<string, number>()
  const hits: Hit[][] = new Array(n)
  for (let p = 0; p < n; p++) {
    const f = input.footprints[p], row = rowOf.get(f.id) ?? -1
    partRow[p] = row
    const key = row < 0 ? `p${p}` : table.assembly[row] >= 0 ? `a${table.assembly[row]}` : `r${row}`
    let g = byKey.get(key)
    if (g === undefined) { g = groups.length; byKey.set(key, g); groups.push({ parts: [], rows: [], base: Infinity, top: -Infinity, resolved: true, zoningH: null }) }
    const grp = groups[g]
    partGroup[p] = g
    grp.parts.push(p)
    if (row >= 0 && !grp.rows.includes(row)) grp.rows.push(row)
    if (Number.isFinite(input.ground[p]) && Number.isFinite(input.roof[p])) { grp.base = Math.min(grp.base, input.ground[p]); grp.top = Math.max(grp.top, input.roof[p]) }
    const abs = f.outer.map(([x, y]) => [x + origin[0], y + origin[1]] as Pt)
    const lowest = new Map<ConeSurface, Hit>()
    for (const tri of earTriangles(abs)) for (const h of surfacesOver(tri as Pt[], surfaces)) { const k = lowest.get(h.surface); if (!k || h.z < k.z) lowest.set(h.surface, h) }
    hits[p] = [...lowest.values()].sort((a, b) => a.z - b.z)
    if ((p + 1) % batch === 0) yield (p + 1) / n
  }
  for (const g of groups) {
    let min = Infinity
    for (const r of g.rows) { if (table.status[r] === 0 && table.zoningDm[r] >= 0) min = Math.min(min, table.zoningDm[r] / 10); else g.resolved = false }
    if (!g.rows.length) g.resolved = false
    g.zoningH = g.resolved && Number.isFinite(min) ? min : null
  }
  return { table, input, groups, partRow, partGroup, hits, buildings: new Set([...partRow].filter((r) => r >= 0)).size }
}

export interface GroupResult {
  scale: number
  /** Cone controlling the view scale (views scenario), with its kind. */
  control: { surface: ConeSurface; kind: SurfaceKind; part: number; at: Pt; z: number } | null
  changed: boolean
}
export interface ImagineResult {
  scenario: Scenario
  groups: GroupResult[]
  /** Scenario roof and underside of every part (geodetic m), NaN where unseated. */
  roof: Float32Array
  ground: Float32Array
  stats: { buildings: number; mapped: number; changed: number; reduced: number; grown: number; zoningReady: number; unresolvedZoning: number; byEstimate: number; byStudy: number; noPositiveHeight: number }
}

/** One scenario over every building (fast once prepared). */
export function imagine(prep: ImaginePrep, scenario: Scenario): ImagineResult {
  const { input, groups, hits } = prep
  const n = input.footprints.length
  const roof = new Float32Array(n), ground = new Float32Array(n)
  const out: GroupResult[] = []
  const stats = { buildings: prep.buildings, mapped: 0, changed: 0, reduced: 0, grown: 0, zoningReady: 0, unresolvedZoning: 0, byEstimate: 0, byStudy: 0, noPositiveHeight: 0 }
  for (const g of groups) {
    const height = g.top - g.base
    const valid = Number.isFinite(height) && height > 0
    const baselineScale = scenario !== 'existing' && valid && g.zoningH !== null ? g.zoningH / height : 1
    let viewScale = Infinity, control: GroupResult['control'] = null
    if (scenario === 'views' && valid) for (const p of g.parts) {
      const rise = input.roof[p] - g.base
      for (const h of hits[p]) {
        const s = rise > 0 ? (h.z - g.base - STUDY.clearanceM) / rise : h.z < g.base + STUDY.clearanceM ? -Infinity : Infinity
        if (s < viewScale) { viewScale = s; control = { surface: h.surface, kind: h.surface.kind, part: p, at: h.at, z: h.z } }
      }
    }
    const scale = scenario === 'existing' || !valid ? 1 : Math.max(0, Math.min(baselineScale, viewScale))
    let changed = false
    for (const p of g.parts) {
      roof[p] = g.base + (input.roof[p] - g.base) * scale
      ground[p] = g.base + (input.ground[p] - g.base) * scale
      if (Math.abs(roof[p] - input.roof[p]) > 0.001) changed = true
    }
    out.push({ scale, control: scale < baselineScale - 1e-12 ? control : null, changed })
    const rows = g.rows.length
    if (hits[g.parts[0]] && g.parts.some((p) => hits[p].length)) stats.mapped += rows
    if (g.resolved) stats.zoningReady += rows; else stats.unresolvedZoning += rows
    if (changed) { stats.changed += rows; if (scale < 1) stats.reduced += rows; else stats.grown += rows }
    const ctl = out[out.length - 1].control
    if (ctl) { if (ctl.kind === 'estimate') stats.byEstimate += rows; else stats.byStudy += rows }
    if (scenario === 'views' && valid && viewScale <= 0) stats.noPositiveHeight += rows
  }
  return { scenario, groups: out, roof, ground, stats }
}

export interface BuildingRow {
  osmId: string
  existingHeightM: number
  heightSource: string
  estimated: boolean
  zoningM: number | null
  zoningStatus: string
  rules: string[]
  scenarioHeightM: number
  controllingView: string | null
  viewKind: SurfaceKind | null
  viewFlag: string | null
  assembly: number | null
}

/** One building's row (by table row), for the readout and the CSV. */
export function buildingRow(prep: ImaginePrep, res: ImagineResult, row: number, partsOfRow: number[], sourceOf: (part: number) => { text: string; estimated: boolean }): BuildingRow | null {
  const { table, input } = prep
  if (!partsOfRow.length) return null
  const gr = res.groups[prep.partGroup[partsOfRow[0]]]
  const base = Math.min(...partsOfRow.map((p) => input.ground[p])), top = Math.max(...partsOfRow.map((p) => input.roof[p]))
  const existing = top - base
  const src = sourceOf(partsOfRow.reduce((a, b) => (input.roof[b] - input.ground[b] > input.roof[a] - input.ground[a] ? b : a)))
  return {
    osmId: `w${table.osm[row]}`, existingHeightM: existing, heightSource: src.text, estimated: src.estimated,
    zoningM: table.zoningDm[row] >= 0 ? table.zoningDm[row] / 10 : null, zoningStatus: table.statusCodes[table.status[row]] ?? 'unknown',
    rules: table.ruleSets[table.ruleSet[row]] ?? [], scenarioHeightM: existing * gr.scale,
    controllingView: gr.control ? gr.control.surface.cone.id : null, viewKind: gr.control?.kind ?? null, viewFlag: gr.control?.surface.flag ?? null,
    assembly: table.assembly[row] >= 0 ? table.assembly[row] : null,
  }
}

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(2) : '') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
/** The comparison as CSV (Vista's columns plus the existing-height source and the surface kind). */
export function imagineCsv(rows: { existing: BuildingRow; zoning: BuildingRow; views: BuildingRow }[], attribution: string): string {
  const head = ['osm_id', 'existing_height_m', 'existing_height_source', 'existing_height_estimated', 'zoning_reference_m', 'zoning_status', 'zoning_rules', 'height_references_m', 'with_view_cones_m', 'controlling_view', 'view_surface', 'view_flag', 'assembly', 'certainty']
  const lines = [head.join(',')]
  for (const r of rows) {
    const v = r.views
    lines.push([v.osmId, v.existingHeightM, v.heightSource, v.estimated, v.zoningM, v.zoningStatus, v.rules.join(' ; '), r.zoning.scenarioHeightM, v.scenarioHeightM, v.controllingView, v.viewKind === 'study' ? 'study surface (assumption, not a City ceiling)' : v.viewKind === 'estimate' ? 'City-sourced estimate' : '', v.viewFlag, v.assembly, 'Study'].map(csvCell).join(','))
  }
  return `# ${attribution}. Study heights, not legal maximums or a City assessment.\n${lines.join('\n')}\n`
}
