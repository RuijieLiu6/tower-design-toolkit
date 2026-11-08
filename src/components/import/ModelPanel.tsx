// Inspector panel of the "Your model" node: the uploaded model (Layer 0 interchange), what each tool reads from it
// through its converter, and where every element came from. Nothing here computes a result of its own.
import { Box, FileUp, Link2, RefreshCw, Trash2, Unlink } from '../icons'
import { useMemo } from 'react'
import { VTC_NORTH_DEG } from '../../context'
import { USES, type UseId } from '../../engine/types'
import { forgetModel } from '../../lib/interchange/apply'
import { checkLinkNow, stopLink, useLiveLink } from '../../lib/interchange/live'
import { toCustomize, toFloorAreas, toNodeTowers, toPresent, toPublicRealm, toShadowCasters, toViewConeInputs } from '../../lib/interchange/converters'
import { ROLE_COLOR, ROLE_LABEL } from '../../lib/interchange/model'
import { useImportStore } from '../../lib/import/store'
import { useStore, useTowers } from '../../store'
import { FlagChip, Section } from '../ui'

export default function ModelPanel() {
  const model = useStore((s) => s.models[s.project])
  const project = useStore((s) => s.project)
  const ground = useStore((s) => s.groundElevation)
  const towers = useTowers()
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  const c = useMemo(() => (model ? {
    nodes: toNodeTowers(model, towers), cones: toViewConeInputs(model, towers, ground), shadow: toShadowCasters(model, towers),
    realm: toPublicRealm(model, towers, north), floors: toFloorAreas(model, towers), present: toPresent(model, towers), canvas: toCustomize(model, towers),
  } : null), [model, towers, ground, north])
  const upload = () => useImportStore.getState().openDialog()
  const live = useLiveLink()

  if (!model || !c) {
    return (
      <Section title="Your model" help="Upload a Rhino .3dm (or OBJ, glTF, IFC), map its layers to roles, and every check here runs on it, with each result traced back to its layer and object.">
        <p className="mb-2 text-meta text-muted">No model uploaded in this project.</p>
        <button onClick={upload} className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-meta font-medium text-white hover:opacity-90"><FileUp size={13} />Upload a Rhino model</button>
      </Section>
    )
  }
  const f = model.frame
  const roles = Object.entries(model.elements.reduce<Record<string, number>>((m, e) => ({ ...m, [e.role]: (m[e.role] ?? 0) + 1 }), {}))
  const removed = model.towers.filter((mt) => !c.nodes.some((t) => t.id === mt.id))
  return (
    <>
      <Section title="Your model" right={<span className="flex items-center gap-2"><button onClick={upload} className="flex items-center gap-1 text-meta text-accent hover:underline"><FileUp size={12} />New version</button><button onClick={forgetModel} title="Take the model out of the project; its towers stay" className="flex items-center gap-1 text-meta text-muted hover:text-red-800"><Trash2 size={12} />Remove</button></span>}>
        <div className="flex items-start gap-2 text-xs">
          <Box size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0">
            <div className="truncate font-medium">{model.source.fileName}</div>
            <div className="text-meta text-muted">{model.source.format.toUpperCase()}{model.source.fileSize != null ? ` · ${(model.source.fileSize / 1024).toFixed(0)} KB` : ''} · mapped by {model.mapping.by === 'userString' ? `user string "${model.mapping.key}"` : model.mapping.by === 'name' ? 'object name' : 'layer'} · {model.elements.length} elements · read in this browser</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {roles.map(([r, n]) => <span key={r} className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10.5px]"><span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: ROLE_COLOR[r as keyof typeof ROLE_COLOR] }} />{ROLE_LABEL[r as keyof typeof ROLE_LABEL]} {n}</span>)}
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-meta">
          <dt className="text-muted">Units</dt><dd>{f.fileUnit} → metres ({f.unitSource === 'file' ? 'from the file' : f.unitSource === 'confirmed' ? 'confirmed by you' : 'chosen'})</dd><FlagChip flag={f.unitSource === 'file' ? 'unverified' : 'team_assumption'} />
          <dt className="text-muted">North</dt><dd>{f.north.label}{f.north.fileNorthDeg != null ? ` (${f.north.fileNorthDeg}° from file +Y)` : ''}</dd><FlagChip flag={f.north.flag} />
          <dt className="text-muted">Zero level</dt><dd>{f.datum.label}{f.datum.shift ? ` (${f.datum.shift} m subtracted)` : ''}</dd><FlagChip flag={f.datum.flag} />
        </dl>
        {live.status !== 'off' && (
          <div className={`mt-2 rounded-md border px-2 py-1.5 text-meta ${live.status === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-accent/30 bg-accent/5'}`} role="status">
            <div className="flex items-center gap-1.5"><Link2 size={12} className="shrink-0 text-accent" aria-hidden /><b className="truncate">Linked to {live.name}</b>
              <button onClick={() => void checkLinkNow()} className="ml-auto flex items-center gap-1 text-accent hover:underline"><RefreshCw size={11} />Check now</button>
              <button onClick={stopLink} className="flex items-center gap-1 text-muted hover:text-ink"><Unlink size={11} />Unlink</button>
            </div>
            <p className="mt-0.5 text-muted">{live.status === 'reading' ? 'Reading the new save…' : live.message} Checked every 2 s while this tab is open; the link ends when the tab closes.</p>
          </div>
        )}
        {removed.length > 0 && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-meta text-amber-900">{removed.map((t) => t.name).join(', ')} {removed.length === 1 ? 'was' : 'were'} removed from the project after upload; the checks below leave {removed.length === 1 ? 'it' : 'them'} out.</p>}
      </Section>

      <Section title="What each tool reads from it">
        <ul className="grid gap-1.5 text-meta">
          <Line tool="Evaluation nodes" what={c.nodes.map((t) => `${t.name}: ${t.floors.length} floors, ${Math.round(t.gfa).toLocaleString('en-CA')} m², core ${(t.core.share * 100).toFixed(1)}% (${t.core.source.split(' (')[0].toLowerCase()})`).join(' · ') || 'no tower left'} />
          <Line tool="View cones and height surface" what={c.cones.map((v) => `${v.name}: top ${v.topZ.toFixed(1)} m${project === 'city' ? ' CGVD28' : ' above grade'}, outline of the whole mass`).join(' · ')} />
          <Line tool="Solar access and sun hours" what={`${c.shadow.proposal.prisms.length} storey prisms cast the proposal's shadow; ${c.shadow.note}`} />
          <Line tool="Public realm" what={c.realm.site ? `Lot line ${Math.round(c.realm.site.area).toLocaleString('en-CA')} m², ${c.realm.edges.length} edges; podium setbacks ${c.realm.edges.map((e) => `${e.facing} ${e.podiumSetback ?? '–'} m`).join(', ')}${project === 'vtc' ? ' (the competition checks keep the brief\'s site; compare)' : ''}` : 'No site boundary mapped'} flag={c.realm.site?.flag} />
          <Line tool="Lifts, egress and interior" what={c.floors.map((t) => `${t.name}: ${t.fromModel} of ${t.floors.length} floors take their use from your program or podium volumes`).join(' · ')} />
          <Line tool="Drawings, boards and captures" what={`Caption "${c.present.caption}"; ${c.present.lines.length} evidence lines for a board`} />
          <Line tool="Customize canvas" what={`Node "Your model": ${c.canvas.headline}`} />
          <Line tool="Export (.3dm, OBJ, glTF)" what="Each storey, crown, core, site curve and context prism carries role, use, level, element id and provenance; upload the export to get the same model back" />
        </ul>
      </Section>

      {c.floors.length > 0 && (
        <Section title="Floor area by use (from the model)">
          <table className="w-full text-meta tabular-nums">
            <thead className="text-left text-muted"><tr><th className="font-medium">Use</th>{c.floors.map((t) => <th key={t.towerId} className="text-right font-medium">{t.name}</th>)}</tr></thead>
            <tbody>
              {(Object.keys(USES) as UseId[]).filter((u) => c.floors.some((t) => t.byUse[u])).map((u) => (
                <tr key={u} className="border-t border-line"><td className="py-0.5"><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: USES[u].color }} />{USES[u].label}</td>{c.floors.map((t) => <td key={t.towerId} className="text-right">{t.byUse[u] ? `${Math.round(t.byUse[u]!).toLocaleString('en-CA')} m²` : '–'}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={`Elements and provenance (${model.elements.length})`}>
        <details className="text-meta">
          <summary className="cursor-pointer text-muted hover:text-ink">Every element, with its file, layer, Rhino object id and flag</summary>
          <ul className="mt-1.5 grid max-h-72 gap-1 overflow-y-auto">
            {model.elements.map((e) => (
              <li key={e.id} className="rounded border border-line p-1.5">
                <div className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: ROLE_COLOR[e.role] }} /><b className="truncate">{e.name}</b><span className="text-muted">{ROLE_LABEL[e.role]}{e.tags.use ? ` · ${USES[e.tags.use].label}` : ''}</span><span className="ml-auto"><FlagChip flag={e.provenance.evidence} /></span></div>
                <div className="mt-0.5 break-all font-mono text-meta text-muted">{e.id} · {e.provenance.layer}{e.provenance.objectId ? ` · ${e.provenance.objectId}` : ''}{e.provenance.block ? ` · block ${e.provenance.block}` : ''}</div>
                <div className="text-meta text-muted">{e.provenance.geometrySource}; {e.provenance.mappedBy}{e.provenance.userStrings ? ` · ${Object.entries(e.provenance.userStrings).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}</div>
              </li>
            ))}
          </ul>
        </details>
        {model.ignored.length > 0 && (
          <details className="mt-2 text-meta">
            <summary className="cursor-pointer text-muted hover:text-ink">{model.ignored.length} item{model.ignored.length === 1 ? '' : 's'} left out, and why</summary>
            <ul className="mt-1 grid max-h-40 gap-1 overflow-y-auto">{model.ignored.map((s, i) => <li key={i}><b>{s.name}</b> <span className="text-muted">({s.kind}{s.layer ? `, ${s.layer}` : ''})</span>: {s.reason}</li>)}</ul>
          </details>
        )}
      </Section>
    </>
  )
}

function Line({ tool, what, flag }: { tool: string; what: string; flag?: Parameters<typeof FlagChip>[0]['flag'] }) {
  return (
    <li className="grid grid-cols-[8.5rem_1fr] gap-2">
      <span className="font-medium">{tool}</span>
      <span className="text-muted">{what}{flag && <span className="ml-1 inline-block align-middle"><FlagChip flag={flag} /></span>}</span>
    </li>
  )
}
