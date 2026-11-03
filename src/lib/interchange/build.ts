// Read file + role mapping + units/north/datum → Layer 0 interchange model and the towers every node runs on.
// Pure (no store, no three.js), so the same code runs in the upload dialog, the tests and the evaluation cases.
//
// Rules (team assumptions, 3 Nov 2026, listed in INTERCHANGE.md):
// - tower and program volumes that overlap in plan (or share a `tower` user string) are one tower;
// - a podium volume belongs to the tower it overlaps most; its top is the podium top;
// - a program volume tags the storeys whose mid-height it spans, where it overlaps the plate in plan;
// - the core share is the median of core area / plate area over the tower's storeys;
// - context buildings are extruded footprints (cut 1 m above their base), z from their lowest to highest point.
import { bounds, chainLoops, convexHull, mergeMeshes, plateAt, planHull, ringArea, transformMesh, type Bounds, type MeshData } from '../../engine/importGeom'
import { towerPatch } from '../../engine/imported'
import { withAutoCore, type LiftPresets } from '../../engine/lifts'
import type { EgressPresets } from '../../engine/egress'
import { fmtLen, guessUnit, guessUpAxis, looksLikeUtm10, topology, UNIT_LABEL, UNIT_SCALE, type HealthItem, type Topology, type Unit } from '../../engine/meshHealth'
import { PODIUM_F2F } from '../../engine/massing'
import type { Band, Flag, ImportedMass, Tower, UseId } from '../../engine/types'
import { buildMass, DATUM_LABEL, earthPoint, healthFor, NORTH_LABEL, stageB, stageC, type ImportOptions, type Placed, type ProjectFrame } from '../import/pipeline'
import type { RawImport } from '../import/types'
import { itemsOf, roleOf, type Item, type ItemRole } from './mapping'
import { hash8, INTERCHANGE_VERSION, MASSING_ROLES, ROLE_LABEL, type IgnoredItem, type InterchangeModel, type Mapping, type ModelCheck, type ModelElement, type ModelTower, type P3, type Provenance, type Pt } from './model'

export interface BuildInput {
  raw: RawImport & { unitScaleOverride?: number }
  mapping: Mapping
  opts: ImportOptions
  frame: ProjectFrame
  /** Program bands and podium use for storeys no program element covers (the selected tower's, as before). */
  bands: Band[]
  podiumUse: UseId
  /** Tower ids already in the project, so new ids do not collide. */
  takenIds?: string[]
  liftPresets?: LiftPresets
  egressPresets?: EgressPresets
}

export interface BuiltTower {
  key: string
  tower: Tower
  /** Mesh in the tower frame (plan centre at 0, z = 0 at the entrance floor), metres. */
  mesh: MeshData
  topo: Topology
  health: HealthItem[]
}

export interface BuildResult {
  model: InterchangeModel
  towers: BuiltTower[]
  /** Massing as one mesh, placed (for the dialog's plan preview and the whole-model health list). */
  placed: Placed | null
  massing: { mesh: MeshData; bounds: Bounds; objects: number; triangles: number; sources: string[] } | null
  /** Why the model cannot be used, in plain words; null when it can. */
  blocked: string | null
}

const MAP_BY: Record<Mapping['by'], string> = { layer: 'Layer', name: 'Object name', userString: 'User string' }
const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000

export function buildModel(i: BuildInput): BuildResult {
  const { raw, mapping, opts, frame } = i
  const scale = raw.unitScaleOverride ?? UNIT_SCALE[opts.unit]
  const yUp = opts.upAxis === 'y'
  const items = itemsOf(raw)
  const roles = items.map((it) => roleOf(it, mapping))
  const modelId = `m${hash8(`${raw.fileName}|${raw.fileSize ?? ''}|${raw.fingerprint ?? ''}`)}`
  const fileBase = raw.fileName.replace(/\.[^.]+$/, '').slice(0, 24) || 'Model'

  // ---- provenance and stable ids ----
  const confirmed = new Set(mapping.confirmed ?? [])
  const prov = (it: Item, r: ItemRole): Provenance => ({
    file: raw.fileName, format: raw.format, layer: it.layer, objectId: it.objectId || null, objectName: it.name, objectType: it.kind,
    ...(it.userStrings ? { userStrings: it.userStrings } : {}),
    geometrySource: it.curve ? 'Curve points (polylines exact, curves sampled at 48 steps)' : it.meshSource,
    ...(it.block ? { block: it.block } : {}),
    mappedBy: `${MAP_BY[mapping.by]}${mapping.by === 'userString' ? ` "${mapping.key}"` : ''}: ${r.row}`,
    // Set or confirmed by the person in the mapping screen: their decision; guessed from names only: unverified.
    evidence: confirmed.has(r.row) ? 'team_assumption' : 'unverified',
  })
  const used = new Set<string>()
  const ids = items.map((it, k) => {
    let id = it.userStrings?.element_id || `${roles[k].role}-${it.objectId ? it.objectId.slice(0, 8) : hash8(`${it.layer}|${it.name}|${k}`)}`
    for (let n = 2; used.has(id); n++) id = `${id.replace(/~\d+$/, '')}~${n}`
    used.add(id)
    return id
  })

  // ---- units and axes ----
  const scaled = new Map<number, MeshData>()
  const meshOf = (k: number) => {
    let m = scaled.get(k)
    if (!m) { const it = items[k] as Item & { curve?: false }; m = transformMesh(it.mesh, { yUp, scale }); scaled.set(k, m) }
    return m
  }
  const pointM = (p: number[]): P3 => (yUp ? [p[0] * scale, -p[2] * scale, p[1] * scale] : [p[0] * scale, p[1] * scale, p[2] * scale])

  const ignored: IgnoredItem[] = raw.skipped.map((s) => ({ name: s.name, layer: s.layer, kind: s.kind, reason: s.reason, ...(s.objectId ? { objectId: s.objectId } : {}) }))
  const ignore = (k: number, reason: string) => { const it = items[k]; ignored.push({ name: it.name, layer: it.layer, kind: it.kind, reason, ...(it.objectId ? { objectId: it.objectId } : {}) }) }
  items.forEach((_, k) => { if (roles[k].role === 'ignore') ignore(k, `${MAP_BY[mapping.by]} "${roles[k].row}" is set to Ignore`) })

  const massIdx = items.map((_, k) => k).filter((k) => !items[k].curve && MASSING_ROLES.includes(roles[k].role))
  const checks: ModelCheck[] = []
  const empty = (blocked: string): BuildResult => ({
    model: shell([], [], blocked), towers: [], placed: null, massing: null, blocked,
  })
  const shell = (elements: ModelElement[], towers: ModelTower[], blocked: string | null, placed?: Placed): InterchangeModel => ({
    version: INTERCHANGE_VERSION, id: modelId, project: frame.project,
    source: { fileName: raw.fileName, format: raw.format, fileSize: raw.fileSize ?? null, fingerprint: raw.fingerprint ?? null, unitNote: raw.unitNote, northNote: raw.northNote },
    frame: {
      units: 'm', fileUnit: raw.unitScaleOverride ? raw.unitNote.replace(/^Rhino model units: /, '') : opts.unit,
      unitSource: raw.unit && raw.unit === opts.unit ? 'file' : opts.unitConfirmed ? 'confirmed' : 'chosen', scale, upAxis: opts.upAxis,
      north: { fileNorthDeg: placed?.fileNorthDeg ?? null, rotation: placed?.rotation ?? 0, label: opts.north === 'unresolved' || placed?.fileNorthDeg == null ? 'Unresolved' : NORTH_LABEL[opts.north], flag: northFlag(opts) },
      datum: { shift: r3(placed?.datumShift ?? 0), label: DATUM_LABEL[opts.datum], flag: 'team_assumption' },
      placement: {
        mode: opts.placement, fileCentre: (placed?.rawCentre.map(r3) ?? [0, 0]) as Pt, x: r3(placed?.x ?? 0), y: r3(placed?.y ?? 0),
        ...(opts.placement === 'anchor' && opts.anchor ? { anchor: { model: opts.anchor.model.map(r3) as Pt, city: opts.anchor.city.map(r3) as Pt, turn: opts.anchor.turn } } : {}),
        ...(opts.placement === 'earth' && raw.earthAnchor ? { earth: { lat: raw.earthAnchor.lat, lon: raw.earthAnchor.lon, turn: opts.anchor?.turn ?? 0 } } : {}),
      },
    },
    mapping, elements, towers, ignored, checks: blocked ? [...checks, { id: 'blocked', severity: 'block', text: blocked }] : checks,
  })

  if (!massIdx.length) {
    const nothing = !raw.objects.length && !(raw.curves ?? []).some((c) => c.closed)
    return empty(nothing ? explainEmpty(raw) : `Nothing is mapped to ${ROLE_LABEL.tower}, ${ROLE_LABEL.podium} or ${ROLE_LABEL.program}, so there is no tower to slice. Map at least one layer with volumes to one of them.`)
  }

  // ---- placement of the whole massing (same rules as the single-mass import) ----
  const mergedMass = mergeMeshes(massIdx.map(meshOf))
  const A = { mesh: mergedMass, bounds: bounds(mergedMass) }
  const placed = stageB(raw, A, opts, frame)
  const height = A.bounds.max[2] - placed.datumShift
  if (height > 2000 || height < 1) return { ...empty(`The massing would be ${fmtLen(height)} tall in ${UNIT_LABEL[opts.unit as Unit] ?? opts.unit}: check the units before going on.`), placed, massing: { ...A, objects: massIdx.length, triangles: mergedMass.indices.length / 3, sources: [] } }
  const rot = (placed.rotation * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot)
  const [cx, cy] = placed.rawCentre
  const dz = placed.datumShift
  // Millimetres: centimetre rounding after a turn moves a 450 m lot line's area by up to 2 m².
  const toProj = (x: number, y: number): Pt => [r3(placed.x + (x - cx) * cs - (y - cy) * sn), r3(placed.y + (x - cx) * sn + (y - cy) * cs)]
  const ccw = (r: Pt[]) => (ringArea(r) < 0 ? [...r].reverse() : r)

  // ---- towers: group tower and program volumes by plan overlap (or a shared `tower` user string) ----
  const box = (k: number) => bounds(meshOf(k))
  let towerIdx = massIdx.filter((k) => roles[k].role !== 'podium')
  const podiumIdx = massIdx.filter((k) => roles[k].role === 'podium')
  const podiumOnly = !towerIdx.length
  if (podiumOnly) towerIdx = podiumIdx
  const parent = towerIdx.map((_, n) => n)
  const find = (n: number): number => (parent[n] === n ? n : (parent[n] = find(parent[n])))
  const tag = (k: number) => items[k].userStrings?.tower
  for (let a = 0; a < towerIdx.length; a++) {
    for (let b = a + 1; b < towerIdx.length; b++) {
      const ta = tag(towerIdx[a]), tb = tag(towerIdx[b])
      const same = ta && tb ? ta === tb : overlapArea(box(towerIdx[a]), box(towerIdx[b])) > 0.01
      if (same) parent[find(a)] = find(b)
    }
  }
  const groupsMap = new Map<number, number[]>()
  towerIdx.forEach((k, n) => { const g = find(n); groupsMap.set(g, [...(groupsMap.get(g) ?? []), k]) })
  const groupBox = (ks: number[]) => ks.map(box).reduce(unionBox)
  const groups = [...groupsMap.values()].map((ks) => ({ ks, b: groupBox(ks) }))
  const centreOf = (b: Bounds) => toProj((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2)
  groups.sort((a, b) => centreOf(a.b)[0] - centreOf(b.b)[0] || centreOf(a.b)[1] - centreOf(b.b)[1])
  const attach = (k: number) => {
    const named = tag(k) ? groups.findIndex((g) => g.ks.some((m) => tag(m) === tag(k))) : -1
    if (named >= 0) return named
    const b = box(k)
    let best = 0, bestA = -1
    groups.forEach((g, n) => { const a = overlapArea(b, g.b); if (a > bestA) { bestA = a; best = n } })
    if (bestA <= 0) {
      const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]
      let d = Infinity
      groups.forEach((g, n) => { const gc = [(g.b.min[0] + g.b.max[0]) / 2, (g.b.min[1] + g.b.max[1]) / 2]; const dd = Math.hypot(gc[0] - c[0], gc[1] - c[1]); if (dd < d) { d = dd; best = n } })
    }
    return best
  }
  const podiumsOf = groups.map(() => [] as number[]), coresOf = groups.map(() => [] as number[])
  if (!podiumOnly) for (const k of podiumIdx) podiumsOf[attach(k)].push(k)
  const coreIdx = items.map((_, k) => k).filter((k) => !items[k].curve && roles[k].role === 'core')
  for (const k of coreIdx) coresOf[attach(k)].push(k)

  // ---- slice each tower ----
  const elements: ModelElement[] = []
  const modelTowers: ModelTower[] = []
  const built: BuiltTower[] = []
  const taken = new Set(i.takenIds ?? [])
  const sliceds = groups.map((g, n) => {
    const key = `T${n + 1}`
    const members = [...g.ks, ...podiumsOf[n]]
    const merged = mergeMeshes(members.map(meshOf))
    const gb = bounds(merged)
    const gx = (gb.min[0] + gb.max[0]) / 2, gy = (gb.min[1] + gb.max[1]) / 2
    const local = transformMesh(merged, { translate: [-gx, -gy, -dz] })
    const [tx, ty] = toProj(gx, gy)
    const topo = topology(local)
    const num = (name: string) => majority(members.map((k) => Number(items[k].userStrings?.[name])).filter((v) => Number.isFinite(v) && v > 0))
    const f2f = num('f2f_m') ?? opts.f2f
    const podiumF2F = num('podium_f2f_m') ?? opts.podiumF2F
    const podTops = podiumsOf[n].map((k) => box(k).max[2] - dz)
    const podiumTop = podiumOnly ? r2(gb.max[2] - dz) : opts.podiumTop ?? (podTops.length ? r2(Math.max(...podTops)) : num('podium_top_m') ?? null)
    const podiumSource = podiumOnly ? 'The whole building is podium (only podium volumes were mapped)'
      : opts.podiumTop != null ? 'Typed in the upload'
      : podTops.length ? `Top of the podium volume${podTops.length > 1 ? 's' : ''} (${uniq(podiumsOf[n].map((k) => items[k].layer)).join(', ')})`
      : num('podium_top_m') != null ? 'podium_top_m user string' : 'Found where the plate shrinks by 30% or more (heuristic)'
    const podiumUse = majority(podiumsOf[n].map((k) => roles[k].use).filter((u): u is UseId => !!u)) ?? i.podiumUse
    const sliced = stageC(local, topo, { f2f, podiumTop, podiumF2F }, { bands: i.bands, podiumUse })
    // Program volumes (and podium volumes with a use) tag the storeys they contain.
    const zones = [...g.ks.filter((k) => roles[k].role === 'program'), ...podiumsOf[n]].filter((k) => roles[k].use).map((k) => {
      const b = box(k)
      return { use: roles[k].use as UseId, id: ids[k], z0: b.min[2] - dz, z1: b.max[2] - dz, x0: b.min[0] - gx, x1: b.max[0] - gx, y0: b.min[1] - gy, y1: b.max[1] - gy }
    })
    let tagged = 0
    const storeys = sliced.storeys.map((s) => {
      if (!s.hasFloor || !zones.length) return s
      const mid = (s.z0 + s.z1) / 2
      const pts = s.loops.flat()
      if (!pts.length) return s
      const sb = { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) }
      let best: (typeof zones)[number] | null = null, bestA = 0
      for (const z of zones) {
        if (mid < z.z0 - 1e-6 || mid > z.z1 + 1e-6) continue
        const a = Math.max(0, Math.min(sb.x1, z.x1) - Math.max(sb.x0, z.x0)) * Math.max(0, Math.min(sb.y1, z.y1) - Math.max(sb.y0, z.y0))
        if (a > bestA) { bestA = a; best = z }
      }
      if (!best) return s
      tagged++
      return { ...s, use: best.use, src: best.id }
    })
    return { g, key, members, local, gx, gy, tx, ty, topo, f2f, podiumF2F, podiumSource, podiumUse, sliced, storeys, tagged, absorbed: 0 }
  })
  // A tower standing inside another tower's podium: its storeys below that podium's top are already counted in the
  // podium's plates, so they keep no floor of their own (team assumption; said in the checks).
  sliceds.forEach((a, n) => {
    a.storeys = a.storeys.map((s) => {
      if (!s.hasFloor || s.podium || !s.loops.length) return s
      const mid = (s.z0 + s.z1) / 2, pts = s.loops.flat()
      const x0 = Math.min(...pts.map((p) => p[0])) + a.gx, x1 = Math.max(...pts.map((p) => p[0])) + a.gx
      const y0 = Math.min(...pts.map((p) => p[1])) + a.gy, y1 = Math.max(...pts.map((p) => p[1])) + a.gy
      const inPodium = podiumsOf.some((ks, m) => m !== n && ks.some((k) => {
        const b = box(k)
        return mid < b.max[2] - dz && x0 >= b.min[0] - 0.01 && x1 <= b.max[0] + 0.01 && y0 >= b.min[1] - 0.01 && y1 <= b.max[1] + 0.01
      }))
      if (!inPodium) return s
      a.absorbed++
      return { ...s, hasFloor: false }
    })
  })
  sliceds.forEach(({ key, members, local, gx, gy, tx, ty, topo, f2f, podiumF2F, podiumSource, podiumUse, sliced, storeys, tagged, absorbed }, n) => {
    // Core share from the core volumes, measured storey by storey.
    let coreShare: number | null = null
    if (coresOf[n].length) {
      const cm = transformMesh(mergeMeshes(coresOf[n].map(meshOf)), { translate: [-gx, -gy, -dz] })
      const shares = storeys.filter((s) => s.hasFloor && !s.podium && s.area > 0).map((s) => plateAt(cm, (s.z0 + s.z1) / 2).area / s.area).filter((v) => v > 0)
      if (shares.length) coreShare = r3(Math.min(0.6, Math.max(0.05, median(shares))))
    }
    const meshId = `${modelId}-${key}`
    const placedG: Placed = { ...placed, local, x: tx, y: ty }
    const health = healthFor(placedG, topo, sliced, frame, opts.unit)
    let id = `${modelId}-${key}`
    for (let k = 2; taken.has(id); k++) id = `${modelId}-${key}-${k}`
    taken.add(id)
    const name = majorityStr(members.map((k) => items[k].userStrings?.tower)) ?? (groups.length === 1 ? fileBase : `${fileBase} ${key}`)
    const elementIds = members.concat(coresOf[n]).map((k) => ids[k])
    const mass: ImportedMass = { ...buildMass(raw, opts, placedG, { ...sliced, storeys }, health, meshId), source: { modelId, towerKey: key, elementIds } }
    const tower = towerFromMass(mass, { x: tx, y: ty, rotation: placed.rotation }, { id, name, bands: i.bands, podiumUse, coreShare }, i.liftPresets, i.egressPresets)
    built.push({ key, tower, mesh: local, topo, health })
    modelTowers.push({ id, name, elementIds, schedule: { f2f, podiumTop: sliced.podiumTop, podiumF2F, podiumSource }, coreShare, taggedStoreys: tagged })
    if (absorbed) checks.push({ id: `inpodium-${key}`, severity: 'info', text: `${name}: its ${absorbed} lowest storeys stand inside another tower's podium, so their area is counted once, in the podium.`, flag: 'team_assumption' })
    for (const k of [...members, ...coresOf[n]]) {
      const m = meshOf(k), b = bounds(m)
      const hull = planHull(m).map(([x, y]) => toProj(x, y))
      const lv = Number(items[k].userStrings?.level)
      elements.push({
        id: ids[k], role: roles[k].role, name: items[k].name,
        tags: { ...(roles[k].use ? { use: roles[k].use } : {}), ...(Number.isFinite(lv) ? { level: lv } : {}), towerId: id },
        geometry: { kind: 'mesh', bbox: projBox(b, toProj, dz), footprint: ccw(hull), triangles: m.indices.length / 3, meshId },
        provenance: prov(items[k], roles[k]),
      })
    }
  })

  // ---- site boundary: closed curves, or the outline of a flat surface ----
  items.forEach((it, k) => {
    if (roles[k].role !== 'site') return
    if (it.curve) {
      if (!it.closed || it.points.length < 3) { ignore(k, 'Open curve on a site row: close it in Rhino (Close or Join) to use it as the site boundary'); return }
      const pts = it.points.map(pointM)
      const ring = ccw(pts.map((p) => toProj(p[0], p[1])))
      elements.push({ id: ids[k], role: 'site', name: it.name, tags: {}, geometry: { kind: 'polygon', rings: [ring], z: r2(pts.reduce((s, p) => s + p[2], 0) / pts.length - dz) }, provenance: prov(it, roles[k]) })
    } else {
      const m = meshOf(k)
      const outline = meshOutline(m)
      if (!outline) { ignore(k, 'No outline could be traced from this surface: draw the lot line as a closed curve'); return }
      elements.push({ id: ids[k], role: 'site', name: it.name, tags: {}, geometry: { kind: 'polygon', rings: [ccw(outline.map(([x, y]) => toProj(x, y)))], z: r2(bounds(m).min[2] - dz) }, provenance: prov(it, roles[k]) })
    }
  })

  // ---- context buildings: extruded footprints ----
  items.forEach((it, k) => {
    const role = roles[k].role
    if (role !== 'context' && role !== 'core') return
    if (it.curve) { ignore(k, `Curves on a ${ROLE_LABEL[role]} row are not used: only volumes are`); return }
    if (role === 'core') return
    const m = meshOf(k), b = bounds(m)
    const cut = b.min[2] + Math.min(1, (b.max[2] - b.min[2]) / 2)
    let rings = plateAt(m, cut).loops.filter((l) => ringArea(l) > 0)
    if (!rings.length) rings = [convexHull(planHull(m))]
    elements.push({
      id: ids[k], role: 'context', name: it.name, tags: {},
      geometry: { kind: 'prism', rings: rings.map((r) => ccw(r.map(([x, y]) => toProj(x, y)))), z0: r2(b.min[2] - dz), z1: r2(b.max[2] - dz) },
      provenance: prov(it, roles[k]),
    })
  })
  items.forEach((it, k) => { if (it.curve && MASSING_ROLES.includes(roles[k].role)) ignore(k, `Curves on a ${ROLE_LABEL[roles[k].role]} row are not used: only closed volumes are sliced`) })
  massIdx.filter((k) => roles[k].role === 'program' && !roles[k].use).forEach((k) => checks.push({ id: `nouse-${ids[k]}`, severity: 'warn', text: `"${items[k].name}" is program without a use: it counts as massing, and its storeys follow the program bands.`, flag: 'unresolved' }))

  // ---- plain-language checks ----
  checks.unshift(...describe({ raw, opts, placed, scale, built, modelTowers, elements, ignored, items, roles, massIdx, meshOf, frame }))
  const blockers = built.flatMap((b) => b.health.filter((h) => h.severity === 'block').map((h) => `${b.tower.name}: ${h.title}`))
  const noStoreys = built.filter((b) => !b.tower.imported?.storeys.some((s) => s.hasFloor)).map((b) => b.tower.name)
  const stop = checks.find((c) => c.severity === 'block' && c.id !== 'health')
  const blocked = blockers.length ? `Fix first: ${blockers.join('; ')}.` : noStoreys.length ? `${noStoreys.join(', ')}: no storey has a floor plate of 25 m² or more.` : stop ? stop.text : null
  return {
    model: shell(elements, modelTowers, blocked, placed), towers: built, placed, blocked,
    massing: { ...A, objects: massIdx.length, triangles: mergedMass.indices.length / 3, sources: uniq(massIdx.map((k) => (items[k] as RawImport['objects'][number]).meshSource)) },
  }
}

/** The tower record for an imported mass: placement, the mass's storeys and plate, and a measured core if there is one. */
export function towerFromMass(mass: ImportedMass, place: { x: number; y: number; rotation: number }, o: { id: string; name: string; bands: Band[]; podiumUse: UseId; coreShare?: number | null; like?: Tower }, lp?: LiftPresets, ep?: EgressPresets): Tower {
  const base: Tower = {
    id: o.id, name: o.name, x: place.x, y: place.y, rotation: place.rotation,
    width: 40, depth: 40, height: mass.top, f2f: mass.f2f, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40, podiumUse: o.podiumUse,
    bands: o.bands.map((b) => ({ ...b })),
    coreShare: o.like?.coreShare ?? 0.25, plantEvery: 0, coreAuto: o.like?.coreAuto ?? true, skyLobbies: [], skyRoom: null,
    ...(o.like?.stairPlacement ? { stairPlacement: o.like.stairPlacement } : {}),
  }
  const core = o.coreShare != null ? { coreShare: o.coreShare, coreAuto: false } : {}
  return withAutoCore({ ...base, ...towerPatch(mass), ...core }, lp, ep)
}

/** What could not be used at all, by kind, for a file with no volumes and no closed curves (the out-of-scope stop). */
export function explainEmpty(raw: RawImport): string {
  const kinds = new Map<string, number>()
  for (const s of raw.skipped) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1)
  for (const c of raw.curves ?? []) kinds.set(c.closed ? 'closed curve' : 'open curve', (kinds.get(c.closed ? 'closed curve' : 'open curve') ?? 0) + 1)
  const list = [...kinds.entries()].map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ')
  return `Nothing in ${raw.fileName} can be used: it has no closed volumes (polysurfaces, extrusions or meshes)${list ? `, only ${list}` : ''}. Tower Design Toolkit needs the tower as closed volumes to slice storeys, and estimates nothing without them. In Rhino, model or select the massing, check it is closed (ShowEdges, naked edges), save, and upload again.`
}

// ---------- helpers ----------

function northFlag(o: ImportOptions): Flag {
  if (o.north === 'unresolved') return 'unresolved'
  return o.north === 'file' || o.north === 'street' || o.north === 'magnetic' ? 'unverified' : 'team_assumption'
}

function describe(c: { raw: BuildInput['raw']; opts: ImportOptions; placed: Placed; scale: number; built: BuiltTower[]; modelTowers: ModelTower[]; elements: ModelElement[]; ignored: IgnoredItem[]; items: Item[]; roles: ItemRole[]; massIdx: number[]; meshOf: (k: number) => MeshData; frame: ProjectFrame }): ModelCheck[] {
  const out: ModelCheck[] = []
  const { raw, opts, placed } = c
  const unitName = UNIT_LABEL[opts.unit as Unit] ?? opts.unit
  if (raw.unitScaleOverride) out.push({ id: 'units', severity: 'info', text: `Units: ${raw.unitNote.replace(/^Rhino model units: /, '')}, as the file says; scaled by ${raw.unitScaleOverride} to metres.` })
  else if (raw.unit && raw.unit === opts.unit) out.push({ id: 'units', severity: 'info', text: `Units: ${unitName}, as the file says${opts.unit === 'm' ? '' : `; scaled by ${c.scale} to metres`}.` })
  else out.push({ id: 'units', severity: opts.unitConfirmed ? 'info' : 'block', text: opts.unitConfirmed ? `Units: ${unitName}, chosen by you (the file ${raw.unit ? `says ${UNIT_LABEL[raw.unit]}` : 'does not say'}).` : `Units: the file does not say; ${unitName} is a guess. Confirm it.`, flag: opts.unitConfirmed ? 'team_assumption' : 'unresolved' })
  const tall = c.built.reduce((m, b) => Math.max(m, b.tower.height), 0)
  if (tall) out.push({ id: 'height', severity: 'info', text: `${c.built.length === 1 ? 'The tower is' : `${c.built.length} towers; the tallest is`} ${tall.toFixed(1)} m from the entrance floor to its top.` })
  if (placed.fileNorthDeg == null || opts.north === 'unresolved') out.push({ id: 'north', severity: 'warn', text: 'North: the file does not say, and none was chosen. Sun, shadow and view results will say north is unresolved.', flag: 'unresolved' })
  else out.push({ id: 'north', severity: 'info', text: `North: ${NORTH_LABEL[opts.north].toLowerCase()} (${placed.fileNorthDeg}° clockwise from the file's +Y); the model turns ${Math.abs(placed.rotation).toFixed(1)}° ${placed.rotation >= 0 ? 'counter-clockwise' : 'clockwise'}.`, flag: northFlag(opts) })
  if (opts.placement === 'anchor' && opts.anchor) {
    const a = opts.anchor, u = c.frame.utmOrigin
    out.push({ id: 'placement', severity: 'info', text: `Placement: the model point (${a.model.map((v) => v.toFixed(2)).join(', ')} m in the file) goes on ${u ? `E ${(a.city[0] + u[0]).toFixed(1)}, N ${(a.city[1] + u[1]).toFixed(1)} (EPSG:26910)` : `${a.city.map((v) => v.toFixed(1)).join(', ')} m on the site`}${a.turn ? `, turned ${Math.abs(a.turn)}° ${a.turn > 0 ? 'counter-clockwise' : 'clockwise'}` : ''}.`, flag: 'team_assumption' })
  } else if (opts.placement === 'earth') {
    const e = earthPoint(raw, opts, c.frame)
    out.push(e
      ? { id: 'placement', severity: 'info', text: `Placement: the file's Earth anchor puts its base point (${raw.earthAnchor!.lat.toFixed(5)}, ${raw.earthAnchor!.lon.toFixed(5)}) at E ${e.utm[0].toFixed(1)}, N ${e.utm[1].toFixed(1)} (EPSG:26910; NAD83 and WGS84 taken as equal, about 1 m).`, flag: 'unverified' }
      : { id: 'placement', severity: 'block', text: 'Placement: the file has no Earth anchor location, or this project has no map frame. Choose another placement.', flag: 'unresolved' })
  }
  out.push({ id: 'datum', severity: 'info', text: `Zero level: ${DATUM_LABEL[opts.datum].toLowerCase()}${placed.datumShift ? ` (${placed.datumShift.toFixed(2)} m subtracted)` : ''}.`, flag: 'team_assumption' })
  if (c.modelTowers.length) out.push({ id: 'towers', severity: 'info', text: `${c.modelTowers.length === 1 ? 'One tower' : `${c.modelTowers.length} towers, found by plan overlap`}: ${c.modelTowers.map((t, n) => `${t.name} (${c.built[n].tower.imported!.storeys.filter((s) => s.hasFloor).length} storeys, podium ${t.schedule.podiumTop ? `to ${t.schedule.podiumTop} m: ${t.schedule.podiumSource.charAt(0).toLowerCase()}${t.schedule.podiumSource.slice(1)}` : 'none'})`).join('; ')}.`, flag: 'team_assumption' })
  const tagged = c.modelTowers.reduce((s, t) => s + t.taggedStoreys, 0)
  const floored = c.built.reduce((s, b) => s + b.tower.imported!.storeys.filter((x) => x.hasFloor).length, 0)
  if (c.massIdx.some((k) => c.roles[k].role === 'program')) out.push({ id: 'program', severity: 'info', text: `Program: ${tagged} of ${floored} storeys take their use from program or podium volumes; the rest follow the program bands.`, flag: 'team_assumption' })
  else out.push({ id: 'program', severity: 'info', text: 'Program: no program volumes, so storeys follow the program bands (change them per storey after upload).', flag: 'team_assumption' })
  const cores = c.modelTowers.filter((t) => t.coreShare != null)
  if (cores.length) out.push({ id: 'core', severity: 'info', text: `Core: ${cores.map((t) => `${t.name} ${(t.coreShare! * 100).toFixed(1)}% of the plate`).join(', ')}, measured from the core volumes (median over the tower storeys); the lift check reads this instead of sizing the core.`, flag: 'team_assumption' })
  const sites = c.elements.filter((e) => e.role === 'site')
  if (sites.length) {
    const area = sites.reduce((s, e) => s + (e.geometry.kind === 'polygon' ? e.geometry.rings.reduce((a, r) => a + Math.abs(ringArea(r)), 0) : 0), 0)
    out.push({ id: 'site', severity: 'info', text: `Site boundary: ${sites.length} outline${sites.length > 1 ? 's' : ''}, ${Math.round(area).toLocaleString('en-CA')} m².${c.frame.project === 'vtc' ? ' The competition rules keep the brief\'s site (144.8 × 79.2 m); yours is compared with it.' : ''}` })
  } else out.push({ id: 'site', severity: 'info', text: 'Site boundary: none mapped. Map a layer with a closed curve to Site boundary to use your lot line.' })
  const ctx = c.elements.filter((e) => e.role === 'context').length
  if (ctx) out.push({ id: 'context', severity: 'info', text: `Context: ${ctx} building${ctx > 1 ? 's' : ''}, kept as extruded footprints (flat roofs); they cast shadows in the solar check.`, flag: 'team_assumption' })
  // Mixed scale: a row far smaller or larger than the massing was probably pasted from a file in other units.
  const span = (b: Bounds) => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])
  const massSpan = span(c.massIdx.map((k) => bounds(c.meshOf(k))).reduce(unionBox))
  const rowSpan = new Map<string, Bounds>()
  c.items.forEach((it, k) => { if (it.curve || c.roles[k].role === 'ignore') return; const b = bounds(c.meshOf(k)); const r = c.roles[k].row; rowSpan.set(r, rowSpan.has(r) ? unionBox(rowSpan.get(r)!, b) : b) })
  for (const [row, b] of rowSpan) {
    const ratio = span(b) / Math.max(1e-9, massSpan)
    if (ratio < 1 / 200 || ratio > 200) out.push({ id: `scale-${row}`, severity: 'warn', text: `"${row}" is about ${ratio < 1 ? `${Math.round(1 / ratio).toLocaleString('en-CA')}× smaller` : `${Math.round(ratio).toLocaleString('en-CA')}× larger`} than the massing: was it pasted from a file in other units? It is used as it is.`, flag: 'unresolved' })
  }
  // Faces left out of Breps saved without render meshes (curved faces are never faked).
  const partial = c.items.filter((it, k) => !it.curve && it.facesNotImported && c.roles[k].role !== 'ignore') as (Item & { curve?: false })[]
  if (partial.length) {
    const curved = partial.reduce((s, it) => s + (it.facesNotImported?.curved ?? 0), 0), invalid = partial.reduce((s, it) => s + (it.facesNotImported?.invalid ?? 0), 0)
    out.push({ id: 'faces', severity: 'warn', text: `Faces not imported: ${[curved ? `${curved} curved` : '', invalid ? `${invalid} planar that could not be rebuilt exactly` : ''].filter(Boolean).join(' and ')}, on ${partial.length} object${partial.length > 1 ? 's' : ''} saved without render meshes (${partial.slice(0, 3).map((it) => `"${it.name}"`).join(', ')}${partial.length > 3 ? ', …' : ''}). Their plates may be short or open; in Rhino untick "Save small" (or run Mesh) and upload again.`, flag: 'unresolved' })
  }
  const healthBad = c.built.flatMap((b) => b.health.filter((h) => h.severity !== 'pass').map((h) => `${b.tower.name}: ${h.title.toLowerCase()}`))
  if (healthBad.length) out.push({ id: 'health', severity: c.built.some((b) => b.health.some((h) => h.severity === 'block')) ? 'block' : 'warn', text: `Geometry health: ${healthBad.slice(0, 4).join('; ')}${healthBad.length > 4 ? ` and ${healthBad.length - 4} more` : ''}. Details below.` })
  if (c.ignored.length) {
    const why = new Map<string, number>()
    for (const g of c.ignored) { const r = g.reason.split(/[:.(]/)[0]; why.set(r, (why.get(r) ?? 0) + 1) }
    out.push({ id: 'ignored', severity: 'info', text: `Left out: ${c.ignored.length} item${c.ignored.length > 1 ? 's' : ''} (${[...why.entries()].map(([r, n]) => `${n} × ${r.trim().toLowerCase()}`).join('; ')}). The list below says why for each.` })
  }
  return out
}

function overlapArea(a: Bounds, b: Bounds): number {
  return Math.max(0, Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0])) * Math.max(0, Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]))
}
function unionBox(a: Bounds, b: Bounds): Bounds {
  return { min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])], max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])] }
}
function projBox(b: Bounds, toProj: (x: number, y: number) => Pt, dz: number): [P3, P3] {
  const c = [toProj(b.min[0], b.min[1]), toProj(b.max[0], b.min[1]), toProj(b.max[0], b.max[1]), toProj(b.min[0], b.max[1])]
  return [[Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), r2(b.min[2] - dz)], [Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1])), r2(b.max[2] - dz)]]
}
function median(v: number[]): number { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
function majority<T>(v: T[]): T | null {
  if (!v.length) return null
  const n = new Map<T, number>()
  for (const x of v) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0]
}
const majorityStr = (v: (string | undefined)[]) => majority(v.filter((x): x is string => !!x))
const uniq = <T,>(v: T[]) => [...new Set(v)]

/** Outer outline of a flat mesh: its boundary edges chained into rings; the largest ring (m, plan). */
export function meshOutline(m: MeshData): Pt[] | null {
  const p = m.positions, ix = m.indices
  const key = (i: number) => `${Math.round(p[3 * i] * 1000)},${Math.round(p[3 * i + 1] * 1000)},${Math.round(p[3 * i + 2] * 1000)}`
  const edges = new Map<string, { n: number; a: number; b: number }>()
  for (let t = 0; t < ix.length; t += 3) {
    for (const [a, b] of [[ix[t], ix[t + 1]], [ix[t + 1], ix[t + 2]], [ix[t + 2], ix[t]]]) {
      const ka = key(a), kb = key(b), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const e = edges.get(k)
      if (e) e.n++; else edges.set(k, { n: 1, a, b })
    }
  }
  const seg: number[] = []
  for (const e of edges.values()) if (e.n === 1) seg.push(p[3 * e.a], p[3 * e.a + 1], p[3 * e.b], p[3 * e.b + 1])
  const rings = chainLoops(seg).filter((l) => l.closed && l.ring.length >= 3).map((l) => l.ring)
  if (!rings.length) return null
  return rings.reduce((best, r) => (Math.abs(ringArea(r)) > Math.abs(ringArea(best)) ? r : best))
}


/**
 * First guess at units, axes, placement, zero level and north for a file (the person confirms them in the dialog).
 * Computed over the massing rows of the mapping, so a far-away context layer does not move the guess.
 */
export function defaultOptions(raw: RawImport & { unitScaleOverride?: number }, mapping: Mapping, frame: ProjectFrame, f2f: number): ImportOptions {
  const items = itemsOf(raw)
  const mass = items.filter((it) => !it.curve && MASSING_ROLES.includes(roleOf(it, mapping).role)) as (Item & { curve?: false })[]
  const all = mergeMeshes((mass.length ? mass : raw.objects).map((o) => o.mesh))
  const b = bounds(all)
  const upAxis = raw.upAxis ?? guessUpAxis(b)
  const h = upAxis === 'y' ? b.max[1] - b.min[1] : b.max[2] - b.min[2]
  const w = b.max[0] - b.min[0], d = upAxis === 'y' ? b.max[2] - b.min[2] : b.max[1] - b.min[1]
  const unit: Unit = raw.unit ?? guessUnit({ height: h, width: w, depth: d })
  const s = raw.unitScaleOverride ?? UNIT_SCALE[unit]
  const cx = ((b.min[0] + b.max[0]) / 2) * s, cy = (upAxis === 'y' ? -(b.min[2] + b.max[2]) / 2 : (b.min[1] + b.max[1]) / 2) * s
  const minZ = (upAxis === 'y' ? b.min[1] : b.min[2]) * s
  // Map coordinates in the file win; then (Real Vancouver) the file's Earth anchor; then the file origin or the site centre.
  const placement = looksLikeUtm10(cx, cy) ? (frame.utmOrigin ? 'utm' : 'centre') : raw.earthAnchor && frame.utmOrigin ? 'earth' : Math.hypot(cx, cy) > 2000 ? 'centre' : 'keep'
  return {
    excluded: [], unit, unitConfirmed: !!raw.unit, upAxis, placement, offset: [0, 0],
    datum: Math.abs(minZ) < 0.5 ? 'zero' : 'lowest', dz: 0,
    north: raw.fileNorthDeg != null ? 'file' : 'unresolved', northDeg: 0,
    f2f, podiumTop: null, podiumF2F: PODIUM_F2F,
  }
}
