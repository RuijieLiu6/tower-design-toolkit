// "Below grade" on the Form step (Ruijie, 6 Nov: "consider the traffic and basement experience … assume a safe and thick
// ground height and assume that users will need to dig on the ground to bring in basement levels"). Dig basement levels
// under the selected tower's podium or tower, see them through the ground, and read what they give (parking) and need
// (depth, a ramp that fits). engine/basement.ts holds the numbers; components/BelowGrade.tsx draws them.
import { useShallow } from 'zustand/react/shallow'
import { CircleAlert, CircleCheck, Eye, EyeOff, Layers2, Trash2 } from '../icons'
import { basementDepth, basementSummary, DEFAULT_BASEMENT, groundThickness, MAX_BASEMENT_LEVELS, type Basement } from '../../engine/basement'
import type { Tower } from '../../engine/types'
import { useMobilityStore } from '../../lib/mobilityStore'
import { useStore, useTowers } from '../../store'
import { useDig } from '../BelowGrade'
import { guideSite } from '../../lib/import/placeModel'
import Help from '../Help'
import { FlagChip, NumberField } from '../ui'

const btn = 'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent'
const fmt = (v: number, d = 0) => v.toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })

/** The dig view looks at the tower's base from low down, so the levels under the ground read. */
export function lookBelow(t: Tower) {
  const s = useStore.getState(), base = s.project === 'city' ? s.groundElevation : 0, depth = basementDepth(t)
  const span = Math.max(80, Math.max(t.podiumWidth, t.podiumDepth, t.width, t.depth) * 1.6)
  s.set({ cameraRequest: { position: [t.x - span * 0.9, t.y - span * 1.2, base + span * 0.45], target: [t.x, t.y, base - depth / 2], fov: 40 } })
}

export default function BasementTool() {
  const towers = useTowers()
  const { selected, updateTower } = useStore(useShallow((s) => ({ selected: s.selectedTower, updateTower: s.updateTower })))
  const dig = useDig((s) => s.dig)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  if (!t) return null
  const b = t.basement
  // An edit here makes the basement the person's own (no longer the uploaded model's).
  const set = (patch: Partial<Basement>) => updateTower(t.id, { basement: { ...(b ?? DEFAULT_BASEMENT), ...patch, from: undefined } })
  const site = guideSite()
  const extent = (v: Basement['extent']) => set(v === 'site' && site ? { extent: v, ring: site.ring } : { extent: v })
  const sum = basementSummary(t)
  const thick = groundThickness(towers)
  return (
    <div className="grid gap-2.5 px-4 py-3 text-xs" data-testid="basement-tool">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <span>Editing <b className="text-ink">{t.name}</b> · ground {fmt(thick)} m thick</span>
        <Help label="About Below grade">
          Basement levels are dug into a ground that is always thick enough to hold them: at least 30 m, and 10 m deeper than the deepest basement. They never count as floor area above grade. The parking estimate, the ramp and the ground thickness are team assumptions (ramp after Sinnie Choi's Downtown Massing Tool); a parking or structural consultant settles them. Turn on the dig view to see the levels through the ground; on the competition block the ramp starts at the parking node's ramp pin.
        </Help>
      </p>
      {!b || b.levels <= 0 ? (
        <button type="button" data-testid="basement-add" onClick={() => set({ levels: DEFAULT_BASEMENT.levels })} className={`${btn} border-accent bg-accent text-white hover:bg-accent/90`}>
          <Layers2 size={14} />Dig a basement
        </button>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Levels" value={b.levels} onChange={(v) => set({ levels: Math.max(0, Math.min(MAX_BASEMENT_LEVELS, Math.round(v))) })} min={0} max={MAX_BASEMENT_LEVELS} step={1} />
            <NumberField label="Floor-to-floor" value={b.f2f} onChange={(v) => set({ f2f: Math.max(2.6, Math.min(6, v)) })} step={0.1} unit="m" />
          </div>
          <label className="flex items-center justify-between gap-2"><span className="text-muted">Use</span>
            <select value={b.use} onChange={(e) => set({ use: e.target.value as Basement['use'] })} className="rounded border border-line bg-panel px-1.5 py-1">
              <option value="parking">Parking and loading</option>
              <option value="mixed">Mixed: parking, storage, plant</option>
            </select></label>
          <label className="flex items-center justify-between gap-2"><span className="text-muted">Dug under</span>
            <select value={b.extent} onChange={(e) => extent(e.target.value as Basement['extent'])} className="rounded border border-line bg-panel px-1.5 py-1">
              <option value="podium">The podium</option>
              <option value="tower">The tower only</option>
              {(site || b.extent === 'site') && <option value="site">The whole site</option>}
            </select></label>
          <div role="group" aria-label="Basement actions" className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => { useDig.setState({ dig: !dig }); if (!dig) lookBelow(t) }} aria-pressed={dig} data-testid="basement-dig"
              className={`${btn} ${dig ? 'border-accent bg-accent text-white' : 'border-line text-ink hover:border-accent'}`}>{dig ? <EyeOff size={14} /> : <Eye size={14} className="text-accent" />}{dig ? 'Hide dig' : 'Dig view'}</button>
            <button type="button" onClick={() => updateTower(t.id, { basement: { ...b, levels: 0 } })} className={`${btn} border-line text-ink hover:border-red-400 hover:text-red-700`}><Trash2 size={14} className="text-red-700" />Remove</button>
          </div>
          {sum && (
            <section aria-label="Basement results" className="grid gap-1 rounded-md border border-line p-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                <span><b className="text-ink">{fmt(sum.depth, 1)} m</b> deep</span><span><b className="text-ink">{fmt(sum.area)}</b> m² in {sum.levels} level{sum.levels === 1 ? '' : 's'}</span>
                <span>≈ <b className="text-ink">{fmt(sum.stalls)}</b> stalls</span><span>ramp <b className="text-ink">{fmt(sum.rampLength, 1)} m</b></span>
              </div>
              {sum.rules.filter((r) => r.state !== 'pass').map((r) => (
                <p key={r.id} className="flex items-start gap-1.5 text-amber-900"><CircleAlert size={14} className="mt-px shrink-0" />{r.label}: {r.note}</p>
              ))}
              {sum.rules.every((r) => r.state === 'pass') && <p className="flex items-center gap-1.5 text-emerald-800"><CircleCheck size={14} />Fits: ground deep enough, the ramp fits along the dig.</p>}
              <div className="flex flex-wrap items-center gap-1.5"><FlagChip flag="team_assumption" />
                <button type="button" onClick={() => useMobilityStore.getState().set({ carStalls: sum.stalls })} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:border-accent" title="Fill Parking, loading & bikes with this number">Use {fmt(sum.stalls)} as stalls provided</button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
