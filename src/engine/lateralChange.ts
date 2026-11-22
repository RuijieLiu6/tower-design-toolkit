// Lateral-system change at the core top (tool cycle 12, R7 Ridge Gate: "the lateral system changes at +283.8 m, from a
// core to a frame. That is declared here as an honest exception, and TP4 must read it"). Where the core ends below the
// top (`Tower.coreTop`), the storeys above it stand on something else: a frame on the core top, or, where an opening
// splits them, ears that stand as separate frames, tied or not by a bridge. This line says what carries the lateral load
// there, where the change happens, how large the change is in the one measure the massing gives (the SFRS's plan
// dimension, NBC Table 4.1.8.6 Type 3) and how much weight rides on it. The frame's members are not modelled, so the
// jump in storey stiffness is not computed: never a pass, always a Check with a specialist marker. An open-storey
// soft / weak storey check, when the Structure tool has one, reads the storey stiffness and strength; this line names it
// rather than repeating it.
import { coreTopLevel, coreTopZ, floorsAboveCore, towerFloors } from './massing'
import { apertureReading, aperturesOf, compassOf, floorParts, levelRuns } from './openingField'
import { structureParts } from './structureOnly'
import type { WeightResult } from './storeyWeight'
import type { Floor, RuleResult, Source, Tower } from './types'

type P = [number, number]
const m1 = (v: number) => v.toFixed(1)

/** Type 3 (vertical geometric irregularity): the SFRS dimension over 130% of the adjacent storey's (NBC 2020 Table 4.1.8.6). */
export const TYPE3_RATIO = 1.3

export const LATERAL_CHANGE_SOURCE: Source = {
  label: 'National Building Code of Canada 2020, Div B Table 4.1.8.6 Type 3; BC Building Code 2024, Table 4.1.8.9 SFRS limits at SC4 (book notes bcbc-2024.md); Aoyama (ed.), Design of Modern Highrise Reinforced Concrete Structures (regular elevation; an analog)',
  page: 'Table 4.1.8.6; pp.4-484–486; p.12',
}

/** What carries the lateral load above the core top, read from the storeys' outlines there (null without a core top below the top storey). */
export interface LateralChange {
  /** The core top (m), the last storey with a core, and the storeys above it. */
  z: number
  last: number
  levels: number[]
  /** The most separate parts on one storey above the core top, and their names (compass point seen from the core). */
  parts: number
  names: string[]
  /** What ties separate parts: a structure-only bridge over an opening, other structure-only parts above the core top, or nothing. */
  tie: { kind: 'bridge' | 'structure' | 'none'; z0?: number; z1?: number }
  /** The top core's side (m) and the frame's plan extent above (m, the larger of the tower's own x and y), and their ratio. */
  coreSide: number
  extent: number
  ratio: number
  /** Seismic weight at and above the core top (kN), its share of the tower's, and the height above the core top (m). */
  W: number
  share: number
  height: number
}

export function lateralChange(t: Tower, w: WeightResult, north = 0, floors: Floor[] = towerFloors(t)): LateralChange | null {
  const above = floorsAboveCore(t, floors).filter((f) => !f.podium)
  const z = coreTopZ(t)
  if (!above.length || z == null) return null
  const last = coreTopLevel(t)
  const own = w.levels.find((l) => l.level === last && !l.roof)
  const core = { x: own?.coreX ?? w.core.x, y: own?.coreY ?? w.core.y, side: own?.coreSide ?? w.core.side }
  let parts = 1
  const names = new Set<string>(), pts: P[] = []
  for (const f of above) {
    const rings = floorParts(t, f)
    parts = Math.max(parts, rings.length)
    for (const r of rings) {
      pts.push(...r)
      if (rings.length > 1) {
        const cx = r.reduce((s, p) => s + p[0], 0) / r.length, cy = r.reduce((s, p) => s + p[1], 0) / r.length
        names.add(`${compassOf(t, [cx - core.x, cy - core.y], north)} ear`)
      }
    }
  }
  const ext = pts.length ? Math.max(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))) : 0
  // a structure-only bridge over an opening at or above the core top ties the ears; other structure-only parts above may
  let tie: LateralChange['tie'] = { kind: 'none' }
  for (const a of aperturesOf(t)) {
    if (a.z1 < z - 0.05) continue
    const h = apertureReading(t, a, north).head
    if (h?.structureOnly) { tie = { kind: 'bridge', z0: h.z0, z1: h.z1 }; break }
  }
  if (tie.kind === 'none') {
    const sp = structureParts(t).filter((s) => s.z0 >= z - 0.05)
    if (sp.length && parts > 1) tie = { kind: 'structure', z0: Math.min(...sp.map((s) => s.z0)), z1: Math.max(...sp.map((s) => s.z1)) }
  }
  const crown = w.levels.filter((l) => l.z >= z - 0.01)
  const W = crown.reduce((s, l) => s + l.W, 0)
  return { z, last, levels: above.map((f) => f.level), parts, names: [...names], tie, coreSide: core.side, extent: ext, ratio: core.side > 0 ? ext / core.side : Infinity, W, share: w.total > 0 ? W / w.total : 0, height: Math.max(0, t.height - z) }
}

/**
 * The lateral-system change line (Structure › Lateral & sway, id "lateral-change"): none when the core runs to the roof.
 * `rules` are the Structure lines computed so far, to name an open-storey soft / weak storey check if one is there.
 */
export function lateralChangeLines(t: Tower, w: WeightResult, o: { north?: number; rules?: RuleResult[]; floors?: Floor[] } = {}): RuleResult[] {
  const c = lateralChange(t, w, o.north ?? 0, o.floors)
  if (!c) return []
  const pair = c.names.length ? c.names.join(' and ') : `${c.parts} parts`
  const system = c.parts > 1
    ? `the ${pair} as separate frames${c.tie.kind === 'bridge' ? `, tied by the structure-only bridge at +${m1(c.tie.z0!)}–${m1(c.tie.z1!)} m` : c.tie.kind === 'structure' ? `, tied (if they span between them) by structure-only parts at +${m1(c.tie.z0!)}–${m1(c.tie.z1!)} m` : ', standing apart (nothing ties them)'}`
    : 'a frame on the core top (the storeys above stand on the core and the columns below)'
  const soft = (o.rules ?? []).find((r) => r.id !== 'lateral-change' && /soft|weak|open-storey|stiffness-irreg/i.test(r.id))
  const pct = Number.isFinite(c.ratio) ? `${Math.round(c.ratio * 100)}%` : 'no core below'
  const MN = (kN: number) => (kN / 1000).toFixed(1)
  return [{
    id: 'lateral-change', label: 'Lateral system change at the core top',
    value: `at +${m1(c.z)} m (above L${c.last}) the core ends: ${levelRuns(c.levels)} carried by ${system}; SFRS plan dimension ${m1(c.coreSide)} m core → ${m1(c.extent)} m of frame (${pct}); ${(c.share * 100).toFixed(1)}% of the seismic weight above (${MN(c.W)} MN over ${m1(c.height)} m)`,
    threshold: `a change of lateral system, declared and modelled by the engineer (never a pass on this screen); SFRS dimension ≤ ${Math.round(TYPE3_RATIO * 100)}% of the adjacent storey (Type 3); a listed SFRS at SC4 above as below (Table 4.1.8.9)`,
    state: 'warn', flag: 'unverified', source: LATERAL_CHANGE_SOURCE,
    specialist: `The lateral system changes at +${m1(c.z)} m from the core to ${c.parts > 1 ? 'separate frames in the ears' : 'a frame'}: the structural engineer models that frame, its base on the core top and the floor that carries its shear into the core, and reads the stiffness change in the dynamic analysis.`,
    note: `What carries the load is read from the outlines of the storeys above the core top (team geometry: each separate outline a frame of its own; a structure-only bridge over an opening ties them, which the bridge line reads). The frame's members are not modelled, so the jump in storey stiffness is not computed: the SFRS's plan dimension stands in, the ${m1(c.coreSide)} m top core against the ${m1(c.extent)} m extent of the frame above, ${c.ratio > TYPE3_RATIO ? `over ${Math.round(TYPE3_RATIO * 100)}%: a Type 3 irregularity by its definition` : `within ${Math.round(TYPE3_RATIO * 100)}%`}. An abrupt change of stiffness between adjacent storeys is what a regular elevation avoids (Aoyama p.12, an analog). The frame above must be a listed SFRS at SC4 (steel ductile moment frames have no height limit there; systems not listed are not permitted; Table 4.1.8.9 as read in the book notes). The core-alone line stops the cantilever at the core top and carries the storeys above as a rigid crown, an upper bound. ${soft ? `The storey stiffness and strength at the open storeys are read by "${soft.label}"; this line describes the change of system and where it happens.` : 'No storey stiffness or strength is computed here: an open-storey soft or weak storey check reads them.'}`,
  }]
}
