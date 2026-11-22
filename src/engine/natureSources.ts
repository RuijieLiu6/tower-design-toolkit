// One input set for City in Nature (node built.nature-inputs, 21 Nov). The panel (components/NatureLedger.tsx) and the
// evidence hub (lib/evidence/engines.ts) used to build their inputs apart: the panel lacked the model trees, the planting
// at grade and the preset soil depth; the hub lacked the Facade node's treated share and the QE Park answer from the view
// cones. Both now call natureArgs with the same sources, so the same design gives the same lines. Kept apart from
// cityInNature.ts because the greenwall area reads the Sun & Wind floor plates (sw/plate.ts), and the store imports
// cityInNature.ts for its defaults.
import { DEFAULT_WEIGHT_PRESETS } from './storeyWeight'
import { cityInNature, fourthStoreyTop, plantedSoil, qeFromCones, type ConeResult, type GreenWalls, type NatureContext, type NatureInput, type NatureResult, type Planters } from './cityInNature'
import { towerHomes } from './interior'
import { DEFAULT_LIFT_PRESETS } from './lifts'
import { towerFloors } from './massing'
import { swFloors, zoneFaceName, zoneFor, type FacadeZone } from './sw/plate'
import type { Tower } from './types'

type FaceStrip = { z0: number; z1: number; length: number; wwr: number }
/** What City in Nature reads from the rest of the design, the same for the panel and the evidence hub. */
export interface NatureSources {
  project: 'vtc' | 'city'
  towers: Tower[]
  /** True north (degrees; lib/northView.ts trueNorthDeg). */
  north: number
  /** The Facade node's result for these towers (engine/facade.ts facadeCheck): its faces and the glass beside planted decks. */
  facade: { faces: FaceStrip[]; deckFaces?: (FaceStrip & { deckZ: number })[] } | null
  /** `facade` was built from the Facade node's own settings (true) or its defaults (false, said in the bird-zone line). */
  facadeFromSettings: boolean
  /** The Facade node's own treated share (0–1), when entered there; the ledger's own figure wins. */
  facadeTreated?: number | null
  /** Real Vancouver: the view-cone results. Absent on Real Vancouver: the views line says they were not read. */
  cones?: ConeResult[] | null
  /** Soil depth (mm) for planted decks without their own: the storey-weight presets' (default 600 mm). */
  soilMm?: number
  /** Persons per home and home size (m²) for the residents (the lift presets'; default DEFAULT_LIFT_PRESETS). */
  personsPerHome?: number
  homeM2?: number
}

/**
 * Planted wall of the greenwall (planted spandrel, sw/plate.ts STRATS.greenwall) facade zones (node built.green-ratio):
 * for every storey and every plate edge whose zone is a greenwall, edge length × band height × (1 − WWR), the band being
 * the storey (floor to floor) and the WWR the zone's. Only a tower's own zones count (the Studio's default zones have no
 * greenwall). Null when no tower has a greenwall zone.
 */
export function greenwallArea(towers: Tower[], north: number): GreenWalls | null {
  const parts = new Map<string, { tower: string; face: string; from: number; to: number; m2: number }>()
  for (const t of towers) {
    const zones: FacadeZone[] = t.facadeZones ?? []
    if (!zones.some((z) => z.strat === 'greenwall')) continue
    // A coarse mask (4 m cells): only the plate edges are read, and they do not depend on the cell size.
    for (const f of swFloors(t, north, 4)) for (const e of f.edges) {
      const z = zoneFor(zones, e.zf, f.level)
      if (z.strat !== 'greenwall') continue
      const key = `${t.id}|${zones.indexOf(z)}`
      const p = parts.get(key) ?? { tower: t.name, face: zoneFaceName(z.face), from: z.from, to: z.to, m2: 0 }
      p.m2 += e.L * f.h * (1 - Math.min(1, Math.max(0, z.wwr)))
      parts.set(key, p)
    }
  }
  const list = [...parts.values()].filter((p) => p.m2 > 0)
  return list.length ? { m2: list.reduce((s, p) => s + p.m2, 0), parts: list } : null
}

/**
 * Declared planters (`Tower.planters`, node built.green-ratio; Ecocity in the Sky pp.90, 159): width × length on each
 * storey from `level` to `to` that the tower has. A planter with no length, width or storey there is left out. Null when
 * none counts.
 */
export function planterArea(towers: Tower[]): Planters | null {
  const parts: Planters['parts'] = []
  for (const t of towers) {
    if (!t.planters?.length) continue
    const levels = towerFloors(t).map((f) => f.level)
    for (const p of t.planters) {
      if (!p || !(p.length > 0) || !(p.width > 0) || !Number.isFinite(p.level)) continue
      const to = p.to != null && Number.isFinite(p.to) ? Math.max(p.level, p.to) : p.level
      const storeys = levels.filter((l) => l >= p.level && l <= to).length
      if (storeys) parts.push({ tower: t.name, ...(p.label ? { label: p.label } : {}), from: p.level, to, storeys, m2: p.length * p.width * storeys })
    }
  }
  return parts.length ? { m2: parts.reduce((s, p) => s + p.m2, 0), parts } : null
}

/**
 * Node contract (21 Nov): the planted-wall reading follows each storey's plate edges and the zone set for its face; on a
 * twisted or free-form tower (blocks turned against each other, imported or drawn storeys) which wall a zone covers needs
 * a facade or landscape specialist's read. Null when no tower with greenwall zones is like that.
 */
export function greenSpecialist(towers: Tower[]): string | undefined {
  const odd = towers.filter((t) => (t.facadeZones ?? []).some((z) => z.strat === 'greenwall') && (t.imported || (t.blocks ?? []).some((b) => Math.abs(b.rotation) > 0.5)))
  return odd.length ? `${odd.map((t) => t.name).join(', ')}: twisted or free-form storeys, so which walls a greenwall zone covers needs a facade or landscape specialist’s read` : undefined
}

/** The arguments cityInNature takes, from one set of sources. Model trees and planting at grade come from the input. */
export function natureArgs(input: NatureInput, s: NatureSources): { coneOverall: string[] | null; ctx: NatureContext } {
  const city = s.project === 'city'
  const soilMm = s.soilMm ?? DEFAULT_WEIGHT_PRESETS.soilMm
  const floors = s.towers.map(towerFloors)
  return {
    coneOverall: city && s.cones ? s.cones.map((c) => c.overall) : null,
    ctx: {
      project: s.project,
      fourthStoreyTop: fourthStoreyTop(floors),
      faces: s.facade?.faces ?? null, deckFaces: s.facade?.deckFaces ?? null,
      facadeFrom: s.facade ? (s.facadeFromSettings ? 'settings' : 'defaults') : undefined,
      facadeTreated: s.facadeTreated ?? null,
      qeFromCones: city ? qeFromCones(s.cones ?? null) : undefined,
      plantedSoil: plantedSoil(s.towers, s.north, soilMm),
      soilPresetMm: soilMm,
      groundPorous: input.groundPorous ?? null,
      groundPlantedM2: input.groundPlantedM2 ?? null,
      greenwalls: greenwallArea(s.towers, s.north),
      gfa: s.towers.length ? floors.flat().reduce((a, f) => a + f.area, 0) : null,
      greenSpecialist: greenSpecialist(s.towers),
      planters: planterArea(s.towers),
      footprint: s.towers.length ? floors.reduce((a, f) => a + (f[0]?.area ?? 0), 0) : null,
      residents: s.towers.length ? { homes: s.towers.reduce((a, t, k) => a + towerHomes(t, floors[k], s.homeM2 ?? DEFAULT_LIFT_PRESETS.homeM2), 0), perHome: s.personsPerHome ?? DEFAULT_LIFT_PRESETS.personsPerHome } : null,
    },
  }
}

/** City in Nature for a design from one set of sources (the panel and the evidence hub both call this). */
export function cityInNatureFrom(input: NatureInput, siteArea: number | null, s: NatureSources): NatureResult {
  const a = natureArgs(input, s)
  return cityInNature(input, siteArea, a.coneOverall, a.ctx)
}
