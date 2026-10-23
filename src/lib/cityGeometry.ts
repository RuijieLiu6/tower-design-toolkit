import { ShapeUtils, Vector2 } from 'three'
import type { Footprint, FootprintHeights, Manifest } from './cityLayers'

export interface RoofForm extends Footprint { ground: number; roof: number; max: number; points: number }
export interface BuildingForms {
  version: number; origin: number[]; baseCount: number; baseSha256: string; tile: string
  replace: number[]; forms: RoofForm[]; repairs?: { index: number; parts: Pick<Footprint, 'outer' | 'holes'>[] }[]
}
export interface StreetLine { id: number; name: string; kind: 'street' | 'lane'; width: number | null; bridge: boolean; points: [number, number][] }
export interface StreetData {
  version: number; origin: number[]; lines: StreetLine[]
  meshes: Record<'street' | 'lane', { positions: number[]; indices: number[] }>
}
const finiteRing = (r: number[][]) => r.length >= 3 && r.every((p) => p.length === 2 && p.every(Number.isFinite))

/** Both viewport and analysis load the same optional building replacement. Independent failures retain the base. */
export async function loadCityGeometry(manifest: Manifest, read: (file: string) => Promise<ArrayBuffer>, buildingsOnly = false) {
  let forms: BuildingForms | null = null, streets: StreetData | null = null
  const errors: string[] = []
  await Promise.all(['building_forms', ...(buildingsOnly ? [] : ['city_streets'])].map(async (id) => {
    const layer = manifest.layers.find((l) => l.id === id)
    if (!layer) return
    try {
      const data = JSON.parse(new TextDecoder().decode(await read(layer.file)))
      if (data.version !== 1 || data.origin?.[0] !== 491300 || data.origin?.[1] !== 5458600) throw new Error('Unsupported geometry frame')
      if (id === 'building_forms') {
        const f = data as BuildingForms
        const base = manifest.layers.find((l) => l.id === 'footprints')
        if (f.baseCount !== base?.count || f.baseSha256 !== base.sha256) throw new Error('Building forms do not match the base footprints')
        if (!f.replace.every((i) => Number.isInteger(i) && i >= 0 && i < f.baseCount) || !f.forms.length ||
          !f.forms.every((p) => finiteRing(p.outer) && p.holes.every(finiteRing) && Number.isFinite(p.ground + p.roof + p.max + p.points) && p.roof > p.ground)) throw new Error('Invalid roof geometry')
        if (f.repairs?.some((r) => !Number.isInteger(r.index) || r.index < 0 || r.index >= f.baseCount || !r.parts.every((p) => finiteRing(p.outer) && p.holes.every(finiteRing)))) throw new Error('Invalid footprint repair')
        forms = f
      } else {
        const s = data as StreetData
        for (const m of Object.values(s.meshes)) {
          if (m.positions.length % 2 || !m.positions.every(Number.isFinite) || m.indices.length % 3 ||
            !m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < m.positions.length / 2)) throw new Error('Invalid street mesh')
        }
        if (!s.lines.every((l) => l.points.length >= 2 && l.points.every((p) => p.length === 2 && p.every(Number.isFinite)))) throw new Error('Invalid street line')
        streets = s
      }
    } catch (e) { errors.push(`${layer.title}: ${(e as Error).message}`) }
  }))
  return { forms, streets, errors } as { forms: BuildingForms | null; streets: StreetData | null; errors: string[] }
}

/** Roof parts precede historical outlines: a measured surface wins where the two surveys disagree. */
export function applyBuildingForms(footprints: Footprint[], heights: FootprintHeights | null, forms: BuildingForms | null) {
  if (!forms) return { footprints, heights }
  if (footprints.length !== forms.baseCount) throw new Error('Mismatched building base')
  const replaced = new Set(forms.replace), repairs = new Map(forms.repairs?.map((r) => [r.index, r.parts]))
  const kept = footprints.flatMap((f, i) => replaced.has(i) ? [] : (repairs.get(i) ?? [f]).map((p) => ({ old: i, footprint: { ...f, ...p } })))
  const n = forms.forms.length + kept.length
  const h: FootprintHeights = { ground: new Float32Array(n).fill(NaN), roof: new Float32Array(n).fill(NaN), max: new Float32Array(n).fill(NaN), points: new Uint16Array(n) }
  forms.forms.forEach((f, i) => { h.ground[i] = f.ground; h.roof[i] = f.roof; h.max[i] = f.max; h.points[i] = Math.min(65535, f.points) })
  kept.forEach(({ old }, j) => {
    if (!heights) return
    const i = forms.forms.length + j
    h.ground[i] = heights.ground[old]; h.roof[i] = heights.roof[old]; h.max[i] = heights.max[old]; h.points[i] = heights.points[old]
  })
  return { footprints: [...forms.forms, ...kept.map((k) => k.footprint)], heights: h }
}

/** Split only holed footprints into solid triangles, preserving courtyards in the prism shadow engine. */
export function solidRings(f: Footprint): [number, number][][] {
  if (!f.holes.length) return [f.outer]
  const outer = f.outer.map(([x, y]) => new Vector2(x, y)), holes = f.holes.map((r) => r.map(([x, y]) => new Vector2(x, y)))
  const points = [...f.outer, ...f.holes.flat()]
  return ShapeUtils.triangulateShape(outer, holes).map((tri) => tri.map((i) => points[i]))
}
