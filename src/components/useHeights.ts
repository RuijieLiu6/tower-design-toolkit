// Hooks for the Vista height model (after Vista v37, Ruijie Liu): the policy and cone surfaces once the city terrain
// is in, and the selected tower's site answer (zoning reference, cone limits, Vista's stacked-block suggestion).
import { useMemo } from 'react'
import { stackSuggestion, surfacesOver, type StackSuggestion, type SurfaceHit } from '../engine/heightModel'
import type { ZoningResult } from '../engine/heightPolicy'
import { blockSpans } from '../engine/massing'
import { pointInRing } from '../engine/site'
import type { Tower } from '../engine/types'
import type { Pt } from '../engine/vista'
import { groundFrom, surfacesFor, useHeightPolicy } from '../lib/heightData'
import { useSiteStore } from '../lib/siteStore'
import { CITY_ORIGIN, useStore } from '../store'
import { useCityData } from './CityContext'

export function useCityHeights(on = true) {
  const { data } = useCityData()
  const grids = data?.grids ?? null
  const { policy, error } = useHeightPolicy(on)
  const surfaces = useMemo(() => (grids ? surfacesFor(grids) : null), [grids])
  const groundAt = useMemo(() => (grids ? groundFrom(grids) : null), [grids])
  return { policy, error, surfaces, groundAt }
}

export interface TowerHeights {
  /** What the zoning was read over: the study site's lot, or the tower's own blocks. */
  zoningOver: 'site' | 'blocks'
  zoning: ZoningResult | null
  stack: StackSuggestion | null
  /** Each covering cone's lowest point over the whole tower footprint (EPSG:26910), lowest first. */
  cones: (SurfaceHit & { at: Pt })[]
  base: number
}

/** The selected tower's height answer in Real Vancouver; null until the data is in or for the competition project. */
export function useTowerHeights(t: Tower | undefined, on = true): { heights: TowerHeights | null; error: string | null; loading: boolean } {
  const project = useStore((s) => s.project)
  const base = useStore((s) => s.groundElevation)
  const site = useSiteStore((s) => s.site)
  const { policy, error, surfaces } = useCityHeights(on && project === 'city')
  const heights = useMemo((): TowerHeights | null => {
    if (!t || project !== 'city' || !policy || !surfaces) return null
    const spans = t.imported ? [] : blockSpans(t)
    const parts = spans.map((s) => ({ ring: s.ring.map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as Pt), z0: s.z0, z1: s.z1, label: s.block.name ?? s.block.id }))
    const onSite = !!site && site.ring.length >= 3 && pointInRing([t.x, t.y], site.ring)
    // An uploaded model: its plan hull (local), placed with the tower's rotation.
    const a = (t.rotation * Math.PI) / 180
    const hull = (t.imported?.hull ?? []).map(([u, v]) => [t.x + u * Math.cos(a) - v * Math.sin(a), t.y + u * Math.sin(a) + v * Math.cos(a)] as Pt)
    const rings: Pt[][] = spans.length ? spans.map((s) => s.ring as Pt[]) : hull.length >= 3 ? [hull] : [[[t.x, t.y]]]
    const zoning = policy.zoning(onSite ? [site!.ring] : rings)
    const stack = stackSuggestion(parts, base, surfaces, zoning, policy, { imported: !!t.imported })
    const abs = rings.filter((r) => r.length >= 3).map((r) => r.map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as Pt))
    const cones = abs.flatMap((r) => surfacesOver(r, surfaces)).sort((p, q) => p.z - q.z).filter((h, i, all) => all.findIndex((k) => k.surface === h.surface) === i)
    return { zoningOver: onSite ? 'site' : 'blocks', zoning, stack, cones, base }
  }, [t, project, policy, surfaces, base, site])
  return { heights, error, loading: project === 'city' && on && (!policy || !surfaces) && !error }
}
