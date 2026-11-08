// Results & evidence for an imported community node: live results with their flags, editable parameters, false
// assumptions kept visible, and the package itself (download, remove).
import { FileDown, OctagonX, RotateCcw, ShieldQuestionMark, Trash } from './icons'
import { useState } from 'react'
import { CATEGORIES, JURY_LABEL } from '../data/registry'
import { FLAG_ICONS } from '../data/icons'
import { useCommunityResults } from '../hooks/useCommunityResults'
import { useCommunityStore } from '../lib/communityStore'
import { saveFile } from '../lib/download'
import { STAGE_LABEL, paramValues, type CommunityResult, type NodePackage } from '../lib/nodePackages'
import { useStore } from '../store'
import { FlagChip, NumberField, Section, StateChip, Toggle } from './ui'
import CodeNodeGate from './CodeNodeGate'
import { U } from './Units'
import { useShallow } from 'zustand/react/shallow'
import Help from './Help'
import { NodeTile } from './NodeTile'
import { NodeArtwork } from './nodeIcons/NodeArtwork'
import { packageIconOf, useNodeIcons } from '../lib/nodeIcons/store'

/** State chip, or "Info" for a value the node shows on purpose with no good or bad. */
export function ResultChip({ r }: { r: CommunityResult }) {
  return r.info ? <span className="inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 text-meta font-semibold text-slate-600" title="Shown for information; no good or bad on purpose">Info</span> : <StateChip state={r.state} />
}

function ResultCard({ r }: { r: CommunityResult }) {
  const ClaimIcon = FLAG_ICONS.verified
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><ResultChip r={r} /></div>
      <div className="mt-0.5 text-meta"><b className="tabular-nums"><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-meta text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <FlagChip flag={r.flag} />
        {r.claimed === 'verified' && <span className="inline-flex items-center gap-0.5 text-meta text-muted" title="Flag set by the node's author; a reviewer hasn't opened the source yet"><ClaimIcon size={11} />author: verified</span>}
        {r.source.url
          ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-meta text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

function Parameters({ p }: { p: NodePackage }) {
  const overrides = useCommunityStore((s) => s.params[p.id]) ?? {}
  const setParam = useCommunityStore((s) => s.setParam)
  const values = paramValues(p, overrides)
  const changed = Object.keys(overrides).length > 0
  return (
    <Section title="Parameters" right={changed ? <button onClick={() => p.parameters!.forEach((x) => setParam(p.id, x.id, null))} className="flex items-center gap-1 text-meta text-accent hover:underline"><RotateCcw size={11} />Defaults</button> : undefined}>
      <div className="grid gap-3">
        {p.parameters!.map((x) => (
          <div key={x.id}>
            <NumberField label={x.label} value={values[x.id]} unit={x.unit} step={x.step ?? 1} min={x.min} max={x.max} hint={x.note}
              onChange={(v) => setParam(p.id, x.id, Number.isFinite(v) && v !== x.default ? v : null)} />
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <FlagChip flag={overrides[x.id] !== undefined ? 'team_assumption' : x.flag === 'verified' ? 'unverified' : x.flag} />
              <span className="text-meta text-muted">{overrides[x.id] !== undefined ? `Your value (default ${x.default} ${x.unit}: ${x.source.label})` : `${x.source.label}${x.source.page ? `, ${x.source.page}` : ''}`}</span>
            </div>
            {x.note && <div className="mt-0.5 text-meta text-muted"><U>{x.note}</U></div>}
          </div>
        ))}
      </div>
    </Section>
  )
}

export default function CommunityInspector({ id }: { id: string }) {
  const p = useCommunityStore((s) => s.packages.find((x) => x.id === id))
  const removePackage = useCommunityStore((s) => s.removePackage)
  const { enabled, toggleNode, project } = useStore(useShallow((s) => ({ enabled: s.enabled, toggleNode: s.toggleNode, project: s.project })))
  const run = useCommunityResults().get(id)
  const [confirmRemove, setConfirmRemove] = useState(false)
  if (!p) return <div className="p-4 text-xs text-muted">This node is no longer in My nodes. Select another node in the library.</div>

  const cat = CATEGORIES[p.category]
  const results = run?.results ?? []
  const towerNames = [...new Set(results.filter((r) => r.per === 'tower').map((r) => r.towerName!))]
  const projectResults = results.filter((r) => r.per === 'project')
  const editIcon = useCommunityStore((s) => s.editIcon)
  const icon = useNodeIcons((s) => s.icons[p.id])
  // The shared file carries the icon too (a brief, or the fitted 256 px image), so whoever imports it sees the same node.
  const download = () => {
    const out = icon ? { ...p, icon: packageIconOf(icon) } : p
    saveFile(`${p.id.split('.').pop()}.json`, JSON.stringify(out, null, 2) + '\n')
  }

  return (
    <div>
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-meta text-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cat.color }} />{cat.label} · {STAGE_LABEL[p.stage]} · community
        </div>
        <div className="mt-1.5 flex items-center gap-2.5">
          {/* The icon is artwork only; changing it never changes what the node does (Icons tab of the node builder). */}
          <button type="button" onClick={() => editIcon(p.id)} title={icon ? 'Change the icon' : 'Give it an icon'} aria-label={`${icon ? 'Change the icon of' : 'Give an icon to'} ${p.name}`}
            className="node-hit shrink-0 rounded-xl outline-none" data-testid="inspector-icon">
            <NodeTile id={p.id} size={44} art={<NodeArtwork id={p.id} size={40} category={p.category} />} />
          </button>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">{p.name}<Help label={`About ${p.name}`}>{p.question}</Help></h2>
        </div>
        {!!p.jury?.length && <div className="mt-1.5 flex flex-wrap gap-1">{p.jury.map((j) => <span key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-meta text-slate-600">{JURY_LABEL[j] ?? j}</span>)}</div>}
        <div className="mt-2 flex items-start gap-1.5 rounded bg-black/[0.03] px-2 py-1.5 text-meta text-slate-700">
          <ShieldQuestionMark size={14} className="mt-px shrink-0 text-muted" />
          <span><b>Community node, unverified until reviewed.</b> By {p.author.name} · v{p.version} · {p.licence}. Its flags are the author's; an author's "verified" shows as unverified until a reviewer opens the source.</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-meta text-muted"><Toggle checked={!!enabled[p.id]} onChange={() => toggleNode(p.id)} label={`Use ${p.name}`} />{enabled[p.id] ? 'On: results update as you design' : 'Off: turn it on to see live results'}</div>
        {run && !run.applies && <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-meta text-slate-700">Runs in the {p.projects?.includes('city') ? '"Real Vancouver"' : '"Competition site"'} project.</div>}
        {run?.error && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-meta text-red-800">Could not run: {run.error}. Re-import the package.</div>}
      </div>

      {p.code && <CodeNodeGate p={p} />}

      {enabled[p.id] && run?.applies && (
        <>
          {towerNames.map((name) => (
            <Section key={name} title={`Results: ${name}`}>
              <div className="grid gap-2">{results.filter((r) => r.towerName === name).map((r) => <ResultCard key={r.id} r={r} />)}</div>
            </Section>
          ))}
          {projectResults.length > 0 && (
            <Section title="Results: whole design"><div className="grid gap-2">{projectResults.map((r) => <ResultCard key={r.id} r={r} />)}</div></Section>
          )}
        </>
      )}

      {!!p.parameters?.length && <Parameters p={p} />}

      {!!p.falseAssumptions?.length && (
        <Section title="False assumptions kept visible">
          <div className="grid gap-2">
            {p.falseAssumptions.map((f, i) => (
              <div key={i} className="rounded-md border border-flag-false/40 bg-flag-false/[0.04] p-2 text-meta">
                <div className="flex items-start gap-1.5 font-medium text-flag-false"><OctagonX size={13} className="mt-px shrink-0" /><span className="line-through decoration-1">{f.claim}</span></div>
                <div className="mt-1 text-slate-800">{f.correction}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag="false_assumption" />
                  {f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{f.source.label}{f.source.page ? `, ${f.source.page}` : ''}</a>
                    : <span className="text-meta text-muted">{f.source.label}{f.source.page ? `, ${f.source.page}` : ''}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="What stays with people"><p className="text-xs text-slate-700">{p.human}</p></Section>
      <Section title="Method"><p className="text-xs leading-relaxed text-slate-700">{p.method}</p></Section>
      <Section title="Limits"><p className="text-xs text-slate-700">{p.limits}</p></Section>
      <Section title="Reads from the design">
        <div className="flex flex-wrap gap-1">{p.inputs.map((x) => <code key={x} className="rounded bg-slate-100 px-1.5 py-0.5 text-meta text-slate-700">{x}</code>)}</div>
        <details className="mt-2">
          <summary className="cursor-pointer text-meta text-muted hover:text-ink">Formulas</summary>
          <div className="mt-1 grid gap-1">{p.metrics.map((m) => <div key={m.id} className="text-meta"><span className="text-muted">{m.label}:</span> <code className="text-slate-700">{m.expression}</code></div>)}</div>
        </details>
      </Section>
      <Section title="Package">
        <div className="font-mono text-meta text-muted">{p.id}</div>
        {p.createdWith && <div className="mt-0.5 text-meta text-muted">Created with: {p.createdWith}</div>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={download} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-meta hover:border-accent hover:text-accent"><FileDown size={12} />Download .json</button>
          <button onClick={() => (confirmRemove ? removePackage(p.id) : setConfirmRemove(true))} onBlur={() => setConfirmRemove(false)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-meta ${confirmRemove ? 'border-red-300 bg-red-50 text-red-800' : 'border-line hover:border-red-300 hover:text-red-800'}`}>
            <Trash size={12} />{confirmRemove ? 'Click again to remove' : 'Remove from My nodes'}
          </button>
        </div>
        <p className="mt-2 text-meta text-muted">Stored in this browser only. Share it by sending the .json file; a shared registry with review and comments is coming.</p>
      </Section>
    </div>
  )
}
