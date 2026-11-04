// Loads the Vista height model for Real Vancouver (after Vista v37, Ruijie Liu): Vista's zoning height references
// (public/data/vista/height_policy.json, checked against its published SHA-256, converted to the local frame once) and
// the 24 cone surfaces (8 City-sourced estimates, 16 Vista study surfaces) built on the Real Vancouver terrain; plus
// what the map layer, the parcel readout, the node panel and the design tool share. (The hook that also waits for the
// city terrain is components/useHeights.ts, so this file stays free of the CityContext import.)
import { useEffect, useState } from 'react'
import { coneSurfaces, type ConeSurface } from '../engine/heightModel'
import { POLICY_FILE, loadPolicy, type HeightPolicy } from '../engine/heightPolicy'
import type { Pt } from '../engine/vista'
import { sampleTerrain, type HeightGrid } from './cityLayers'
import { CITY_ORIGIN } from '../store'

let cache: Promise<HeightPolicy> | null = null
let loaded: HeightPolicy | null = null
/** The zoning height references, loaded once (1.6 MB). Rejects when the file is not Vista's published copy. */
export function loadHeightPolicy(): Promise<HeightPolicy> {
  cache ??= (async () => {
    const r = await fetch(`./${POLICY_FILE.path}`)
    if (!r.ok) throw new Error(`Zoning height references: HTTP ${r.status}`)
    const buf = await r.arrayBuffer()
    if (buf.byteLength !== POLICY_FILE.bytes) throw new Error(`Zoning height references: ${buf.byteLength} bytes, expected ${POLICY_FILE.bytes} (not Vista's published file)`)
    if (globalThis.crypto?.subtle) {
      const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('')
      if (hex !== POLICY_FILE.sha256) throw new Error("Zoning height references: SHA-256 differs from Vista's release manifest")
    }
    loaded = loadPolicy(JSON.parse(new TextDecoder().decode(buf)), CITY_ORIGIN)
    return loaded
  })()
  cache.catch(() => { cache = null })
  return cache
}
/** The policy if it has loaded already (for synchronous readouts), else null. */
export const heightPolicyNow = () => loaded

export function useHeightPolicy(on = true): { policy: HeightPolicy | null; error: string | null } {
  const [s, setS] = useState<{ policy: HeightPolicy | null; error: string | null }>({ policy: loaded, error: null })
  useEffect(() => {
    if (!on || s.policy) return
    let live = true
    loadHeightPolicy().then((policy) => { if (live) setS({ policy, error: null }) }, (e: Error) => { if (live) setS({ policy: null, error: e.message }) })
    return () => { live = false }
  }, [on, s.policy])
  return s
}

/** Ground at an EPSG:26910 point from the terrain grids (local frame inside). */
export const groundFrom = (grids: HeightGrid[]) => (p: Pt): number | null => sampleTerrain(grids, p[0] - CITY_ORIGIN[0], p[1] - CITY_ORIGIN[1])

const surfaceCache = new WeakMap<HeightGrid[], ConeSurface[]>()
/** The 24 cone surfaces on these terrain grids (cached per grid set). */
export function surfacesFor(grids: HeightGrid[]): ConeSurface[] {
  let s = surfaceCache.get(grids)
  if (!s) { s = coneSurfaces(groundFrom(grids)); surfaceCache.set(grids, s) }
  return s
}
