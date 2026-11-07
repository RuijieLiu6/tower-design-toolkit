// Every built node's results for one design, computed straight from the engines (no React), for the Sources hub and
// its tests. Nodes whose inputs live in their own stores (economics, parking, facade) get the defaults here; energy and
// solar run only when switched on (their declared sources stand in). The hub page swaps in live results.
import { VTC_NORTH_DEG } from '../../context'
import { cityInNature, fourthStoreyTop } from '../../engine/cityInNature'
import { DEFAULT_ECON } from '../../engine/economics'
import { egressCheck, type EgressPresets } from '../../engine/egress'
import { DEFAULT_FACADE, facadeCheck } from '../../engine/facade'
import { interiorCheck } from '../../engine/interior'
import { daylightScreen } from '../../engine/daylightDepth'
import { DEFAULT_SYSTEMS_PRESETS, lifeSafety, type SystemsPresets } from '../../engine/lifeSafety'
import { aviationChecklist, relaxationChecklist } from '../../engine/relaxAviation'
import { CITY_ORIGIN } from '../../store'
import { liftCheck, type LiftPresets } from '../../engine/lifts'
import { towerFloors } from '../../engine/massing'
import { DEFAULT_MOBILITY, mobilityCheck } from '../../engine/mobility'
import { cityFrontageCheck, cityGroundPlaneCheck, cityStreetwallCheck, frontageCheck, groundPlaneCheck, streetwallCheck, type PublicRealmInput } from '../../engine/publicRealm'
import { skyRoomCheck } from '../../engine/skyRoom'
import { structureCheck } from '../../engine/structure'
import type { Tower } from '../../engine/types'
import { SITE, vtcRules, type FsrTier } from '../../engine/vtcRules'
import { windProcedure, windStudyRules, type WindPresets } from '../../engine/windStructure'
import type { NatureInput } from '../../engine/cityInNature'

export interface EvidenceInput {
  project: 'vtc' | 'city'
  towers: Tower[]
  fsrTier: FsrTier
  transitLink: boolean
  liftPresets: LiftPresets
  egressPresets: EgressPresets
  publicRealm: PublicRealmInput
  cityInNature: NatureInput
  windPresets: WindPresets
  systemsPresets?: SystemsPresets
  /** Real Vancouver: the study site's area (lib/siteArea.ts), when one is chosen. */
  studyArea?: number | null
  /** Real Vancouver: the study site's boundary, when one is chosen. */
  cityRing?: [number, number][] | null
}

/** Both projects' results side by side, so the hub lists every node's sources whichever project is open. */
export function mergeGroups(...list: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown[]> = {}
  for (const g of list) for (const [k, v] of Object.entries(g)) (out[k] ??= []).push(v)
  return out
}

export function evidenceGroups(i: EvidenceInput): Record<string, unknown> {
  const { towers } = i
  const vtc = i.project === 'vtc' && towers.length > 0
  const lifts = towers.map((t) => liftCheck(t, i.liftPresets, i.egressPresets))
  const egress = towers.map((t) => egressCheck(t, i.egressPresets, i.liftPresets))
  const wind = towers.map((t) => windProcedure(t, i.windPresets))
  return {
    'built.vtc-rules': vtc ? vtcRules(towers, { fsrTier: i.fsrTier, transitLink: i.transitLink }) : [],
    'built.core-lifts': lifts.map((l) => l.rules),
    'built.egress': egress.map((e) => e.rules),
    'built.life-safety': towers.map((t, k) => lifeSafety(t, lifts[k], egress[k], { transitLink: i.transitLink, liftPresets: i.liftPresets, presets: i.systemsPresets ?? DEFAULT_SYSTEMS_PRESETS, entrances: vtc ? Object.values(i.publicRealm.frontage).reduce((n, f) => n + f.entrances, 0) : null }).rules),
    'built.sky-room': towers.map((t, k) => skyRoomCheck(t, lifts[k], egress[k], i.egressPresets, i.liftPresets).rules),
    'built.pr-streetwall': vtc ? streetwallCheck(towers, i.publicRealm).rules : i.project === 'city' ? cityStreetwallCheck(towers).rules : [],
    'built.pr-frontage': vtc ? frontageCheck(towers, i.publicRealm).rules : i.project === 'city' ? cityFrontageCheck(towers).rules : [],
    'built.pr-ground': vtc ? groundPlaneCheck(towers, i.publicRealm).rules : i.project === 'city' ? cityGroundPlaneCheck(towers, i.cityRing ?? null, i.publicRealm).rules : [],
    'built.city-in-nature': cityInNature(i.cityInNature, i.project === 'vtc' ? SITE.area : i.studyArea ?? null, null, { fourthStoreyTop: fourthStoreyTop(towers.map(towerFloors)), faces: facadeCheck(towers, DEFAULT_FACADE, i.project === 'vtc' ? VTC_NORTH_DEG : 0).faces }),
    'built.wind-procedure': wind.map((w) => w.rules),
    'built.structure': towers.map((t, k) => structureCheck(t, wind[k]).rules),
    'built.wind-study': windStudyRules(Math.max(0, ...towers.map((t) => t.height))),
    'built.mobility': mobilityCheck(towers, DEFAULT_MOBILITY, { project: i.project, transitLink: i.transitLink, homeM2: i.liftPresets.homeM2, hotelM2PerKey: i.liftPresets.hotelM2PerKey }).rules,
    'built.facade': facadeCheck(towers, DEFAULT_FACADE, i.project === 'vtc' ? VTC_NORTH_DEG : 0).rules,
    'built.economics': DEFAULT_ECON,
    'built.interior': towers.map((t) => interiorCheck(t, towerFloors(t)).rules),
    'built.daylight-depth': towers.map((t) => daylightScreen(t, towerFloors(t)).rules),
    'built.relax-aviation': towers.map((t) => [...(i.project === 'city' ? relaxationChecklist(t, [], 15, i.studyArea ?? null, CITY_ORIGIN) : []), ...aviationChecklist(t, i.project === 'city' ? [t.x + CITY_ORIGIN[0], t.y + CITY_ORIGIN[1]] : null)]),
  }
}
