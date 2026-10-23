import { useMemo } from 'react'
import { mobilityCheck } from '../engine/mobility'
import { useMobilityStore } from '../lib/mobilityStore'
import { useStore, useTowers } from '../store'

/** Live parking, loading, bicycle and servicing results for the current project (research P09-M02, M05). */
export function useMobility() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const transitLink = useStore((s) => s.transitLink)
  const lift = useStore((s) => s.liftPresets)
  const { carStalls, accessibleStalls, loadingB, loadingC, bikeA, bikeB, trucksPerHour, dwellMin, access } = useMobilityStore()
  return useMemo(() => mobilityCheck(towers, { carStalls, accessibleStalls, loadingB, loadingC, bikeA, bikeB, trucksPerHour, dwellMin, access }, { project, transitLink, homeM2: lift.homeM2, hotelM2PerKey: lift.hotelM2PerKey }),
    [towers, project, transitLink, lift.homeM2, lift.hotelM2PerKey, carStalls, accessibleStalls, loadingB, loadingC, bikeA, bikeB, trucksPerHour, dwellMin, access])
}
