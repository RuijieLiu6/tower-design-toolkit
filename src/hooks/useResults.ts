import { useMemo } from 'react'
import { egressCheck } from '../engine/egress'
import { liftCheck } from '../engine/lifts'
import { frontageCheck, groundPlaneCheck, streetwallCheck } from '../engine/publicRealm'
import { skyRoomCheck } from '../engine/skyRoom'
import { overall } from '../engine/viewCones'
import { checkTowerCones } from '../engine/towerCones'
import { fsrSummary, vtcRules } from '../engine/vtcRules'
import { useVtcNeighbours } from '../lib/vtcNeighbours'
import { useSiteStore } from '../lib/siteStore'
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
  // Real Vancouver FSR divides by the study site (parcels or boundary, lib/siteParcels.ts); the competition keeps its block.
  const studyArea = useSiteStore((s) => (project === 'city' ? s.fsrArea?.area ?? null : null))

  return useMemo(() => sharedResult([towers, project, fsrTier, transitLink, ground, liftPresets, egressPresets, publicRealm, neighbours, studyArea], () => {
    const fsr = studyArea ? fsrSummary(towers, studyArea) : fsrSummary(towers)
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
    const streetwall = vtc ? streetwallCheck(towers, publicRealm, neighbours) : null
    const frontage = vtc ? frontageCheck(towers, publicRealm) : null
    const groundPlane = vtc ? groundPlaneCheck(towers, publicRealm) : null
    // Optional fields, so code that builds a results object by hand (tests, workflows) need not supply them.
    const out: {
      fsr: typeof fsr; rules: typeof rules; cones: typeof cones; lifts: typeof lifts; egress: typeof egress; skyRooms: typeof skyRooms
      streetwall?: typeof streetwall; frontage?: typeof frontage; groundPlane?: typeof groundPlane
    } = { fsr, rules, cones, lifts, egress, skyRooms, streetwall, frontage, groundPlane }
    return out
  }), [towers, project, fsrTier, transitLink, ground, liftPresets, egressPresets, publicRealm, neighbours, studyArea])
}
