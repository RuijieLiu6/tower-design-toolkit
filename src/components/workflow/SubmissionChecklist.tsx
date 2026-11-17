// The Submission checklist (17 Nov 2026, Sinnie: the tools that are not design checks become "a Submission checklist
// on the Present step"). Engagement and claims, the AI use and provenance log and the uploaded model's record are
// obligations of the entry, not readings of the design, so they leave the workflow and sit at the top of Present ›
// Check and export: one row each with where it stands; a row opens its full panel in place.
import { lazy, Suspense, useState } from 'react'
import { ChevronDown, CircleCheck, CircleDashed } from '../icons'
import { SUBMISSION_NODES, nodeById } from '../../data/registry'
import { useStore } from '../../store'
import { useCultureGate } from '../CultureResults'
import { useProvenanceIssues } from '../ProvenanceResults'

const PANELS = {
  'built.culture-claims': lazy(() => import('../CultureResults')),
  'built.provenance': lazy(() => import('../ProvenanceResults')),
  'built.model': lazy(() => import('../import/ModelPanel')),
} as const

export default function SubmissionChecklist() {
  const { findings, gate } = useCultureGate()
  const { prov, issues } = useProvenanceIssues()
  const model = useStore((s) => s.models[s.project])
  const [open, setOpen] = useState<string | null>(null)
  const bad = findings.filter((f) => !f.pass).length, done = gate.filter((g) => g.ok).length
  const rows: { id: (typeof SUBMISSION_NODES)[number]; ok: boolean; status: string }[] = [
    { id: 'built.culture-claims', ok: done === gate.length && !bad, status: `${done} of ${gate.length} done${bad ? ` · ${bad} claim${bad > 1 ? 's' : ''} to fix` : ''}` },
    { id: 'built.provenance', ok: prov.length > 0 && !issues.length, status: prov.length ? `${prov.length} element${prov.length > 1 ? 's' : ''}${issues.length ? ` · ${issues.length} to fix` : ' · complete'}` : 'nothing logged yet' },
    { id: 'built.model', ok: true, status: model ? `from ${model.source.fileName}` : 'no upload: drawn in the toolkit' },
  ]
  return (
    <section aria-labelledby="submission-title" data-testid="submission-checklist" className="rounded-md border border-white/10 bg-white/[0.03] p-2.5">
      <h3 id="submission-title" className="mb-1.5 text-meta font-semibold text-slate-400">Submission</h3>
      <ul className="grid gap-1">
        {rows.map((r) => {
          const on = open === r.id, Panel = PANELS[r.id]
          return (
            <li key={r.id} data-submission={r.id}>
              <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : r.id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-sky-400">
                {r.ok ? <CircleCheck size={15} className="shrink-0 text-emerald-300" aria-label="done" /> : <CircleDashed size={15} className="shrink-0 text-amber-300" aria-label="open" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta font-medium text-slate-100">{nodeById(r.id)?.name ?? r.id}</span>
                  <span className="block truncate text-meta text-slate-400">{r.status}</span>
                </span>
                <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${on ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {on && <div className="mt-1 max-h-[60vh] min-w-0 overflow-auto rounded-md bg-white text-ink" data-submission-panel={r.id}><Suspense fallback={<div aria-busy="true" className="min-h-16" />}><Panel /></Suspense></div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
