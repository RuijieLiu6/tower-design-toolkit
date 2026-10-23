// Engagement ledger and claims guard (research P07-M01). Guardrails only: no cultural content, no AI verdict, no score.
import { Check, Copy, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CLAIM_RULES, CONTACT_RULE, COUNTERPART_LABEL, exportGate, LADDER, lintClaims, NATIONS, NON_ENDORSEMENT, recordIssues, statementFor, type ClaimFinding, type Counterpart, type Nation } from '../engine/culture'
import { useCultureStore } from '../lib/cultureStore'
import { FlagChip, Section } from './ui'

export function useCultureGate() {
  const { records, claimsText, contactAck, eligibility } = useCultureStore()
  return useMemo(() => {
    const findings = lintClaims(claimsText, records)
    return { findings, gate: exportGate(records, findings, contactAck, eligibility) }
  }, [records, claimsText, contactAck, eligibility])
}

export default function CultureResults() {
  const s = useCultureStore()
  const { findings, gate } = useCultureGate()
  return (
    <>
      <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-slate-300 bg-slate-100 px-2 py-1.5 text-[11px] text-slate-700">
        <span className="shrink-0 rounded bg-slate-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Unreviewed beta</span>
        <span>The ladder, phrase list and statements are team designs awaiting paid Indigenous review (P07-M01). The tool restricts claims; it never scores culture and never contacts anyone.</span>
      </div>

      <Section title="Contact guard">
        <div className="rounded-md border-2 border-red-300 bg-red-50/50 p-2.5 text-[11px]">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-red-800"><ShieldAlert size={14} />No contact about the entry</div>
          <p>{CONTACT_RULE}</p>
          <div className="mt-1.5 flex items-center gap-1"><FlagChip flag="unverified" /><span className="text-[10px] text-muted">Generic rule only. Names, clause numbers and dates stay hidden until a person checks the Terms and the jury page in a browser (they came from fetch summaries; the organizer's site was unreachable in research rounds 3 and 4).</span></div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="grid gap-0.5"><span className="text-muted">Checked by</span><input value={s.verifiedBy} onChange={(e) => s.set({ verifiedBy: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" placeholder="name (kept in this browser)" /></label>
            <label className="grid gap-0.5"><span className="text-muted">On</span><input type="date" value={s.verifiedOn} onChange={(e) => s.set({ verifiedOn: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>
          </div>
          <label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" checked={s.contactAck} onChange={() => s.set({ contactAck: !s.contactAck })} />Our team has read and follows this rule</label>
        </div>
      </Section>

      <Section title="Engagement ledger, per Nation" right={<FlagChip flag="team_assumption" />}>
        <p className="mb-2 text-[10px] text-muted">One Nation's status says nothing about the other two. N0 is the standing default: whether any sanctioned channel to the Nations exists for this competition is unresolved.</p>
        <div className="grid gap-2.5">{NATIONS.map((n) => <NationRow key={n} n={n} />)}</div>
      </Section>

      <Section title="Claims check">
        <textarea value={s.claimsText} onChange={(e) => s.set({ claimsText: e.target.value })} rows={5} placeholder="Paste board text or the project narrative. Each sentence that names a Nation (or Nations in general) is checked against the status you declared."
          className="w-full rounded-md border border-line bg-panel p-2 text-xs" aria-label="Board or narrative text" />
        {s.claimsText.trim() && <Highlighted text={s.claimsText} findings={findings} />}
        <ul className="mt-2 grid gap-1.5">
          {findings.map((f, i) => (
            <li key={i} className={`rounded border px-2 py-1 text-[11px] ${f.pass ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60'}`}>
              <div className="flex items-center gap-1.5"><b>"{f.phrase}"</b><span className="text-muted">· {f.rule.label} · {f.general ? 'Nations in general' : f.nations.join(', ')}</span><span className={`ml-auto text-[10px] font-semibold ${f.pass ? 'text-emerald-800' : 'text-red-800'}`}>{f.pass ? 'Allowed' : 'Not allowed'}</span></div>
              <div className="text-[10px] text-slate-700">{f.reason}</div>
            </li>
          ))}
          {s.claimsText.trim() && !findings.length && <li className="text-[11px] text-emerald-800">No claim wording found. This is a phrase check, not a review of meaning.</li>}
        </ul>
        <details className="mt-2 text-[10px] text-muted"><summary className="cursor-pointer hover:text-ink">The {CLAIM_RULES.length} stage A rules</summary>
          <ul className="mt-1 grid gap-1">{CLAIM_RULES.map((r) => <li key={r.id}><b className="text-ink">{r.label}</b> ({r.need === 'banned' ? 'never in a competition entry' : `needs N${r.need}`}): {r.why}</li>)}</ul>
        </details>
      </Section>

      <Section title="Eligibility (private)">
        <p className="mb-1.5 text-[10px] text-muted">Kept in this browser only and never exported. Uncertain cases go to the organizer's staff through the portal, never to a juror.</p>
        <div className="grid gap-1 text-[11px]">
          {([['authors', 'Each author has recorded their own eligibility status'], ['associate', 'The question about UBC SALA associates is logged (asked of organizer staff, without describing the entry)'], ['instructor', 'The instructor confirmed in writing that no juror reviews competition-specific work in the course']] as const).map(([k, label]) => (
            <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={s.eligibility[k]} onChange={() => s.set({ eligibility: { ...s.eligibility, [k]: !s.eligibility[k] } })} />{label}</label>
          ))}
        </div>
      </Section>

      <Section title="Before any board export">
        <ul className="grid gap-1 text-[11px]">
          {gate.map((g) => <li key={g.id} className="flex items-center gap-1.5"><span className={`flex h-4 w-4 items-center justify-center rounded-full text-white ${g.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>{g.ok ? <Check size={10} /> : '!'}</span>{g.label}</li>)}
        </ul>
        <div className="mt-2 rounded-md bg-black/[0.03] p-2 text-[10px] text-muted">
          <div className="mb-0.5 flex items-center gap-1"><FlagChip flag="team_assumption" /><span>Non-endorsement line (wording needs the instructor's agreement; kept off boards to protect anonymity):</span></div>
          <p className="text-slate-700">{NON_ENDORSEMENT}</p>
        </div>
      </Section>
    </>
  )
}

function NationRow({ n }: { n: Nation }) {
  const r = useCultureStore((s) => s.records[n])
  const setRecord = useCultureStore((s) => s.setRecord)
  const up = (p: Parameters<typeof setRecord>[1]) => setRecord(n, { ...p, confirmed: 'confirmed' in p ? p.confirmed : false })
  const issues = recordIssues(r)
  const statement = statementFor(n, r)
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-md border border-line p-2 text-[11px]">
      <div className="mb-1.5 flex items-center justify-between"><b className="text-xs">{n}</b><span className="text-[10px] text-muted">{LADDER[r.status].allows}</span></div>
      <div className="flex rounded-md bg-black/5 p-0.5" role="radiogroup" aria-label={`${n} engagement status`}>
        {LADDER.map((l) => (
          <button key={l.level} role="radio" aria-checked={r.status === l.level} title={`${l.name}: ${l.detail}`} onClick={() => up({ status: l.level })}
            className={`flex-1 rounded px-1 py-0.5 text-[10px] ${r.status === l.level ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>N{l.level}</button>
        ))}
      </div>
      <div className="mt-1 text-[10px] text-muted">{LADDER[r.status].name}: {LADDER[r.status].detail}</div>
      {r.status >= 1 && (
        <div className="mt-1.5 grid gap-1.5">
          <label className="grid gap-0.5"><span className="text-muted">{r.status === 1 ? 'Documents read' : 'Evidence note'}</span><input value={r.evidence} onChange={(e) => up({ evidence: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>
          <div className="grid grid-cols-2 gap-1.5">
            {r.status >= 3 && <label className="grid gap-0.5"><span className="text-muted">Counterpart</span>
              <select value={r.counterpart} onChange={(e) => up({ counterpart: e.target.value as Counterpart })} className="rounded border border-line bg-panel px-1 py-0.5">
                {(Object.keys(COUNTERPART_LABEL) as Counterpart[]).map((c) => <option key={c} value={c}>{COUNTERPART_LABEL[c]}</option>)}
              </select></label>}
            {r.status >= 2 && <label className="grid gap-0.5"><span className="text-muted">Date</span><input type="date" value={r.date} onChange={(e) => up({ date: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>}
          </div>
          {r.status === 4 && (
            <div className="grid grid-cols-2 gap-1.5">
              <label className="grid gap-0.5"><span className="text-muted">Document reference</span><input value={r.reference} onChange={(e) => up({ reference: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>
              <label className="grid gap-0.5"><span className="text-muted">The one use it covers</span><input value={r.use} onChange={(e) => up({ use: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-0.5" /></label>
            </div>
          )}
        </div>
      )}
      {issues.length > 0 && <ul className="mt-1.5 list-disc pl-4 text-[10px] text-red-800">{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
      <div className="mt-1.5 rounded bg-black/[0.03] p-1.5">
        <div className="flex items-start gap-1.5"><span className="flex-1 text-[11px] text-slate-700">{statement}</span>
          <button onClick={() => { void navigator.clipboard?.writeText(statement); setCopied(true); setTimeout(() => setCopied(false), 1200) }} aria-label={`Copy the ${n} statement`} className="shrink-0 text-muted hover:text-accent">{copied ? <Check size={12} /> : <Copy size={12} />}</button>
        </div>
      </div>
      <label className="mt-1.5 flex items-center gap-2"><input type="checkbox" checked={r.confirmed} onChange={() => setRecord(n, { confirmed: !r.confirmed })} />We confirm this status is true</label>
    </div>
  )
}

function Highlighted({ text, findings }: { text: string; findings: ClaimFinding[] }) {
  const parts: { t: string; f?: ClaimFinding }[] = []
  let at = 0
  for (const f of findings) {
    if (f.start < at) continue
    parts.push({ t: text.slice(at, f.start) }, { t: text.slice(f.start, f.end), f })
    at = f.end
  }
  parts.push({ t: text.slice(at) })
  return (
    <div className="mt-1.5 whitespace-pre-wrap rounded-md border border-line bg-black/[0.02] p-2 text-[11px] leading-relaxed">
      {parts.map((p, i) => p.f ? <mark key={i} title={p.f.reason} className={p.f.pass ? 'rounded bg-emerald-100 px-0.5' : 'rounded bg-red-200 px-0.5'}>{p.t}</mark> : <span key={i}>{p.t}</span>)}
    </div>
  )
}
