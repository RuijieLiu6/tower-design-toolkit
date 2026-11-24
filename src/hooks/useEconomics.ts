import { useMemo } from 'react'
import { economics } from '../engine/economics'
import type { Tower } from '../engine/types'
import { projectSiteArea, useProjectSiteArea } from '../lib/siteArea'
import { presetsWith, useEconStore } from '../lib/econStore'
import { trueNorthDeg } from '../lib/northView'
import { useSiteStore } from '../lib/siteStore'
import { useStore, useTowers } from '../store'

type EconInputsNow = Pick<ReturnType<typeof useEconStore.getState>, 'permitYear' | 'landPrice' | 'includeRegional' | 'overrides' | 'costBasis' | 'residentialBase' | 'contingency' | 'civicReduced' | 'accTreatment' | 'conceptTrees' | 'conceptPublicLifts' | 'conceptTreesGrade'>
type StoreNow = ReturnType<typeof useStore.getState>

/** The economics node's reading for given towers and inputs (the same call the panel makes). */
export function economicsFor(towers: Tower[], project: 'vtc' | 'city', lift: StoreNow['liftPresets'], wind: StoreNow['windPresets'], siteArea: number | null, e: EconInputsNow) {
  const presets = presetsWith(e.overrides)
  return { presets, siteArea, result: economics(towers, { permitYear: e.permitYear, landPrice: e.landPrice, siteArea, includeRegional: e.includeRegional, homeM2: lift.homeM2, hotelM2PerKey: lift.hotelM2PerKey, costBasis: e.costBasis, residentialBase: e.residentialBase, contingency: e.contingency, civicReduced: e.civicReduced, accTreatment: e.accTreatment,
    // the concept's own costs (gap G29): open storeys from the model, the damper declared in the wind presets, trees (on the decks and at grade, G40) and public lifts declared here
    concept: { north: trueNorthDeg(project), supplementalDamping: wind.supplementalDamping, damperNote: wind.damperNote, trees: e.conceptTrees, treesAtGrade: e.conceptTreesGrade, publicLifts: e.conceptPublicLifts } }, presets) }
}

/** The same reading outside React (scripted renders: lib/presentRender.ts), from the stores as they are now. */
export function economicsNow() {
  const s = useStore.getState()
  const site = projectSiteArea(s.project, s.project === 'city' ? useSiteStore.getState().fsrArea : null, s.project === 'city' ? s.citySite : null)
  return { site, ...economicsFor(s.towers[s.project], s.project, s.liftPresets, s.windPresets, site.area, useEconStore.getState()) }
}

/** Live economics for the current project (research P08, Program Value Visualizer method). */
export function useEconomics() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const lift = useStore((s) => s.liftPresets)
  const wind = useStore((s) => s.windPresets)
  const site = useProjectSiteArea()
  const { permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment, conceptTrees, conceptPublicLifts, conceptTreesGrade } = useEconStore()
  return useMemo(() => economicsFor(towers, project, lift, wind, site.area, { permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment, conceptTrees, conceptPublicLifts, conceptTreesGrade }),
    [towers, project, site.area, lift, wind, permitYear, landPrice, includeRegional, overrides, costBasis, residentialBase, contingency, civicReduced, accTreatment, conceptTrees, conceptPublicLifts, conceptTreesGrade])
}
