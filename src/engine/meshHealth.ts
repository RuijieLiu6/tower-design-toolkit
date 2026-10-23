// Geometry health check and unit detection for imported massing (research P14-M05, P14-M03).
// Every threshold here is a team assumption unless its rule says otherwise.

import type { Flag } from './types'
import { bounds, signedVolume, type MeshData } from './importGeom'

export type Unit = 'm' | 'mm' | 'cm' | 'ft' | 'in'
export const UNIT_SCALE: Record<Unit, number> = { m: 1, mm: 0.001, cm: 0.01, ft: 0.3048, in: 0.0254 }
export const UNIT_LABEL: Record<Unit, string> = { m: 'metres', mm: 'millimetres', cm: 'centimetres', ft: 'feet', in: 'inches' }

/** VTC brief envelope as quoted in the project packet (the brief PDF was not opened: unverified, research P14-S54). */
export const BRIEF = { minHeight: 244, maxHeight: 305, siteW: 79.2, siteD: 144.8 }

export interface UnitCandidate { unit: Unit; height: number; width: number; depth: number; fitsBrief: boolean; plausible: boolean }

/**
 * Tries each unit on the raw extents (file units): a tower 20-700 m tall is plausible, 244-305 m fits the brief.
 * The best guess prefers the brief, then plausibility, then metres.
 */
export function unitCandidates(raw: { height: number; width: number; depth: number }): UnitCandidate[] {
  return (Object.keys(UNIT_SCALE) as Unit[]).map((unit) => {
    const s = UNIT_SCALE[unit]
    const height = raw.height * s
    return { unit, height, width: raw.width * s, depth: raw.depth * s, fitsBrief: height >= BRIEF.minHeight && height <= BRIEF.maxHeight, plausible: height >= 20 && height <= 700 }
  })
}

export function guessUnit(raw: { height: number; width: number; depth: number }): Unit {
  const c = unitCandidates(raw)
  return (c.find((x) => x.fitsBrief) ?? c.find((x) => x.plausible && x.unit === 'm') ?? c.find((x) => x.plausible) ?? c[0]).unit
}

/** Guess which axis is up for formats that do not say (OBJ): a tower is taller than it is wide. */
export function guessUpAxis(raw: Bounds3): 'z' | 'y' {
  const ex = raw.max[0] - raw.min[0], ey = raw.max[1] - raw.min[1], ez = raw.max[2] - raw.min[2]
  return ey > ez && ey > ex ? 'y' : 'z'
}
type Bounds3 = { min: [number, number, number]; max: [number, number, number] }

/** UTM zone 10N (EPSG:26910 / 3157) coordinates around Vancouver. */
export function looksLikeUtm10(x: number, y: number) {
  return x > 470000 && x < 520000 && y > 5430000 && y < 5480000
}

export interface Topology {
  triangles: number
  /** Edges used by one triangle: holes in the surface. */
  openEdges: number
  /** Edges used by three or more triangles. */
  nonManifoldEdges: number
  /** Edges whose two triangles run the same way: one of them faces the wrong way. */
  flippedEdges: number
  degenerate: number
  /** Separate pieces (connected by shared edges). */
  shells: number
  /** Plan + height of up to 4000 open edges, for drawing them. */
  openSegments: number[]
  /** Indices (triangle numbers) of triangles next to a flipped edge, up to 4000. */
  flippedTriangles: number[]
}

/** Welds vertices within tol (m) and counts how edges are shared. */
export function topology(m: MeshData, tol = 0.001): Topology {
  const p = m.positions, ix = m.indices
  const weld = new Map<string, number>()
  const id = new Uint32Array(p.length / 3)
  for (let i = 0; i < id.length; i++) {
    const k = `${Math.round(p[3 * i] / tol)},${Math.round(p[3 * i + 1] / tol)},${Math.round(p[3 * i + 2] / tol)}`
    let w = weld.get(k)
    if (w === undefined) { w = weld.size; weld.set(k, w) }
    id[i] = w
  }
  // Edge -> [use count, direction sum, first triangle, its direction, second triangle, its direction]
  const edges = new Map<number, [number, number, number, number, number, number]>()
  const nW = weld.size
  let degenerate = 0
  const parent = new Int32Array(ix.length / 3).map((_, i) => i)
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
  for (let t = 0; t < ix.length; t += 3) {
    const tri = t / 3
    const a = id[ix[t]], b = id[ix[t + 1]], c = id[ix[t + 2]]
    const pa = ix[t] * 3, pb = ix[t + 1] * 3, pc = ix[t + 2] * 3
    const ux = p[pb] - p[pa], uy = p[pb + 1] - p[pa + 1], uz = p[pb + 2] - p[pa + 2]
    const vx = p[pc] - p[pa], vy = p[pc + 1] - p[pa + 1], vz = p[pc + 2] - p[pa + 2]
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
    if (a === b || b === c || c === a || area < 1e-6) { degenerate++; continue }
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const lo = Math.min(i, j), hi = Math.max(i, j), key = lo * nW + hi
      const e = edges.get(key)
      const dir = i < j ? 1 : -1
      if (e) {
        e[0]++; e[1] += dir
        if (e[0] === 2) { e[4] = tri; e[5] = dir }
        const r1 = find(e[2]), r2 = find(tri)
        if (r1 !== r2) parent[r1] = r2
      } else edges.set(key, [1, dir, tri, dir, -1, 0])
    }
  }
  let openEdges = 0, nonManifoldEdges = 0, flippedEdges = 0
  const openSegments: number[] = []
  const pos = new Float64Array(nW * 3)
  for (let i = 0; i < id.length; i++) { pos[3 * id[i]] = p[3 * i]; pos[3 * id[i] + 1] = p[3 * i + 1]; pos[3 * id[i] + 2] = p[3 * i + 2] }
  for (const [key, e] of edges) {
    if (e[0] === 1) {
      openEdges++
      if (openSegments.length < 4000 * 6) {
        const lo = Math.floor(key / nW), hi = key % nW
        openSegments.push(pos[3 * lo], pos[3 * lo + 1], pos[3 * lo + 2], pos[3 * hi], pos[3 * hi + 1], pos[3 * hi + 2])
      }
    } else if (e[0] > 2) nonManifoldEdges++
    else if (e[1] !== 0) flippedEdges++
  }
  // Faces that face the wrong way: orient each piece from one face across shared edges; the smaller group is flipped.
  const nTri = ix.length / 3
  const adj: number[][] = Array.from({ length: nTri }, () => [])
  for (const e of edges.values()) if (e[0] === 2 && e[4] >= 0) { const same = e[3] === e[5] ? 1 : 0; adj[e[2]].push(e[4], same); adj[e[4]].push(e[2], same) }
  const parity = new Int8Array(nTri).fill(-1)
  const flippedTris: number[] = []
  for (let s0 = 0; s0 < nTri; s0++) {
    if (parity[s0] >= 0 || !adj[s0].length) continue
    const group: number[] = [s0]
    parity[s0] = 0
    for (let q = 0; q < group.length; q++) {
      const a = group[q], l = adj[a]
      for (let k = 0; k < l.length; k += 2) {
        const b = l[k]
        if (parity[b] >= 0) continue
        parity[b] = (parity[a] ^ l[k + 1]) as 0 | 1
        group.push(b)
      }
    }
    const ones = group.filter((g) => parity[g] === 1)
    if (ones.length && ones.length < group.length) flippedTris.push(...(ones.length * 2 <= group.length ? ones : group.filter((g) => parity[g] === 0)))
  }
  const roots = new Set<number>()
  for (let t = 0; t < ix.length / 3; t++) {
    const a = id[ix[3 * t]], b = id[ix[3 * t + 1]], c = id[ix[3 * t + 2]]
    if (a !== b && b !== c && c !== a) roots.add(find(t))
  }
  return { triangles: ix.length / 3, openEdges, nonManifoldEdges, flippedEdges, degenerate, shells: roots.size, openSegments, flippedTriangles: flippedTris.slice(0, 4000) }
}

export type Severity = 'pass' | 'warn' | 'block'

export interface HealthItem {
  id: string
  severity: Severity
  title: string
  /** Plain-language detail. */
  detail: string
  /** What to do about it. */
  fix?: string
  flag: Flag
  source: string
}

export interface HealthInput {
  /** Mesh after unit scale, axis and placement (m, z up, tower frame or project frame). */
  mesh: MeshData
  topo: Topology
  /** Distance of the plan centre from the project origin (m) before any re-centring. */
  originDistance: number
  /** Raw plan centre in file units scaled to m (to spot UTM coordinates). */
  rawCentre: [number, number]
  project: 'vtc' | 'city'
  unit: string
  /** Mesh area lost to overlaps at the storeys (m², summed), from slicing. */
  overlapArea?: number
}

const PACKET = 'Research P14-M05 (geometry health), team rule'

/** Plain-language health report: each rule passes, warns or blocks (block = results would be wrong). */
export function healthReport(h: HealthInput): HealthItem[] {
  const out: HealthItem[] = []
  const t = h.topo
  const b = bounds(h.mesh)
  const height = b.max[2] - Math.max(0, b.min[2])
  const vol = signedVolume(h.mesh)
  if (t.triangles === 0) {
    out.push({ id: 'empty', severity: 'block', title: 'No surfaces to measure', detail: 'Nothing in the chosen layers could be turned into triangles.', fix: 'Pick other layers, or save the file with render meshes (Rhino) and import again.', flag: 'team_assumption', source: PACKET })
    return out
  }
  const closed = t.openEdges === 0 && t.nonManifoldEdges === 0
  // Closed solids that touch without being joined share edges between four faces: not a hole, but not one solid.
  const touching = t.openEdges === 0 && t.nonManifoldEdges > 0 && t.shells > 1
  out.push(touching
    ? { id: 'closed', severity: 'warn', title: 'Solids touch but are not joined', detail: `${t.shells} closed pieces meet along ${t.nonManifoldEdges.toLocaleString()} shared edges. Plate areas are fine (each storey counts covered floor once), but the volume check cannot run.`, fix: 'BooleanUnion the pieces in Rhino if they are one building, then export again.', flag: 'team_assumption', source: PACKET }
    : closed
    ? { id: 'closed', severity: 'pass', title: 'Closed volumes', detail: `Every edge joins exactly two faces (${t.triangles.toLocaleString()} triangles, ${t.shells} piece${t.shells === 1 ? '' : 's'}).`, flag: 'team_assumption', source: PACKET }
    : { id: 'closed', severity: 'warn', title: t.openEdges ? 'Open mesh: holes in the surface' : 'Edges shared by more than two faces',
        detail: `${t.openEdges ? `${t.openEdges.toLocaleString()} edges border a hole` : ''}${t.openEdges && t.nonManifoldEdges ? ' and ' : ''}${t.nonManifoldEdges ? `${t.nonManifoldEdges.toLocaleString()} edges are shared by three or more faces (non-manifold)` : ''}. Plate areas next to a hole can be wrong, and the volume check cannot run. Holes show as red lines in the 3D view.`,
        fix: 'In Rhino: ShowEdges (naked edges), then Cap or Join; for meshes, FillMeshHoles. Then export again.', flag: 'team_assumption', source: PACKET })
  if (t.flippedEdges > 0) {
    out.push({ id: 'normals', severity: 'warn', title: 'Some faces point the wrong way', detail: `${t.flippedEdges.toLocaleString()} edges sit between faces that disagree on which side is outside (magenta in the 3D view). Plate outlines there may come out as holes.`, fix: 'In Rhino: Dir or UnifyMeshNormals, then export again.', flag: 'team_assumption', source: PACKET })
  } else if (closed && vol < 0) {
    out.push({ id: 'normals', severity: 'warn', title: 'Inside out', detail: 'All faces point inwards (negative volume). Areas still add up, but some tools read this as a hole.', fix: 'Flip all normals (Rhino: Flip) and export again.', flag: 'team_assumption', source: PACKET })
  } else {
    out.push({ id: 'normals', severity: 'pass', title: 'Faces point outwards', detail: closed ? `Volume ${Math.round(vol).toLocaleString()} m³.` : 'No face disagrees with its neighbours.', flag: 'team_assumption', source: PACKET })
  }
  out.push(t.degenerate > 0
    ? { id: 'degenerate', severity: 'warn', title: 'Zero-area faces', detail: `${t.degenerate.toLocaleString()} faces have no area (collapsed edges). They are skipped; many of them usually mean a bad export.`, fix: 'Rhino: CullDegenerateMeshFaces.', flag: 'team_assumption', source: PACKET }
    : { id: 'degenerate', severity: 'pass', title: 'No zero-area faces', detail: 'Every face has some area.', flag: 'team_assumption', source: PACKET })
  // Units: a tower 3 km tall or 3 m tall is a unit slip, not a design.
  if (height > 700 || height < 20) {
    const c = unitCandidates({ height: height / unitScaleOf(h.unit), width: (b.max[0] - b.min[0]) / unitScaleOf(h.unit), depth: (b.max[1] - b.min[1]) / unitScaleOf(h.unit) }).find((x) => x.fitsBrief || x.plausible)
    out.push({ id: 'units', severity: 'block', title: `Units look wrong: the mass is ${fmtLen(height)} tall`, detail: `Read as ${UNIT_LABEL[h.unit as Unit] ?? h.unit}, the tower is ${fmtLen(height)} tall, which no tower is.${c ? ` In ${UNIT_LABEL[c.unit]} it would be ${Math.round(c.height)} m.` : ''}`, fix: c ? `Choose ${UNIT_LABEL[c.unit]} under Units.` : 'Check the export units.', flag: 'team_assumption', source: 'Research P14-M03 unit plausibility (20-700 m is a team preset)' })
  } else if (h.project === 'vtc' && (height < BRIEF.minHeight || height > BRIEF.maxHeight)) {
    out.push({ id: 'units', severity: 'warn', title: `Height ${Math.round(height)} m is outside 244-305 m`, detail: 'Units look plausible, but the VTC brief asks for 244-305 m (quoted in the project packet; brief not opened, measuring convention unknown). A justified breach may be fine.', flag: 'unverified', source: 'VTC brief via project packet (research P14-S54, not opened)' })
  } else {
    out.push({ id: 'units', severity: 'pass', title: `Units plausible: ${Math.round(height)} m tall`, detail: h.project === 'vtc' ? 'Inside the 244-305 m range quoted from the brief (unverified).' : 'A plausible tower height.', flag: h.project === 'vtc' ? 'unverified' : 'team_assumption', source: h.project === 'vtc' ? 'VTC brief via project packet (research P14-S54, not opened)' : 'Research P14-M03' })
  }
  // Far from the origin: float32 rendering jitters and the mass lands off site.
  if (looksLikeUtm10(h.rawCentre[0], h.rawCentre[1])) {
    out.push({ id: 'origin', severity: h.originDistance > 2000 ? 'warn' : 'pass', title: 'File uses map coordinates (UTM 10N)', detail: `The model sits about ${fmtLen(Math.hypot(...h.rawCentre))} from its file origin, at UTM-sized coordinates.${h.originDistance > 2000 ? ' Choose "UTM 10N" or "Centre on site" under Placement.' : ' Placement re-centres it.'}`, flag: 'team_assumption', source: 'Research P14-M03 model origin (float32 steps about 0.5 m at 5.46 million m)' })
  } else if (h.originDistance > 2000) {
    out.push({ id: 'origin', severity: 'warn', title: `Far from the origin: ${fmtLen(h.originDistance)} away`, detail: 'The mass would land far from the site and draw with visible jitter (3D graphics keep about 7 digits).', fix: 'Choose "Centre on site" under Placement, or enter an offset.', flag: 'team_assumption', source: 'Research P14-M03 model origin' })
  } else {
    out.push({ id: 'origin', severity: 'pass', title: 'Near the origin', detail: `Placed ${fmtLen(h.originDistance)} from the project origin.`, flag: 'team_assumption', source: 'Research P14-M03 model origin' })
  }
  if (b.min[2] < -0.5) out.push({ id: 'below', severity: 'warn', title: `${fmtLen(-b.min[2])} below the entrance floor`, detail: 'Storeys are sliced from the entrance floor up; parts below it are not counted (below-grade area stays out of FSR here, team assumption).', fix: 'If the zero level is wrong, change the datum.', flag: 'team_assumption', source: 'Research P14-M04 zero level' })
  if ((h.overlapArea ?? 0) > 1) out.push({ id: 'overlap', severity: 'warn', title: 'Solids overlap', detail: `Separate solids overlap by about ${Math.round(h.overlapArea!).toLocaleString()} m² of floor in total. Floor area counts each overlap once.`, fix: 'BooleanUnion them in Rhino if they are one building.', flag: 'team_assumption', source: 'Research P14-M04 program overlap (v1 rule, area counted once)' })
  return out
}

function unitScaleOf(u: string) { return UNIT_SCALE[u as Unit] ?? 1 }

export function fmtLen(m: number): string {
  const a = Math.abs(m)
  if (a >= 10000) return `${(m / 1000).toFixed(0)} km`
  if (a >= 1000) return `${(m / 1000).toFixed(1)} km`
  if (a >= 10) return `${Math.round(m)} m`
  return `${m.toFixed(1)} m`
}
