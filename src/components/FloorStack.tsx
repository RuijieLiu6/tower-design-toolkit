// Floors and programme (Sinnie, 13 Nov, with a picture of the stack she wanted): the picked tower as a section of
// floors, L1 at the bottom, the core down the middle, each run of one use named at its side with its levels, floor
// count and area. A click picks a floor (Shift: a range, Ctrl / Cmd: add or remove), as in the model; From / to picks
// by number; the programme picker gives the picked floors their use (Tower.floorUses, lib/floorPick.ts).
import { useMemo, type MouseEvent } from 'react'
import { towerFloors } from '../engine/massing'
import { USES, type Tower, type UseId } from '../engine/types'
import { floorRuns, pickFloor, pickLevels, resetFloorUses, setPickedUse, useFloorPick } from '../lib/floorPick'

// Picked floors in ink, a colour no use wears (the selection blue is too near Office's).
const ACCENT = '#1f2937'

export default function FloorStack({ t }: { t: Tower }) {
  const floors = useMemo(() => towerFloors(t).filter((f) => f.z1 > 0), [t])
  const runs = useMemo(() => floorRuns(floors), [floors])
  const pick = useFloorPick()
  const levels = pick.tower === t.id ? pick.levels : []
  const sel = new Set(levels)
  const n = floors.length
  if (!n) return null
  const row = Math.max(5, Math.min(16, Math.floor(300 / n)))
  const every = row >= 12 ? 1 : row >= 8 ? 2 : 5
  const H = row * n
  const core = Math.round(Math.sqrt(Math.max(0, Math.min(0.6, t.coreShare))) * 100)
  const yOf = (level: number) => H - (floors.findIndex((f) => f.level === level) + 1) * row
  const click = (level: number) => (e: MouseEvent) => pickFloor(t.id, level, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'one')
  const pickedUses = [...new Set(floors.filter((f) => sel.has(f.level)).map((f) => f.use))]
  const own = Object.keys(t.floorUses ?? {}).length
  const lo = levels.length ? levels[0] : '', hi = levels.length ? levels[levels.length - 1] : ''
  const setRange = (a: number, b: number) => { const max = floors[floors.length - 1].level; const c = (v: number) => Math.max(1, Math.min(max, Math.round(v || 1))); pickLevels(t.id, c(a), c(b)) }

  return (
    <div className="grid gap-2" data-testid="floor-stack">
      <div className="relative rounded-lg border border-line bg-subtle/60 px-2 py-3" style={{ height: H + 24 }}>
        <div className="absolute left-2 top-3" style={{ height: H, width: 'calc(100% - 1rem)' }}>
          {floors.map((f) => {
            const y = yOf(f.level), on = sel.has(f.level), mine = t.floorUses?.[f.level] !== undefined
            return (
              <div key={f.level} className="absolute left-0 flex w-full items-center" style={{ top: y, height: row }}>
                <span className="w-8 shrink-0 pr-1 text-right font-mono text-[10px] leading-none text-muted" aria-hidden>{f.level % every === 0 || f.level === 1 || f.level === floors[floors.length - 1].level ? `L${f.level}` : ''}</span>
                <button type="button" data-floor={f.level} aria-pressed={on} onClick={click(f.level)}
                  aria-label={`Level ${f.level}: ${USES[f.use].label}${mine ? ' (set floor by floor)' : ''}`} title={`L${f.level} · ${USES[f.use].label} · ${Math.round(f.area).toLocaleString()} m²${mine ? ' · set floor by floor' : ''}`}
                  className="relative h-full w-[45%] border-b border-white/70 outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent"
                  style={{ background: on ? ACCENT : USES[f.use].color, opacity: on ? 1 : 0.85 }}>
                  {/* the core down the middle */}
                  <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-slate-500/45" style={{ width: `${core}%` }} aria-hidden />
                  {mine && <span className="absolute right-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white ring-1 ring-black/30" aria-hidden />}
                </button>
              </div>
            )
          })}
          {/* each run of one use, named at its side */}
          {runs.map((r) => {
            const yTop = yOf(r.to), yBot = yOf(r.from) + row
            const mid = (yTop + yBot) / 2
            return (
              <div key={`${r.from}-${r.use}`} className="pointer-events-none absolute left-[calc(2rem+45%+0.5rem)] right-0 -translate-y-1/2 font-mono text-[10px] leading-tight" style={{ top: mid }} aria-hidden>
                {(yBot - yTop >= 18 || runs.length <= 6) && <>
                  <div className="font-semibold text-ink">{USES[r.use].label.replace(/ \/.*$/, '')}</div>
                  <div className="text-muted">{r.from === r.to ? `L${r.from}` : `L${r.from}–${r.to}`} · {r.count} fl · {Math.round(r.area).toLocaleString()} m²</div>
                </>}
              </div>
            )
          })}
          <div className="absolute -bottom-px left-8 h-px w-[calc(45%+1rem)] bg-ink" aria-hidden />
        </div>
      </div>

      <div className="flex items-center gap-2 text-control">
        <label className="text-muted" htmlFor="floor-from">From</label>
        <input id="floor-from" type="number" min={1} value={lo} onChange={(e) => setRange(Number(e.target.value), Number(hi || e.target.value))} className="h-8 w-16 rounded-lg border border-line bg-panel px-2 tabular-nums" />
        <label className="text-muted" htmlFor="floor-to">to</label>
        <input id="floor-to" type="number" min={1} value={hi} onChange={(e) => setRange(Number(lo || e.target.value), Number(e.target.value))} className="h-8 w-16 rounded-lg border border-line bg-panel px-2 tabular-nums" />
      </div>
      <p className="text-meta text-muted">Click a floor in the stack or on the tower in the model. Shift-click to extend the range, Ctrl-click to add or remove one.</p>
      <label className="grid gap-1 text-control">
        <span className="text-muted">Programme of {levels.length > 1 ? `these ${levels.length} floors` : 'this floor'}</span>
        <select data-testid="floor-use" disabled={!levels.length} value={pickedUses.length === 1 ? pickedUses[0] : ''} onChange={(e) => e.target.value && setPickedUse(e.target.value as UseId)}
          className="h-9 rounded-lg border border-line bg-panel px-2 disabled:opacity-50">
          <option value="">{levels.length ? 'Mixed — choose a use' : 'Pick floors first'}</option>
          {(Object.keys(USES) as UseId[]).map((u) => <option key={u} value={u}>{USES[u].label}</option>)}
        </select>
      </label>
      {own > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-meta text-muted">
          <span>{own} floor{own === 1 ? '' : 's'} set one by one (white dot); the bands decide the rest.</span>
          {levels.some((l) => t.floorUses?.[l] !== undefined) && <button type="button" onClick={() => resetFloorUses()} className="h-7 rounded-lg border border-line bg-panel px-2 text-control text-ink">Picked back to bands</button>}
          <button type="button" onClick={() => resetFloorUses(true)} className="h-7 rounded-lg border border-line bg-panel px-2 text-control text-ink">All back to bands</button>
        </div>
      )}
    </div>
  )
}
