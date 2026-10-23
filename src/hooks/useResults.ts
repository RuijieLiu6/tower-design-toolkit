import { useMemo } from 'react'
import { egressCheck } from '../engine/egress'
import { liftCheck } from '../engine/lifts'
import { frontageCheck, groundPlaneCheck, streetwallCheck } from '../engine/publicRealm'
import { towerFootprint } from '../engine/massing'
import { skyRoomCheck } from '../engine/skyRoom'
import { checkFootprint, overall } from '../engine/viewCones'
import { fsrSummary, vtcRules } from '../engine/vtcRules'
import { useVtcNeighbours } from '../lib/vtcNeighbours'
import { CITY_ORIGIN, useStore, useTowers } from '../store'

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

  return useMemo(() => {
    const fsr = fsrSummary(towers)
    const rules = project === 'vtc' ? vtcRules(towers, { fsrTier, transitLink }) : []
    const cones = project === 'city'
      ? towers.map((t) => {
          const fp = towerFootprint(t).map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as [number, number])
          const checks = checkFootprint(fp, ground + t.height)
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
  }, [towers, project, fsrTier, transitLink, ground, liftPresets, egressPresets, publicRealm, neighbours])
}
