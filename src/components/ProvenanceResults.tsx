// AI use and provenance log (research P07-M07): who or what made each board element, what a person decided, the IPTC
// term for images, and a board appendix with AI use, sources and module licences only (no people).
import { Check, Copy, Plus, Trash2 } from './icons'
import { useMemo, useState } from 'react'
import { boardAppendix, DECIDER_LABEL, IPTC, IPTC_BASE, MODULES, provenanceIssues, type Decider, type ElementKind, type Involvement } from '../engine/provenance'
import { useCultureStore } from '../lib/cultureStore'
import { FlagChip, Section } from './ui'

export function useProvenanceIssues() {
  const prov = useCultureStore((s) => s.prov)
  return useMemo(() => ({ prov, issues: provenanceIssues(prov) }), [prov])
}

export default function ProvenanceResults() {
  const { addProv, updateProv, removeProv } = useCultureStore()
  const { prov, issues } = useProvenanceIssues()
  const appendix = useMemo(() => boardAppendix(prov, MODULES), [prov])
  const [copied, setCopied] = useState(false)
  return (
    <>
      <Section title="Elements" right={<button onClick={addProv} className="flex items-center gap-1 text-meta text-accent hover:underline"><Plus size={12} />Add element</button>}>
        {!prov.length && <p className="text-meta text-muted">List each board image, drawing and text block, and how it was made. Kept in this browser; names and reviewers never reach an export.</p>}
        <div className="grid gap-2">
          {prov.map((e) => {
            const lvl = IPTC[e.involvement]
            const mine = issues.filter((i) => i.entry === e.id)
            return (
              <div key={e.id} className={`rounded-md border p-2 text-meta ${mine.length ? 'border-amber-300' : 'border-line'}`}>
                <div className="flex items-center gap-1.5">
                  <input value={e.element} onChange={(x) => updateProv(e.id, { element: x.target.value })} placeholder="Element, e.g. Board 2 hero render" className="min-w-0 flex-1 rounded border border-line bg-panel px-1.5 py-0.5 font-medium" aria-label="Element" />
                  <select value={e.kind} onChange={(x) => updateProv(e.id, { kind: x.target.value as ElementKind })} className="rounded border border-line bg-panel px-1 py-0.5" aria-label="Kind">
                    {(['image', 'drawing', 'text', 'result'] as ElementKind[]).map((k) => <option key={k}>{k}</option>)}
                  </select>
                  <button onClick={() => removeProv(e.id)} aria-label="Remove element" className="text-muted hover:text-red-700"><Trash2 size={12} /></button>
                </div>
                <label className="mt-1.5 grid gap-0.5"><span className="text-muted">How it was made</span>
                  <select value={e.involvement} onChange={(x) => updateProv(e.id, { involvement: x.target.value as Involvement })} className="rounded border border-line bg-panel px-1 py-0.5">
                    {(Object.keys(IPTC) as Involvement[]).map((k) => <option key={k} value={k}>{IPTC[k].label}</option>)}
                  </select>
                </label>
                {e.kind === 'image' && <div className="mt-0.5 text-meta text-muted">Label: <b className="text-ink">{lvl.visible}</b> · IPTC <a className="text-accent hover:underline" href={IPTC_BASE + lvl.term} target="_blank" rel="noreferrer">{lvl.term}</a></div>}
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <label className="grid gap-0.5"><span className="text-muted">Tool and version</span><input value={e.tool} onChange={(x) => updateProv(e.id, { tool: x.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>
                  <label className="grid gap-0.5"><span className="text-muted">Date</span><input type="date" value={e.date} onChange={(x) => updateProv(e.id, { date: x.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>
                </div>
                <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={e.toolGenerative} onChange={() => updateProv(e.id, { toolGenerative: !e.toolGenerative })} />The tool can generate content (image or text models)</label>
                <label className="mt-1.5 grid gap-0.5"><span className="text-muted">What a person contributed</span><input value={e.humanContribution} onChange={(x) => updateProv(e.id, { humanContribution: x.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <label className="grid gap-0.5"><span className="text-muted">Decided by</span>
                    <select value={e.decidedBy} onChange={(x) => updateProv(e.id, { decidedBy: x.target.value as Decider })} className="rounded border border-line bg-panel px-1 py-0.5">
                      {(Object.keys(DECIDER_LABEL) as Decider[]).map((k) => <option key={k} value={k}>{DECIDER_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-0.5"><span className="text-muted">{e.kind === 'result' ? 'Source ids' : 'Licence or tool terms'}</span>
                    <input value={e.kind === 'result' ? e.sourceIds : e.licence} onChange={(x) => updateProv(e.id, e.kind === 'result' ? { sourceIds: x.target.value } : { licence: x.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" />
                  </label>
                </div>
                {e.kind === 'text' && (
                  <div className="mt-1.5 grid gap-1">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={e.cultural} onChange={() => updateProv(e.id, { cultural: !e.cultural })} />Touches culture or the Nations</label>
                    {e.cultural && <label className="grid gap-0.5"><span className="text-muted">Human reviewer (kept off exports)</span><input value={e.reviewer} onChange={(x) => updateProv(e.id, { reviewer: x.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>}
                  </div>
                )}
                {mine.length > 0 && <ul className="mt-1.5 list-disc pl-4 text-meta text-amber-900">{mine.map((i, k) => <li key={k}>{i.text}</li>)}</ul>}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">IPTC terms by level are the team's mapping of IPTC's own definitions (P07-M07 r4). When unsure, declare more AI use.</span></div>
      </Section>

      <Section title="Board appendix" right={<button onClick={() => { void navigator.clipboard?.writeText(appendix); setCopied(true); setTimeout(() => setCopied(false), 1200) }} className="flex items-center gap-1 text-meta text-accent hover:underline">{copied ? <Check size={12} /> : <Copy size={12} />}Copy</button>}>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-black/[0.03] p-2 text-meta">{appendix}</pre>
        <p className="mt-1 text-meta text-muted">AI use, sources, module names and licences only: no people, handles or reviewers. Removing names and metadata from the exported PDF and images is part of the board export check (backlog item 5).</p>
      </Section>
    </>
  )
}
