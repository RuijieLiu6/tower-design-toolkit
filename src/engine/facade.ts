// Facade layout and glazing checks (research P12-M06a facade layout, part of P12-M06b envelope and bird safety),
// round 2. Geometry only: energy (TEUI, TEDI, GHGI) belongs to the energy node. Reference WWR, VLT and SHGC lines are
// US or legacy VBBL values shown without a pass badge, as the research requires.

import { readsStoreys, towerFloors, towerFootprint, towerMasses } from './massing'
import { deckUseOf, towerDecks } from './sw/decks'
import type { RuleResult, RuleState, Tower } from './types'

export type FacadeSystem = 'curtain-wall' | 'window-wall' | 'punched' | 'double-skin'
export type Quadrant = 'N' | 'E' | 'S' | 'W'

/** System defaults are team presets (research P12-M06a: only the curtain wall has a secondary source, P12-S75). */
export const SYSTEMS: Record<FacadeSystem, { label: string; wwr: number; note: string }> = {
  'curtain-wall': { label: 'Curtain wall (unitized)', wwr: 0.6, note: 'Factory-glazed units; opaque spandrel at each slab (P12-S75, secondary)' },
  'window-wall': { label: 'Window wall (slab to slab)', wwr: 0.5, note: 'Glazed between slabs with a slab-edge cover (team preset)' },
  punched: { label: 'Punched windows', wwr: 0.35, note: 'Windows in an opaque wall (team preset)' },
  'double-skin': { label: 'Double-skin facade', wwr: 0.65, note: 'Ventilated cavity between two glass layers (team preset)' },
}

export interface FacadeInput {
  system: FacadeSystem
  /** Window-to-wall ratio by facing (true north quadrant); null = the system's preset. */
  wwr: Record<Quadrant, number | null>
  /** Share of glass in the bird-collision zone with markers, frit or other treatment (0-1). */
  treated: number | null
  /** Where `treated` came from when it was not entered here (e.g. City in Nature's ledger); said in the line's note. */
  treatedFrom?: string
  /** Tallest vegetation next to the facade (m above grade); sets the zone top (4 m above it, at least 16 m). */
  vegetation: number
  /** Vision glass properties from the product data (blank until entered). */
  vlt: number | null
  shgc: number | null
}

export const DEFAULT_FACADE: FacadeInput = { system: 'curtain-wall', wwr: { N: null, E: null, S: null, W: null }, treated: null, vegetation: 0, vlt: null, shgc: null }

export interface Face {
  tower: string
  part: 'podium' | 'tower'
  /** Outward normal, degrees clockwise from true north. */
  azimuth: number
  bin: string
  /** The 8-bin label changes within ±5° (the street grid sits near bin edges here). */
  binFlips: boolean
  quadrant: Quadrant
  length: number
  z0: number
  z1: number
  area: number
  wwr: number
  glass: number
}

const BINS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const binOf = (az: number) => BINS[Math.round((((az % 360) + 360) % 360) / 45) % 8]
const quadOf = (az: number): Quadrant => (['N', 'E', 'S', 'W'] as Quadrant[])[Math.round((((az % 360) + 360) % 360) / 90) % 4]

/**
 * Facade faces of every tower: plan outline edges (rectangle, or the imported hull) for the tower shaft, and the
 * podium rectangle. northDeg = true north clockwise from model +Y.
 */
export function faces(towers: Tower[], input: FacadeInput, northDeg: number): Face[] {
  const out: Face[] = []
  for (const t of towers) {
    const parts: { part: Face['part']; poly: [number, number][]; z0: number; z1: number }[] = []
    // Every stacked block (shifted and twisted blocks face their own way), or every run of equal storeys of an imported
    // tower (T10); a drawn mass or a bare hull: its hull, full height.
    if (t.imported && !readsStoreys(t)) parts.push({ part: 'tower', poly: towerFootprint(t), z0: 0, z1: t.height })
    else for (const m of towerMasses(t)) parts.push({ part: m.podium ? 'podium' : 'tower', poly: m.ring, z0: m.z0, z1: m.z1 })
    for (const p of parts) {
      const ring = p.poly
      const ccw = ring.reduce((a, q, i) => { const r = ring[(i + 1) % ring.length]; return a + q[0] * r[1] - r[0] * q[1] }, 0) > 0
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
        if (len < 0.5) continue
        // Outward normal in the model frame, then as a bearing from true north.
        const nx = ccw ? dy / len : -dy / len, ny = ccw ? -dx / len : dx / len
        const modelBearing = (Math.atan2(nx, ny) * 180) / Math.PI
        const az = (((modelBearing - northDeg) % 360) + 360) % 360
        const quadrant = quadOf(az)
        const wwr = input.wwr[quadrant] ?? SYSTEMS[input.system].wwr
        const area = len * (p.z1 - p.z0)
        out.push({ tower: t.id, part: p.part, azimuth: Math.round(az * 10) / 10, bin: binOf(az), binFlips: binOf(az - 5) !== binOf(az) || binOf(az + 5) !== binOf(az), quadrant, length: len, z0: p.z0, z1: p.z1, area, wwr, glass: area * wwr })
      }
    }
  }
  return out
}

/** Bird-collision zone top: 16 m above grade or 4 m above the tallest vegetation, whichever is greater (UBC, P12-S31). */
export const zoneTop = (vegetation: number) => Math.max(16, vegetation + 4)

/** Facade glass beside a planted deck: a wall rising from the deck, over the deck's storey and the one above (gap G34). */
export interface DeckFace { tower: string; level: number; deckZ: number; z0: number; z1: number; length: number; wwr: number }

/**
 * Glass next to planting counts at any height (Vancouver Bird Friendly Design Guidelines 3.3(c)(ii), as cited by the
 * team in the City in Nature review R3-13; to confirm against the guideline text). For every deck the deck-use input
 * marks planted, the walls rising from it (its closed edges) over the deck's storey and the one above, capped at the
 * wall's own rise and any slab over the deck; the glass share is the facade's window-to-wall ratio for the wall's facing.
 */
export function plantedDeckFaces(towers: Tower[], input: FacadeInput, northDeg: number): DeckFace[] {
  const out: DeckFace[] = []
  for (const t of towers) {
    if (!t.deckUses?.some((u) => u?.use === 'planted')) continue
    const floors = towerFloors(t)
    for (const d of towerDecks(t, northDeg)) {
      if (deckUseOf(t, d)?.use !== 'planted') continue
      const up = floors.filter((f) => f.z0 >= d.z - 0.05).slice(0, 2)
      const h = up.length ? up[up.length - 1].z1 - d.z : 2 * t.f2f
      for (const e of d.edges) {
        if (e.open) continue
        const rise = Math.min(h, e.dH ?? h, d.cover ?? Infinity)
        if (!(rise > 0)) continue
        // the deck's outward normal at a closed edge points into the wall; the wall faces the deck
        const wwr = input.wwr[quadOf(e.az + 180)] ?? SYSTEMS[input.system].wwr
        out.push({ tower: t.id, level: d.level, deckZ: d.z, z0: d.z, z1: d.z + rise, length: e.L, wwr })
      }
    }
  }
  return out
}

/** Glass on a set of faces above a height (m²): the part a lower zone has not already counted. */
export const glazingAbove = (fs: { z0: number; z1: number; length: number; wwr: number }[], top: number) => fs.reduce((s, f) => s + Math.max(0, f.z1 - Math.max(f.z0, top)) * f.length * f.wwr, 0)

/** "+100 m" or "+40 m, +100 m": the planted decks' heights the extra glass sits on. */
export const deckHeights = (fs: DeckFace[], top: number) => [...new Set(fs.filter((f) => f.z1 > top).map((f) => Math.round(f.deckZ)))].sort((a, b) => a - b).map((z) => `+${z} m`).join(', ')

/** UBC Bird Backgrounder Table 1 (P12-S31): treated share by tier; Tier 4 sets no percentage. */
export const TIERS: { tier: number; share: number }[] = [{ tier: 1, share: 0.9 }, { tier: 2, share: 0.85 }, { tier: 3, share: 0.55 }]

export interface FacadeResult { faces: Face[]; rules: RuleResult[]; wall: number; glass: number; zoneGlass: number; byBin: Record<string, { wall: number; glass: number }>; /** Glass beside planted decks above the zone (G34), and its faces. */ deckGlass: number; deckFaces: DeckFace[] }

export function facadeCheck(towers: Tower[], input: FacadeInput, northDeg: number): FacadeResult {
  const fs = faces(towers, input, northDeg)
  const wall = fs.reduce((s, f) => s + f.area, 0), glass = fs.reduce((s, f) => s + f.glass, 0)
  const byBin: Record<string, { wall: number; glass: number }> = Object.fromEntries(BINS.map((b) => [b, { wall: 0, glass: 0 }]))
  for (const f of fs) { byBin[f.bin].wall += f.area; byBin[f.bin].glass += f.glass }
  const top = zoneTop(input.vegetation)
  const zoneGlass = fs.reduce((s, f) => s + Math.max(0, Math.min(f.z1, top) - f.z0) * f.length * f.wwr, 0)
  // Glass beside planted decks counts at any height (G34): added to the zone's glass and reported apart.
  const deckFaces = plantedDeckFaces(towers, input, northDeg)
  const deckGlass = glazingAbove(deckFaces, top)
  const wwr = wall ? glass / wall : 0
  const rules: RuleResult[] = []
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const flips = fs.filter((f) => f.binFlips).length

  rules.push({
    id: 'fa-wwr', label: 'Window-to-wall ratio (whole building)', value: `${pct(wwr)} · ${Math.round(glass).toLocaleString()} m² glass of ${Math.round(wall).toLocaleString()} m² wall`,
    threshold: 'reference lines only: office 40%, hotel 34% (US Appendix G baseline); 40% cap on the VBBL 2019 NECB-path reference building',
    state: 'unknown', flag: 'team_assumption',
    source: { label: 'PNNL Appendix G prototypes Table 30 (research P12-S18); VBBL 2019 10.2.2.3(1)(d) (P12-S71)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/564929486' },
    note: `No badge: these are reference-model values, not limits. Judge glazing by the energy result against the VBBL lines (energy node). Towers follow 10.2.2.5, so the 40% cap's applicability is unconfirmed; VBBL 2025 unread.${wwr > 0.4 ? ' Above 40%: expect the energy model to need better glass or shading.' : ''}`,
  })
  rules.push({
    id: 'fa-azimuth', label: 'Facing sensitivity (±5°)', value: `${flips} of ${fs.length} faces change their 8-way facing within ±5°`, threshold: 'report the change beside each result (team rule)',
    state: flips ? 'warn' : 'pass', flag: 'team_assumption', source: { label: 'Research P12-M06a (team rule: the street grid sits about 45° off true north, near bin edges)' },
    note: flips ? 'Faces near a bin edge: a few degrees of rotation moves them between, say, SW and W rules. Results by facing below show both.' : undefined,
  })
  // Bird-collision zone (P12-M06b).
  const tr = input.treated
  const tier = tr == null ? null : TIERS.find((t) => tr >= t.share - 1e-9)
  const birdState: RuleState = tr == null ? 'unknown' : tr >= 0.9 ? 'pass' : tr >= 0.55 ? 'warn' : 'fail'
  rules.push({
    id: 'fa-bird', label: 'Bird-friendly glass in the collision zone',
    value: (tr == null ? `${Math.round(zoneGlass).toLocaleString()} m² of glass below ${top} m: treated share not entered` : `${pct(tr)} of ${Math.round(zoneGlass + deckGlass).toLocaleString()} m² treated below ${top} m${deckGlass > 0.5 ? ' and beside planted decks' : ''}${tier ? ` (meets UBC Tier ${tier.tier})` : ' (below UBC Tier 3)'}`)
      + (deckGlass > 0.5 ? `; plus ${Math.round(deckGlass).toLocaleString()} m² of glass beside planted decks at ${deckHeights(deckFaces, top)} (any height, 3.3(c)(ii))` : ''),
    threshold: '90% treated (Tier 1, aligned with CSA A460); 85% Tier 2; 55% Tier 3; zone to 16 m or 4 m above the tallest vegetation',
    state: birdState, flag: 'unverified', source: { label: 'UBC Bird Backgrounder, Table 1 (research P12-S31, opened); CSA summary in Construction Canada (P12-S32)', url: 'https://planning.ubc.ca/sites/default/files/2024-05/UBC%20Bird%20Backgrounder_CCP-websiteR1.pdf' },
    note: (input.treatedFrom && tr != null ? `Treated share from ${input.treatedFrom}. ` : '') + 'UBC campus policy used as a proxy: the City Bird Friendly Guidelines (2017) and CSA A460-2019 were not opened. Markers 50 mm apart or closer ("2 × 2 rule"); treat glass corners 5 m each way and remove fly-through conditions (all tiers). Glass next to planting counts at any height (Vancouver guideline 3.3(c)(ii), as cited by the team, to confirm): the walls rising from each deck marked planted, over its storey and the one above, join the zone and are reported apart.',
  })
  rules.push({
    id: 'fa-vlt', label: 'Vision glass light transmittance (views)', value: input.vlt == null ? 'Not entered' : pct(input.vlt), threshold: 'above 40% (LEED quality views)',
    state: 'unknown', flag: input.vlt == null ? 'unresolved' : 'unverified', source: { label: 'LEEDuser NC-v5 EQc2 (P12-S56); CaGBC v4.1 quality views (P12-S05)', url: 'https://leeduser.buildinggreen.com/credit/NC-v5/EQc2' },
    note: `${input.vlt != null ? (input.vlt > 0.4 ? 'Above 40%. ' : '40% or below: views may not count. ') : 'Enter the glass product value. '}A rating-system line, not a by-law; shown without a badge until a person confirms the credit wording.`,
  })
  rules.push({
    id: 'fa-shgc', label: 'Vertical glazing SHGC (reference)', value: input.shgc == null ? 'Not entered' : input.shgc.toFixed(2), threshold: 'at or below 0.36 (VBBL 2019 NECB-path reference line)',
    state: 'unknown', flag: input.shgc == null ? 'unresolved' : 'unverified', source: { label: 'VBBL 2019 10.2.2.3(1)(e) (research P12-S71)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/564929486' },
    note: `${input.shgc != null ? (input.shgc <= 0.36 ? 'At or below the line. ' : 'Above the line: judge by the energy result. ') : ''}Towers follow 10.2.2.5, so this line's applicability is unconfirmed; legacy edition, VBBL 2025 unread.`,
  })
  rules.push({
    id: 'fa-feasibility', label: 'Facade feasibility items', value: '6 items not assessed: wind pressure, inter-storey drift, perimeter fire containment and spandrel height, condensation at frames, rainscreen, cleaning and maintenance access',
    threshold: 'every item has an owner result before a board shows it as resolved', state: 'unknown', flag: 'team_assumption',
    source: { label: 'Research P12-M06b feasibility checklist (owners: structure, systems, energy)' },
    note: 'None is computed here. Wind and drift come from the structure nodes; fire containment and access from systems; condensation from energy.',
  })
  return { faces: fs, rules, wall, glass, zoneGlass, byBin, deckGlass, deckFaces }
}
