// Runs the solar-access job off the main thread, so dragging a tower never stutters. The VTC model is sent once and
// kept here; the Real Vancouver layers (public/data, built by the context pipeline) are fetched and decoded here once.
import type { VtcContext } from '../context'
import { loadTerrainDetails } from '../lib/terrainDetails'
import { applyBuildingForms, loadCityGeometry, solidRings } from '../lib/cityGeometry'
import type { CityInput } from '../engine/solarCity'
import { runSolarJob, type SolarJobInput } from '../engine/solarJob'
import { decodeFootprints, decodeHeights, decodeTerrain, type Manifest } from '../lib/cityLayers'
import { loadVistaBuildings, seatVista } from '../lib/vistaBuildings'
import type { CityModel } from '../lib/cityModel'

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)
let ctx: VtcContext | null = null
const city: Partial<Record<CityModel, Promise<CityInput | null>>> = {}

/**
 * The buildings model shown in the viewport (Vista's by default, or the City LiDAR 2022 + 2009 model) on the same ground
 * as the viewport's; null if the layers are missing.
 */
function loadCity(base: string, model: CityModel): Promise<CityInput | null> {
  const p = city[model] ??= (async () => {
    const get = async (f: string) => { const r = await fetch(new URL(`data/${f}`, base)); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.arrayBuffer() }
    const m = (await (await fetch(new URL('data/layers.json', base))).json()) as Manifest
    const layer = (id: string) => m.layers.find((l) => l.id === id)
    const t1 = layer('terrain_r1')
    const coarse = t1?.grid ? decodeTerrain(await get(t1.file), t1.grid) : null
    const detail = await loadTerrainDetails(m, get, true)
    const grids = [...detail.loaded.map((d) => d.grid).sort((a, b) => a.step - b.step), ...(coarse ? [coarse] : [])]
    const terrain = grids.length ? grids : null
    let footprints, heights
    if (model === 'vista') {
      const v = await loadVistaBuildings(m, get)
      if (!v) return null
      footprints = v.footprints
      heights = seatVista(v.footprints, v.vista, grids)
    } else {
      const fp = layer('footprints'), h = layer('footprint_heights')
      if (!fp) return null
      const baseFootprints = decodeFootprints(await get(fp.file))
      const baseHeights = h ? decodeHeights(await get(h.file), baseFootprints.length) : null
      const geometry = await loadCityGeometry(m, get, true)
      ;({ footprints, heights } = applyBuildingForms(baseFootprints, baseHeights, geometry.forms))
    }
    const out: CityInput = { buildings: [], unknown: [], terrain,
      ...(model === 'vista' ? { heights: { label: 'heights by source (City LiDAR 2022 or 2009 where measured, else OpenStreetMap, unverified)', estimated: true } } : {}) }
    footprints.forEach((f, k) => {
      const g = heights?.ground[k] ?? NaN, r = heights?.roof[k] ?? NaN
      // Same test as the context layer (CityContext.tsx): no height means unknown. Vista's heights include estimates per
      // building type (unverified, named in the result's sources); the City model has measured heights only.
      if (Number.isFinite(g) && Number.isFinite(r) && r > g) out.buildings.push(...solidRings(f).map((ring) => ({ ring, ground: g, roof: r })))
      else out.unknown.push([f.outer.reduce((s, p) => s + p[0], 0) / f.outer.length, f.outer.reduce((s, p) => s + p[1], 0) / f.outer.length])
    })
    return out
  })().catch(() => { delete city[model]; return null })
  return p
}

self.onmessage = async (e: MessageEvent<{ id: number; input: Omit<SolarJobInput, 'ctx' | 'city'>; ctx?: VtcContext | null; cityBase?: string; cityModel?: CityModel }>) => {
  if ('ctx' in e.data) ctx = e.data.ctx ?? null
  try {
    const c = e.data.input.project === 'city' && e.data.cityBase ? await loadCity(e.data.cityBase, e.data.cityModel ?? 'vista') : null
    // Baseline masks cached without the city layers must not be reused once they load.
    const ctxKey = e.data.input.ctxKey ? `${e.data.input.ctxKey}:${c ? 'layers' : 'none'}` : undefined
    const out = runSolarJob({ ...e.data.input, ctxKey, ctx, city: c })
    const m = out.map
    const transfer: Transferable[] = m ? [m.proposal.buffer, m.baseline.buffer, m.covered.buffer] : []
    if (out.mapTerrain) transfer.push(out.mapTerrain.z.buffer)
    post({ id: e.data.id, out }, transfer)
  } catch (err) {
    post({ id: e.data.id, error: (err as Error).message })
  }
}
