import { useEffect } from 'react'
import { loadVtcContext, useVtcSource } from './lib/vtcContextSource'

export interface Extruded { footprint: [number, number][]; z0: number; z1: number }
export interface MeshItem { positions: number[]; indices: number[] }
export type ContextItem = Extruded | MeshItem
export interface VtcContext {
  meta: { true_north_deg_clockwise_from_plus_y: number; north_note: string; source: string }
  site: { outline: [number, number][]; width_m: number; depth_m: number; area_m2: number } | null
  blocks: [number, number][][]
  curbs: [number, number][][]
  plazas: MeshItem[]
  midblock: MeshItem[]
  buildings: ContextItem[]
  heritage: ContextItem[]
  future_towers: { footprint: [number, number][]; z0: number; z1: number | null }[]
  labels: { text: string; at: [number, number] }[]
  /**
   * Ground-level use areas from the model's Ground Level Use Plan: the layer name under "Ground Level Use" (Retail,
   * Office, Cultural, Hotel, Institutional, Residential, Transit Station) and the outline rings. Absent in contexts built
   * before 6 Nov; lib/vtcUses.ts gives each building the use covering most of its footprint.
   */
  ground_uses?: GroundUseArea[]
}
export interface GroundUseArea { use: string; rings: [number, number][][] }

export const isExtruded = (c: ContextItem): c is Extruded => 'footprint' in c

/**
 * The competition model belongs to Buildner and is never published as a file. Its derived context is included with the
 * app (public/context/vtc/), or comes from the entrant's own copy, read and kept in this browser (lib/vtcContextSource.ts),
 * or on a developer's computer from public/local/ (git-ignored, made by tools/build_vtc_context.py). Without any of
 * them, the app still runs with the site alone.
 */
export function useVtcContext() {
  const ctx = useVtcSource((s) => s.ctx)
  const status = useVtcSource((s) => s.status)
  useEffect(() => { void loadVtcContext() }, [])
  return { ctx, missing: !ctx && (status === 'missing' || status === 'error'), status }
}

/** True north in the VTC model, read from its drawn arrow (the file's own north setting is wrong). */
export const VTC_NORTH_DEG = 45
