import { useMemo } from 'react'
import { economics } from '../engine/economics'
import { SITE } from '../engine/vtcRules'
import { presetsWith, useEconStore } from '../lib/econStore'
import { useStore, useTowers } from '../store'

/** Live economics for the current project (research P08, Program Value Visualizer method). */
export function useEconomics() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const lift = useStore((s) => s.liftPresets)
  const { permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment } = useEconStore()
  return useMemo(() => {
    const presets = presetsWith(overrides)
    // The VTC block's area is known (brief p.15); the Real Vancouver study site has none yet.
    const siteArea = project === 'vtc' ? SITE.area : null
    return { presets, siteArea, result: economics(towers, { permitYear, landPrice, siteArea, includeRegional, homeM2: lift.homeM2, hotelM2PerKey: lift.hotelM2PerKey, costBasis, residentialBase, contingency, civicReduced, accTreatment }, presets) }
  }, [towers, project, lift.homeM2, lift.hotelM2PerKey, permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment])
}
