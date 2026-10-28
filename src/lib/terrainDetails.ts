// Detailed terrain is loaded after the lightweight scene. Analysis always uses unblended source heights.
import { decodeTerrain, sampleGrid, type HeightGrid, type LayerEntry, type Manifest } from './cityLayers'

export const isGroundDetail = (l: LayerEntry) => l.id.startsWith('terrain_ground_')
export const isTerrainDetail = (l: LayerEntry) => isGroundDetail(l) || l.id === 'terrain_r2_detail'
export const nameTerrain = (g: HeightGrid, l: LayerEntry): HeightGrid => ({ ...g,
  source: isGroundDetail(l) ? `City LiDAR 2022 · ${g.step} m ground` : `MRDEM-30 · ${g.step} m grid` })

/** Each failed detail layer leaves the corresponding coarse fallback available. */
export async function loadTerrainDetails(manifest: Manifest, get: (f: string) => Promise<ArrayBuffer>, groundOnly = false) {
  const entries = manifest.layers.filter(groundOnly ? isGroundDetail : isTerrainDetail)
  const results = await Promise.allSettled(entries.map(async (layer) => {
    if (!layer.grid) throw new Error(`${layer.id}: missing grid metadata`)
    const grid = nameTerrain(decodeTerrain(await get(layer.file), layer.grid), layer)
    return { layer, grid }
  }))
  return {
    loaded: results.flatMap((r) => r.status === 'fulfilled' ? [r.value] : []),
    errors: results.flatMap((r, i) => r.status === 'rejected' ? [`${entries[i].title}: ${String(r.reason)}`] : []),
  }
}

/** Report every source actually used under the footprint, including mixed detailed/fallback coverage. */
export function terrainBasis(grids: HeightGrid[], points: [number, number][]): string {
  return [...new Set(points.map(([x, y]) => {
    const g = grids.find((a) => sampleGrid(a, x, y) !== null)
    return g?.source ?? (g ? `${g.step} m terrain` : 'no terrain data')
  }))].join(' + ')
}

export const gridBounds = (g: HeightGrid) => [g.x0, g.y0, g.x0 + (g.cols - 1) * g.step, g.y0 + (g.rows - 1) * g.step] as const
export const cellInside = (g: HeightGrid, x: number, y: number, step: number) => {
  const [x0, y0, x1, y1] = gridBounds(g)
  return x >= x0 && y >= y0 && x + step <= x1 && y + step <= y1
}

/**
 * Joins aligned grids of one step (adjacent City LiDAR tiles) into one grid, so a display patch blends to the coarse
 * terrain only at the outer edge of the mosaic. Drawn tile by tile, neighbouring patches overlapped along every shared
 * edge and dipped towards MRDEM there (27 Oct). Cells no tile covers stay NaN; grids that do not align stay separate.
 */
export function mosaicGrids(grids: HeightGrid[]): HeightGrid[] {
  const groups = new Map<string, HeightGrid[]>()
  const phase = (v: number, step: number) => ((v % step) + step) % step
  for (const g of grids) {
    const key = `${g.step}:${phase(g.x0, g.step)}:${phase(g.y0, g.step)}`
    groups.set(key, [...(groups.get(key) ?? []), g])
  }
  return [...groups.values()].map((gs) => {
    if (gs.length === 1) return gs[0]
    const step = gs[0].step
    const x0 = Math.min(...gs.map((g) => g.x0)), y0 = Math.min(...gs.map((g) => g.y0))
    const cols = Math.round((Math.max(...gs.map((g) => g.x0 + (g.cols - 1) * step)) - x0) / step) + 1
    const rows = Math.round((Math.max(...gs.map((g) => g.y0 + (g.rows - 1) * step)) - y0) / step) + 1
    const z = new Float32Array(cols * rows).fill(NaN)
    for (const g of gs) {
      const c0 = Math.round((g.x0 - x0) / step), r0 = Math.round((g.y0 - y0) / step)
      for (let r = 0; r < g.rows; r++) z.set(g.z.subarray(r * g.cols, (r + 1) * g.cols), (r0 + r) * cols + c0)
    }
    return { cols, rows, step, x0, y0, z, source: gs[0].source }
  })
}

/**
 * Display-only patch aligned with the coarse cell edges. Missing source cells use coarse terrain; a 30 m
 * transition joins the perimeter without changing the measured grid used by views and solar analysis.
 */
export function groundDisplayPatch(fine: HeightGrid, coarse: HeightGrid): HeightGrid {
  const [fx0, fy0, fx1, fy1] = gridBounds(fine)
  const snap = (v: number, origin: number, end: boolean) => origin + (end ? Math.ceil : Math.floor)((v - origin) / coarse.step) * coarse.step
  const x0 = snap(fx0, coarse.x0, false), y0 = snap(fy0, coarse.y0, false)
  const x1 = snap(fx1, coarse.x0, true), y1 = snap(fy1, coarse.y0, true)
  const step = fine.step, cols = Math.round((x1 - x0) / step) + 1, rows = Math.round((y1 - y0) / step) + 1
  const z = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = x0 + c * step, y = y0 + r * step
    const low = sampleGrid(coarse, x, y), high = sampleGrid(fine, x, y)
    const weight = Math.max(0, Math.min(1, Math.min(x - fx0, fx1 - x, y - fy0, fy1 - y) / 30))
    z[r * cols + c] = low === null ? high ?? NaN : high === null ? low : low + (high - low) * weight
  }
  return { x0, y0, step, cols, rows, z }
}
