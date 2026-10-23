// Live results of the trips & station-entrance node (research P09-M01, M03). Populations are the lift check's (rises by
// class; shuttles skipped so nobody counts twice), retail and civic area and the parking maximum the mobility node's.
import { useMemo } from 'react'
import type { LiftResult } from '../engine/lifts'
import { tripCheck, type Population, type TripResult } from '../engine/trips'
import { useTripStore } from '../lib/tripStore'
import { useStore } from '../store'
import { useMobility } from './useMobility'
import { useResults } from './useResults'

export const TRIPS_NODE = 'built.trips'

export function populationFrom(lifts: LiftResult[], retailCivicM2: number): Population {
  const by = { office: 0, residential: 0, hotel: 0 }
  for (const l of lifts) for (const r of l.rises) if (r.kind === 'local' && r.cls !== 'public') by[r.cls] += r.population
  return { office: by.office, residents: by.residential, hotelGuests: by.hotel, retailCivicM2, basis: "the core & lift check's populations (homes and keys from the interior layout where it is on, otherwise from net area; office present at the lift utilisation)" }
}

export function useTrips(): TripResult | null {
  const on = useStore((s) => !!s.enabled[TRIPS_NODE])
  const presets = useTripStore((s) => s.presets)
  const { lifts } = useResults()
  const mob = useMobility()
  return useMemo(() => {
    if (!on || !lifts.length) return null
    const pop = populationFrom(lifts, mob.program.gfa.retail + mob.program.gfa.civic)
    return tripCheck(pop, presets, { maxStalls: mob.maxStalls })
  }, [on, lifts, mob, presets])
}
