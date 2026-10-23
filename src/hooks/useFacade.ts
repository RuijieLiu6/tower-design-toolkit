import { useMemo } from 'react'
import { VTC_NORTH_DEG } from '../context'
import { facadeCheck } from '../engine/facade'
import { useFacadeStore } from '../lib/facadeStore'
import { useStore, useTowers } from '../store'

/** Live facade layout and glazing checks (research P12-M06a/b). True north: VTC 45° from the model grid, City grid north. */
export function useFacade() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const { system, wwr, treated, vegetation, vlt, shgc } = useFacadeStore()
  return useMemo(() => facadeCheck(towers, { system, wwr, treated, vegetation, vlt, shgc }, project === 'vtc' ? VTC_NORTH_DEG : 0),
    [towers, project, system, wwr, treated, vegetation, vlt, shgc])
}
