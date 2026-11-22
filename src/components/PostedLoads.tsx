// Egress › Posted loads (tool cycle 11, 21 Nov 2026): the persons a civic, amenity or sky-lobby floor is designed for,
// on a permanent sign (BCBC 2024 3.1.17.1(1)(c), (2), p.3-104). A number applies at once (Ctrl+Z undoes it); empty
// goes back to the Table load. Below the Table load the floor must be shown to hold fewer people: a code consultant's case.
import type { EgressResult, StoreyLoad } from '../engine/egress'
import type { Tower } from '../engine/types'
import { useStore } from '../store'
import Help from './Help'

const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')
/** Floors a posted load is offered on: unprogrammed or programmed amenity, civic and tenant sky-lobby floors. */
export const postable = (s: StoreyLoad) => !s.podium && !s.publicRoom && (s.use === 'amenity' || s.use === 'civic' || s.skyLobby)

/** postedLoads with `level` set to `persons` (null clears it; an empty record becomes undefined). */
export function withPosted(t: Pick<Tower, 'postedLoads'>, level: number, persons: number | null): Tower['postedLoads'] {
  const next: Record<number, number> = { ...(t.postedLoads as Record<number, number> | undefined) }
  delete next[level]
  delete (next as Record<string, number>)[String(level)]
  if (persons !== null && Number.isFinite(persons) && persons >= 0) next[level] = Math.round(persons)
  return Object.keys(next).length ? next : undefined
}

export default function PostedLoads({ e }: { e: EgressResult & { tower: Tower } }) {
  const updateTower = useStore((s) => s.updateTower)
  const t = e.tower
  const rows = e.storeys.filter(postable)
  if (!rows.length) return null
  const word = (s: StoreyLoad) => (s.skyLobby ? 'sky lobby' : s.use === 'civic' ? 'civic' : 'amenity')
  return (
    <div className="mt-3 grid min-w-0 gap-1.5" data-testid="posted-loads">
      <div className="flex items-center gap-1.5">
        <h4 className="text-meta font-semibold text-ink">Posted loads</h4>
        <Help label="About posted loads">
          <p>A floor can be designed for a number of people and that number posted on a permanent sign (BCBC 2024 3.1.17.1(1)(c), (2), p.3-104). The stairs are then sized for it.</p>
          <p>Below the Table load, the floor must be shown to hold fewer people: a code consultant or fire engineer makes that case. Empty uses the Table load.</p>
        </Help>
      </div>
      <ul className="grid min-w-0 gap-1">
        {rows.map((s) => {
          const table = s.posted ? s.posted.table : s.load
          const below = s.posted && s.posted.persons < s.posted.table - 0.5
          return (
            <li key={s.level} className="flex min-w-0 items-center justify-between gap-2 text-meta" data-level={s.level}>
              <span className="min-w-0 truncate text-ink" title={s.basis}>L{s.level} {word(s)} <span className="text-muted">· table {fmt(table)}</span></span>
              <label className="flex items-center gap-1 text-muted" title={below ? 'Below the Table load: a permanent sign and an accepted case' : undefined}>
                <input type="number" min={0} step={10} value={s.posted ? s.posted.persons : ''} placeholder="table"
                  onChange={(ev) => { const v = ev.target.value === '' ? null : Number(ev.target.value); updateTower(t.id, { postedLoads: withPosted(t, s.level, v) }) }}
                  className={`w-20 rounded border bg-panel px-1 py-0.5 text-right tabular-nums text-ink ${below ? 'border-warning' : 'border-line'}`} aria-label={`L${s.level} ${word(s)}: posted occupant load (people)`} />
                people
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
