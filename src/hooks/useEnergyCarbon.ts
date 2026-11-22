// Live results for the Energy & carbon node (research P04, P11-M04). Runs only while the node is switched on, because
// the PV shading pass is the heaviest calculation in the app (a few tens of milliseconds with the context buildings).
import { useMemo } from 'react'
import { VTC_NORTH_DEG } from '../context'
import { defaultSystem, energyCarbonCheck, type EnergyCarbonResult } from '../engine/energyCarbon'
import { DOWNTOWN } from '../engine/solar'
import { systemShortlist, windProcedure } from '../engine/windStructure'
import { useEnergyStore } from '../lib/energyStore'
import { useVtcShadeContext } from '../lib/vtcShadeContext'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { hbpCeiling, hbpFootprint, hbpReading } from '../engine/hbpArea'
import { useRelax } from '../lib/relaxStore'
import { useResults } from './useResults'
import { nodeOn } from '../lib/analysis'

export const ENERGY_NODE = 'built.energy-carbon'

export function useEnergyCarbon(): EnergyCarbonResult | null {
  const on = useStore((s) => nodeOn(s, ENERGY_NODE))
  const project = useStore((s) => s.project)
  const towers = useTowers()
  const input = useEnergyStore((s) => s.input)
  const { lifts } = useResults()
  const shade = useVtcShadeContext(on && project === 'vtc')
  const hbpCeilingFt = useRelax((s) => s.hbpCeilingFt)
  return useMemo(() => {
    if (!on || towers.length === 0) return null
    const tallest = towers.reduce((a, b) => (b.height > a.height ? b : a))
    const shortlist = systemShortlist(tallest, windProcedure(tallest))
    // Passenger cars from the lift check, plus a service and a firefighter lift per tower (the core preset's service lifts).
    const cars = lifts.reduce((s, l) => s + l.totalCars, 0) + 2 * towers.length
    // The tallest tower's Higher Buildings ceiling (book node #1): its area on Real Vancouver, the CBD's on the competition site.
    const hbp = hbpCeiling(hbpReading(project === 'city' ? hbpFootprint(tallest, CITY_ORIGIN) : null), hbpCeilingFt)
    return energyCarbonCheck(towers, input, {
      cars, northDeg: project === 'vtc' ? VTC_NORTH_DEG : 0, lat: DOWNTOWN.lat, lon: DOWNTOWN.lon,
      obstacles: shade.obstacles, obstaclesKnown: shade.loaded, shortlistSystem: defaultSystem(shortlist), hbpCeiling: hbp,
    })
  }, [on, towers, input, lifts, project, shade, hbpCeilingFt])
}
