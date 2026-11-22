// Services → core fit (node placement, 21 Nov 2026): when the core is short, what of its need is lifts, exit stairs and
// services, read from the same worst-level breakdown the core-fit line uses (engine/lifts.ts breakdownMax, no second
// computation), with the HVAC choice that sets the office shafts right there (the same `Tower.hvac` as Schematic ›
// Core & floors). A change applies at once; Ctrl+Z takes it back.
import { HVAC_LABEL } from '../engine/lifeSafety'
import type { LiftResult } from '../engine/lifts'
import type { HvacSystem, Tower } from '../engine/types'
import { useStore } from '../store'
import Help from './Help'

export interface CoreSplit { lifts: number; stairs: number; services: number; walls: number; total: number; short: number }

/** The worst level's need in four parts (lifts = passenger shafts + lobby + service and firefighter lifts). */
export function coreSplit(r: Pick<LiftResult, 'breakdownMax' | 'requiredMax' | 'modelledCore'>): CoreSplit {
  const b = r.breakdownMax
  const lifts = b.passenger + b.lobby + b.service
  return { lifts, stairs: b.stairs, services: b.services, walls: b.walls, total: lifts + b.stairs + b.services + b.walls, short: r.requiredMax - r.modelledCore }
}

const pc = (v: number, of: number) => (of > 0 ? Math.round((v / of) * 100) : 0)

export default function CoreNeed({ r }: { r: LiftResult & { tower: Tower } }) {
  const updateTower = useStore((s) => s.updateTower)
  const s = coreSplit(r)
  if (s.short <= 0.5) return null
  const t = r.tower
  const parts: [string, number][] = [['Lifts and lobbies', s.lifts], ['Exit stairs', s.stairs], ['Services', s.services], ['Walls', s.walls]]
  return (
    <div className="mt-2 grid min-w-0 gap-1.5 rounded-lg border border-line bg-panel p-2" data-testid="core-need">
      <p className="text-meta font-semibold text-ink">Core {Math.round(s.short).toLocaleString()} m² short at L{r.maxLevel ?? '—'}: what it needs</p>
      <ul className="grid grid-cols-[1fr_auto_auto] gap-x-2 text-meta">
        {parts.map(([label, v]) => (
          <li key={label} className="contents">
            <span className="text-ink">{label}</span>
            <span className="text-right tabular-nums text-ink">{Math.round(v).toLocaleString()} m²</span>
            <span className="w-9 text-right tabular-nums text-muted">{pc(v, s.total)}%</span>
          </li>
        ))}
      </ul>
      <label className="flex items-center justify-between gap-2 text-meta">
        <span className="flex items-center gap-1.5 text-ink">HVAC system<Help label="How the HVAC choice moves the core">The services part holds the office floors' HVAC shafts: about 4% of the floor for all-air, less for air-water (Allen &amp; Iano p.192, unverified). The same choice as in Schematic › Core &amp; floors.</Help></span>
        <select value={t.hvac ?? 'all-air'} onChange={(e) => updateTower(t.id, { hvac: e.target.value as HvacSystem })} className="rounded border border-line bg-panel px-1.5 py-0.5 text-meta" aria-label="HVAC system (sets the services shafts)">
          {(Object.keys(HVAC_LABEL) as HvacSystem[]).map((k) => <option key={k} value={k}>{HVAC_LABEL[k]}</option>)}
        </select>
      </label>
    </div>
  )
}
