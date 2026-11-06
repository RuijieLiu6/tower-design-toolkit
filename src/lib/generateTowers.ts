// A generated massing (Sinnie Choi's generator, engine/dtmassGen.ts) placed on the project as Toolkit towers.
// The generator works on a site rectangle (origin at its south-west corner, +x along W); this puts that rectangle on the
// project: the competition block as the brief draws it, or the oriented rectangle around the Real Vancouver study site.
// Slender, Podium + Tower and Split results become parametric towers (stacked blocks, a use per podium block, program
// bands above), so every Massing control still edits them. The Courtyard's podium is a ring of four bars around an open
// court, which one rectangle cannot hold, so it becomes an exact generated mass with its storeys tagged by use (Ruijie,
// 6 Nov: "courtyard as an exact shape"), checked like an imported model.
import { withAutoCore, type LiftPresets } from '../engine/lifts'
import type { EgressPresets } from '../engine/egress'
import { towerPatch } from '../engine/imported'
import { withBlocks } from '../engine/massing'
import { USES, type Band, type Block, type ImportedMass, type ImportedStorey, type Tower, type UseId } from '../engine/types'
import { SITE } from '../engine/vtcRules'
import type { GenBlock, GenResult, GenUse, Rect, Side } from '../engine/dtmassGen'
import { prism } from './export/scene'
import type { MeshEntry } from './import/store'

type Pt = [number, number]

/** The generator's site rectangle in the project frame. */
export interface SiteRect {
  /** South-west corner of the rectangle (its local origin), project frame, m. */
  origin: Pt
  /** Rotation of the rectangle's +x from the project's +x, degrees counter-clockwise. */
  angleDeg: number
  w: number
  d: number
  /** Site area for FSR (the lot itself, not its rectangle). */
  area: number
  label: string
}

/** The competition block, centred on the model origin, +x along the Retail High Street (dtmass comp-site.js frame). */
export function vtcSiteRect(): SiteRect {
  return { origin: [-SITE.width / 2, -SITE.depth / 2], angleDeg: 0, w: SITE.width, d: SITE.depth, area: SITE.area, label: 'Competition block, 144.8 × 79.2 m' }
}

function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = [], up: Pt[] = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}
const ringArea = (ring: Pt[]) => Math.abs(ring.reduce((s, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + x * y2 - x2 * y }, 0)) / 2

/** True when (x, y) is inside the ring or within `tol` metres of its outline. */
function insideOrOn(ring: Pt[], x: number, y: number, tol: number): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    const dx = xj - xi, dy = yj - yi, L = dx * dx + dy * dy
    const t = L ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / L)) : 0
    if (Math.hypot(x - (xi + t * dx), y - (yi + t * dy)) <= tol) return true
  }
  return c
}

/**
 * The generator's rectangle on a study site: the smallest rectangle around the lot (rotating calipers over its hull),
 * turned so +x runs along its longer side, then drawn in until its corners are on the lot, since lot lines are rarely
 * square and a corner a few centimetres over the line would fail the Toolkit's lot checks. A lot far from rectangular
 * (the rectangle would lose more than a quarter of its area) keeps the outer rectangle; the site checks then say where
 * the massing leaves the lot.
 */
export function cityRect(ring: Pt[], label: string): SiteRect {
  const h = hull(ring)
  if (!h.length) return { origin: [0, 0], angleDeg: 0, w: 1, d: 1, area: 1, label }
  let bestDeg = 0, bestArea = Infinity
  for (let i = 0; i < h.length; i++) {
    const [x0, y0] = h[i], [x1, y1] = h[(i + 1) % h.length]
    const a = Math.atan2(y1 - y0, x1 - x0), c = Math.cos(a), s = Math.sin(a)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const [x, y] of h) { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v) }
    const area = (u1 - u0) * (v1 - v0)
    if (area < bestArea - 1e-6) { bestArea = area; bestDeg = ((a * 180) / Math.PI) + (v1 - v0 > u1 - u0 ? 90 : 0) } // +x along the longer side
  }
  // The lot in the rectangle's own frame.
  const r = (bestDeg * Math.PI) / 180, cr = Math.cos(r), sr = Math.sin(r)
  const lot = ring.map(([x, y]) => [x * cr + y * sr, -x * sr + y * cr] as Pt)
  const U0 = Math.min(...lot.map((p) => p[0])), U1 = Math.max(...lot.map((p) => p[0])), V0 = Math.min(...lot.map((p) => p[1])), V1 = Math.max(...lot.map((p) => p[1]))
  // Draw each side in, 2 cm at a time, while a corner on it is off the lot (the side that brings the corner on first).
  let u0 = U0, u1 = U1, v0 = V0, v1 = V1
  const STEP = 0.02, TOL = 0.001
  for (let i = 0; i < 2000; i++) {
    const off = ([[u0, v0, 'u0', 'v0'], [u1, v0, 'u1', 'v0'], [u1, v1, 'u1', 'v1'], [u0, v1, 'u0', 'v1']] as const).filter(([u, v]) => !insideOrOn(lot, u, v, TOL))
    if (!off.length) break
    for (const [u, v, su, sv] of off) {
      const du = su === 'u0' ? STEP : -STEP, dv = sv === 'v0' ? STEP : -STEP
      if (insideOrOn(lot, u + du, v, TOL)) { if (su === 'u0') u0 += STEP; else u1 -= STEP }
      else if (insideOrOn(lot, u, v + dv, TOL)) { if (sv === 'v0') v0 += STEP; else v1 -= STEP }
      else { if (su === 'u0') u0 += STEP; else u1 -= STEP; if (sv === 'v0') v0 += STEP; else v1 -= STEP }
    }
    if (u1 - u0 < 1 || v1 - v0 < 1) break
  }
  const inner = (u1 - u0) * (v1 - v0) >= 0.75 * (U1 - U0) * (V1 - V0)
  if (!inner) { u0 = U0; u1 = U1; v0 = V0; v1 = V1 }
  return { origin: [u0 * cr - v0 * sr, u0 * sr + v0 * cr], angleDeg: ((bestDeg % 360) + 360) % 360, w: u1 - u0, d: v1 - v0, area: ringArea(ring), label }
}

/** A point of the site rectangle (generator frame) in the project frame. */
export function toProject(f: SiteRect, x: number, y: number): Pt {
  const r = (f.angleDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return [f.origin[0] + x * c - y * s, f.origin[1] + x * s + y * c]
}

/** True bearing that a side of the site rectangle faces (its outward normal), for naming the street side. */
export function sideBearing(f: SiteRect, side: Side, northDeg: number): number {
  const n = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }[side]
  const r = (f.angleDeg * Math.PI) / 180, vx = n[0] * Math.cos(r) - n[1] * Math.sin(r), vy = n[0] * Math.sin(r) + n[1] * Math.cos(r)
  return ((((Math.atan2(vx, vy) * 180) / Math.PI) - northDeg) % 360 + 360) % 360
}

/** The generator's uses on the Toolkit's (restaurant is commercial; amenity is the building's shared amenity). */
export const USE_MAP: Record<GenUse, UseId> = { residential: 'residential', hotel: 'hotel', office: 'office', retail: 'retail', restaurant: 'retail', amenity: 'amenity' }

const topOf = (b: GenBlock) => b.z0 + b.floors * b.f2f
const centre = (r: Rect): Pt => [r.x + r.w / 2, r.y + r.d / 2]
const r2 = (v: number) => Math.round(v * 100) / 100
/** Block sizes to the millimetre: the generator's quarter-metre halves (72.375 m) stay exact. */
const r3 = (v: number) => Math.round(v * 1000) / 1000

export interface Placed {
  towers: Tower[]
  /** The courtyard's generated mesh, to keep in the import store under its id. */
  mesh: { id: string; entry: MeshEntry } | null
  /** What changed on the way into the Toolkit, in words. */
  notes: string[]
}

interface Presets { liftPresets: LiftPresets; egressPresets: EgressPresets }

/** Turns a generated result into Toolkit towers on the site rectangle. `idBase` keeps ids unique per placement. */
export function placeGenerated(r0: GenResult, f: SiteRect, presets: Presets, idBase: string, northDeg = 0): Placed {
  const notes: string[] = []
  // The generator snaps sizes to the quarter metre, so a 79.2 m lot gets a 79.25 m podium: everything is clipped to the
  // site rectangle here, so the Toolkit's lot-line checks do not trip over 5 cm.
  const clip = (q: Rect): Rect => { const x0 = Math.max(0, q.x), y0 = Math.max(0, q.y), x1 = Math.min(f.w, q.x + q.w), y1 = Math.min(f.d, q.y + q.d); return { x: x0, y: y0, w: Math.max(0, x1 - x0), d: Math.max(0, y1 - y0) } }
  const r: GenResult = { ...r0, podium: clip(r0.podium), court: r0.court && clip(r0.court), towerRects: r0.towerRects.map(clip), blocks: r0.blocks.map((b) => ({ ...b, ...clip(b) })) }
  const blocks = r.blocks.filter((b) => b.use !== 'parking')
  if (r.blocks.some((b) => b.use === 'parking')) notes.push('Parking levels below grade are not drawn: the Toolkit counts floor area above grade (the mobility node takes parking separately).')
  if (r.blocks.some((b) => b.use === 'restaurant')) notes.push('Restaurant floors count as Retail / commercial in the Toolkit.')
  if (r.key === 'court' && r.court) { const c = placeCourt(r, f, blocks, presets, idBase, northDeg, notes); return { ...c, notes: [...new Set(notes)] } }

  const ground = blocks.filter((b) => b.role === 'ground'), podium = blocks.filter((b) => b.role === 'podium')
  const groundTop = ground.length ? Math.max(...ground.map(topOf)) : 0
  const angle = f.angleDeg
  const towers: Tower[] = []
  const n = r.towerRects.length
  // Split towers share one podium: each takes the half on its side of the gap, so no floor area is counted twice.
  const baseFor = (ti: number): Rect => {
    const pod = r.key === 'slender' ? r.towerRects[0] : r.podium
    if (n < 2) return pod
    const alongX = r.frame.alongX
    const [a, b] = r.towerRects
    const cut = alongX ? ((a.x + a.w) + b.x) / 2 : ((a.y + a.d) + b.y) / 2
    const lo = alongX ? pod.x : pod.y, hi = alongX ? pod.x + pod.w : pod.y + pod.d
    const [s0, s1] = ti === 0 ? [lo, Math.min(hi, Math.max(lo, cut))] : [Math.max(lo, Math.min(hi, cut)), hi]
    return alongX ? { x: s0, y: pod.y, w: s1 - s0, d: pod.d } : { x: pod.x, y: s0, w: pod.w, d: s1 - s0 }
  }
  // The ground storey's use. Her generator lays retail (and a restaurant) along the street with the next use's lobby
  // behind them in one storey; a Toolkit floor holds one use, so the storey takes retail when the brief has it at grade
  // (the street front is what the ground floor is for), else its largest use, and the note says how much area moves.
  const byUse = new Map<UseId, number>()
  for (const g of ground) byUse.set(USE_MAP[g.use as GenUse], (byUse.get(USE_MAP[g.use as GenUse]) ?? 0) + g.w * g.d * g.floors)
  const groundUse: UseId | null = byUse.has('retail') ? 'retail' : byUse.size ? [...byUse].sort((p, q) => q[1] - p[1])[0][0] : null
  if (groundUse && byUse.size > 1) {
    const moved = [...byUse].filter(([u]) => u !== groundUse).map(([u, a]) => `${Math.round(a).toLocaleString('en-CA')} m² of ${USES[u].label.toLowerCase()}`)
    notes.push(`The ground storey has ${USES[groundUse].label.toLowerCase()} along the street and ${moved.join(' and ')} behind it; a Toolkit floor holds one use, so the whole storey counts as ${USES[groundUse].label.toLowerCase()} (${moved.join(' and ')} moves to it).`)
  }
  r.towerRects.forEach((rect, ti) => {
    const [cx, cy] = centre(rect)
    const base = baseFor(ti), [bx, by] = centre(base)
    const tb: Block[] = []
    // Ground storey(s): one podium block (strips share one storey), with the ground use worked out once below.
    if (groundTop > 0 && groundUse) {
      const gf = Math.max(...ground.map((g) => g.f2f))
      tb.push({ id: `${idBase}-${ti}-g`, name: ground.some((g) => g.floors > 1) ? 'Ground storeys' : 'Ground storey', f2f: gf, height: r3(groundTop), width: r3(base.w), depth: r3(base.d), dx: r3(bx - cx), dy: r3(by - cy), rotation: 0, podium: true, use: groundUse })
    }
    // Podium storeys above it: one podium block per run of one use (amenity, office), on the podium footprint.
    for (const [k, p] of [...podium].sort((a, b) => a.z0 - b.z0).entries()) {
      tb.push({ id: `${idBase}-${ti}-p${k}`, name: `Podium · ${p.name}`, f2f: p.f2f, height: r3(p.floors * p.f2f), width: r3(base.w), depth: r3(base.d), dx: r3(bx - cx), dy: r3(by - cy), rotation: 0, podium: true, use: USE_MAP[p.use as GenUse] })
    }
    // The tower: one block over its storeys, its program as bands bottom-up at each use's floor-to-floor.
    const mine = blocks.filter((b) => b.role === 'tower' && b.tower === ti).sort((a, b) => a.z0 - b.z0)
    const towerH = mine.reduce((s, b) => s + b.floors * b.f2f, 0)
    if (towerH > 0) tb.push({ id: `${idBase}-${ti}-t`, name: 'Tower', height: r3(towerH), width: r3(rect.w), depth: r3(rect.d), dx: 0, dy: 0, rotation: 0 })
    const floors = mine.reduce((s, b) => s + b.floors, 0)
    const bands: Band[] = []
    for (const b of mine) {
      const use = USE_MAP[b.use as GenUse], last = bands[bands.length - 1]
      if (last && last.use === use && last.f2f === b.f2f) last.share += b.floors / Math.max(1, floors)
      else bands.push({ use, share: b.floors / Math.max(1, floors), f2f: b.f2f })
    }
    // The tower's floor-to-floor: that of its most floors (bands keep their own).
    const typical = mine.slice().sort((a, b) => b.floors - a.floors)[0]
    const [x, y] = toProject(f, cx, cy)
    const t0: Tower = {
      id: `${idBase}-${ti}`, name: n > 1 ? `Tower ${'AB'[ti]}` : 'Tower 1', x: r3(x), y: r3(y), rotation: r3(angle),
      width: rect.w, depth: rect.d, height: groundTop + towerH, f2f: typical?.f2f ?? 3.0,
      podiumHeight: 0, podiumWidth: base.w, podiumDepth: base.d, podiumUse: tb[0]?.use ?? 'retail',
      bands: bands.length ? bands : [{ use: 'residential', share: 1 }], coreShare: 0.25, plantEvery: 0, coreAuto: true, skyLobbies: [], skyRoom: null,
    }
    towers.push(withAutoCore(withBlocks(t0, tb.length ? tb : [{ id: `${idBase}-${ti}-t`, height: 3, width: rect.w, depth: rect.d, dx: 0, dy: 0, rotation: 0 }]), presets.liftPresets, presets.egressPresets))
  })
  void northDeg
  return { towers, mesh: null, notes: [...new Set(notes)] }
}

/** Courtyard: an exact mass of the bars and the tower, storeys tagged by use; tower frame centred on the site. */
function placeCourt(r: GenResult, f: SiteRect, blocks: GenBlock[], presets: Presets, idBase: string, northDeg: number, notes: string[]): Omit<Placed, 'notes'> {
  const cxs = f.w / 2, cys = f.d / 2
  const loc = (b: Rect): Pt[] => [[b.x - cxs, b.y - cys], [b.x + b.w - cxs, b.y - cys], [b.x + b.w - cxs, b.y + b.d - cys], [b.x - cxs, b.y + b.d - cys]]
  const positions: number[] = [], indices: number[] = []
  let volume = 0
  for (const b of blocks) {
    const m = prism(loc(b), b.z0, topOf(b)), off = positions.length / 3
    positions.push(...m.positions); indices.push(...m.indices.map((i) => i + off))
    volume += b.w * b.d * b.floors * b.f2f
  }
  // Storeys: every block's floors, grouped by level (the four bars of a podium storey are one storey with the court as a hole).
  const levels = new Map<string, { z0: number; z1: number; parts: GenBlock[] }>()
  for (const b of blocks) for (let i = 0; i < b.floors; i++) {
    const z0 = r2(b.z0 + i * b.f2f), z1 = r2(b.z0 + (i + 1) * b.f2f), key = `${z0}`
    const L = levels.get(key) ?? { z0, z1, parts: [] }
    L.z1 = Math.max(L.z1, z1); L.parts.push(b); levels.set(key, L)
  }
  const court = r.court!
  const storeys: ImportedStorey[] = [...levels.values()].sort((a, b) => a.z0 - b.z0).map((L, i) => {
    const area = L.parts.reduce((s, b) => s + b.w * b.d, 0)
    const byUse = new Map<UseId, number>()
    for (const b of L.parts) byUse.set(USE_MAP[b.use as GenUse], (byUse.get(USE_MAP[b.use as GenUse]) ?? 0) + b.w * b.d)
    const use = [...byUse].sort((p, q) => q[1] - p[1])[0][0]
    const ring = L.parts.filter((b) => b.bar).length === 4
    const loops: Pt[][] = ring ? [loc(r.podium), loc(court).reverse()] : L.parts.map((b) => loc(b))
    return { level: i + 1, z0: L.z0, z1: L.z1, area: Math.round(area * 10) / 10, use, podium: L.parts.every((b) => b.role !== 'tower'), hasFloor: area >= 25, loops }
  })
  const corners = blocks.flatMap((b) => loc(b))
  const top = Math.max(...blocks.map(topOf))
  const podTop = Math.max(0, ...blocks.filter((b) => b.role !== 'tower').map(topOf))
  const tower = blocks.filter((b) => b.role === 'tower').sort((a, b) => b.floors - a.floors)[0]
  const ground = blocks.find((b) => b.role === 'ground')
  const meshId = `${idBase}-court`
  const angle = f.angleDeg
  const mass: ImportedMass = {
    meshId, fileName: 'Generated: Courtyard Podium + Tower', format: 'generated', unit: 'm', unitSource: 'chosen',
    fileNorthDeg: ((northDeg + angle) % 360 + 360) % 360, northSource: 'Generated on the project site (same frame as the project)',
    datumShift: 0, datumSource: 'Site grade, z = 0 (generated)', f2f: tower?.f2f ?? 3.0, podiumTop: r2(podTop), podiumF2F: ground?.f2f ?? 4.5,
    storeys, hull: hull(corners).map(([x, y]) => [r2(x), r2(y)] as Pt), volume: Math.round(volume), top: r2(top), health: { block: 0, warn: 0 },
  }
  const [x, y] = toProject(f, cxs, cys)
  const base: Tower = {
    id: idBase, name: 'Courtyard tower', x: r2(x), y: r2(y), rotation: r2(angle), width: 40, depth: 40, height: top, f2f: mass.f2f,
    podiumHeight: 0, podiumWidth: 40, podiumDepth: 40, podiumUse: 'retail', bands: [{ use: 'residential', share: 1 }],
    coreShare: 0.25, plantEvery: 0, coreAuto: true, skyLobbies: [], skyRoom: null,
  }
  const t = withAutoCore({ ...base, ...towerPatch(mass) }, presets.liftPresets, presets.egressPresets)
  notes.push('The courtyard ring is placed as an exact generated mass (storeys tagged by use, like an imported model): the Massing sliders do not reshape it; generate again to change it.')
  const entry: MeshEntry = {
    positions: new Float32Array(positions), indices: new Uint32Array(indices), openSegments: new Float32Array(0), flippedTriangles: new Uint32Array(0), health: [],
    report: { objects: blocks.length, triangles: indices.length / 3, sources: ["Generated with Sinnie Choi's massing generator (Downtown Massing Tool)"], skipped: [], notes: [], unitNote: 'Metres (generated)', northNote: 'Project frame' },
  }
  return { towers: [t], mesh: { id: meshId, entry } }
}
