import { ShapeUtils, Vector2 } from 'three'
import type { Footprint, FootprintHeights, Manifest } from './cityLayers'

export interface RoofForm extends Footprint { ground: number; roof: number; max: number; points: number }
export interface BuildingForms {
  version: number; origin: number[]; baseCount: number; baseSha256: string; tile: string
  replace: number[]; forms: RoofForm[]; repairs?: { index: number; parts: Pick<Footprint, 'outer' | 'holes'>[] }[]
  /** building_forms_2009 only: 2015 outlines with no height in any source, drawn as display-only placeholders. */
  placeholders?: number[]; placeholderHeight?: number
  /** building_forms_2009 only: 2015 outlines of the view-cone ring (outside the base box) left without a height, and which of them are placeholders. */
  outlines?: Footprint[]; outlinePlaceholders?: number[]
}
/** City "Building footprints 2009" parts (outside the 2022 LiDAR core) carry ids from -1,000,001 down (tools/build_city_forms_2009.py). */
export const is2009Part = (id: number) => id <= -1_000_001
/** Where a building part's height comes from, for viewpoint captions. */
export const heightSource = (id: number) => (is2009Part(id) ? 'City 2009 heights (older survey)' : 'LiDAR 2022')
/** Building layers, in priority order: a 2022 LiDAR roof wins over a 2009 height where both exist. */
const FORM_LAYERS = ['building_forms', 'building_forms_2009']
export interface StreetLine { id: number; name: string; kind: 'street' | 'lane'; width: number | null; bridge: boolean; points: [number, number][] }
export interface StreetData {
  version: number; origin: number[]; lines: StreetLine[]
  meshes: Record<'street' | 'lane', { positions: number[]; indices: number[] }>
}
const finiteRing = (r: number[][]) => r.length >= 3 && r.every((p) => p.length === 2 && p.every(Number.isFinite))

/** Both viewport and analysis load the same optional building replacement. Independent failures retain the base. */
export async function loadCityGeometry(manifest: Manifest, read: (file: string) => Promise<ArrayBuffer>, buildingsOnly = false) {
  const loaded: Partial<Record<string, BuildingForms>> = {}
  let streets: StreetData | null = null
  const errors: string[] = []
  await Promise.all([...FORM_LAYERS, ...(buildingsOnly ? [] : ['city_streets'])].map(async (id) => {
    const layer = manifest.layers.find((l) => l.id === id)
    if (!layer) return
    try {
      const data = JSON.parse(new TextDecoder().decode(await read(layer.file)))
      if (data.version !== 1 || data.origin?.[0] !== 491300 || data.origin?.[1] !== 5458600) throw new Error('Unsupported geometry frame')
      if (FORM_LAYERS.includes(id)) {
        const f = data as BuildingForms
        const base = manifest.layers.find((l) => l.id === 'footprints')
        const inBase = (i: number) => Number.isInteger(i) && i >= 0 && i < f.baseCount
        if (f.baseCount !== base?.count || f.baseSha256 !== base.sha256) throw new Error('Building forms do not match the base footprints')
        if (!f.replace.every(inBase) || !f.forms.length ||
          !f.forms.every((p) => finiteRing(p.outer) && p.holes.every(finiteRing) && Number.isFinite(p.ground + p.roof + p.max + p.points) && p.roof > p.ground)) throw new Error('Invalid roof geometry')
        if (f.repairs?.some((r) => !inBase(r.index) || !r.parts.every((p) => finiteRing(p.outer) && p.holes.every(finiteRing)))) throw new Error('Invalid footprint repair')
        if (f.placeholders && (!f.placeholders.every(inBase) || !(Number(f.placeholderHeight) > 0))) throw new Error('Invalid placeholder list')
        if (f.outlines && (!f.outlines.every((p) => finiteRing(p.outer) && p.holes.every(finiteRing)) ||
          !(f.outlinePlaceholders ?? []).every((i) => Number.isInteger(i) && i >= 0 && i < f.outlines!.length))) throw new Error('Invalid ring outlines')
        loaded[id] = f
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
  return { forms: mergeForms(loaded.building_forms ?? null, loaded.building_forms_2009 ?? null), streets, errors } as { forms: BuildingForms | null; streets: StreetData | null; errors: string[] }
}

/** One replacement from the 2022 LiDAR forms and the 2009 ring (either may be missing); the 2022 parts come first. */
export function mergeForms(a: BuildingForms | null, b: BuildingForms | null): BuildingForms | null {
  if (!a || !b) return a ?? b
  return { ...a, tile: `${a.tile} + ${b.tile}`, forms: [...a.forms, ...b.forms], replace: [...new Set([...a.replace, ...b.replace])],
    repairs: [...(a.repairs ?? []), ...(b.repairs ?? [])], placeholders: b.placeholders ?? a.placeholders, placeholderHeight: b.placeholderHeight ?? a.placeholderHeight,
    outlines: b.outlines ?? a.outlines, outlinePlaceholders: b.outlinePlaceholders ?? a.outlinePlaceholders }
}

/**
 * Roof parts precede historical outlines: a measured surface wins where the two surveys disagree. `placeholders` are
 * indices into the returned footprints (2015 outlines with no height anywhere), for display only: they stay "unknown".
 */
export function applyBuildingForms(footprints: Footprint[], heights: FootprintHeights | null, forms: BuildingForms | null) {
  if (!forms) return { footprints, heights, placeholders: new Set<number>() }
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
  const wanted = new Set(forms.placeholders ?? [])
  const placeholders = new Set(kept.flatMap(({ old }, j) => (wanted.has(old) ? [forms.forms.length + j] : [])))
  // View-cone ring outlines without a height come last: unknown, like any other outline (NaN heights).
  const ring = forms.outlines ?? []
  if (ring.length) {
    const grow = (a: Float32Array) => { const b = new Float32Array(n + ring.length).fill(NaN); b.set(a); return b }
    h.ground = grow(h.ground); h.roof = grow(h.roof); h.max = grow(h.max)
    const pts = new Uint16Array(n + ring.length); pts.set(h.points); h.points = pts
    for (const k of forms.outlinePlaceholders ?? []) placeholders.add(n + k)
  }
  return { footprints: [...forms.forms, ...kept.map((k) => k.footprint), ...ring], heights: h, placeholders }
}

/** Split only holed footprints into solid triangles, preserving courtyards in the prism shadow engine. */
export function solidRings(f: Footprint): [number, number][][] {
  if (!f.holes.length) return [f.outer]
  const outer = f.outer.map(([x, y]) => new Vector2(x, y)), holes = f.holes.map((r) => r.map(([x, y]) => new Vector2(x, y)))
  const points = [...f.outer, ...f.holes.flat()]
  return ShapeUtils.triangulateShape(outer, holes).map((tri) => tri.map((i) => points[i]))
}
