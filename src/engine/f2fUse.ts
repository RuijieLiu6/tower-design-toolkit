// Storey height by use (P1 #8, book notes 21 Nov): each use's storeys against a typical floor-to-floor, the height spent
// above it, and what that height buys in daylight depth (the daylight rule, P1 #7), so the trade-off is on one line.
// Extra height = Σ storeys × (f2f − typical). Typical values: residential about 3.05 m (KPF test fits read in the City's
// Vertical Studio deck, p.73, second-hand); hotel 3.3 m and office 3.9 m (the Toolkit generator's presets,
// dtmassGen.ts GEN_F2F, with Allen & Iano's floor sandwich, pp.206, 208). Unverified.
import { DEFAULT_INTERIOR } from './interior'
import { fullDepth } from './daylightDepth'
import { GEN_F2F } from './dtmassGen'
import type { Floor, RuleResult, Source, Tower } from './types'

export const F2F_USES = ['residential', 'hotel', 'office'] as const
export type F2fUse = (typeof F2F_USES)[number]

/** Typical floor-to-floor by use (m) and the margin above it that still passes (m). */
export const TYPICAL_F2F: Record<F2fUse, number> = { residential: 3.05, hotel: GEN_F2F.hotel, office: GEN_F2F.office }
export const F2F_MARGIN = 0.4

const SOURCE: Record<F2fUse, Source> = {
  residential: { label: 'Dobson, Vertical Studio deck (City of Vancouver, Higher Buildings Policy review): KPF residential test fits, about 3.05 m per added storey (second-hand)', page: 'p.73' },
  hotel: { label: 'Toolkit generator presets (dtmassGen.ts GEN_F2F, from Sinnie Choi’s model.js); Allen & Iano, The Architect’s Studio Companion, 6th ed., floor sandwich', page: 'pp.206, 208' },
  office: { label: 'Toolkit generator presets (dtmassGen.ts GEN_F2F, from Sinnie Choi’s model.js); Allen & Iano, The Architect’s Studio Companion, 6th ed., floor sandwich', page: 'pp.206, 208' },
}
const LABEL: Record<F2fUse, string> = { residential: 'Residential', hotel: 'Hotel', office: 'Office' }

export interface UseHeight {
  use: F2fUse
  floors: number
  /** Lowest and highest floor-to-floor of this use (m), and the mean. */
  min: number
  max: number
  mean: number
  typical: number
  /** Height above the typical storeys (m), and in typical storeys of this use. */
  extra: number
  storeys: number
  /** Full daylight depth 2.5 × (head − 0.76 m) at the mean height and at the typical one (head = f2f − head drop). */
  reach: number
  reachTypical: number
  state: 'pass' | 'warn'
}

export function useHeights(t: Tower, floors: Floor[]): UseHeight[] {
  const drop = (t.interior ?? DEFAULT_INTERIOR).headDrop
  const head = (f2f: number) => Math.max(2.2, f2f - drop) // as the daylight screen reads the head
  const out: UseHeight[] = []
  for (const use of F2F_USES) {
    const fl = floors.filter((f) => f.use === use && !f.podium && !f.skyLobby)
    if (!fl.length) continue
    const h = fl.map((f) => f.z1 - f.z0)
    const typical = TYPICAL_F2F[use]
    const extra = h.reduce((s, x) => s + (x - typical), 0)
    const mean = h.reduce((s, x) => s + x, 0) / h.length
    const max = Math.max(...h)
    out.push({ use, floors: fl.length, min: Math.min(...h), max, mean, typical, extra, storeys: extra / typical,
      reach: fullDepth(head(mean)), reachTypical: fullDepth(head(typical)), state: max <= typical + F2F_MARGIN + 1e-6 ? 'pass' : 'warn' })
  }
  return out
}

const m2 = (v: number) => v.toFixed(2)

export interface F2fResult { uses: UseHeight[]; extra: number; rules: RuleResult[] }

export function f2fUse(t: Tower, floors: Floor[]): F2fResult {
  const uses = useHeights(t, floors)
  const rules: RuleResult[] = []
  if (!uses.length) {
    rules.push({ id: 'f2f-none', label: 'Storey height by use', value: 'no residential, hotel or office floors in this tower', threshold: 'a typical storey height for the use', state: 'unknown', flag: 'unresolved', source: SOURCE.residential })
    return { uses, extra: 0, rules }
  }
  for (const u of uses) {
    const h = Math.abs(u.min - u.max) < 0.005 ? `${m2(u.mean)} m` : `${m2(u.min)}–${m2(u.max)} m (mean ${m2(u.mean)})`
    const n = Math.round(Math.abs(u.storeys))
    const value = `${LABEL[u.use].toLowerCase()} ${h} × ${u.floors} floor${u.floors === 1 ? '' : 's'}: ${Math.abs(u.extra).toFixed(1)} m (≈ ${n} floor${n === 1 ? '' : 's'}) ${u.extra >= 0 ? 'above' : 'below'} ${m2(u.typical)} m`
    rules.push({
      id: `f2f-${u.use}`, label: `${LABEL[u.use]}: storey height`, value,
      threshold: `≤ ${m2(u.typical + F2F_MARGIN)} m (typical ${m2(u.typical)} m + ${F2F_MARGIN} m)`, state: u.state, flag: 'unverified', source: SOURCE[u.use],
      note: `Extra height = storeys × (floor-to-floor − typical). Daylight trade-off (Daylight › Plate depth): full daylight depth ${u.reach.toFixed(1)} m at this height against ${u.reachTypical.toFixed(1)} m at ${m2(u.typical)} m, 2.5 × (window head − 0.76 m) (Allen & Iano p.151; head = floor-to-floor − ${(t.interior ?? DEFAULT_INTERIOR).headDrop} m head drop, team). A lower storey with a slimmer plate keeps the daylight; a tall storey keeps the plate and spends the height.`
        + (u.use === 'residential' ? ' The 3.05 m is KPF’s per-storey increment read from the City deck (p.73), not the report itself; the generator uses 3.0 m.' : ' Hotel and office values are the Toolkit generator’s presets, which the floor-sandwich depths in Allen & Iano corroborate (pp.206, 208).'),
    })
  }
  const extra = uses.reduce((s, u) => s + u.extra, 0)
  const res = TYPICAL_F2F.residential
  rules.push({ id: 'f2f-total', label: 'Height above typical storeys, all uses', value: `${extra.toFixed(1)} m (≈ ${Math.round(extra / res)} residential floors at ${m2(res)} m)`, threshold: 'reported: the height the storeys spend above typical, under the same height cap', state: 'pass', flag: 'unverified', source: SOURCE.residential })
  return { uses, extra, rules }
}
