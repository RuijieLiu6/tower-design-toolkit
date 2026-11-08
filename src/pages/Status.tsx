// Build status (#/status): the original request's "done / to-build tracking", read live from the node registry.
// Built vs researched nodes by category and stage, and by plan milestone (13 Nov working core, 10 Dec v1, roadmap).
import { ArrowLeft, BookOpen, CalendarDays, Check, FlaskConical, Package, Route as RouteIcon, Workflow } from '../components/icons'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { stageOf } from '../components/NodeLibrary'
import { CATEGORY_ICONS } from '../data/icons'
import { ALL_NODES, CATEGORIES, type Category, type NodeDef, type Priority } from '../data/registry'
import { useCommunityStore } from '../lib/communityStore'
import { navigate } from '../lib/route'
import EvalCasesSection from '../components/EvalCasesSection'
import { useStore } from '../store'

type Stage = ReturnType<typeof stageOf>
const STAGES: { id: Stage; label: string }[] = [
  { id: 'basic', label: 'Massing' }, { id: 'advanced', label: 'Schematic' }, { id: 'present', label: 'Present' }, { id: 'platform', label: 'Platform & data' },
]
const MILESTONE: Record<Priority, { label: string; date: string }> = {
  core: { label: 'Working core', date: '13 Nov' },
  v1: { label: 'v1', date: '10 Dec' },
  roadmap: { label: 'Roadmap', date: 'after 10 Dec' },
}
/** Course and competition dates (04 Tool Plan/PLAN.md §7). */
const DATES: { date: string; iso: string; label: string }[] = [
  { date: 'Fri 23 Oct', iso: '2026-10-23', label: 'Mid review: first attempt live' },
  { date: '6 Nov', iso: '2026-11-06', label: 'User matched (a VTC entrant)' },
  { date: '13 Nov', iso: '2026-11-13', label: 'Peer review 1: working core' },
  { date: '27 Nov', iso: '2026-11-27', label: 'Peer review 2: handover' },
  { date: '30 Nov', iso: '2026-11-30', label: 'VTC submission' },
  { date: '10 Dec', iso: '2026-12-10', label: 'Final review' },
]

const isBuilt = (n: NodeDef) => n.status === 'built' || n.status === 'preview'

function Bar({ built, total, label }: { built: number; total: number; label: string }) {
  const pct = total ? Math.round((100 * built) / total) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted">{built} of {total} built · {pct}%</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={built} aria-label={`${label}: ${built} of ${total} built`}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function Status() {
  const reduced = useStore((s) => s.reducedMotion)
  const mine = useCommunityStore((s) => s.packages.length)
  const [open, setOpen] = useState<Category | null>(null)
  useEffect(() => { document.title = 'Build status · Tower Design Toolkit' }, [])

  const { byCat, totals, byPriority } = useMemo(() => {
    const byCat = new Map<Category, NodeDef[]>()
    for (const n of ALL_NODES) byCat.set(n.category, [...(byCat.get(n.category) ?? []), n])
    const byPriority = (['core', 'v1', 'roadmap'] as Priority[]).map((p) => {
      const list = ALL_NODES.filter((n) => n.priority === p)
      return { p, built: list.filter(isBuilt).length, total: list.length }
    })
    return { byCat, byPriority, totals: { built: ALL_NODES.filter(isBuilt).length, researched: ALL_NODES.filter((n) => n.status === 'researched').length } }
  }, [])
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div data-stage="basic" data-reduced={reduced} className="h-full overflow-y-auto bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-6 py-6 md:px-10">
        <header className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate('start')} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft size={14} aria-hidden />Start</button>
          <h1 className="text-display-sm md:text-display">Build status</h1>
          <span className="text-meta text-muted">Live from the node registry · every node is either built (runs) or researched (method and sources, not runnable yet)</span>
          <span className="ml-auto flex gap-1.5">
            <button onClick={() => navigate('guided')} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><RouteIcon size={14} aria-hidden />Guided process</button>
            <button onClick={() => navigate('customize')} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><Workflow size={14} aria-hidden />Customize</button>
            <button onClick={() => navigate('sources')} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><BookOpen size={14} aria-hidden />Sources &amp; assumptions</button>
          </span>
        </header>

        <section className="mt-5 grid gap-3 md:grid-cols-4" aria-label="Totals">
          {[
            { k: 'Built nodes', v: totals.built, note: 'run live, with sources and flags' },
            { k: 'Researched nodes', v: totals.researched, note: 'method and thresholds, not runnable yet' },
            { k: 'Categories', v: Object.keys(CATEGORIES).length, note: 'every node declares one' },
            { k: 'My nodes', v: mine, note: 'community nodes installed in this browser' },
          ].map((t) => (
            <div key={t.k} className="rounded-lg border border-line bg-panel p-3">
              <div className="text-2xl font-semibold tabular-nums">{t.v}</div>
              <div className="text-xs font-medium">{t.k}</div>
              <div className="text-meta text-muted">{t.note}</div>
            </div>
          ))}
        </section>

        <section className="mt-5 grid gap-5 md:grid-cols-[1fr_300px]">
          <div className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold">By milestone</h2>
            <p className="mt-0.5 text-meta text-muted">Each researched module carries the plan priority it was given: core for the 13 Nov working core, v1 for 10 Dec, or roadmap.</p>
            <div className="mt-3 space-y-3">
              {byPriority.map(({ p, built, total }) => <Bar key={p} built={built} total={total} label={`${MILESTONE[p].label} · ${MILESTONE[p].date}`} />)}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><CalendarDays size={14} aria-hidden />Dates</h2>
            <ol className="mt-2 space-y-1.5">
              {DATES.map((d) => (
                <li key={d.iso} className={`flex gap-2 text-meta ${d.iso < today ? 'text-muted line-through' : ''}`}>
                  <span className="w-20 shrink-0 font-medium tabular-nums">{d.date}</span><span>{d.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mt-5 overflow-x-auto rounded-lg border border-line bg-panel" aria-label="Nodes by category and stage">
          <table className="w-full min-w-[760px] text-meta">
            <thead>
              <tr className="border-b border-line text-left text-meta text-muted">
                <th className="px-3 py-2 font-medium">Category</th>
                {STAGES.map((s) => <th key={s.id} className="px-3 py-2 font-medium">{s.label}</th>)}
                <th className="px-3 py-2 text-right font-medium">Built / all</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(CATEGORIES) as Category[]).map((c) => {
                const list = byCat.get(c) ?? []
                const Icon = CATEGORY_ICONS[c]
                const built = list.filter(isBuilt).length
                return (
                  <Fragment key={c}>
                    <tr className="border-b border-line/70 hover:bg-black/[0.02]">
                      <td className="px-3 py-2">
                        <button onClick={() => setOpen(open === c ? null : c)} aria-expanded={open === c} className="flex items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: CATEGORIES[c].color }}><Icon size={13} aria-hidden /></span>
                          <span className="font-medium">{CATEGORIES[c].label}</span>
                        </button>
                      </td>
                      {STAGES.map((s) => {
                        const here = list.filter((n) => stageOf(n) === s.id)
                        const b = here.filter(isBuilt).length, r = here.length - b
                        return (
                          <td key={s.id} className="px-3 py-2">
                            {here.length ? (
                              <span className="flex flex-wrap items-center gap-1">
                                {b > 0 && <span className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-meta font-semibold text-white"><Check size={10} aria-hidden />{b} built</span>}
                                {r > 0 && <span className="inline-flex items-center gap-0.5 rounded border border-dashed border-slate-400 px-1.5 py-0.5 text-meta text-muted"><FlaskConical size={10} aria-hidden />{r}</span>}
                              </span>
                            ) : <span className="text-muted">·</span>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right tabular-nums">{built} / {list.length}</td>
                    </tr>
                    {open === c && (
                      <tr className="border-b border-line/70 bg-paper">
                        <td colSpan={STAGES.length + 2} className="px-3 py-2">
                          <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                            {[...list].sort((a, b) => Number(isBuilt(b)) - Number(isBuilt(a)) || ['core', 'v1', 'roadmap'].indexOf(a.priority) - ['core', 'v1', 'roadmap'].indexOf(b.priority)).map((n) => (
                              <li key={n.id} className="flex items-start gap-1.5 text-meta">
                                {isBuilt(n) ? <Check size={12} className="mt-0.5 shrink-0 text-accent" aria-label="Built" /> : <FlaskConical size={12} className="mt-0.5 shrink-0 text-muted" aria-label="Researched, not runnable" />}
                                <span className={isBuilt(n) ? 'font-medium' : 'text-ink/75'}>{n.name}</span>
                                <span className="shrink-0 text-meta text-muted">{STAGES.find((s) => s.id === stageOf(n))?.label} · {MILESTONE[n.priority].label}{n.status === 'preview' ? ' · preview' : ''}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </section>
        <EvalCasesSection />
        <p className="mt-3 flex items-start gap-1.5 text-meta text-muted"><Package size={13} className="mt-0.5 shrink-0" aria-hidden />Some built nodes cover parts of a researched module, so a module can appear as both. Present-stage tools (A2 frame, captures, boards, drawings) are features of the stage, not registry nodes, so Presentation reads 0 built here. Detailed notes on what each build covers and lacks are in the plan's tracker (04 Tool Plan/PLAN.md §3).</p>
      </div>
    </div>
  )
}
