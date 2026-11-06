// Massing generator, ported from Sinnie Choi's Downtown Massing Tool (github.com/xubynii/dtmass, src/gen.js at commit
// 2ef1d96) with her permission (6 Nov 2026, relayed by Ruijie Liu; recorded in 04 Tool Plan/permissions). The logic,
// the four typologies, their parameters and the wording of the notes and conflicts are hers; this file only retypes them
// for the Toolkit. Tests compare it block by block with outputs of her own code (dtmassGen.fixtures.json).
//
// From the site rectangle, the brief (target GFA, program mix, floor-to-floor per use, preferred floorplate, height
// target) and a typology with its parameters, it lays out program blocks as whole storeys: ground uses first, podium
// uses next, tower uses on top, every block a continuous run of floors of one use. A ground use that wants less than half
// the footprint becomes a strip (retail at the street, restaurant at the lane) and the rest of that storey is the next
// use's lobby; everything above grade is settled onto what it overlaps, so no mass floats. It reports requested against
// generated areas, explains rounding and geometric losses, and names conflicts with specific adjustments instead of
// changing the targets.
//
// Left out on purpose (the Toolkit has its own evidence nodes for them): her guideline setback sets and ODP density and
// height lookups (codes.js, rules.js), the cores (the Toolkit sizes its own from the lifts and stairs), the parking ramp,
// and the stepped and terraced variants, which her typology menu does not offer. Frame: origin at the site's south-west
// corner, +x along W, +y along D, metres.

export type GenUse = 'residential' | 'hotel' | 'office' | 'retail' | 'restaurant' | 'amenity'
export const GEN_USES: GenUse[] = ['residential', 'hotel', 'office', 'retail', 'restaurant', 'amenity']
export const GEN_LABEL: Record<GenUse | 'parking', string> = { residential: 'Residential', hotel: 'Hotel', office: 'Office', retail: 'Retail', restaurant: 'Restaurant', amenity: 'Amenity', parking: 'Parking' }
/** Typical downtown floor-to-floor by use (her model.js USE_F2F). */
export const GEN_F2F: Record<GenUse, number> = { residential: 3.0, hotel: 3.3, office: 3.9, retail: 5.0, restaurant: 4.5, amenity: 3.6 }

export interface GenBrief {
  /** Target gross floor area above grade (m²). */
  gfa: number
  heightTarget: number | null
  /** Preferred tower floorplate (m²). */
  plate: number
  parkingLevels: number
  f2f: Record<GenUse, number>
  /** Shares of gross floor area (%), adding to 100. */
  mix: Record<GenUse, number>
  /** Stacking order, bottom to top. */
  order: GenUse[]
}

/** Her brief.js defaults. */
export const defaultBrief = (): GenBrief => ({
  gfa: 25000, heightTarget: null, plate: 650, parkingLevels: 2, f2f: { ...GEN_F2F },
  mix: { residential: 60, hotel: 0, office: 20, retail: 8, restaurant: 4, amenity: 8 },
  order: ['retail', 'restaurant', 'amenity', 'office', 'hotel', 'residential'],
})

export type Side = 'N' | 'S' | 'E' | 'W'
export interface GenSite { w: number; d: number; frontage?: Side; lane?: Side; area?: number }
export interface Rect { x: number; y: number; w: number; d: number }

export type GenKey = 'slender' | 'podium' | 'split' | 'court'
export interface GenParam { key: string; label: string; def: number | string; min?: number; max?: number; step?: number; options?: [string, string][]; fmt: (v: number) => string }
export type GenParams = Record<string, number | string>

export interface GenBlock {
  use: GenUse | 'parking'
  name: string
  x: number; y: number; w: number; d: number
  z0: number
  floors: number
  f2f: number
  /** Toolkit bookkeeping (not in her blocks): what the block is, and which tower it belongs to. */
  role: 'ground' | 'podium' | 'tower' | 'parking'
  tower: number | null
  /** One of the four bars of a courtyard podium. */
  bar?: 'south' | 'north' | 'west' | 'east'
}
export interface GenConflict { title: string; text: string; fix: string }
export interface GenRow { use: GenUse; target: number; pct: number; gen: number; genPct: number }
export interface GenResult {
  key: GenKey
  P: GenParams
  seed: number
  blocks: GenBlock[]
  rows: GenRow[]
  reqTotal: number
  genTotal: number
  notes: string[]
  conflicts: GenConflict[]
  height: number
  storeys: number
  fsr: number
  towers: number
  podiumStoreys: number
  /** Tower rectangles, the podium footprint and the open court (courtyard type), site frame. */
  towerRects: Rect[]
  podium: Rect
  court: Rect | null
  frame: Frame
  label: string
}

const fmt = (v: number, d = 0) => Number(v).toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })
const snap = (v: number) => Math.round(v * 4) / 4
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const param = (key: string, label: string, def: number, min: number, max: number, step = 1, fmtf?: (v: number) => string): GenParam => ({ key, label, def, min, max, step, fmt: fmtf || ((v) => String(v)) })
const COMMON: GenParam[] = [
  param('along', 'Tower position along the frontage', 0, -1, 1, 0.05, (v) => (Math.abs(v) < 0.03 ? 'centred' : v < 0 ? Math.round(-v * 100) + '% to one end' : Math.round(v * 100) + '% to the other')),
  param('depth', 'Tower position, street to lane', 0.3, -1, 1, 0.05, (v) => (Math.abs(v) < 0.03 ? 'middle' : v < 0 ? Math.round(-v * 100) + '% to the street' : Math.round(v * 100) + '% to the lane')),
  param('aspect', 'Tower proportion, frontage ÷ depth', 1.2, 0.5, 2.5, 0.05, (v) => v.toFixed(2)),
]
export const GEN_TYPES: Record<GenKey, { name: string; blurb: string; params: GenParam[] }> = {
  slender: { name: 'Slender Tower', blurb: 'One tower straight from the ground, retail in its base. Smallest footprint, tallest result.', params: COMMON },
  podium: { name: 'Podium + Tower', blurb: 'A street-wall podium of retail, amenity and office with the tower set back on top. The downtown default.', params: [param('podiumStoreys', 'Podium storeys', 3, 1, 8)].concat(COMMON) },
  split: {
    name: 'Split Towers on a Shared Podium', blurb: 'Two slimmer towers at the ends of one podium, kept 24.4 m apart so both keep daylight and views.',
    params: [param('podiumStoreys', 'Podium storeys', 3, 1, 8), param('gap', 'Gap between towers', 24.4, 15, 60, 0.1, (v) => v.toFixed(1) + ' m'), param('share', 'Area in the first tower', 50, 20, 80, 5, (v) => v + '%'),
      param('depth', 'Towers, street to lane', 0.3, -1, 1, 0.05, (v) => (Math.abs(v) < 0.03 ? 'middle' : v < 0 ? 'toward the street' : 'toward the lane')), param('aspect', 'Tower proportion, frontage ÷ depth', 1.0, 0.5, 2.5, 0.05, (v) => v.toFixed(2))],
  },
  court: {
    name: 'Courtyard Podium + Tower', blurb: 'A podium of bars around an open court, with the tower on one corner of the ring.',
    params: [param('podiumStoreys', 'Podium storeys', 4, 2, 8), param('barDepth', 'Bar depth', 16, 10, 24, 0.5, (v) => v.toFixed(1) + ' m'),
      { key: 'corner', label: 'Tower corner', def: 'street-left', options: [['street-left', 'Street side, left'], ['street-right', 'Street side, right'], ['lane-left', 'Lane side, left'], ['lane-right', 'Lane side, right']], fmt: String },
      param('aspect', 'Tower proportion, frontage ÷ depth', 1.1, 0.5, 2.5, 0.05, (v) => v.toFixed(2))],
  },
}
export const genDefaults = (key: GenKey): GenParams => Object.fromEntries(GEN_TYPES[key].params.map((q) => [q.key, q.def]))
const PODIUM_USES: GenUse[] = ['amenity', 'office'], GROUND_USES: GenUse[] = ['retail', 'restaurant']

export interface Frame { W: number; D: number; front: Side; lane: Side; alongX: boolean; streetMin: boolean; podium: Rect }
/** The site's podium footprint (her `frame`, with no guideline setback set: the Toolkit checks setbacks itself). */
function frame(site: GenSite): Frame {
  const W = site.w, D = site.d, front = site.frontage || 'S'
  const lane = site.lane || (front === 'S' ? 'N' : front === 'N' ? 'S' : front === 'E' ? 'W' : 'E')
  return { W, D, front, lane, alongX: 'NS'.includes(front), streetMin: front === 'S' || front === 'W', podium: { x: snap(0), y: snap(0), w: snap(Math.max(8, W)), d: snap(Math.max(8, D)) } }
}
/** A tower rectangle of `area` inside `box`, with proportion `aspect` (frontage ÷ depth) and position params. */
function towerRect(F: Frame, box: Rect, area: number, aspect: number, along: number, depth: number): Rect {
  const k = F.alongX ? aspect : 1 / aspect
  let w = Math.sqrt(area * k), d = area / w
  if (w > box.w) { w = box.w; d = Math.min(box.d, area / w) }
  if (d > box.d) { d = box.d; w = Math.min(box.w, area / d) }
  w = snap(Math.max(6, w)); d = snap(Math.max(6, d))
  const fx = F.alongX ? along : F.streetMin ? depth : -depth, fy = F.alongX ? (F.streetMin ? depth : -depth) : along
  return { x: snap(clamp(box.x + ((box.w - w) / 2) * (1 + fx), box.x, box.x + box.w - w)), y: snap(clamp(box.y + ((box.d - d) / 2) * (1 + fy), box.y, box.y + box.d - d)), w, d }
}
const areaOf = (r: Rect) => r.w * r.d
const top = (b: { z0: number; floors: number; f2f: number }) => b.z0 + b.floors * b.f2f
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.d - 1e-9 && b.y < a.y + a.d - 1e-9
function seededRandom(seed: number) { let a = (seed * 9301 + 49297) % 233280 || 1; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280 } }

interface Seg { use: GenUse; rect: Rect; floors: number; f2f: number; ring?: boolean; strip?: boolean; name?: string; role: GenBlock['role']; tower: number | null }

export interface GenOptions {
  /** Tower floorplate the floor-plate bulletin allows (m²); null for no note (her default 605, downtown residential). */
  plateLimit?: number | null
}

/** Her Gen.generate(project, key, P, seed). */
export function generate(site: GenSite, brief: GenBrief, key: GenKey, P: GenParams = {}, seed = 0, opts: GenOptions = {}): GenResult {
  const T = GEN_TYPES[key] || GEN_TYPES.podium
  const p: GenParams = { ...genDefaults(key), ...P }
  const num = (k: string): number | undefined => (p[k] == null ? undefined : Number(p[k]))
  const F = frame(site), notes: string[] = [], conflicts: GenConflict[] = []
  const uses = GEN_USES.filter((u) => (brief.mix[u] || 0) > 0)
  const target = {} as Record<GenUse, number>
  for (const u of uses) target[u] = (brief.gfa * brief.mix[u]) / 100
  const alloc = { ...target } // what is still to be placed once the ground storey is drawn
  const f2f = (u: GenUse) => brief.f2f[u] || GEN_F2F[u] || 3
  // Variation: nudge the brief-independent choices so each seed is a different, plausible answer to the same brief.
  const rnd = seededRandom(seed), vary = seed > 0
  const plateArea = brief.plate * (vary ? 0.9 + rnd() * 0.25 : 1)
  const along = clamp((num('along') || 0) + (vary ? (rnd() - 0.5) * 0.6 : 0), -1, 1)
  const depth = clamp((num('depth') == null ? 0.3 : num('depth')!) + (vary ? (rnd() - 0.5) * 0.5 : 0), -1, 1)
  const aspect = clamp((num('aspect') || 1.2) * (vary ? 0.85 + rnd() * 0.3 : 1), 0.5, 2.5)
  const podStoreys = key === 'slender' ? 0 : Math.max(0, Math.round((num('podiumStoreys') == null ? 3 : num('podiumStoreys')!) + (vary ? Math.round((rnd() - 0.5) * 2) : 0)))
  const segs: Seg[] = []
  const blocks: GenBlock[] = []
  const order = brief.order.filter((u) => uses.includes(u)).concat(uses.filter((u) => !brief.order.includes(u)))
  const groundUses = order.filter((u) => GROUND_USES.includes(u))
  const podiumUses = podStoreys > 0 ? order.filter((u) => PODIUM_USES.includes(u)) : []
  const towerUses = order.filter((u) => !groundUses.includes(u) && !podiumUses.includes(u))
  if (vary && towerUses.length > 1 && rnd() < 0.5) towerUses.reverse() // e.g. hotel above homes in one variation
  // Footprints (no setback set: the tower box is the podium footprint).
  const podiumRect = F.podium
  let court: Rect | null = null
  const towerBox = F.podium
  if (key === 'court') {
    const bd = num('barDepth')!, ok = F.podium.w >= 2 * bd + 10 && F.podium.d >= 2 * bd + 10
    if (!ok) notes.push(`The site is too small for a full courtyard ring with ${fmt(bd, 1)} m bars; the podium is a solid block instead.`)
    else court = { x: snap(F.podium.x + bd), y: snap(F.podium.y + bd), w: snap(F.podium.w - 2 * bd), d: snap(F.podium.d - 2 * bd) }
  }
  const podiumArea = court ? areaOf(F.podium) - areaOf(court) : areaOf(podiumRect)
  let towers: { rect: Rect; share: number }[] = []
  if (key === 'split') {
    const gap = Math.max(24.4, num('gap') || 24.4), share = (num('share') || 50) / 100
    const alongLen = F.alongX ? podiumRect.w : podiumRect.d
    const each = Math.min(plateArea, Math.max(300, ((alongLen - gap) / 2) * (F.alongX ? podiumRect.d : podiumRect.w) * 0.8))
    if ((alongLen - gap) / 2 < 12) conflicts.push({ title: 'Two towers do not fit', text: `The ${fmt(alongLen, 1)} m frontage cannot hold two towers ${fmt(gap, 1)} m apart; choose Podium + Tower or widen the site.`, fix: 'Use one tower, or reduce the gap only if the design review accepts it.' })
    const tA = towerRect(F, towerBox, each, aspect, -1, depth), tB = towerRect(F, towerBox, each, aspect, 1, depth)
    if (each < plateArea - 1) notes.push(`Each tower plate is ${fmt(each)} m² so that two towers fit ${fmt(gap, 1)} m apart; the preferred plate was ${fmt(plateArea)} m².`)
    towers = [{ rect: tA, share }, { rect: tB, share: 1 - share }]
  } else if (key === 'court' && court) {
    const c = String(p.corner || 'street-left'), bd = num('barDepth')!
    const w = snap(Math.min(towerBox.w, Math.sqrt(plateArea * aspect))), d = snap(Math.min(towerBox.d, plateArea / w))
    const streetSide = c.startsWith('street') ? (F.streetMin ? 'min' : 'max') : F.streetMin ? 'max' : 'min', left = c.endsWith('left')
    const tb = towerBox
    const yPos = F.alongX ? (streetSide === 'min' ? tb.y : tb.y + tb.d - d) : left ? tb.y : tb.y + tb.d - d
    const xPos = F.alongX ? (left ? tb.x : tb.x + tb.w - w) : streetSide === 'min' ? tb.x : tb.x + tb.w - w
    towers = [{ rect: { x: snap(xPos), y: snap(yPos), w, d }, share: 1 }]
    if (w > 2 * bd + 2 || d > 2 * bd + 2) notes.push('The tower plate is wider than the podium bar, so part of it sits over the court.')
  } else {
    towers = [{ rect: towerRect(F, towerBox, key === 'slender' ? Math.max(plateArea, 1) : plateArea, aspect, along, depth), share: 1 }]
  }
  // Ground storey: retail along the street, restaurant at the lane side, on the podium footprint (or the tower footprint
  // for a slender tower). A use that wants half the footprint or more takes whole storeys of it; smaller ones become
  // strips side by side in one storey, and the rest of that storey is the next use up the stack (its lobby).
  const base = key === 'slender' ? towers[0].rect : podiumRect
  const strips: { use: GenUse; A: number; street: boolean }[] = []
  const fillUse: GenUse | null = podiumUses[0] || towerUses[0] || null
  for (const u of groundUses) {
    const A = target[u]
    let rect = { ...base }, floors = 1
    if (court) rect = { ...F.podium }
    const perFloor = court ? podiumArea : areaOf(rect)
    floors = Math.max(1, Math.round(A / perFloor))
    if (floors > 2) { floors = 2; notes.push(`${GEN_LABEL[u]} wants ${fmt(A)} m² but the ground footprint holds ${fmt(perFloor)} m² a storey; two storeys are drawn and the rest is left out (add it to the podium or raise the share).`) }
    if (A < perFloor * 0.5 && !court) { strips.push({ use: u, A, street: u === 'retail' }); continue }
    segs.push({ use: u, rect, floors, f2f: f2f(u), ring: !!court, role: 'ground', tower: null })
  }
  if (strips.length) {
    const alongLen = F.alongX ? base.w : base.d, full = F.alongX ? base.d : base.w, lo = F.alongX ? base.y : base.x, hi = lo + full
    let depths = strips.map((s) => clamp(s.A / alongLen, Math.min(6, full), full))
    const sum = depths.reduce((a, b) => a + b, 0)
    if (sum > full) depths = depths.map((d) => (d / sum) * full)
    let rest = full - depths.reduce((a, b) => a + b, 0)
    if (!fillUse || rest < 4) { depths = depths.map((d) => d + rest / depths.length); rest = 0 } // too thin for a block of its own
    depths = depths.map(snap)
    const gh = Math.max(...strips.map((s) => f2f(s.use)).concat(rest > 0 ? [f2f(fillUse!)] : [])) // one storey height across the ground storey
    const rectAt = (from: number, to: number) => { const r = { ...base }; if (F.alongX) { r.y = snap(from); r.d = snap(to - from) } else { r.x = snap(from); r.w = snap(to - from) } return r }
    let a0 = lo, a1 = hi
    strips.forEach((s, i) => {
      const last = rest === 0 && i === strips.length - 1, atMin = s.street === F.streetMin
      const r = last ? rectAt(a0, a1) : atMin ? rectAt(a0, a0 + depths[i]) : rectAt(a1 - depths[i], a1)
      if (atMin) a0 += depths[i]; else a1 -= depths[i]
      segs.push({ use: s.use, rect: r, floors: 1, f2f: gh, strip: true, role: 'ground', tower: null })
    })
    if (rest > 0 && a1 - a0 > 0.5) {
      const r = rectAt(a0, a1), fa = areaOf(r)
      alloc[fillUse!] = Math.max(0, alloc[fillUse!] - fa)
      const atGrade = !segs.some((s) => !s.strip), fillName = `${GEN_LABEL[fillUse!]} ${atGrade ? 'ground floor' : 'podium floor'}`
      segs.push({ use: fillUse!, rect: r, floors: 1, f2f: gh, strip: true, name: fillName, role: 'ground', tower: null })
      notes.push(`${strips.map((s) => GEN_LABEL[s.use]).join(' and ')} fill${strips.length === 1 ? 's' : ''} only part of ${atGrade ? 'the ground storey' : 'the storey above the retail'}, so its remaining ${fmt(fa)} m² is drawn as ${fillName.toLowerCase()} (lobby and back of house) and counted toward ${GEN_LABEL[fillUse!].toLowerCase()}.`)
    }
    if (strips.some((s) => Math.abs(f2f(s.use) - gh) > 0.01) || (rest > 0 && Math.abs(f2f(fillUse!) - gh) > 0.01)) notes.push(`The storey of side-by-side ${strips.map((s) => GEN_LABEL[s.use].toLowerCase()).join(' and ')}${rest > 0 ? ` and ${GEN_LABEL[fillUse!].toLowerCase()}` : ''} is ${fmt(gh, 1)} m floor to floor for every use in it, so the mass above sits flush on it.`)
  }
  // Podium storeys: amenity and office on the podium footprint; what they do not hold goes into the tower.
  const groundStoreys = segs.filter((s) => !s.strip).reduce((a, s) => a + s.floors, 0) + (segs.some((s) => s.strip) ? 1 : 0)
  let podLeft = Math.max(0, podStoreys - groundStoreys)
  const overflow: Partial<Record<GenUse, number>> = {}
  const towerPlate = Math.min(...towers.map((tw) => areaOf(tw.rect)))
  for (const u of podiumUses) {
    const per = court ? podiumArea : areaOf(podiumRect)
    let n = 0
    if (podLeft > 0 && alloc[u] >= per * 0.5) {
      n = Math.min(podLeft, Math.max(1, Math.round(alloc[u] / per))); podLeft -= n
      segs.push({ use: u, rect: court ? { ...F.podium } : { ...podiumRect }, floors: n, f2f: f2f(u), ring: !!court, role: 'podium', tower: null })
    }
    const rem = alloc[u] - n * per
    if (rem > 0) { overflow[u] = rem; if (n > 0 && rem >= towerPlate * 0.5) notes.push(`${GEN_LABEL[u]} needs ${fmt(alloc[u])} m²${alloc[u] < target[u] ? ' above the ground floor' : ''}; ${n} podium storey${n === 1 ? '' : 's'} hold ${fmt(n * per)} m² and the remaining ${fmt(rem)} m² go into the tower.`) }
  }
  if (podLeft > 0 && podStoreys > 0 && podiumUses.length) notes.push(`The podium needs only ${podStoreys - podLeft} storey${podStoreys - podLeft === 1 ? '' : 's'} for its program; ${podLeft} requested podium storey${podLeft === 1 ? ' is' : 's are'} not drawn rather than padded with tower uses.`)
  // Tower storeys per use, split across towers by share; podium overflow (office, amenity) sits at the base of the tower.
  const towerSegs: { use: GenUse; tower: number; floors: number; f2f: number }[] = []
  for (const u of (Object.keys(overflow) as GenUse[]).filter((x) => !towerUses.includes(x)).concat(towerUses)) {
    const A = overflow[u] != null ? overflow[u]! : alloc[u]
    if (A <= 0) continue
    const placed = segs.some((s) => s.use === u)
    towers.forEach((tw, ti) => {
      const a = A * tw.share, per = areaOf(tw.rect)
      if (placed && a < per * 0.5) return // the ground floor or podium already holds it, bar a fraction of a plate
      towerSegs.push({ use: u, tower: ti, floors: Math.max(1, Math.round(a / per)), f2f: f2f(u) })
    })
  }
  const outTower: Seg[] = []
  towers.forEach((tw, ti) => { for (const s of towerSegs.filter((x) => x.tower === ti)) outTower.push({ use: s.use, rect: tw.rect, floors: s.floors, f2f: s.f2f, role: 'tower', tower: ti }) })
  segs.push(...outTower)
  // Blocks from segments, each a continuous run of floors.
  let zc = 0
  const names: Partial<Record<GenUse, number>> = {}
  const nm = (u: GenUse) => { names[u] = (names[u] || 0) + 1; return names[u]! > 1 ? `${GEN_LABEL[u]} ${names[u]}` : GEN_LABEL[u] }
  const towerZ0 = new Map<number, number>()
  for (const s of segs) {
    if (s.tower != null && !towerZ0.has(s.tower)) towerZ0.set(s.tower, zc)
    if (s.ring && court) {
      const b = F.podium, c = court
      const bars: Rect[] = [{ x: b.x, y: b.y, w: b.w, d: c.y - b.y }, { x: b.x, y: c.y + c.d, w: b.w, d: b.y + b.d - c.y - c.d }, { x: b.x, y: c.y, w: c.x - b.x, d: c.d }, { x: c.x + c.w, y: c.y, w: b.x + b.w - c.x - c.w, d: c.d }]
      const sides = ['south', 'north', 'west', 'east'] as const
      const base2 = nm(s.use)
      bars.forEach((r, i) => blocks.push({ use: s.use, name: `${base2} ${sides[i]} bar`, x: snap(r.x), y: snap(r.y), w: snap(r.w), d: snap(r.d), z0: Math.round(zc * 100) / 100, floors: s.floors, f2f: s.f2f, role: s.role, tower: null, bar: sides[i] }))
    } else {
      const r = s.rect
      blocks.push({ use: s.use, name: s.name || nm(s.use), x: r.x, y: r.y, w: r.w, d: r.d, z0: Math.round(zc * 100) / 100, floors: s.floors, f2f: s.f2f, role: s.role, tower: s.tower })
    }
    zc += s.floors * s.f2f
  }
  // Settle: every above-grade block sits on the highest block below it that it overlaps in plan, bottom to top, so
  // side-by-side ground strips, a tower that misses the retail strip and two towers on one podium never float.
  {
    const up = blocks.filter((b) => b.z0 >= 0).sort((a, b) => a.z0 - b.z0), done: GenBlock[] = []
    for (const b of up) { let zz = 0; for (const o of done) if (overlap(b, o)) zz = Math.max(zz, top(o)); b.z0 = Math.round(zz * 100) / 100; done.push(b) }
  }
  // Parking below grade on the whole site (no ramp or cores: the Toolkit sizes its own cores).
  const nPark = Math.max(0, Math.round(brief.parkingLevels || 0)), base0 = Math.round(-3.2 * nPark * 100) / 100
  if (nPark) blocks.push({ use: 'parking', name: `Parking P1–P${nPark}`, x: 0.5, y: 0.5, w: snap(F.W - 1), d: snap(F.D - 1), z0: base0, floors: nPark, f2f: 3.2, role: 'parking', tower: null })
  const above = blocks.filter((b) => b.use !== 'parking')
  const topAll = above.length ? Math.max(...above.map(top)) : 0
  // Requested against generated.
  const gen = {} as Record<GenUse, number>
  for (const u of uses) gen[u] = above.filter((b) => b.use === u).reduce((a, b) => a + b.floors * b.w * b.d, 0)
  const genTotal = uses.reduce((a, u) => a + gen[u], 0), reqTotal = uses.reduce((a, u) => a + target[u], 0)
  const rows: GenRow[] = uses.map((u) => ({ use: u, target: target[u], pct: brief.mix[u], gen: gen[u], genPct: genTotal ? (gen[u] / genTotal) * 100 : 0 }))
  for (const r of rows) {
    const d = r.gen - r.target
    if (Math.abs(d) > Math.max(60, r.target * 0.08)) {
      const seg = segs.filter((s) => s.use === r.use), per = seg.length ? areaOf(seg[0].rect) : 0, n = seg.reduce((a, s) => a + s.floors, 0)
      notes.push(`${GEN_LABEL[r.use]}: ${fmt(r.gen)} m² generated against ${fmt(r.target)} m² requested (${d > 0 ? '+' : ''}${fmt(d)} m²)${per ? `, because storeys are whole: ${fmt(per)} m² a storey, so the share rounds to ${n} storey${n === 1 ? '' : 's'}` : ''}.`)
    }
  }
  // Conflicts: height (against the design height target only; the Toolkit's own nodes check the City and brief limits).
  const cap = brief.heightTarget || null
  if (cap && topAll > cap + 0.05) {
    const over = topAll - cap, twArea = towers.reduce((a, tw) => a + areaOf(tw.rect), 0), towerFloors = outTower.reduce((a, s) => a + s.floors, 0)
    const meanF2f = outTower.reduce((a, s) => a + s.floors * s.f2f, 0) / Math.max(1, towerFloors)
    const spare = Math.max(1, Math.floor((cap - (towerZ0.size ? Math.min(...towerZ0.values()) : 0)) / meanF2f))
    const plateNeeded = Math.ceil(outTower.reduce((a, s) => a + s.floors * areaOf(s.rect), 0) / spare / 10) * 10
    conflicts.push({
      title: `Height ${fmt(topAll, 1)} m exceeds the design height target of ${fmt(cap, 1)} m by ${fmt(over, 1)} m`,
      text: `The ${fmt(brief.gfa)} m² brief on a ${fmt(twArea)} m² tower plate needs ${towerFloors} tower storeys.`,
      fix: `Either raise the preferred floorplate to about ${fmt(plateNeeded)} m² (${spare} storeys would then fit), reduce the target area by about ${fmt((over / meanF2f) * twArea)} m², ${towers.length < 2 ? 'or split into two towers on the podium' : 'or widen the towers'}. The targets were not changed.`,
    })
  }
  const siteArea = site.area || F.W * F.D
  const fsr = genTotal / siteArea
  const plateLim = opts.plateLimit === undefined ? 605 : opts.plateLimit
  if (plateLim != null) for (const tw of towers) if (areaOf(tw.rect) > plateLim * 1.1) notes.push(`A ${fmt(areaOf(tw.rect))} m² tower plate is above the ${plateLim} m² the floor-plate bulletin allows on most downtown sites; the tower floor-plate check will flag it.`)
  return {
    key, P: p, seed, blocks, rows, reqTotal, genTotal, notes, conflicts, height: topAll,
    storeys: above.reduce((a, b) => a + b.floors, 0), fsr, towers: towers.length, podiumStoreys: podStoreys,
    towerRects: towers.map((t) => t.rect), podium: F.podium, court, frame: F, label: `${T.name}${seed ? ` · variation ${seed}` : ''}`,
  }
}
