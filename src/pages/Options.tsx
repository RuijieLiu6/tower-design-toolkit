// Design options (#/options, backlog item 26): save up to four named options, compare them side by side (massing,
// every switched-on node's result with state and evidence, deltas against a baseline), chart them by jury criterion
// with the user's weights, and explain the difference between two options through the decision trace.
import { ArrowLeft, ArrowDown, ArrowUp, Equal, FolderOpen, Minus, Route as RouteIcon, Save, Trash, Workflow } from '../components/icons'
import { useEffect, useMemo, useState } from 'react'
import { TraceRecorder } from '../components/TracePanel'
import { FlagChip, StateChip } from '../components/ui'
import { U } from '../components/Units'
import { USES, type Tower } from '../engine/types'
import { navigate } from '../lib/route'
import {
  BRIEF_WEIGHTS, compareNode, CRITERIA, criterionLabel, criterionScores, explainDifference, MAX_OPTIONS, nodeSummaries, weightedTotal, weightsChanged,
  type Criterion, type Delta, type OptionRecord,
} from '../lib/options'
import { deleteOption, liveDigestReady, openOption, refreshOptions, saveOption, useOptions } from '../lib/optionsStore'
import { useCommunityStore } from '../lib/communityStore'
import { startPersistence, whenRestored } from '../lib/project/session'
import { useTrace } from '../lib/trace/trace'
import { useStore } from '../store'

/** Categorical slots 1–4 (validated: CVD and normal-vision separation pass; two slots under 3:1, so values are labelled). */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100']
const WEIGHTS_KEY = 'ts.options.weights'
const readWeights = (): Record<Criterion, number> => {
  try { const w = JSON.parse(window.localStorage.getItem(WEIGHTS_KEY) ?? 'null'); return w && CRITERIA.every((c) => Number.isFinite(w[c])) ? w : { ...BRIEF_WEIGHTS } } catch { return { ...BRIEF_WEIGHTS } }
}

/** Option's tallest tower (m). */
const topOf = (o: OptionRecord) => Math.max(0, ...o.design.towers[o.design.project].map((t) => t.height))

/**
 * Elevation of an option's towers (podium and shaft, program bands in their colours), drawn to a scale shared by all
 * options (`top` m fills the height), with the baseline's top dashed so a taller or shorter option reads at a glance.
 */
function Massing({ o, color, top, baseline }: { o: OptionRecord; color: string; top: number; baseline: number | null }) {
  const towers = o.design.towers[o.design.project]
  const W = 300, H = 120, base = H - 10
  const xs = towers.flatMap((t) => [t.x - Math.max(t.width, t.podiumWidth) / 2, t.x + Math.max(t.width, t.podiumWidth) / 2])
  const minX = Math.min(...xs, -60), maxX = Math.max(...xs, 60)
  const k = Math.min((W - 40) / (maxX - minX), (H - 22) / top)
  const left = (W - (maxX - minX) * k) / 2
  const X = (x: number) => left + (x - minX) * k
  const shaft = (t: Tower) => {
    const top = t.height, bottom = t.podiumHeight
    const total = t.bands.reduce((s, b) => s + Math.max(0, b.share), 0) || 1
    let z = bottom
    return t.bands.map((b, i) => {
      const h = ((top - bottom) * Math.max(0, b.share)) / total
      const r = <rect key={i} x={X(t.x - t.width / 2)} y={base - (z + h) * k} width={t.width * k} height={h * k} fill={USES[b.use].color} />
      z += h
      return r
    })
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label={`Elevation of ${o.name}: ${towers.map((t) => `${t.name} ${Math.round(t.height)} m`).join(', ')}`}>
      <rect x="0" y="0" width={W} height={H} fill="var(--color-paper)" />
      <line x1="4" x2={W - 4} y1={base} y2={base} stroke="var(--color-ink)" strokeWidth="1" />
      {baseline !== null && <><line x1="8" x2={W - 8} y1={base - baseline * k} y2={base - baseline * k} stroke="var(--color-muted)" strokeWidth="0.8" strokeDasharray="3 3" /><text x={W - 8} y={base - baseline * k - 3} fontSize="7.5" textAnchor="end" fill="var(--color-muted)"><U>{`baseline ${Math.round(baseline)} m`}</U></text></>}
      {towers.map((t) => (
        <g key={t.id}>
          {t.podiumHeight > 0 && <rect x={X(t.x - t.podiumWidth / 2)} y={base - t.podiumHeight * k} width={t.podiumWidth * k} height={t.podiumHeight * k} fill={USES[t.podiumUse].color} opacity={0.75} />}
          {shaft(t)}
          <rect x={X(t.x - t.width / 2)} y={base - t.height * k} width={t.width * k} height={(t.height - t.podiumHeight) * k} fill="none" stroke="var(--color-ink)" strokeWidth="0.6" />
          <text x={X(t.x)} y={base - t.height * k - 3} fontSize="8" textAnchor="middle" fill="var(--color-ink)"><U>{`${Math.round(t.height)} m`}</U></text>
        </g>
      ))}
      <rect x="0" y="0" width="4" height={H} fill={color} />
    </svg>
  )
}

const DELTA: Record<Delta, { icon: typeof ArrowUp; word: string; cls: string }> = {
  better: { icon: ArrowUp, word: 'Better', cls: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
  worse: { icon: ArrowDown, word: 'Worse', cls: 'text-red-800 bg-red-50 border-red-200' },
  same: { icon: Equal, word: 'Same', cls: 'text-muted bg-paper border-line' },
  changed: { icon: Minus, word: 'Changed', cls: 'text-slate-700 bg-slate-50 border-slate-200' },
  'n/a': { icon: Minus, word: '—', cls: 'text-muted border-transparent' },
}
function DeltaChip({ d }: { d: Delta }) {
  if (d === 'n/a') return null
  const x = DELTA[d], Icon = x.icon
  return <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-meta font-semibold leading-none ${x.cls}`}><Icon size={10} aria-hidden />{x.word}</span>
}

/** Grouped horizontal bars: one row per criterion, one bar per option, value labelled at the bar end. */
function CriterionChart({ options, weights }: { options: OptionRecord[]; weights: Record<Criterion, number> }) {
  const scores = options.map((o) => criterionScores(o.design, o.digest))
  const bar = 14, gap = 2, rowGap = 14, labelW = 150, W = 640
  const rowH = options.length * (bar + gap) - gap
  const H = CRITERIA.length * (rowH + rowGap)
  const x = (v: number) => labelW + ((W - labelW - 46) * v) / 100
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Score by jury criterion for each option (study aid, not the jury's score)">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="var(--color-line)" strokeWidth="1" />
            <text x={x(t)} y={H + 12} fontSize="9" textAnchor="middle" fill="var(--color-muted)">{t}</text>
          </g>
        ))}
        {CRITERIA.map((c, ci) => {
          const y0 = ci * (rowH + rowGap)
          return (
            <g key={c}>
              <text x={0} y={y0 + rowH / 2 + 3} fontSize="10.5" fill="var(--color-ink)">{criterionLabel(c)}</text>
              <text x={0} y={y0 + rowH / 2 + 14} fontSize="9" fill="var(--color-muted)">weight {weights[c]}</text>
              {options.map((o, oi) => {
                const s = scores[oi][ci]
                const y = y0 + oi * (bar + gap)
                const ok = Number.isFinite(s.score)
                return (
                  <g key={o.key}>
                    <title>{`${o.name} · ${criterionLabel(c)}: ${ok ? `${Math.round(s.score)} / 100 from ${s.nodes} node${s.nodes === 1 ? '' : 's'}` : 'no scorable result'}${s.flag ? ` · weakest evidence: ${s.flag.replace(/_/g, ' ')}` : ''}`}</title>
                    {ok ? <rect x={labelW} y={y} width={Math.max(2, x(s.score) - labelW)} height={bar} rx={3} fill={SERIES[oi]} /> : <rect x={labelW} y={y} width={W - labelW - 46} height={bar} fill="none" stroke="var(--color-line)" strokeDasharray="3 3" />}
                    <text x={ok ? x(s.score) + 4 : labelW + 6} y={y + bar - 3} fontSize="9.5" fill="var(--color-ink)">{ok ? Math.round(s.score) : 'no result'}</text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-3 text-meta">
        {options.map((o, i) => <span key={o.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i] }} />{o.name}</span>)}
      </figcaption>
    </figure>
  )
}

export default function Options() {
  const { options, loaded, error } = useOptions()
  const reduced = useStore((s) => s.reducedMotion)
  const trace = useTrace((s) => s.iterations)
  const packages = useCommunityStore((s) => s.packages)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [weights, setWeights] = useState(readWeights)
  const [pair, setPair] = useState<[number, number]>([0, 1])
  useEffect(() => { document.title = 'Design options · Tower Design Toolkit'; refreshOptions() }, [])
  // The open project is restored and autosaved here too: a save from a fresh page load must be the user's design.
  useEffect(() => startPersistence(), [])
  useEffect(() => { try { window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights)) } catch { /* private mode */ } }, [weights])

  const names = useMemo(() => Object.fromEntries(packages.map((p) => [p.id, p.name])), [packages])
  const summaries = useMemo(() => options.map((o) => nodeSummaries(o.design, o.digest, names)), [options, names])
  const nodes = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of summaries) for (const n of s) if (!seen.has(n.nodeId)) seen.set(n.nodeId, n.name)
    return [...seen]
  }, [summaries])
  const top = Math.max(320, ...options.map(topOf)) * 1.04
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAll, setShowAll] = useState<Set<string>>(new Set())
  const totals = useMemo(() => options.map((o) => weightedTotal(criterionScores(o.design, o.digest), weights)), [options, weights])
  const [ia, ib] = [Math.min(pair[0], options.length - 1), Math.min(pair[1], options.length - 1)]
  const explain = useMemo(() => (options.length >= 2 && ia !== ib ? explainDifference(options[ia], options[ib], trace) : null), [options, ia, ib, trace])

  const save = async () => {
    setMsg('')
    await whenRestored()
    if (!liveDigestReady()) await new Promise((r) => setTimeout(r, 600))
    const r = await saveOption(name || `Option ${String.fromCharCode(65 + options.length)}`)
    setMsg(r.ok ? 'Saved.' : r.reason ?? 'Not saved.')
    if (r.ok) setName('')
  }

  return (
    <div data-stage="basic" data-reduced={reduced} className="h-full overflow-y-auto bg-paper text-ink">
      {/* Keeps the current design's results digest fresh, so it can be saved from here. */}
      <TraceRecorder />
      <div className="mx-auto max-w-6xl px-6 py-6 md:px-10">
        <header className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate('start')} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft size={14} aria-hidden />Start</button>
          <h1 className="text-display-sm md:text-display">Design options</h1>
          <span className="text-meta text-muted">Save up to {MAX_OPTIONS} versions of the design and compare what the checks say about each</span>
          <span className="ml-auto flex gap-1.5">
            <button onClick={() => navigate('guided')} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><RouteIcon size={14} aria-hidden />Guided process</button>
            <button onClick={() => navigate('customize')} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><Workflow size={14} aria-hidden />Customize</button>
          </span>
        </header>

        <section className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">Save the current design as
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Option ${String.fromCharCode(65 + options.length)}`} maxLength={60} aria-label="Option name"
              className="min-w-0 flex-1 rounded border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent" onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
          </label>
          <button onClick={save} disabled={options.length >= MAX_OPTIONS} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white outline-none hover:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Save size={14} aria-hidden />Save option</button>
          <span role="status" className="w-full text-meta text-muted">{msg || 'Saves the design and every result as they are now. Change the design, then save the next one.'}</span>
          {error && <span className="w-full text-meta text-red-800">{error}</span>}
        </section>

        {loaded && options.length === 0 && <p className="mt-6 text-sm text-muted">No options yet. Save the current design, change it (height, program, core…), and save again to compare.</p>}

        {options.length > 0 && (
          <section className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} aria-label="Options">
            {options.map((o, i) => (
              <div key={o.key} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold" title={o.name}>{o.name}</div><div className="text-meta text-muted">{i === 0 ? 'Baseline · ' : ''}{new Date(o.savedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} · {o.design.project === 'vtc' ? 'Competition site' : 'Real Vancouver'}</div></div>
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: SERIES[i] }} aria-hidden />
                </div>
                <div className="mt-2"><Massing o={o} color={SERIES[i]} top={top} baseline={i === 0 ? null : topOf(options[0])} /></div>
                <div className="mt-2 text-meta">Weighted study score <b className="tabular-nums">{Number.isFinite(totals[i]) ? Math.round(totals[i]) : '—'}</b> / 100</div>
                <div className="mt-2 flex gap-1.5">
                  <button onClick={async () => { await openOption(o); navigate('guided') }} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-meta outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><FolderOpen size={12} aria-hidden />Open in the guided app</button>
                  {deleting === o.key ? (
                    <span className="flex items-center gap-1 text-meta">Delete?
                      <button onClick={() => { setDeleting(null); deleteOption(o.key) }} className="rounded-md border border-red-300 bg-red-50 px-2 py-1 font-medium text-red-800 outline-none hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-accent">Delete</button>
                      <button onClick={() => setDeleting(null)} className="rounded-md border border-line px-2 py-1 outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">Keep</button>
                    </span>
                  ) : <button onClick={() => setDeleting(o.key)} aria-label={`Delete ${o.name}`} className="rounded-md border border-line px-2 py-1 text-meta text-muted outline-none hover:border-red-400 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-accent"><Trash size={12} /></button>}
                </div>
              </div>
            ))}
          </section>
        )}

        {options.length > 0 && (
          <section className="mt-5 rounded-lg border border-line bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">By jury criterion</h2>
                <p className="mt-0.5 max-w-2xl text-meta text-amber-900"><b>Not the jury's score.</b> A study aid from this tool's checks: each node counts towards the criteria its jury tags name; pass 1, check 0.5, fail 0, unknown left out; nodes without recorded results do not count.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-meta">
                {CRITERIA.map((c) => (
                  <label key={c} className="flex items-center gap-1">{criterionLabel(c).split(' ')[0]}
                    <input type="number" min={0} max={100} value={weights[c]} onChange={(e) => setWeights({ ...weights, [c]: Math.max(0, Number(e.target.value) || 0) })} aria-label={`Weight for ${criterionLabel(c)}`}
                      className="w-12 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums outline-none focus:border-accent" />
                  </label>
                ))}
                {weightsChanged(weights) ? <FlagChip flag="team_assumption" /> : <span className="text-muted">brief weights 40 / 30 / 20 / 10</span>}
                {weightsChanged(weights) && <button onClick={() => setWeights({ ...BRIEF_WEIGHTS })} className="text-accent hover:underline">Reset to the brief</button>}
              </div>
            </div>
            <div className="mt-3"><CriterionChart options={options} weights={weights} /></div>
            <table className="mt-3 w-full text-meta">
              <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Criterion</th>{options.map((o) => <th key={o.key} className="py-1 font-medium">{o.name}</th>)}</tr></thead>
              <tbody>
                {CRITERIA.map((c) => (
                  <tr key={c} className="border-t border-line/70">
                    <td className="py-1">{criterionLabel(c)} <span className="text-muted">· weight {weights[c]}</span></td>
                    {options.map((o) => {
                      const s = criterionScores(o.design, o.digest).find((x) => x.criterion === c)!
                      return <td key={o.key} className="py-1"><span className="inline-flex flex-wrap items-center gap-1"><b className="tabular-nums">{Number.isFinite(s.score) ? Math.round(s.score) : '—'}</b><span className="text-muted">{s.nodes} node{s.nodes === 1 ? '' : 's'}</span>{s.flag && <FlagChip flag={s.flag} />}</span></td>
                    })}
                  </tr>
                ))}
                <tr className="border-t border-line font-semibold"><td className="py-1">Weighted study score</td>{totals.map((t, i) => <td key={i} className="py-1 tabular-nums">{Number.isFinite(t) ? Math.round(t) : '—'}</td>)}</tr>
              </tbody>
            </table>
          </section>
        )}

        {options.length > 0 && (
          <section className="mt-5 overflow-x-auto rounded-lg border border-line bg-panel" aria-label="Node results by option">
            <h2 className="px-4 pt-3 text-sm font-semibold">Every switched-on node</h2>
            <p className="px-4 text-meta text-muted">Worst state, counts and weakest evidence flag per node; deltas are against the baseline (the first option).</p>
            <table className="mt-2 w-full min-w-[720px] text-meta">
              <thead><tr className="border-y border-line text-left text-muted"><th className="px-4 py-1.5 font-medium">Node</th>{options.map((o) => <th key={o.key} className="px-3 py-1.5 font-medium">{o.name}</th>)}</tr></thead>
              <tbody>
                {nodes.map(([id, nm]) => (
                  <tr key={id} className="border-b border-line/60 align-top">
                    <td className="px-4 py-1.5 font-medium">{nm}</td>
                    {summaries.map((s, i) => {
                      const n = s.find((x) => x.nodeId === id)
                      const d = i === 0 ? 'n/a' : compareNode(summaries[0].find((x) => x.nodeId === id), n)
                      return (
                        <td key={i} className="px-3 py-1.5">
                          {!n ? <span className="text-muted">off</span> : !n.recorded ? <span className="text-muted"><U>{n.headline}</U></span> : (
                            <span className="flex flex-wrap items-center gap-1">{n.counts.pass + n.counts.warn + n.counts.fail > 0 && <StateChip state={n.state} />}{n.flag && <FlagChip flag={n.flag} />}<DeltaChip d={d} /><span className="w-full text-muted"><U>{n.headline}</U></span></span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {options.length >= 2 && (
          <section className="mt-5 rounded-lg border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Explain the difference</h2>
              <select value={ia} onChange={(e) => setPair([Number(e.target.value), ib])} aria-label="From option" className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs">{options.map((o, i) => <option key={o.key} value={i}>{o.name}</option>)}</select>
              <span className="text-xs text-muted">→</span>
              <select value={ib} onChange={(e) => setPair([ia, Number(e.target.value)])} aria-label="To option" className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs">{options.map((o, i) => <option key={o.key} value={i}>{o.name}</option>)}</select>
            </div>
            {!explain ? <p className="mt-2 text-meta text-muted">Pick two different options.</p> : (
              <>
                <p className="mt-1 text-meta text-muted">Each input that differs, with the results that moved when the decision trace saw that input change on its own. Results no single-input step explains are listed last.</p>
                <ul className="mt-2 space-y-2">
                  {explain.inputs.map((x) => (
                    <li key={x.change} className="rounded-md border border-line p-2 text-meta">
                      <div className="font-medium"><U>{x.change}</U></div>
                      {x.moved.length ? (
                        <ul className="mt-1 space-y-0.5 text-meta">{x.moved.slice(0, showAll.has(x.change) ? undefined : 10).map((m) => <li key={m.id} className="flex flex-wrap items-center gap-1.5"><DeltaChip d={m.kind === 'worse' || m.kind === 'better' ? m.kind : 'changed'} /><span>{m.label}</span><span className="text-muted"><U>{`${m.before?.value ?? '—'} → ${m.after?.value ?? '—'}`}</U></span></li>)}
                          {x.moved.length > 10 && !showAll.has(x.change) && <li><button onClick={() => setShowAll(new Set([...showAll, x.change]))} className="text-accent hover:underline">Show all {x.moved.length} results it moved</button></li>}</ul>
                      ) : <p className="mt-0.5 text-meta text-muted">{x.steps ? 'Changed on its own in the trace, but none of those results differ between these options.' : 'Not seen changing on its own in the trace yet: change only this input in the guided app to see what it moves.'}</p>}
                    </li>
                  ))}
                </ul>
                {explain.unexplained.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-meta font-semibold text-muted">Results that differ, not yet attributed ({explain.unexplained.length})</h3>
                    <ul className="mt-1 space-y-0.5 text-meta">{explain.unexplained.slice(0, 20).map((m) => <li key={m.id} className="flex flex-wrap items-center gap-1.5"><DeltaChip d={m.kind === 'worse' || m.kind === 'better' ? m.kind : 'changed'} /><span>{m.label}</span><span className="text-muted"><U>{`${m.before?.value ?? '—'} → ${m.after?.value ?? '—'}`}</U></span></li>)}</ul>
                  </div>
                )}
                {!explain.inputs.length && <p className="mt-2 text-meta text-muted">The two options have the same design inputs.</p>}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
