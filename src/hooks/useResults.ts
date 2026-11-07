import { useMemo } from 'react'
import { egressCheck } from '../engine/egress'
import { liftCheck } from '../engine/lifts'
import { cityFrontageCheck, cityGroundPlaneCheck, cityStreetwallCheck, frontageCheck, groundPlaneCheck, streetwallCheck } from '../engine/publicRealm'
import { skyRoomCheck } from '../engine/skyRoom'
import { overall } from '../engine/viewCones'
import { checkTowerCones } from '../engine/towerCones'
import { fsrSummary, vtcRules } from '../engine/vtcRules'
import { useVtcNeighbours } from '../lib/vtcNeighbours'
import { useProjectSiteArea } from '../lib/siteArea'
import { streetsCtx, useSiteStreets } from '../lib/siteStreets'
import { SOLAR_NODE, useSolar } from './useSolarAccess'
import { nodeOn } from '../lib/analysis'
import { useWindScreen } from './useWindScreen'
import { SCREEN_LABEL } from '../engine/windScreen'
import { CITY_ORIGIN, useStore, useTowers } from '../store'

// One shared result for identical inputs. About 16 components call useResults(); each used to keep its own memo,
// so every component that mounted (e.g. when a node switch reveals a panel or overlay) re-ran all checks,
// view cones included (~100 ms per switch click, measured 4 Nov). Inputs are compared by identity, as before.
let shared: { key: readonly unknown[]; value: unknown } | null = null
function sharedResult<T>(key: readonly unknown[], compute: () => T): T {
  if (shared && shared.key.length === key.length && shared.key.every((v, i) => Object.is(v, key[i]))) return shared.value as T
  const value = compute()
  shared = { key, value }
  return value
}

/** All live results for the current project, recomputed when the design changes. */
export function useResults() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const fsrTier = useStore((s) => s.fsrTier)
  const transitLink = useStore((s) => s.transitLink)
  const ground = useStore((s) => s.groundElevation)
  const liftPresets = useStore((s) => s.liftPresets)
  const egressPresets = useStore((s) => s.egressPresets)
  const publicRealm = useStore((s) => s.publicRealm)
  const neighbours = useVtcNeighbours(project === 'vtc')
  // Real Vancouver FSR divides by the study site (parcels or boundary, lib/siteArea.ts); the competition keeps its block.
  const studyArea = useProjectSiteArea().area
  const cityStudyArea = project === 'city' ? studyArea : null
  const cityRing = useStore((s) => (s.project === 'city' ? s.citySite?.ring ?? null : null)) as [number, number][] | null
  // Real Vancouver: the streets along the study site (found once per outline) and the site's per-street settings (7 Nov).
  const citySite = useStore((s) => (s.project === 'city' ? s.citySite : null))
  const streetsFound = useSiteStreets().result
  // Open space & links reads the solar access and wind screen nodes when they are on (engine/publicRealm.ts GroundCross).
  const solarOut = useSolar((s) => s.out)
  // Only while the node is on: its last result stays in the store after it is switched off.
  const solarOn = useStore((s) => nodeOn(s, SOLAR_NODE))
  const solarLines = solarOn && solarOut && solarOut.project === project ? solarOut.lines : null
  // The wind screen as a value-stable summary (each caller of useWindScreen gets its own object, which would defeat the
  // shared cache): the levels of the zones that reach the ground.
  const windResult = useWindScreen()
  const windGround = windResult ? windResult.zones.filter((z) => z.z <= 1).map((z) => z.level).join(',') : null

  return useMemo(() => sharedResult([towers, project, fsrTier, transitLink, ground, liftPresets, egressPresets, publicRealm, neighbours, cityStudyArea, cityRing, solarLines, windGround, citySite, streetsFound], () => {
    const fsr = cityStudyArea ? fsrSummary(towers, cityStudyArea) : fsrSummary(towers)
    const rules = project === 'vtc' ? vtcRules(towers, { fsrTier, transitLink }) : []
    const cones = project === 'city'
      ? towers.map((t) => {
          // Every stacked block at its own top (engine/towerCones.ts).
          const checks = checkTowerCones(t, ground, CITY_ORIGIN)
          return { tower: t, checks, overall: overall(checks), topZ: ground + t.height }
        })
      : []
    const lifts = towers.map((t) => ({ tower: t, ...liftCheck(t, liftPresets, egressPresets) }))
    const egress = towers.map((t) => ({ tower: t, ...egressCheck(t, egressPresets, liftPresets) }))
    const skyRooms = towers.map((t, i) => ({ tower: t, ...skyRoomCheck(t, lifts[i], egress[i], egressPresets, liftPresets) }))
    // Public realm checks run on the competition block, whose streets are known (research P06).
    const vtc = project === 'vtc' && towers.length > 0
    // Real Vancouver: the study site's streets (right-of-way measured, types picked by the user) once they are found.
    const ctx = project === 'city' ? streetsCtx(citySite, streetsFound) : null
    const streetwall = vtc ? streetwallCheck(towers, publicRealm, neighbours) : project === 'city' && towers.length ? cityStreetwallCheck(towers, ctx, cityRing, publicRealm.openPublicShare) : null
    const frontage = vtc ? frontageCheck(towers, publicRealm) : project === 'city' && towers.length ? cityFrontageCheck(towers, ctx) : null
    const cross = { solar: solarLines, wind: windGround === null ? null : { zones: windGround.split(',').filter(Boolean).map((level) => ({ level: level as 'low' | 'medium' | 'high', kind: 'ground', z: 0 })), note: SCREEN_LABEL } }
    // Real Vancouver: open space over the study site, sun and wind; the link, frontage runs and station lines from its streets.
    const groundPlane = vtc ? groundPlaneCheck(towers, publicRealm, cross) : project === 'city' && towers.length ? cityGroundPlaneCheck(towers, cityRing, publicRealm, cross, ctx) : null
    // Optional fields, so code that builds a results object by hand (tests, workflows) need not supply them.
    const out: {
      fsr: typeof fsr; rules: typeof rules; cones: typeof cones; lifts: typeof lifts; egress: typeof egress; skyRooms: typeof skyRooms
      streetwall?: typeof streetwall; frontage?: typeof frontage; groundPlane?: typeof groundPlane
    } = { fsr, rules, cones, lifts, egress, skyRooms, streetwall, frontage, groundPlane }
    return out
  }), [towers, project, fsrTier, transitLink, ground, liftPresets, egressPresets, publicRealm, neighbours, cityStudyArea, cityRing, solarLines, windGround, citySite, streetsFound])
}
