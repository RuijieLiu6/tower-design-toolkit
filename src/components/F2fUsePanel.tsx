// Inspector for Storey height by use (P1 #8): per use, the storey height against a typical one, the height it spends
// and the daylight depth it buys (the daylight rule's 2.5 × (head − 0.76 m)), so the trade-off reads on one card.
import { useMemo } from 'react'
import { f2fUse } from '../engine/f2fUse'
import { towerFloors } from '../engine/massing'
import { useStore, useTowers } from '../store'
import { Section, StateChip } from './ui'
import { Fold, RuleRows } from './ResultViz'

const LABEL = { residential: 'Homes', hotel: 'Hotel', office: 'Office' } as const

export default function F2fUsePanel() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const r = useMemo(() => (t ? f2fUse(t, towerFloors(t)) : null), [t])
  if (!t || !r) return null
  return (
    <Section title={`Storey height · ${t.name}`} help="Each use's floor-to-floor against a typical one, the tower height that difference spends, and the daylight depth it buys.">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {r.uses.map((u) => (
          <div key={u.use} className="min-w-0 rounded-md border border-line p-2" data-f2f-use={u.use}>
            <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-xs font-semibold">{LABEL[u.use]} · {u.floors} floors</span><StateChip state={u.state} /></div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-meta">
              <div title={`Typical ${u.typical.toFixed(2)} m`}><b className="text-control tabular-nums">{u.mean.toFixed(2)} m</b> <span className="text-muted">vs {u.typical.toFixed(2)}</span><br /><span className="text-muted">{u.extra >= 0 ? '+' : '−'}{Math.abs(u.extra).toFixed(1)} m of height</span></div>
              <div title="Full daylight depth 2.5 × (window head − 0.76 m), Allen & Iano p.151"><b className="text-control tabular-nums">{u.reach.toFixed(1)} m</b> <span className="text-muted">daylight</span><br /><span className="text-muted">{u.reachTypical.toFixed(1)} m at typical</span></div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3"><Fold title={`${r.rules.length} rule lines`}><RuleRows rules={r.rules} /></Fold></div>
    </Section>
  )
}
