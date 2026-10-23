// Facade layout and glazing checks (research P12-M06a facade layout, part of P12-M06b envelope and bird safety),
// round 2. Geometry only: energy (TEUI, TEDI, GHGI) belongs to the energy node. Reference WWR, VLT and SHGC lines are
// US or legacy VBBL values shown without a pass badge, as the research requires.

import { towerFootprint } from './massing'
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
    if (t.podiumHeight > 0 && !t.imported) parts.push({ part: 'podium', poly: towerFootprint(t, true), z0: 0, z1: t.podiumHeight })
    parts.push({ part: 'tower', poly: towerFootprint(t), z0: t.imported ? 0 : t.podiumHeight, z1: t.height })
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

/** UBC Bird Backgrounder Table 1 (P12-S31): treated share by tier; Tier 4 sets no percentage. */
export const TIERS: { tier: number; share: number }[] = [{ tier: 1, share: 0.9 }, { tier: 2, share: 0.85 }, { tier: 3, share: 0.55 }]

export interface FacadeResult { faces: Face[]; rules: RuleResult[]; wall: number; glass: number; zoneGlass: number; byBin: Record<string, { wall: number; glass: number }> }

export function facadeCheck(towers: Tower[], input: FacadeInput, northDeg: number): FacadeResult {
  const fs = faces(towers, input, northDeg)
  const wall = fs.reduce((s, f) => s + f.area, 0), glass = fs.reduce((s, f) => s + f.glass, 0)
  const byBin: Record<string, { wall: number; glass: number }> = Object.fromEntries(BINS.map((b) => [b, { wall: 0, glass: 0 }]))
  for (const f of fs) { byBin[f.bin].wall += f.area; byBin[f.bin].glass += f.glass }
  const top = zoneTop(input.vegetation)
  const zoneGlass = fs.reduce((s, f) => s + Math.max(0, Math.min(f.z1, top) - f.z0) * f.length * f.wwr, 0)
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
    id: 'fa-bird', label: 'Bird-friendly glass in the collision zone', value: tr == null ? `${Math.round(zoneGlass).toLocaleString()} m² of glass below ${top} m: treated share not entered` : `${pct(tr)} of ${Math.round(zoneGlass).toLocaleString()} m² treated below ${top} m${tier ? ` (meets UBC Tier ${tier.tier})` : ' (below UBC Tier 3)'}`,
    threshold: '90% treated (Tier 1, aligned with CSA A460); 85% Tier 2; 55% Tier 3; zone to 16 m or 4 m above the tallest vegetation',
    state: birdState, flag: 'unverified', source: { label: 'UBC Bird Backgrounder, Table 1 (research P12-S31, opened); CSA summary in Construction Canada (P12-S32)', url: 'https://planning.ubc.ca/sites/default/files/2024-05/UBC%20Bird%20Backgrounder_CCP-websiteR1.pdf' },
    note: 'UBC campus policy used as a proxy: the City Bird Friendly Guidelines (2017) and CSA A460-2019 were not opened. Markers 50 mm apart or closer ("2 × 2 rule"); treat glass corners 5 m each way and remove fly-through conditions (all tiers). Sky gardens: apply the 4 m rule around each planted terrace (team reading).',
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
  return { faces: fs, rules, wall, glass, zoneGlass, byBin }
}
