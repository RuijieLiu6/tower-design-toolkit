import { useMemo } from 'react'
import { economics } from '../engine/economics'
import { useProjectSiteArea } from '../lib/siteArea'
import { presetsWith, useEconStore } from '../lib/econStore'
import { useStore, useTowers } from '../store'

/** Live economics for the current project (research P08, Program Value Visualizer method). */
export function useEconomics() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const lift = useStore((s) => s.liftPresets)
  const site = useProjectSiteArea()
  const { permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment } = useEconStore()
  return useMemo(() => {
    const presets = presetsWith(overrides)
    // The competition block (brief p.15), or the Real Vancouver study site once one is chosen (lib/siteArea.ts).
    const siteArea = site.area
    return { presets, siteArea, result: economics(towers, { permitYear, landPrice, siteArea, includeRegional, homeM2: lift.homeM2, hotelM2PerKey: lift.hotelM2PerKey, costBasis, residentialBase, contingency, civicReduced, accTreatment }, presets) }
  }, [towers, project, site.area, lift.homeM2, lift.hotelM2PerKey, permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment])
}
