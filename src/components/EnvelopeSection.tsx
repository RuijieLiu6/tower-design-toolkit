// Exact geometry check against the protected views' estimated lower surfaces (after Vista v34 view-envelope.js,
// Ruijie Liu): the proposal's own triangles (parametric towers, stacked blocks, uploaded meshes), the controlling
// point and clearance per view, side by side with the View-cone height check, and the surfaces as OBJ / JSON.
import { Download } from './icons'
import { useMemo } from 'react'
import { envelopeCheck, envelopeJson, envelopeObj, proposalTriangles } from '../engine/viewEnvelope'
import { STATE_LABEL } from '../engine/viewCones'
import { useResults } from '../hooks/useResults'
import { saveFile } from '../lib/download'
import { useImportStore, useMeshEntry } from '../lib/import/store'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { FlagChip, Section } from './ui'

const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d }))
const STATE: Record<string, string> = { no_estimate: 'In cone: no estimate', outside: 'Outside', clear: STATE_LABEL.clear, within_uncertainty: STATE_LABEL.within_uncertainty, above: STATE_LABEL.above }

/** Asks the import store to bring an uploaded tower's mesh back from this browser's storage (it loads lazily). */
function LoadMesh({ id }: { id: string }) { useMeshEntry(id); return null }

export default function EnvelopeSection() {
  const towers = useTowers()
  const ground = useStore((s) => s.groundElevation)
  const meshes = useImportStore((s) => s.meshes)
  const { cones } = useResults()
  const result = useMemo(() => {
    const { tris, notes } = proposalTriangles(towers, ground, CITY_ORIGIN, meshes)
    return envelopeCheck(tris, notes)
  }, [towers, ground, meshes])
  const inCones = result.cones.filter((c) => c.state !== 'outside')
  const c = result.controlling
  // The View-cone height check for the same cone and tower (sampled footprint at the tower top), to show both numbers.
  const sampled = c ? cones.find((k) => k.tower.name === c.tower)?.checks.find((k) => k.cone.id === c.cone.id) : null
  return (
    <Section title="Exact geometry check (triangles)">
      {towers.filter((t) => t.imported).map((t) => <LoadMesh key={t.id} id={t.imported!.meshId} />)}
      <p className="text-meta text-muted">Every triangle of the proposal ({result.triangles.toLocaleString('en-CA')}) against each view's estimated lower surface, clipped to the wedge exactly: the lowest clearance is at a vertex of the clipped part (Vista view-envelope.js).</p>
      {c ? (
        <div className="mt-1.5 rounded-md border border-line p-2 text-meta">
          <div className="flex items-center justify-between"><b>Controlling: view {c.cone.id} · {c.cone.name}</b><span className="text-meta text-muted">{STATE[c.state]}</span></div>
          <div>Clearance <b className={c.clearance! < 0 ? 'text-red-700' : ''}>{c.clearance! >= 0 ? '+' : ''}{fmt(c.clearance)} m</b> at {c.tower} ({c.part}), E {fmt(c.at![0])} N {fmt(c.at![1])}, z {fmt(c.at![2])} m CGVD28; estimated limit there {fmt(c.limit)} m</div>
          {sampled && sampled.exceed !== null && <div className="text-muted">View-cone height check (footprint at the top): {fmt(-sampled.exceed)} m{Math.abs(-sampled.exceed - c.clearance!) < 0.01 ? ' — the same.' : ' — they differ because the check tests the whole footprint at the top, while this follows each block and face.'}</div>}
          <div className="mt-1 flex items-start gap-1.5"><FlagChip flag={c.param?.flag ?? 'unresolved'} /><span className="text-meta text-muted">{c.param?.source}; ±{c.param?.u95} m (95%). An estimate; the City View Cone Assessment governs.</span></div>
        </div>
      ) : <p className="mt-1.5 text-meta text-muted">{inCones.length ? 'The proposal is only in views without an estimate: no clearance is given.' : 'The proposal is outside every protected view.'}</p>}
      {inCones.length > 0 && (
        <div className="mt-1.5 grid gap-0.5 text-meta">
          {inCones.map((k) => (
            <div key={k.cone.id} className="flex justify-between gap-2"><span>{k.cone.id} · {k.cone.name}</span><span className="tabular-nums text-muted">{k.clearance === null ? 'no estimate' : `${k.clearance >= 0 ? '+' : ''}${fmt(k.clearance)} m`} · {k.tested} triangle{k.tested === 1 ? '' : 's'}</span></div>
          ))}
        </div>
      )}
      {result.notes.map((n) => <p key={n} className="mt-1 text-meta text-amber-900">{n}</p>)}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:border-accent" onClick={() => saveFile('view-cone-surfaces.obj', envelopeObj(CITY_ORIGIN))}><Download size={12} />Surfaces OBJ</button>
        <button type="button" className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:border-accent" onClick={() => saveFile('view-envelope.json', envelopeJson(CITY_ORIGIN, result))}><Download size={12} />Check + surfaces JSON</button>
      </div>
      <p className="mt-1 text-meta text-muted">The 8 estimated surfaces (Z = Lv + k·D) over their wedges, in the app's OBJ convention (Y up, local metres; origin E 491300, N 5458600); the JSON also lists the 16 views without an estimate, with their sources and flags.</p>
    </Section>
  )
}
