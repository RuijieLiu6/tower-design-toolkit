// Lines for the parcel readout (Context layers › Parcels): the lot's zoning height reference and the height suggestion
// over it, after Vista v37 (Ruijie Liu). Starts loading the references on first use; cached per lot.
import { combine, surfacesOver } from '../engine/heightModel'
import { readRule } from '../engine/heightPolicy'
import type { Pt } from '../engine/vista'
import type { HeightGrid } from './cityLayers'
import { groundFrom, heightPolicyNow, loadHeightPolicy, surfacesFor } from './heightData'
import { CITY_ORIGIN } from '../store'

const cache = new WeakMap<object, string[]>()

/** Two or three short lines for one lot (local frame ring), or a loading line. */
export function parcelHeightLines(outer: readonly (readonly [number, number])[], grids: HeightGrid[]): string[] {
  const policy = heightPolicyNow()
  if (!policy) { void loadHeightPolicy().catch(() => {}); return ['Zoning height: loading the references…'] }
  const hit = cache.get(outer)
  if (hit) return hit
  const ring = outer.map(([x, y]) => [x, y] as Pt)
  const zoning = policy.zoning([ring])
  const lines: string[] = []
  if (zoning.status === 'ready') lines.push(`Zoning height ${zoning.heightM} m basic (${zoning.controlling}; Vista transcription, unverified)`)
  else {
    const names = zoning.zones.map((z) => readRule(policy, z.ruleId, z.zone)).filter((r) => r.heightM === null).map((r) => r.label.replace(/^no zoning number \(|\)$/g, ''))
    lines.push(`Zoning: no number${names.length ? ` (${[...new Set(names)].join(', ')})` : ''}; never a guessed height`)
  }
  const surfaces = surfacesFor(grids), groundAt = groundFrom(grids)
  const hits = surfacesOver(ring.map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as Pt), surfaces)
  const ground = hits.length ? groundAt(hits[0].at) : null
  const s = combine(zoning, hits, ground, policy)
  if (s.status !== 'none' && s.heightM !== null && s.controlling) {
    const kind = s.controlling.kind === 'study' ? ' (study surface: assumption, not a City ceiling)' : s.controlling.kind === 'estimate' ? ' (City-sourced estimate)' : ''
    lines.push(`${s.status === 'ready' ? 'Suggested' : 'Cones allow'} up to ${s.heightM.toFixed(1)} m above ground: ${s.controlling.kind === 'zoning' ? 'zoning' : s.controlling.label.replace(/ \(.*\)$/, '')}${kind}`)
  }
  cache.set(outer, lines)
  return lines
}
