// What the Sun & Wind Studio tools read from the toolkit: the towers, true north, the site, the buildings around and the
// typical-year climate. One hook so every tool, its results and its analysis view read the same thing.
import { useSiteGeometry } from './siteGeometry'
import { useEffect, useMemo, useState } from 'react'
import { useCityData, useRemoval } from '../components/CityContext'
import { useVtcContext, VTC_NORTH_DEG } from '../context'
import { towerOccluders, vtcOccluders } from '../engine/solarRules'
import type { ContextBlock } from '../engine/sw/plate'
import type { ClimatePayload, Prism } from '../engine/sw/types'
import type { PorousObstacle } from '../engine/sw/wind'
import type { Pt } from '../engine/shadow'
import type { Tower } from '../engine/types'
import { useStore, useTowers } from '../store'
import { useWindComfortStore } from '../hooks/useWindComfort'

let climate: Promise<ClimatePayload> | null = null
/** The CWEC 2020 typical year for Vancouver Intl, loaded once on demand. */
export function loadClimate(): Promise<ClimatePayload> {
  climate ??= import('../data/climate/yvr-cwec2020.json').then((m) => (m.default ?? m) as unknown as ClimatePayload)
  climate.catch(() => { climate = null })
  return climate
}
export function useSwClimate(): ClimatePayload | null {
  const [c, setC] = useState<ClimatePayload | null>(null)
  useEffect(() => { let live = true; loadClimate().then((v) => live && setC(v), () => {}); return () => { live = false } }, [])
  return c
}

export interface SwInputs {
  project: 'vtc' | 'city'
  towers: Tower[]
  north: number
  site: Pt[] | null
  /** Buildings around (not the towers), as prisms in the project frame. */
  context: Prism[]
  /** The same as centres and tops in the north frame (daylight obstruction). */
  ctxBlocks: ContextBlock[]
  C: ClimatePayload | null
  /**
   * Trees and porous screens on the ground (project frame), read by the pedestrian wind study as drag
   * (engine/sw/wind.ts PorousObstacle). Optional: none is the study as before. No tool fills it in the app yet.
   */
  porous?: PorousObstacle[]
  /** A canopy around the tower's base (m deep; the wind comfort node's canopy depth), read by the downwash line (G40). */
  canopy?: number
}

const REACH = 260
export function useSwInputs(): SwInputs {
  const project = useStore((s) => s.project)
  const towers = useTowers()
  // The competition block counts as the site too (16 Nov: the sun study's open site and the shaded share read it).
  const vtcSite = useSiteGeometry((s) => s.site.vtc?.ring as Pt[] | undefined)
  const site = useStore((s) => (s.project === 'city' ? (s.citySite?.ring as Pt[] | undefined) ?? null : vtcSite ?? null))
  const { data } = useCityData()
  const removal = useRemoval(project === 'city' ? data : null)
  const { ctx } = useVtcContext()
  const C = useSwClimate()
  const canopy = useWindComfortStore((s) => s.presets.canopy)
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  const centre = useMemo<Pt>(() => (towers.length ? [towers.reduce((s, t) => s + t.x, 0) / towers.length, towers.reduce((s, t) => s + t.y, 0) / towers.length] : [0, 0]), [towers])
  const context = useMemo<Prism[]>(() => {
    const out: Prism[] = []
    const near = (r: Pt[]) => r.some(([x, y]) => Math.abs(x - centre[0]) < REACH && Math.abs(y - centre[1]) < REACH)
    if (project === 'city' && data?.heights) {
      const h = data.heights
      data.footprints.forEach((f, i) => {
        if (removal.hidden.has(i) || !near(f.outer as Pt[])) return
        const g0 = h.ground[i], r = h.roof[i]
        // Heights above the project's ground: the engines take z from grade.
        if (Number.isFinite(g0) && Number.isFinite(r) && r - g0 > 2) out.push({ ring: f.outer as Pt[], z0: 0, z1: r - g0 })
      })
    } else if (project === 'vtc' && ctx) {
      for (const p of vtcOccluders(ctx).prisms) if (near(p.ring as Pt[])) out.push({ ring: p.ring as Pt[], z0: p.z0, z1: p.z1 })
    }
    // Leave out anything that sits under a tower (the building it replaces).
    const towerRings = towers.flatMap((t) => (towerOccluders([t]).prisms as Prism[]).map((p) => p.ring))
    const inside = (p: Pt, r: Pt[]) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) o = !o } return o }
    return out.filter((p) => { const c: Pt = [p.ring.reduce((s, q) => s + q[0], 0) / p.ring.length, p.ring.reduce((s, q) => s + q[1], 0) / p.ring.length]; return !towerRings.some((r) => inside(c, r)) && !(site && inside(c, site)) })
  }, [project, data, removal.hidden, ctx, centre, towers, site])
  const ctxBlocks = useMemo<ContextBlock[]>(() => {
    const nr = (north * Math.PI) / 180, c = Math.cos(nr), s = Math.sin(nr)
    return context.map((p) => { const x = p.ring.reduce((a, q) => a + q[0], 0) / p.ring.length, y = p.ring.reduce((a, q) => a + q[1], 0) / p.ring.length; return { x: x * c - y * s, y: x * s + y * c, top: p.z1 } })
  }, [context, north])
  return useMemo(() => ({ project, towers, north, site, context, ctxBlocks, C, canopy }), [project, towers, north, site, context, ctxBlocks, C, canopy])
}
