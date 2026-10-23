// Live results of the pedestrian wind screen (research P03-M03). On the competition site the supplied context buildings
// and future towers are the upwind context; elsewhere only the project's own towers are (open ground otherwise, flagged).
import { useMemo } from 'react'
import { VTC_NORTH_DEG } from '../context'
import { windScreen, type WindScreenResult } from '../engine/windScreen'
import { useVtcShadeContext } from '../lib/vtcShadeContext'
import { useWindScreenStore } from '../lib/windScreenStore'
import { useStore, useTowers } from '../store'

export const WIND_SCREEN_NODE = 'built.wind-screen'

export function useWindScreen(): WindScreenResult | null {
  const on = useStore((s) => !!s.enabled[WIND_SCREEN_NODE])
  const project = useStore((s) => s.project)
  const towers = useTowers()
  const presets = useWindScreenStore((s) => s.presets)
  const ctx = useVtcShadeContext(on && project === 'vtc')
  return useMemo(() => {
    if (!on || towers.length === 0) return null
    const context = ctx.obstacles.map((b) => ({ footprint: b.footprint, height: b.height }))
    return windScreen(towers, { northDeg: project === 'vtc' ? VTC_NORTH_DEG : 0, context, contextLoaded: ctx.loaded }, presets)
  }, [on, towers, project, presets, ctx])
}
