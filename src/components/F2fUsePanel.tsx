// Inspector for Storey height by use (P1 #8): per use, the storey height against a typical one, the height it spends
// and the daylight depth it buys (the daylight rule's 2.5 × (head − 0.76 m)), so the trade-off reads on one card.
// Node placement (21 Nov 2026): each row can act on it at once (undoable, no confirm): "Use typical" and the band's
// floor-to-floor; for storeys that come from an imported model the row says what it cannot change.
import { useMemo } from 'react'
import { f2fUse, type F2fUse } from '../engine/f2fUse'
import { towerFloors } from '../engine/massing'
import type { Band, Tower } from '../engine/types'
import { useStore, useTowers } from '../store'
import { Section, StateChip } from './ui'
import { Fold, RuleRows } from './ResultViz'

const LABEL = { residential: 'Homes', hotel: 'Hotel', office: 'Office' } as const

/** What the row's actions can change for `use`: the storey height of the tower's bands of that use, or nothing. */
export function f2fEditable(t: Pick<Tower, 'imported' | 'bands' | 'floorUses'>, use: F2fUse): { ok: boolean; why: string } {
  if (t.imported) return { ok: false, why: 'Storeys come from the imported model: change them in the model and sync it again (Import › Rhino link or re-import).' }
  if (!t.bands.some((b) => b.use === use)) return { ok: false, why: 'These floors were given this use one by one (Program): their storey height is their band’s; change it on that use.' }
  const moved = Object.values(t.floorUses ?? {}).some((u) => u === use)
  return { ok: true, why: `Sets the storey height of the ${use} band${t.bands.filter((b) => b.use === use).length > 1 ? 's' : ''}; the tower keeps about its height (whole storeys), so the storey count changes.${moved ? ' Floors given this use one by one in Program keep their own band’s height.' : ''}` }
}

/** The bands with every band of `use` at storey height `f2f` (m, rounded to the centimetre). */
export function withUseF2f(bands: Band[], use: F2fUse, f2f: number): Band[] {
  const v = Math.round(Math.min(8, Math.max(2.4, f2f)) * 100) / 100
  return bands.map((b) => (b.use === use ? { ...b, f2f: v } : b))
}

export default function F2fUsePanel() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const r = useMemo(() => (t ? f2fUse(t, towerFloors(t)) : null), [t])
  const updateTower = useStore((s) => s.updateTower)
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
            <F2fActions t={t} use={u.use} mean={u.mean} typical={u.typical} set={(f2f) => updateTower(t.id, { bands: withUseF2f(t.bands, u.use, f2f) })} />
          </div>
        ))}
      </div>
      <div className="mt-3"><Fold title={`${r.rules.length} rule lines`}><RuleRows rules={r.rules} /></Fold></div>
    </Section>
  )
}

export function F2fActions({ t, use, mean, typical, set }: { t: Tower; use: F2fUse; mean: number; typical: number; set: (f2f: number) => void }) {
  const can = f2fEditable(t, use)
  if (!can.ok) return <p className="mt-1.5 text-meta text-muted" title={can.why} data-f2f-locked={use}>{t.imported ? 'From the model: not editable here' : 'Set on its own band'}</p>
  const band = t.bands.find((b) => b.use === use)
  const cur = band?.f2f && band.f2f > 0 ? band.f2f : mean
  const atTypical = Math.abs(cur - typical) < 0.005
  return (
    <div className="mt-1.5 flex items-center justify-between gap-2" title={can.why} data-f2f-actions={use}>
      <button type="button" disabled={atTypical} onClick={() => set(typical)}
        className="rounded-md border border-line px-2 py-0.5 text-meta text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
        Use typical ({typical.toFixed(2)} m)
      </button>
      <label className="flex items-center gap-1 text-meta text-muted">Storey
        <input type="number" min={2.4} max={8} step={0.05} value={Number(cur.toFixed(2))} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) set(v) }}
          className="w-16 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums text-ink" aria-label={`${LABEL[use]} storey height (m)`} />m</label>
    </div>
  )
}

/**
 * The node's own settings in the left panel (node placement, 21 Nov 2026; it used to say it "has no settings of its own
 * here"): per use of the selected tower, Use typical and the storey height. Registered as the f2f-use-set tool.
 */
export function F2fUseSettings() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const updateTower = useStore((s) => s.updateTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const r = useMemo(() => (t ? f2fUse(t, towerFloors(t)) : null), [t])
  if (!t || !r) return <p className="px-3 pb-3 text-meta text-muted">Place or draw a tower first.</p>
  if (!r.uses.length) return <p className="px-3 pb-3 text-meta text-muted">No homes, hotel or office floors in {t.name}.</p>
  return (
    <div className="grid gap-2 px-3 pb-3" data-testid="f2f-use-settings">
      {r.uses.map((u) => (
        <div key={u.use} className="min-w-0">
          <div className="flex items-center justify-between text-meta"><span className="font-semibold text-ink">{LABEL[u.use]}</span><span className="tabular-nums text-muted">{u.mean.toFixed(2)} m now</span></div>
          <F2fActions t={t} use={u.use} mean={u.mean} typical={u.typical} set={(f2f) => updateTower(t.id, { bands: withUseF2f(t.bands, u.use, f2f) })} />
        </div>
      ))}
    </div>
  )
}
