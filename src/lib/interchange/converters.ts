// Layer 0 interchange model → each tool's input. One converter per tool family; all pure, all tested
// (converters.test.ts), and all keep the provenance: every line says which file, layer and object it came from.
//
//   toNodeTowers     evaluation nodes: towers, floors, uses, core
//   toViewConeInputs view-cone and height-surface checks: footprints and top heights
//   toShadowCasters  solar access and sun hours: shadow-casting prisms (proposal + uploaded context)
//   toPublicRealm    public-realm checks: site boundary, its edges, podium and tower setbacks, coverage
//   toFloorAreas     lifts, egress and interior: floor areas by use, with where each use came from
//   toPresent        drawings, boards and Present captures: outlines and the provenance caption
//   toCustomize      the Customize canvas: the model as a node output (lines with flags and sources)
//   toExportScene    export back to .3dm, OBJ and glTF with roles and provenance as user strings
import { floorRing, towerFloors, towerFootprint, towerMasses, PODIUM_F2F } from '../../engine/massing'
import { ringArea } from '../../engine/importGeom'
import type { Occluders, Prism } from '../../engine/shadow'
import { towerOccluders } from '../../engine/solarRules'
import { USES, type Flag, type Floor, type RuleState, type Source, type Tower, type UseId } from '../../engine/types'
import { buildScene, LAYER, type ExportCurve, type ExportScene, type ExportSolid, type RGB, type SceneOptions } from '../export/scene'
import { earcutFlat } from '../import/rhino'
import type { Item, NodeOutput } from '../workflowLogic'
import { ROLE_LABEL, type InterchangeModel, type ModelElement, type Pt } from './model'

/** Towers in the project that came from this model (the person may have deleted or added some since). */
export const modelTowers = (model: InterchangeModel, towers: Tower[]) => towers.filter((t) => t.imported?.source?.modelId === model.id)
const elementsBy = (model: InterchangeModel, role: ModelElement['role']) => model.elements.filter((e) => e.role === role)
const SOURCE: Source = { label: 'Uploaded model (Layer 0 interchange, INTERCHANGE.md)' }
const layersOf = (model: InterchangeModel, ids: string[]) => [...new Set(model.elements.filter((e) => ids.includes(e.id)).map((e) => e.provenance.layer))]
const placeRing = (t: Tower, ring: Pt[]): Pt[] => {
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return ring.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c])
}

// ---------- 1. evaluation nodes ----------

export interface NodeTower {
  id: string
  name: string
  height: number
  floors: Floor[]
  gfa: number
  gfaByUse: Partial<Record<UseId, number>>
  core: { share: number; source: string; flag: Flag }
  /** File, layers and element ids the tower was built from. */
  provenance: { file: string; layers: string[]; elementIds: string[] }
}

/** The towers every evaluation node reads, with where their floors, uses and core came from. */
export function toNodeTowers(model: InterchangeModel, towers: Tower[]): NodeTower[] {
  return modelTowers(model, towers).map((t) => {
    const mt = model.towers.find((x) => x.id === t.id)
    const floors = towerFloors(t)
    const byUse: Partial<Record<UseId, number>> = {}
    for (const f of floors) byUse[f.use] = (byUse[f.use] ?? 0) + f.area
    const ids = t.imported!.source!.elementIds
    const fromModel = mt?.coreShare != null && t.coreAuto === false && Math.abs(t.coreShare - mt.coreShare) < 1e-9
    return {
      id: t.id, name: t.name, height: t.height, floors, gfa: floors.reduce((s, f) => s + f.area, 0), gfaByUse: byUse,
      core: fromModel ? { share: t.coreShare, source: `Measured from the core volumes (${layersOf(model, ids.filter((id) => model.elements.find((e) => e.id === id)?.role === 'core')).join(', ')})`, flag: 'team_assumption' }
        : { share: t.coreShare, source: t.coreAuto === false ? 'Set by hand in the app' : 'Sized to the lifts, stairs and risers (core & lift check)', flag: 'team_assumption' },
      provenance: { file: model.source.fileName, layers: layersOf(model, ids), elementIds: ids },
    }
  })
}

// ---------- 2. view cones and the height surface ----------

export interface ViewConeInput { towerId: string; name: string; footprint: Pt[]; topZ: number; heightSource: string }

/**
 * Footprint and top of each model tower, as the view-cone and height-surface checks read them: the plan outline of
 * the whole mass and its top, geodetic in Real Vancouver (base + height), above grade on the competition site.
 */
export function toViewConeInputs(model: InterchangeModel, towers: Tower[], groundElevation: number): ViewConeInput[] {
  const city = model.project === 'city'
  return modelTowers(model, towers).map((t) => ({
    towerId: t.id, name: t.name, footprint: towerFootprint(t), topZ: (city ? groundElevation : 0) + t.height,
    heightSource: `Highest point of the uploaded volumes above the entrance floor (${model.frame.datum.label.toLowerCase()})${city ? `, plus the tower base ${groundElevation.toFixed(2)} m CGVD28` : ''}`,
  }))
}

/**
 * World triangles of one tower for exact geometric checks (the exact cone check after Vista's view-envelope.js): x, y, z
 * per vertex, 9 numbers per triangle. Real Vancouver: EPSG:26910 metres and CGVD28 z (origin and base added); the
 * competition site: the project frame, z above grade. The uploaded mesh when this browser has it, else closed prisms of
 * its storeys (no crown above the last storey); a parametric tower is one closed prism per stacked block (towerMasses).
 * Contract: engine/viewEnvelope.ts (the exact cone check) calls this for every imported tower. Keep the signature and
 * the flat output (9 numbers per triangle, EPSG:26910 + CGVD28 in Real Vancouver) stable, or agree a change with it first.
 */
export function placedTriangles(t: Tower, entry: { positions: ArrayLike<number>; indices: ArrayLike<number> } | undefined, o: { origin: [number, number] | null; groundElevation: number }): { tris: number[]; source: 'mesh' | 'storeys'; flag: Flag } {
  const [ox, oy] = o.origin ?? [0, 0], oz = o.origin ? o.groundElevation : 0
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const out: number[] = []
  if (t.imported && entry) {
    const p = entry.positions, ix = entry.indices
    for (let k = 0; k < ix.length; k++) { const v = ix[k] * 3; const u = p[v], w = p[v + 1]; out.push(ox + t.x + u * c - w * s, oy + t.y + u * s + w * c, oz + p[v + 2]) }
    return { tris: out, source: 'mesh', flag: 'team_assumption' }
  }
  const prisms: { ring: Pt[]; z0: number; z1: number }[] = t.imported
    ? t.imported.storeys.flatMap((st) => st.loops.filter((l) => ringArea(l) > 0).map((l) => ({ ring: placeRing(t, l), z0: st.z0, z1: st.z1 })))
    : towerMasses(t).map((m) => ({ ring: m.ring, z0: m.z0, z1: m.z1 })) // one prism per stacked block, crown included
  for (const pr of prisms) {
    const m = closedPrism([pr.ring], pr.z0, pr.z1)
    for (const k of m.indices) out.push(ox + m.positions[3 * k], oy + m.positions[3 * k + 1], oz + m.positions[3 * k + 2])
  }
  return { tris: out, source: 'storeys', flag: t.imported ? 'unverified' : 'team_assumption' }
}

// ---------- 3. solar access and sun hours ----------

/** Uploaded context buildings as extruded footprints, z from the tower base (team assumption: flat roofs). */
export function contextOccluders(model: InterchangeModel): Occluders {
  const prisms: Prism[] = []
  for (const e of elementsBy(model, 'context')) {
    if (e.geometry.kind !== 'prism') continue
    for (const ring of e.geometry.rings) if (ring.length >= 3) prisms.push({ ring, z0: e.geometry.z0, z1: e.geometry.z1 })
  }
  return { prisms, tris: [] }
}

/** Shadow casters: the proposal (the model's towers, sliced storeys) and the existing context the model brings. */
export function toShadowCasters(model: InterchangeModel, towers: Tower[]): { proposal: Occluders; context: Occluders; note: string } {
  const context = contextOccluders(model)
  return {
    proposal: towerOccluders(modelTowers(model, towers)),
    context,
    note: `${context.prisms.length} context prism${context.prisms.length === 1 ? '' : 's'} from ${model.source.fileName} added to the existing context (flat roofs, team assumption)`,
  }
}

// ---------- 4. public realm ----------

export interface SiteEdgeInfo {
  index: number
  a: Pt
  b: Pt
  length: number
  /** Outward normal, degrees clockwise from true north. */
  bearing: number
  facing: 'north' | 'east' | 'south' | 'west'
  /** Shortest distance from the edge to the podium (lowest storeys) and to the tower above it (m); null with no tower. */
  podiumSetback: number | null
  towerSetback: number | null
}

export interface PublicRealmInput {
  site: { rings: Pt[][]; area: number; perimeter: number; source: string; flag: Flag } | null
  edges: SiteEdgeInfo[]
  /** Ground-floor plate of the model towers as a share of the site (screening). */
  coverage: number | null
  openArea: number | null
}

/** Site boundary edges with the podium and tower setbacks, for the streetwall, frontage and open-space checks. */
export function toPublicRealm(model: InterchangeModel, towers: Tower[], northDeg: number): PublicRealmInput {
  const site = elementsBy(model, 'site').find((e) => e.geometry.kind === 'polygon')
  if (!site || site.geometry.kind !== 'polygon') return { site: null, edges: [], coverage: null, openArea: null }
  const ring = site.geometry.rings[0]
  const area = Math.abs(ringArea(ring))
  const ts = modelTowers(model, towers)
  // Podium = the lowest floored storey's outlines; tower = the first storey above the podium.
  const outlines = (pick: (t: Tower) => [number, number][][]) => ts.flatMap((t) => pick(t).filter((l) => ringArea(l) > 0).map((l) => placeRing(t, l)))
  const podium = outlines((t) => t.imported!.storeys.find((s) => s.hasFloor)?.loops ?? [])
  const tower = outlines((t) => t.imported!.storeys.find((s) => s.hasFloor && !s.podium)?.loops ?? [])
  const edges = ring.map((a, i): SiteEdgeInfo => {
    const b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    // Counter-clockwise ring: the outward normal is (dy, -dx).
    const bearing = (((Math.atan2(dy, -dx) * 180) / Math.PI - northDeg) % 360 + 360) % 360
    const facing = bearing >= 315 || bearing < 45 ? 'north' : bearing < 135 ? 'east' : bearing < 225 ? 'south' : 'west'
    const dist = (polys: Pt[][]) => (polys.length ? Math.min(...polys.flatMap((p) => p.map((q) => segDist(q, a, b)))) : null)
    return { index: i, a, b, length: round2(len), bearing: round2(bearing), facing, podiumSetback: round2n(dist(podium)), towerSetback: round2n(dist(tower)) }
  })
  // Ground floor of each tower: its lowest storey's plate (union area; a storey inside another tower's podium has no floor).
  const ground = ts.reduce((s, t) => { const g = t.imported!.storeys[0]; return s + (g?.hasFloor ? g.area : 0) }, 0)
  return {
    site: { rings: site.geometry.rings, area: round2(area), perimeter: round2(edges.reduce((s, e) => s + e.length, 0)), source: `${site.provenance.file}, ${site.provenance.layer} "${site.provenance.objectName}"`, flag: site.provenance.evidence },
    edges, coverage: ts.length ? round3(ground / area) : null, openArea: ts.length ? round2(area - ground) : null,
  }
}

// ---------- 5. lifts, egress and interior ----------

export interface FloorArea { level: number; z0: number; z1: number; use: UseId; area: number; podium: boolean; useSource: string }
export interface FloorAreas { towerId: string; name: string; floors: FloorArea[]; byUse: Partial<Record<UseId, number>>; fromModel: number }

/** Floor areas by use per storey, as the lift, egress and interior checks read them, with where each use came from. */
export function toFloorAreas(model: InterchangeModel, towers: Tower[]): FloorAreas[] {
  return modelTowers(model, towers).map((t) => {
    const storeys = new Map(t.imported!.storeys.map((s) => [s.level, s]))
    let fromModel = 0
    const floors = towerFloors(t).map((f): FloorArea => {
      const s = storeys.get(f.level)
      const el = s?.src && f.use === s.use ? model.elements.find((e) => e.id === s.src) : undefined
      if (el) fromModel++
      const useSource = el ? `${ROLE_LABEL[el.role]} "${el.name}" (${el.provenance.layer})`
        : f.skyLobby ? 'Sky lobby (Schematic)' : f.use === 'mechanical' && s?.use !== 'mechanical' ? 'Plant floor (Schematic)'
        : f.podium ? 'Podium use' : 'Program bands'
      return { level: f.level, z0: f.z0, z1: f.z1, use: f.use, area: f.area, podium: f.podium, useSource }
    })
    const byUse: Partial<Record<UseId, number>> = {}
    for (const f of floors) byUse[f.use] = round2((byUse[f.use] ?? 0) + f.area)
    return { towerId: t.id, name: t.name, floors, byUse, fromModel }
  })
}

// ---------- 6. drawings, boards and Present captures ----------

export interface PresentInput {
  /** One line for a capture or board frame: what the model is and how far to trust it. */
  caption: string
  /** Evidence lines for a board's sources block. */
  lines: { text: string; flag: Flag }[]
  /** Plan overlays in the project frame for site plans and drawings. */
  overlays: { site: Pt[][]; context: { rings: Pt[][]; height: number }[]; towers: { id: string; footprint: Pt[] }[] }
}

export function toPresent(model: InterchangeModel, towers: Tower[]): PresentInput {
  const ts = modelTowers(model, towers)
  const f = model.frame
  const flagWord: Record<Flag, string> = { verified: 'verified', team_assumption: 'team assumption', unverified: 'unverified', unresolved: 'unresolved', false_assumption: 'false assumption' }
  const lines: PresentInput['lines'] = [
    { text: `Massing from ${model.source.fileName} (${model.source.format.toUpperCase()}), ${ts.length} tower${ts.length === 1 ? '' : 's'}, mapped by ${model.mapping.by === 'userString' ? `user string "${model.mapping.key}"` : model.mapping.by === 'name' ? 'object name' : 'layer'}`, flag: model.elements.every((e) => e.provenance.evidence === 'team_assumption') ? 'team_assumption' : 'unverified' },
    { text: `Units ${f.fileUnit} (${f.unitSource === 'file' ? 'from the file' : f.unitSource === 'confirmed' ? 'confirmed by the designer' : 'chosen'}), scaled to metres`, flag: f.unitSource === 'file' ? 'unverified' : 'team_assumption' },
    { text: `North: ${f.north.label}${f.north.fileNorthDeg != null ? ` (${f.north.fileNorthDeg}° from file +Y)` : ''}`, flag: f.north.flag },
    { text: `Zero level: ${f.datum.label}${f.datum.shift ? ` (${f.datum.shift} m subtracted)` : ''}`, flag: f.datum.flag },
  ]
  const ctx = elementsBy(model, 'context')
  if (ctx.length) lines.push({ text: `${ctx.length} context building${ctx.length === 1 ? '' : 's'} from the same file, as extruded footprints`, flag: 'team_assumption' })
  return {
    caption: `Massing: ${model.source.fileName} · north ${flagWord[f.north.flag]} · LOD 100`,
    lines,
    overlays: {
      site: elementsBy(model, 'site').flatMap((e) => (e.geometry.kind === 'polygon' ? e.geometry.rings : [])),
      context: ctx.flatMap((e) => (e.geometry.kind === 'prism' ? [{ rings: e.geometry.rings, height: round2(e.geometry.z1 - e.geometry.z0) }] : [])),
      towers: ts.map((t) => ({ id: t.id, footprint: towerFootprint(t) })),
    },
  }
}

// ---------- 7. the Customize canvas ----------

/** The model as a node output on the canvas: one line per tower, the site, context, frame and what was left out. */
export function toCustomize(model: InterchangeModel | null, towers: Tower[]): NodeOutput {
  if (!model) return { state: 'idle', headline: 'No model uploaded', items: [] }
  const ts = toNodeTowers(model, towers)
  const items: Item[] = ts.map((t) => ({
    id: `model-${t.id}`, label: `${t.name}: storeys and floor area`, value: `${t.floors.length} floors · ${Math.round(t.gfa).toLocaleString('en-CA')} m² · ${t.height.toFixed(1)} m`,
    state: 'pass' as RuleState, flag: 'team_assumption' as Flag, source: { label: `${t.provenance.file}: ${t.provenance.layers.join(', ')}` }, towerId: t.id, towerName: t.name,
    note: `Core ${(t.core.share * 100).toFixed(1)}%: ${t.core.source}`,
  }))
  const pr = toPublicRealm(model, towers, 0)
  items.push(pr.site
    ? { id: 'model-site', label: 'Site boundary', value: `${Math.round(pr.site.area).toLocaleString('en-CA')} m²`, state: 'pass', flag: pr.site.flag, source: { label: pr.site.source } }
    : { id: 'model-site', label: 'Site boundary', value: 'none mapped', state: 'unknown', flag: 'unresolved', source: SOURCE })
  const ctx = elementsBy(model, 'context').length
  items.push({ id: 'model-context', label: 'Context buildings', value: String(ctx), state: ctx ? 'pass' : 'unknown', flag: ctx ? 'team_assumption' : 'unresolved', source: SOURCE, note: 'Extruded footprints; they cast shadows in the solar check' })
  items.push({ id: 'model-north', label: 'North', value: model.frame.north.label, state: model.frame.north.flag === 'unresolved' ? 'warn' : 'pass', flag: model.frame.north.flag, source: { label: model.source.northNote || SOURCE.label } })
  items.push({ id: 'model-datum', label: 'Zero level', value: model.frame.datum.label, state: 'pass', flag: model.frame.datum.flag, source: SOURCE })
  if (model.ignored.length) items.push({ id: 'model-ignored', label: 'Left out of the model', value: String(model.ignored.length), state: 'warn', flag: 'team_assumption', source: SOURCE, note: model.ignored.slice(0, 3).map((x) => `${x.name}: ${x.reason}`).join(' · ') })
  const blocked = model.checks.some((c) => c.severity === 'block')
  const warn = items.some((x) => x.state === 'warn') || model.checks.some((c) => c.severity === 'warn')
  const missing = model.towers.filter((mt) => !ts.some((t) => t.id === mt.id)).length
  return {
    state: blocked ? 'fail' : warn ? 'warn' : 'pass',
    headline: `${model.source.fileName}: ${ts.length} tower${ts.length === 1 ? '' : 's'}${missing ? ` (${missing} removed since upload)` : ''}${pr.site ? ' · site' : ''}${ctx ? ` · ${ctx} context` : ''}`,
    items,
  }
}

// ---------- 8. export back to .3dm, OBJ and glTF ----------

export type InterchangeScene = ExportScene & { curves: ExportCurve[] }

const hex = (c: string): RGB => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
export const ROLE_LAYER = { podium: 'Massing::Podium', crown: 'Massing::Crown and parapet', void: 'Massing::No floor (void or spire)', site: 'Site boundary', context: 'Context', reference: 'Reference::Uploaded mesh (not read back)' }

/**
 * Everything in the project as role-tagged geometry: each storey as a closed solid (program or podium, with its use,
 * level and the element that set it), the crown above the last storey, cores, the site boundary curve and the context
 * prisms. Every object carries `role`, `element_id`, `tower`, the storey schedule and its provenance as user strings,
 * so an upload of the export reads back the same towers, storeys, uses and roles.
 */
export function toExportScene(towers: Tower[], model: InterchangeModel | null, o: SceneOptions): InterchangeScene {
  const solids: ExportSolid[] = []
  const layers = new Map<string, RGB>()
  const add = (s: ExportSolid) => { solids.push(s); if (!layers.has(s.layer)) layers.set(s.layer, s.color) }
  const prov = (e: ModelElement | undefined): Record<string, string> => (e ? {
    source_file: e.provenance.file, source_layer: e.provenance.layer, ...(e.provenance.objectId ? { source_object_id: e.provenance.objectId } : {}), evidence: e.provenance.evidence,
  } : {})
  for (const t of towers) {
    const schedule = scheduleOf(t)
    const common = { tower: t.name, tower_id: t.id, f2f_m: fmt(schedule.f2f), podium_top_m: fmt(schedule.podiumTop), podium_f2f_m: fmt(schedule.podiumF2F) }
    if (!t.imported) {
      // Parametric tower: the existing scene, with roles added (podium storeys, program storeys, core).
      for (const s of buildScene([t], o).solids) {
        const role = s.layer === LAYER.core ? 'core' : s.strings.podium === 'yes' ? 'podium' : 'program'
        add({ ...s, strings: { ...s.strings, role, element_id: `${t.id}-${role === 'core' ? 'core' : `L${s.strings.level}`}`, ...common } })
      }
      const floors = towerFloors(t)
      const last = floors.length ? floors[floors.length - 1].z1 : 0
      if (t.height - last > 0.05) {
        const ring: Pt[] = floorRing(t, { z0: last, z1: t.height }) // the block the crown belongs to
        add({ name: `${t.name} · crown`, layer: ROLE_LAYER.crown, color: [190, 194, 200], ...closedPrism([ring], last, t.height), strings: { role: 'tower', element_id: `${t.id}-crown`, ...common, source: 'tower height above the last storey (Design panel)' } })
      }
      continue
    }
    const m = t.imported
    const el = (id?: string) => (id && model ? model.elements.find((e) => e.id === id) : undefined)
    for (const s of m.storeys) {
      const outer = s.loops.filter((l) => ringArea(l) > 0).map((l) => placeRing(t, l))
      const holes = s.loops.filter((l) => ringArea(l) < 0).map((l) => placeRing(t, l))
      if (!outer.length) continue
      const src = el(s.src)
      const role = !s.hasFloor ? 'tower' : s.podium ? 'podium' : 'program'
      const layer = role === 'tower' ? ROLE_LAYER.void : role === 'podium' ? ROLE_LAYER.podium : LAYER.use(s.use)
      const color = role === 'tower' ? [200, 203, 208] as RGB : hex(USES[s.use].color)
      for (const [k, ring] of outer.entries()) {
        add({
          name: `${t.name} · L${s.level}${s.hasFloor ? ` ${USES[s.use].label}` : ' (no floor)'}${outer.length > 1 ? ` part ${k + 1}` : ''}`, layer, color, ...closedPrism([ring, ...holes.filter((h) => inside(h[0], ring))], s.z0, s.z1),
          strings: {
            role, ...(s.hasFloor ? { use: s.use } : {}), level: String(s.level), z0_m: fmt(s.z0), z1_m: fmt(s.z1), gross_area_m2: s.area.toFixed(1), podium: s.podium ? 'yes' : 'no',
            element_id: `${t.id}-L${s.level}${outer.length > 1 ? `-${k + 1}` : ''}`, ...common,
            source: src ? `use from ${ROLE_LABEL[src.role]} "${src.name}"` : s.podium ? 'podium use' : 'program bands', ...prov(src ?? el(m.source?.elementIds[0])),
          },
        })
      }
    }
    const lastTop = m.storeys.length ? m.storeys[m.storeys.length - 1].z1 : 0
    const lastLoops = [...m.storeys].reverse().find((s) => s.loops.length)?.loops.filter((l) => ringArea(l) > 0) ?? []
    if (m.top - lastTop > 0.05 && lastLoops.length) {
      for (const ring of lastLoops) add({ name: `${t.name} · crown`, layer: ROLE_LAYER.crown, color: [190, 194, 200], ...closedPrism([placeRing(t, ring)], lastTop, m.top), strings: { role: 'tower', element_id: `${t.id}-crown`, ...common, source: 'top of the uploaded volumes above the last storey (outline of the last storey)', ...prov(el(m.source?.elementIds[0])) } })
    }
    const mesh = o.meshOf(m.meshId)
    if (mesh) {
      const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
      const positions: number[] = []
      for (let i = 0; i < mesh.positions.length; i += 3) { const x = mesh.positions[i], y = mesh.positions[i + 1]; positions.push(t.x + x * c - y * sn, t.y + x * sn + y * c, mesh.positions[i + 2]) }
      add({ name: `${t.name} · uploaded mesh`, layer: ROLE_LAYER.reference, color: [170, 176, 184], positions, indices: Array.from(mesh.indices), strings: { role: 'ignore', tower: t.name, element_id: `${t.id}-mesh`, source: `uploaded ${m.format}: ${m.fileName} (reference only: the storeys above carry the roles)` } })
    }
    // Core: a centred square of the core share (LOD 100), so an upload of the export measures the same share.
    const plate = typicalPlateArea(t)
    if (plate > 0) {
      const half = Math.sqrt(t.coreShare * plate) / 2
      const ring = placeRing(t, [[-half, -half], [half, -half], [half, half], [-half, half]].map(([u, v]) => [u + coreCentre(t)[0], v + coreCentre(t)[1]] as Pt))
      add({ name: `${t.name} · Core`, layer: LAYER.core, color: [60, 64, 72], ...closedPrism([ring], 0, lastTop), strings: { role: 'core', element_id: `${t.id}-core`, ...common, core_share: t.coreShare.toFixed(3), core_mode: t.coreAuto === false ? 'measured or set by hand' : 'sized to the lifts', evidence: 'team_assumption (LOD 100 space reservation)' } })
    }
  }
  const curves: ExportCurve[] = []
  if (model) {
    for (const e of elementsBy(model, 'site')) {
      if (e.geometry.kind !== 'polygon') continue
      const z = e.geometry.z
      for (const ring of e.geometry.rings) curves.push({ name: e.name || 'Site boundary', layer: ROLE_LAYER.site, color: hex('#2a9d8f'), points: ring.flatMap(([x, y]) => [x, y, z]), closed: true, strings: { role: 'site', element_id: e.id, ...prov(e) } })
    }
    for (const e of elementsBy(model, 'context')) {
      if (e.geometry.kind !== 'prism') continue
      add({ name: e.name, layer: ROLE_LAYER.context, color: [154, 149, 139], ...closedPrism(e.geometry.rings, e.geometry.z0, e.geometry.z1), strings: { role: 'context', element_id: e.id, ...prov(e), source: 'extruded footprint of the uploaded context (flat roof)' } })
    }
    if (curves.length && !layers.has(ROLE_LAYER.site)) layers.set(ROLE_LAYER.site, hex('#2a9d8f'))
  }
  const base = buildScene([], o)
  return {
    solids, curves, layers: [...layers.entries()].map(([path, color]) => ({ path, color })),
    notes: { ...base.notes, content: 'One closed solid per storey (role and use as user strings), crown, core, site boundary curve and context prisms; uploaded meshes on a reference layer', ...(model ? { model_id: model.id, model_source: model.source.fileName } : {}), interchange: 'tower-studio-interchange@1 roles: role, use, level, tower, element_id, f2f_m, podium_top_m, podium_f2f_m' },
  }
}

// ---------- helpers ----------

function scheduleOf(t: Tower): { f2f: number; podiumTop: number; podiumF2F: number } {
  if (t.imported) return { f2f: t.imported.f2f, podiumTop: t.imported.podiumTop, podiumF2F: t.imported.podiumF2F }
  const n = t.podiumHeight > 0 ? Math.max(1, Math.round(t.podiumHeight / PODIUM_F2F)) : 0
  return { f2f: t.f2f, podiumTop: t.podiumHeight, podiumF2F: n ? t.podiumHeight / n : PODIUM_F2F }
}

function typicalPlateArea(t: Tower): number {
  const a = (t.imported?.storeys ?? []).filter((s) => s.hasFloor && !s.podium).map((s) => s.area).sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : t.width * t.depth
}
/** Core centre (tower frame): the centroid of the typical storey's outline. */
function coreCentre(t: Tower): Pt {
  const fl = (t.imported?.storeys ?? []).filter((s) => s.hasFloor && !s.podium && s.loops.length)
  const s = fl[Math.floor(fl.length / 2)]
  const ring = s?.loops.find((l) => ringArea(l) > 0)
  if (!ring) return [0, 0]
  let a = 0, cx = 0, cy = 0
  ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; const k = p[0] * q[1] - q[0] * p[1]; a += k; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k })
  return a ? [cx / (3 * a), cy / (3 * a)] : [0, 0]
}

/** Closed, outward-facing prism over an outer ring and its holes (any shape; caps by ear clipping). */
export function closedPrism(rings: Pt[][], z0: number, z1: number): { positions: number[]; indices: number[] } {
  const rs = rings.map((r, i) => ((ringArea(r) > 0) === (i === 0) ? r : [...r].reverse()))
  const positions: number[] = [], indices: number[] = []
  for (const r of rs) {
    const b = positions.length / 3, n = r.length
    for (const [x, y] of r) positions.push(x, y, z0)
    for (const [x, y] of r) positions.push(x, y, z1)
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; indices.push(b + i, b + j, b + n + j, b + i, b + n + j, b + n + i) }
  }
  const tris = earcutFlat(rs)
  const flat = rs.flat()
  const bot = positions.length / 3
  for (const [x, y] of flat) positions.push(x, y, z0)
  const top = positions.length / 3
  for (const [x, y] of flat) positions.push(x, y, z1)
  for (let k = 0; k < tris.length; k += 3) { indices.push(bot + tris[k], bot + tris[k + 2], bot + tris[k + 1]); indices.push(top + tris[k], top + tris[k + 1], top + tris[k + 2]) }
  return { positions, indices }
}

function inside([x, y]: Pt, ring: Pt[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
const fmt = (v: number) => String(Math.round(v * 1000) / 1000)
const round2 = (v: number) => Math.round(v * 100) / 100
const round3 = (v: number) => Math.round(v * 1000) / 1000
const round2n = (v: number | null) => (v == null ? null : round2(v))
