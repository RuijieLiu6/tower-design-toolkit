// Egress › Stair doors (node placement, 21 Nov 2026): the face of the core each core stair's door opens on
// (`Tower.stairDoorFaces`, P1 #11), and the exit separation along the smoke path beside the straight line, which stays
// the line of record. A pick applies at once and Ctrl+Z takes it back (store.updateTower); no confirm.
import { DEFAULT_DOOR_FACES, doorFacesOf, withDoorFace, type EgressResult } from '../engine/egress'
import type { CoreFace, Tower } from '../engine/types'
import { useStore } from '../store'
import Help from './Help'

const FACES: { id: CoreFace; word: string }[] = [{ id: 'n', word: 'N' }, { id: 'e', word: 'E' }, { id: 's', word: 'S' }, { id: 'w', word: 'W' }]
const FACE_NAME: Record<CoreFace, string> = { n: 'north', e: 'east', s: 'south', w: 'west' }

/** Core stairs of a result, in stair order (the k-th core stair takes the k-th door face). */
export const coreStairCount = (e: Pick<EgressResult, 'spots'>) => e.spots.filter((s) => s.inCore).length

export default function EgressDoors({ e }: { e: EgressResult & { tower: Tower } }) {
  const updateTower = useStore((s) => s.updateTower)
  const t = e.tower
  const n = coreStairCount(e)
  const faces = doorFacesOf(t, n)
  const sep = e.separation, smoke = e.smoke.d, need = e.separationNeeded
  return (
    <div className="mt-3 grid min-w-0 gap-2" data-testid="egress-doors">
      <div className="flex items-center gap-1.5">
        <h4 className="text-meta font-semibold text-ink">Stair doors</h4>
        <Help label="About stair doors">
          <p>The face of the core each core stair's door opens on. BCBC 2024 3.4.2.3(3) measures exit separation along the shortest path smoke would travel; round a fire-separated core, doors on opposite faces are farthest apart, on adjacent faces about half, on the same face about nothing.</p>
          <p>The smoke-path reading is a code-consultant reading (unverified). The straight line stays the check of record until a code consultant accepts it.</p>
        </Help>
      </div>
      {n === 0
        ? <p className="text-meta text-muted">No stair in the core: the exits are at the plate edge, read at their centres.</p>
        : <ul className="grid min-w-0 gap-1">
          {faces.map((f, k) => (
            <li key={k} className="flex min-w-0 items-center justify-between gap-2 text-meta">
              <span className="text-ink">Core stair {k + 1}</span>
              <span role="radiogroup" aria-label={`Core stair ${k + 1}: door face`} className="inline-flex rounded-lg bg-subtle p-0.5">
                {FACES.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={f === x.id} data-face={x.id}
                    title={`Door on the ${FACE_NAME[x.id]} face of the core${DEFAULT_DOOR_FACES[k % 4] === x.id ? ' (default)' : ''}`}
                    onClick={() => { if (f !== x.id) updateTower(t.id, { stairDoorFaces: withDoorFace(t, n, k, x.id) }) }}
                    className={`h-6 min-w-[1.75rem] rounded-md px-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${f === x.id ? 'bg-selected text-accent-hover' : 'text-muted hover:text-ink'}`}>{x.word}</button>
                ))}
              </span>
            </li>
          ))}
        </ul>}
      <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-meta" data-testid="egress-separations">
        <dt className="text-ink" title="Straight line between the two farthest exits: the line of record">Straight line (of record)</dt>
        <dd className="text-right font-semibold tabular-nums text-ink">{sep.toFixed(1)} m</dd>
        <dt className="text-muted" title="Door to door round the fire-separated core: a code-consultant reading, unverified">Smoke path (consultant reading)</dt>
        <dd className="text-right tabular-nums text-muted">{smoke.toFixed(1)} m</dd>
        <dt className="text-muted">Needed</dt>
        <dd className="text-right tabular-nums text-muted">≥ {need.toFixed(1)} m</dd>
      </dl>
    </div>
  )
}
