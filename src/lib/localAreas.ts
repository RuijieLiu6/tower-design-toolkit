// The City's 22 local areas, kept in public/data/local_areas.json (tools/build_local_areas.py from the City open-data
// "local-area-boundary" export, OGL-Vancouver, retrieved 2026-11-03): name, label point, plan bounds and a 2 m outline
// in the local frame. Bundled, so "Start from a neighbourhood" works offline and sends nothing anywhere.
import { useEffect, useState } from 'react'
import type { Pt } from '../engine/site'

export interface Neighbourhood { name: string; at: Pt; bounds: [number, number, number, number]; areaM2: number; rings: Pt[][] }
export interface LocalAreaFile { version: number; origin: [number, number]; count: number; source: string; licence: { name: string; url: string }; areas: Neighbourhood[] }

export const LOCAL_AREAS_FILE = './data/local_areas.json'
let cache: Promise<LocalAreaFile> | null = null
export function loadNeighbourhoods(): Promise<LocalAreaFile> {
  cache ??= fetch(LOCAL_AREAS_FILE).then((r) => (r.ok ? r.json() as Promise<LocalAreaFile> : Promise.reject(new Error(`local_areas.json: HTTP ${r.status}`))))
  cache.catch(() => { cache = null })
  return cache
}

export function useLocalAreas(): Neighbourhood[] | null {
  const [areas, setAreas] = useState<Neighbourhood[] | null>(null)
  useEffect(() => {
    let live = true
    loadNeighbourhoods().then((f) => live && setAreas(f.areas), () => live && setAreas([]))
    return () => { live = false }
  }, [])
  return areas
}

/** A camera over a plan box: oblique from the south-south-west, the whole box in a 40° view (model frame, z up). */
export function cameraOver(bounds: [number, number, number, number], ground: number): { position: [number, number, number]; target: [number, number, number]; fov: number } {
  const [x0, y0, x1, y1] = bounds
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const span = Math.max(300, Math.max(x1 - x0, y1 - y0) * 1.15)
  const d = span / (2 * Math.tan((20 * Math.PI) / 180))
  // 50° above the horizon, looking north-north-east.
  const el = (50 * Math.PI) / 180, az = (200 * Math.PI) / 180
  const dir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)]
  return { position: [cx + dir[0] * d, cy + dir[1] * d, ground + dir[2] * d], target: [cx, cy, ground], fov: 40 }
}
