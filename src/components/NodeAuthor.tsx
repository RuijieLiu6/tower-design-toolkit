// "Make it here": build a node inside the app, with no outside AI (Phase 1 #1). A form for one design question with up to
// three formula metrics. Every threshold needs a source or is marked unresolved / shown as information; the formula is
// checked as you type and run live on the three sample designs. "Check and add" hands the package to the Import tab,
// so the same checker, tests and preview decide whether it joins My nodes (one importer, not two). Nothing is uploaded.
import { Plus, Trash2, Wand2 } from './icons'
import { useMemo, useState } from 'react'
import { CATEGORIES, type Category } from '../data/registry'
import { VARIABLES } from '../lib/layer0Summary'
import { parse, variablesOf } from '../lib/nodeExpr'
import { FORMAT, runPackage, STAGE_LABEL, type MetricDef, type NodePackage, type Stage, type ThresholdFlag } from '../lib/nodePackages'
import { FIXTURES } from '../lib/nodeValidate'
import { useCommunityStore } from '../lib/communityStore'

type Direction = 'higher_is_better' | 'lower_is_better' | 'range' | 'info'
interface MetricForm { label: string; unit: string; per: 'tower' | 'project'; expression: string; decimals: string; direction: Direction; good: string; bad: string; flag: ThresholdFlag; source: string; page: string; url: string }
const blankMetric = (): MetricForm => ({ label: '', unit: 'm', per: 'tower', expression: '', decimals: '1', direction: 'lower_is_better', good: '', bad: '', flag: 'unresolved', source: '', page: '', url: '' })

const FLAGS: { id: ThresholdFlag; label: string; hint: string }[] = [
  { id: 'unresolved', label: 'Unresolved', hint: 'No sourced number yet: the node shows the value only' },
  { id: 'unverified', label: 'Unverified', hint: 'From a source not yet checked (a lecture, a summary)' },
  { id: 'team_assumption', label: 'Team assumption', hint: 'Your own choice, said as such' },
  { id: 'verified', label: 'Verified', hint: 'You read the source; it still shows as unverified until a reviewer checks it' },
]
const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: 'lower_is_better', label: 'Lower is better' }, { id: 'higher_is_better', label: 'Higher is better' },
  { id: 'range', label: 'Within a range' }, { id: 'info', label: 'Information only (no good or bad)' },
]

const slug = (s: string, max = 40) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'node'
const metricId = (label: string, i: number) => (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'm_$1') || `metric_${i + 1}`).slice(0, 40)
/** "12" → 12; "6-12" or "6, 12" → [6, 12]; empty → undefined (never 0). */
const num = (s: string): number | [number, number] | undefined => {
  const parts = s.split(/[,–-]\s*(?=\d)/).map((x) => x.trim()).filter((x) => x !== '').map(Number).filter((x) => Number.isFinite(x))
  return parts.length === 2 ? [parts[0], parts[1]] : parts.length === 1 ? parts[0] : undefined
}

/** The form as a node package (format tower-studio-node@1). Tests come from the sample designs if asked. */
export function packageFromForm(f: { name: string; question: string; category: Category; stage: Stage; author: string; licence: string; method: string; human: string; limits: string; metrics: MetricForm[]; tests: boolean }): NodePackage {
  const metrics: MetricDef[] = f.metrics.map((m, i) => {
    const info = m.direction === 'info'
    const source = { label: m.source.trim() || 'No source yet', ...(m.page.trim() ? { page: m.page.trim() } : {}), ...(m.url.trim() ? { url: m.url.trim() } : {}) }
    return {
      id: metricId(m.label, i), label: m.label.trim(), unit: m.unit.trim() || '-', per: m.per, expression: m.expression.trim(),
      decimals: Math.max(0, Math.min(4, Math.round(Number(m.decimals) || 0))),
      threshold: info
        ? { direction: 'info', flag: m.flag, source }
        : { direction: m.direction, ...(num(m.good) !== undefined ? { good: num(m.good)! } : {}), ...(num(m.bad) !== undefined ? { bad: num(m.bad)! } : {}), flag: m.flag, source },
    }
  })
  const inputs = [...new Set(metrics.flatMap((m) => { try { return [...variablesOf(parse(m.expression))] } catch { return [] } }))].sort()
  const pkg: NodePackage = {
    format: FORMAT, id: `community.${slug(f.author, 20)}.${slug(f.name)}`, version: '0.1.0', licence: f.licence,
    name: f.name.trim(), author: { name: f.author.trim() }, category: f.category, stage: f.stage, question: f.question.trim(),
    inputs, method: f.method.trim(), human: f.human.trim(), limits: f.limits.trim(), metrics, createdWith: 'Tower Design Toolkit form (no AI)',
  }
  if (f.tests) {
    // Regression tests: today's values on the sample designs, so a later edit that changes a formula shows up.
    const tests = FIXTURES.flatMap((fx) => {
      let res: ReturnType<typeof runPackage> = []
      try { res = runPackage(pkg, fx.summary) } catch { return [] }
      return res.filter((r) => Number.isFinite(r.raw)).map((r) => ({ fixture: fx.id, metric: r.metricId, ...(r.per === 'tower' ? { tower: Math.max(0, fx.summary.towers.findIndex((t) => t.name === r.towerName)) } : {}), value: Math.round(r.raw * 1e6) / 1e6, tolerance: 1e-6 }))
    })
    if (tests.length) pkg.tests = tests.slice(0, 12)
  }
  return pkg
}

export default function NodeAuthor() {
  const openDialog = useCommunityStore((s) => s.openDialog)
  const setDraft = useCommunityStore((s) => s.setDraft)
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [category, setCategory] = useState<Category>('SPAC')
  const [stage, setStage] = useState<Stage>('massing')
  const [author, setAuthor] = useState('')
  const [licence, setLicence] = useState('CC-BY-4.0')
  const [method, setMethod] = useState('')
  const [human, setHuman] = useState('')
  const [limits, setLimits] = useState('')
  const [metrics, setMetrics] = useState<MetricForm[]>([blankMetric()])
  const [tests, setTests] = useState(true)
  const [varQuery, setVarQuery] = useState('')
  const [focus, setFocus] = useState(0)

  const setM = (i: number, patch: Partial<MetricForm>) => setMetrics((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const parsed = metrics.map((m) => { if (!m.expression.trim()) return { ok: false, msg: 'Write a formula' }; try { parse(m.expression); return { ok: true, msg: '' } } catch (e) { return { ok: false, msg: (e as Error).message } } })
  const form = { name, question, category, stage, author, licence, method, human, limits, metrics, tests }
  const pkg = useMemo(() => packageFromForm(form), [name, question, category, stage, author, licence, method, human, limits, metrics, tests]) // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => {
    if (parsed.some((p) => !p.ok)) return []
    return FIXTURES.slice(0, 3).map((fx) => { try { return { fx, res: runPackage({ ...pkg, tests: undefined }, fx.summary) } } catch { return { fx, res: [] } } })
  }, [pkg]) // eslint-disable-line react-hooks/exhaustive-deps
  const vars = VARIABLES.filter((v) => !varQuery || `${v.name} ${v.label}`.toLowerCase().includes(varQuery.toLowerCase())).slice(0, 8)
  const missing = [!name.trim() && 'a name', !question.trim() && 'the question', !author.trim() && 'your name', !method.trim() && 'the method', !human.trim() && 'what stays a human judgement', !limits.trim() && 'the limits',
    ...metrics.flatMap((m, i) => [!m.label.trim() && `metric ${i + 1}'s label`, !parsed[i].ok && `metric ${i + 1}'s formula`, m.direction !== 'info' && m.flag !== 'unresolved' && !m.source.trim() && `metric ${i + 1}'s source`])].filter(Boolean) as string[]

  const send = () => { setDraft(JSON.stringify(pkg, null, 2)); openDialog('import') }
  const field = 'w-full rounded-md border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent'
  const lab = 'mb-0.5 block text-[11px] font-medium text-ink'

  return (
    <div className="grid gap-3 text-xs">
      <p className="text-slate-700">Build a check here, without an AI: one design question, a formula on the design's numbers, and a threshold with its source. It is checked and tested exactly like an imported node before it joins <b>My nodes</b>. Nothing is uploaded.</p>
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lab}>Name</span><input data-autofocus className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office plate depth" /></label>
        <label><span className={lab}>Your name (author)</span><input className={field} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="shown on the node" /></label>
        <label className="col-span-2"><span className={lab}>The design question, in one sentence</span><input className={field} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Is every office desk within reach of daylight?" /></label>
        <label><span className={lab}>Category</span><select className={field} value={category} onChange={(e) => setCategory(e.target.value as Category)}>{(Object.keys(CATEGORIES) as Category[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}</select></label>
        <label><span className={lab}>Stage</span><select className={field} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>{(Object.keys(STAGE_LABEL) as Stage[]).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></label>
      </div>

      {metrics.map((m, i) => (
        <fieldset key={i} className="rounded-lg border border-line p-2.5" onFocus={() => setFocus(i)}>
          <legend className="px-1 text-[11px] font-semibold">Metric {i + 1}</legend>
          <div className="grid grid-cols-6 gap-2">
            <label className="col-span-3"><span className={lab}>Label</span><input className={field} value={m.label} onChange={(e) => setM(i, { label: e.target.value })} placeholder="Facade-to-core depth" /></label>
            <label className="col-span-1"><span className={lab}>Unit</span><input className={field} value={m.unit} onChange={(e) => setM(i, { unit: e.target.value })} /></label>
            <label className="col-span-2"><span className={lab}>One result per</span><select className={field} value={m.per} onChange={(e) => setM(i, { per: e.target.value as 'tower' | 'project' })}><option value="tower">tower</option><option value="project">project</option></select></label>
            <label className="col-span-6"><span className={lab}>Formula</span>
              <input className={`${field} font-mono`} value={m.expression} onChange={(e) => setM(i, { expression: e.target.value })} placeholder="(tower.minSide - sqrt(tower.coreArea)) / 2" aria-invalid={!!m.expression && !parsed[i].ok} />
              <span role="status" className={`mt-0.5 block text-[11px] ${parsed[i].ok ? 'text-emerald-800' : 'text-muted'}`}>{parsed[i].ok ? `Reads ${[...variablesOf(parse(m.expression))].join(', ') || 'no design values'}` : parsed[i].msg}</span>
            </label>
            <label className="col-span-3"><span className={lab}>Good and bad</span><select className={field} value={m.direction} onChange={(e) => setM(i, { direction: e.target.value as Direction })}>{DIRECTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            {m.direction !== 'info' && <>
              <label className="col-span-1"><span className={lab}>Good</span><input className={field} value={m.good} onChange={(e) => setM(i, { good: e.target.value })} placeholder={m.direction === 'range' ? '6-12' : ''} /></label>
              <label className="col-span-1"><span className={lab}>Bad</span><input className={field} value={m.bad} onChange={(e) => setM(i, { bad: e.target.value })} /></label>
            </>}
            <label className={m.direction === 'info' ? 'col-span-3' : 'col-span-1'}><span className={lab}>Decimals</span><input className={field} value={m.decimals} onChange={(e) => setM(i, { decimals: e.target.value })} inputMode="numeric" /></label>
            <label className="col-span-3"><span className={lab}>Evidence</span><select className={field} value={m.flag} onChange={(e) => setM(i, { flag: e.target.value as ThresholdFlag })} title={FLAGS.find((f) => f.id === m.flag)?.hint}>{FLAGS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
            <label className="col-span-3"><span className={lab}>Source of the numbers</span><input className={field} value={m.source} onChange={(e) => setM(i, { source: e.target.value })} placeholder={m.flag === 'team_assumption' ? 'Team assumption: say why' : 'Document, clause'} /></label>
            <label className="col-span-2"><span className={lab}>Page or clause</span><input className={field} value={m.page} onChange={(e) => setM(i, { page: e.target.value })} /></label>
            <label className="col-span-4"><span className={lab}>Link (https://…)</span><input className={field} value={m.url} onChange={(e) => setM(i, { url: e.target.value })} /></label>
          </div>
          {metrics.length > 1 && <button onClick={() => setMetrics((ms) => ms.filter((_, j) => j !== i))} className="mt-2 flex items-center gap-1 text-[11px] text-muted hover:text-red-700"><Trash2 size={12} aria-hidden />Remove this metric</button>}
        </fieldset>
      ))}
      {metrics.length < 3 && <button onClick={() => setMetrics((ms) => [...ms, blankMetric()])} className="flex w-fit items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"><Plus size={12} aria-hidden />Add a metric</button>}

      <div className="rounded-lg border border-line p-2.5">
        <div className="flex items-center gap-2"><span className="text-[11px] font-semibold">Design values a formula can read</span>
          <input className={`${field} ml-auto w-44`} value={varQuery} onChange={(e) => setVarQuery(e.target.value)} placeholder="Search, e.g. core, office" aria-label="Search design values" /></div>
        <div className="mt-1.5 grid gap-0.5">
          {vars.map((v) => (
            <button key={v.name} onClick={() => setM(focus, { expression: `${metrics[focus]?.expression ?? ''}${metrics[focus]?.expression ? ' ' : ''}${v.name}` })} title={`Add to metric ${focus + 1}'s formula`}
              className="flex items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-black/5"><span className="font-mono text-[11px] text-accent">{v.name}</span><span className="text-[11px] text-muted">{v.label} ({v.unit})</span></button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted">Also + − × ÷, min, max, sqrt, abs, round and NA (not available). No code runs: formulas are read by the app's own parser.</p>
      </div>

      <div className="grid gap-2">
        <label><span className={lab}>Method: how the numbers are worked out</span><textarea className={`${field} h-14`} value={method} onChange={(e) => setMethod(e.target.value)} /></label>
        <label><span className={lab}>What stays a human judgement</span><textarea className={`${field} h-12`} value={human} onChange={(e) => setHuman(e.target.value)} /></label>
        <label><span className={lab}>Limits: what this check does not cover</span><textarea className={`${field} h-12`} value={limits} onChange={(e) => setLimits(e.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5"><span className="text-[11px]">Licence</span><select className={`${field} w-auto`} value={licence} onChange={(e) => setLicence(e.target.value)}><option>CC-BY-4.0</option><option>MIT</option></select></label>
          <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} />Add tests from the sample designs (today's values, so later edits that change a result show up)</label>
        </div>
      </div>

      {preview.length > 0 && (
        <div className="rounded-lg border border-line p-2.5" aria-live="polite">
          <div className="text-[11px] font-semibold">On the sample designs</div>
          <table className="mt-1 w-full text-[11px]"><tbody>
            {preview.flatMap(({ fx, res }) => res.slice(0, 4).map((r) => (
              <tr key={`${fx.id}-${r.id}`} className="border-t border-line/60"><td className="py-0.5 pr-2 text-muted">{fx.label}{r.towerName ? ` · ${r.towerName}` : ''}</td><td className="pr-2">{r.label}</td><td className="tabular-nums">{r.value}</td><td className="pl-2 text-muted">{r.info ? 'information' : r.state}</td></tr>
            )))}
          </tbody></table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={send} disabled={missing.length > 0} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"><Wand2 size={13} aria-hidden />Check and add</button>
        <span className="text-[11px] text-muted" role="status">{missing.length ? `Still needed: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}` : 'Ready: the next screen checks the package and runs its tests.'}</span>
      </div>
    </div>
  )
}
