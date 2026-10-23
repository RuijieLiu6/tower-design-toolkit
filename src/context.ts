import { useEffect, useState } from 'react'

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
}

export const isExtruded = (c: ContextItem): c is Extruded => 'footprint' in c

/**
 * The competition model belongs to Buildner and is never published, so it is read from public/local/
 * (git-ignored), produced by tools/build_vtc_context.py. Without it, the app still runs with the site alone.
 */
export function useVtcContext() {
  const [ctx, setCtx] = useState<VtcContext | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    fetch('./local/vtc_context.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setCtx)
      .catch(() => setMissing(true))
  }, [])
  return { ctx, missing }
}

/** True north in the VTC model, read from its drawn arrow (the file's own north setting is wrong). */
export const VTC_NORTH_DEG = 45
