import { useMemo } from 'react'
import { economics } from '../engine/economics'
import { useProjectSiteArea } from '../lib/siteArea'
import { presetsWith, useEconStore } from '../lib/econStore'
import { trueNorthDeg } from '../lib/northView'
import { useStore, useTowers } from '../store'

/** Live economics for the current project (research P08, Program Value Visualizer method). */
export function useEconomics() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const lift = useStore((s) => s.liftPresets)
  const wind = useStore((s) => s.windPresets)
  const site = useProjectSiteArea()
  const { permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment, conceptTrees, conceptPublicLifts } = useEconStore()
  return useMemo(() => {
    const presets = presetsWith(overrides)
    // The competition block (brief p.15), or the Real Vancouver study site once one is chosen (lib/siteArea.ts).
    const siteArea = site.area
    return { presets, siteArea, result: economics(towers, { permitYear, landPrice, siteArea, includeRegional, homeM2: lift.homeM2, hotelM2PerKey: lift.hotelM2PerKey, costBasis, residentialBase, contingency, civicReduced, accTreatment,
      // the concept's own costs (gap G29): open storeys from the model, the damper declared in the wind presets, trees and public lifts declared here
      concept: { north: trueNorthDeg(project), supplementalDamping: wind.supplementalDamping, damperNote: wind.damperNote, trees: conceptTrees, publicLifts: conceptPublicLifts } }, presets) }
  }, [towers, project, site.area, lift.homeM2, lift.hotelM2PerKey, permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment, wind.supplementalDamping, wind.damperNote, conceptTrees, conceptPublicLifts])
}
