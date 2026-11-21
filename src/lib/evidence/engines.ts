// Every built node's results for one design, computed straight from the engines (no React), for the Sources hub and
// its tests. Nodes whose inputs live in their own stores (economics, parking, facade) get the defaults here; energy and
// solar run only when switched on (their declared sources stand in). The hub page swaps in live results.
// The engagement-and-claims guard and the AI-use log run when a culture input is given (gap G15): the app passes the
// browser's ledger (lib/cultureStore.ts), the design harness passes a design's records and board text.
import { VTC_NORTH_DEG } from '../../context'
import { cityInNature, fourthStoreyTop, plantedSoil } from '../../engine/cityInNature'
import { claimsLines, type Nation, type NationRecord } from '../../engine/culture'
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
import { provenanceLines, type ProvEntry } from '../../engine/provenance'
import { cityFrontageCheck, cityGroundPlaneCheck, cityStreetwallCheck, frontageCheck, groundPlaneCheck, streetwallCheck, type CityStreetsCtx, type PublicRealmInput } from '../../engine/publicRealm'
import { silhouetteReading, skyContext, type SkyContext, type SkyScreens } from '../../engine/silhouette'
import { skyRoomCheck, type SkyTerraceLine } from '../../engine/skyRoom'
import { structureCheck } from '../../engine/structure'
import { DEFAULT_WEIGHT_PRESETS, type WeightPresets } from '../../engine/storeyWeight'
import type { Tower } from '../../engine/types'
import { SITE, vtcRules, type FsrTier } from '../../engine/vtcRules'
import { windProcedure, windStudyRules, type WindPresets } from '../../engine/windStructure'
import type { ModelTree, NatureInput } from '../../engine/cityInNature'

/** The engagement ledger's data, as lib/cultureStore.ts holds it (that store's state can be passed as it is). */
export interface CultureInput {
  /** Engagement record per Nation (engine/culture.ts NationRecord: status 0 = N0 · No engagement … 4 = N4 · Written
   *  permission). A Nation or field left out takes DEFAULT_RECORD: N0, not confirmed. */
  records: Partial<Record<Nation, Partial<NationRecord>>>
  /** Board and narrative text to check: the store's one string, or a list of sentences or paragraphs. */
  claimsText: string | string[]
  /** AI-use log entries (engine/provenance.ts ProvEntry); fields left out take the log's new-entry defaults. Absent = nothing logged. */
  prov?: Partial<ProvEntry>[]
}

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
  /** Real Vancouver: the site's streets and their settings (lib/siteStreets.ts streetsCtx), once found. */
  cityStreets?: CityStreetsCtx | null
  /** The sky room terrace wind by tower id, from Wind on terraces and roofs (its data.skyTerraces), when it has run. */
  skyTerraces?: Record<string, SkyTerraceLine> | null
  /** Skyline silhouette: the viewing distance (m); default 2 km (engine/silhouette.ts). */
  silhouetteDistance?: number
  /**
   * Skyline silhouette, sky through the tower (gap G23): masses to check behind each tower besides the design's other
   * towers (always checked), e.g. the city's buildings, and what they are in words.
   */
  silhouetteContext?: SkyContext | null
  /** Skyline silhouette, sky through glass (gap G33): transmittance of the marked glass (0–1); absent: glass blocks. Counts in the judgement. */
  silhouetteGlassT?: number | null
  /**
   * Skyline silhouette, sky through screens (gap G33): screens across the open storeys, height (m) and transmittance
   * (0–1, e.g. the wind settings' deck screen and its open share); reported apart, judged only with `set`.
   */
  silhouetteScreens?: SkyScreens | null
  /**
   * Structure: storey-weight presets (gap G21; engine/storeyWeight.ts WeightPresets: soil depth on planted decks in mm,
   * which decks are planted, facade kPa, core wall thickness). Fields left out keep DEFAULT_WEIGHT_PRESETS (600 mm of
   * soil on the decks of open garden storeys and public-amenity floors). The structure node has no settings of its own,
   * so this lives in the evidence input only. Per-deck use and soil (gaps G25, G32) live on the tower instead,
   * `Tower.deckUses`, so Wind on terraces and roofs reads the same entries.
   */
  weightPresets?: Partial<WeightPresets> | null
  /** Engagement records, board text and the AI-use log; with it, the claims guard and the AI-use log give lines. */
  culture?: CultureInput | null
  /**
   * City in Nature from the model (gap G12): the ground wind study's trees and screens (project frame; only trees with a
   * crown count), read beside the typed canopy, and planting typed at grade (m²) added to the planted decks' cover.
   */
  groundPorous?: readonly ModelTree[] | null
  groundPlantedM2?: number | null
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
  const north = i.project === 'vtc' ? VTC_NORTH_DEG : 0
  const weightPresets: WeightPresets = { ...DEFAULT_WEIGHT_PRESETS, ...Object.fromEntries(Object.entries(i.weightPresets ?? {}).filter(([, v]) => v !== undefined && v !== null)) }
  return {
    'built.vtc-rules': vtc ? vtcRules(towers, { fsrTier: i.fsrTier, transitLink: i.transitLink }) : [],
    'built.core-lifts': lifts.map((l) => l.rules),
    'built.egress': egress.map((e) => e.rules),
    'built.life-safety': towers.map((t, k) => lifeSafety(t, lifts[k], egress[k], { transitLink: i.transitLink, liftPresets: i.liftPresets, presets: i.systemsPresets ?? DEFAULT_SYSTEMS_PRESETS, entrances: vtc ? Object.values(i.publicRealm.frontage).reduce((n, f) => n + f.entrances, 0) : null }).rules),
    'built.sky-room': towers.map((t, k) => skyRoomCheck(t, lifts[k], egress[k], i.egressPresets, i.liftPresets, i.skyTerraces?.[t.id]).rules),
    'built.pr-streetwall': vtc ? streetwallCheck(towers, i.publicRealm).rules : i.project === 'city' ? cityStreetwallCheck(towers, i.cityStreets ?? null, i.cityRing ?? null, i.publicRealm.openPublicShare).rules : [],
    'built.pr-frontage': vtc ? frontageCheck(towers, i.publicRealm).rules : i.project === 'city' ? cityFrontageCheck(towers, i.cityStreets ?? null).rules : [],
    'built.pr-ground': vtc ? groundPlaneCheck(towers, i.publicRealm).rules : i.project === 'city' ? cityGroundPlaneCheck(towers, i.cityRing ?? null, i.publicRealm, {}, i.cityStreets ?? null).rules : [],
    'built.city-in-nature': cityInNature(i.cityInNature, i.project === 'vtc' ? SITE.area : i.studyArea ?? null, null, (() => { const fa = facadeCheck(towers, DEFAULT_FACADE, i.project === 'vtc' ? VTC_NORTH_DEG : 0); return { fourthStoreyTop: fourthStoreyTop(towers.map(towerFloors)), faces: fa.faces, deckFaces: fa.deckFaces, plantedSoil: plantedSoil(towers, north, weightPresets.soilMm), groundPorous: i.groundPorous ?? null, groundPlantedM2: i.groundPlantedM2 ?? null } })()),
    'built.wind-procedure': wind.map((w) => w.rules),
    'built.structure': towers.map((t, k) => structureCheck(t, wind[k], weightPresets, north).rules),
    'built.wind-study': windStudyRules(Math.max(0, ...towers.map((t) => t.height))),
    'built.mobility': mobilityCheck(towers, DEFAULT_MOBILITY, { project: i.project, transitLink: i.transitLink, homeM2: i.liftPresets.homeM2, hotelM2PerKey: i.liftPresets.hotelM2PerKey }).rules,
    'built.facade': facadeCheck(towers, DEFAULT_FACADE, north).rules,
    'built.silhouette': towers.map((t) => silhouetteReading(t, { northDeg: north, distance: i.silhouetteDistance, context: skyContext(towers, t, i.silhouetteContext), glassT: i.silhouetteGlassT, screens: i.silhouetteScreens }).rules),
    'built.economics': DEFAULT_ECON,
    'built.interior': towers.map((t) => interiorCheck(t, towerFloors(t)).rules),
    'built.daylight-depth': towers.map((t) => daylightScreen(t, towerFloors(t)).rules),
    'built.relax-aviation': towers.map((t) => [...(i.project === 'city' ? relaxationChecklist(t, [], 15, i.studyArea ?? null, CITY_ORIGIN) : []), ...aviationChecklist(t, i.project === 'city' ? [t.x + CITY_ORIGIN[0], t.y + CITY_ORIGIN[1]] : null)]),
    ...(i.culture ? { 'built.culture-claims': claimsLines(i.culture.claimsText, i.culture.records), 'built.provenance': provenanceLines(i.culture.prov ?? []) } : {}),
  }
}
