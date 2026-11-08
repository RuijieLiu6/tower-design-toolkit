// Sources & assumptions (#/sources; research P16-M01 citations): every source any built node cites, with research
// metadata where the packets list it; the team's editable presets with their current values; every unverified or
// unresolved result; every false assumption in magenta with its correction. Filter by flag, category and node; each
// entry links back to its node and rule card. Exports a bibliography for the boards (Markdown, or a numbered block).
import { projectSiteArea } from '../lib/siteArea'
import { useSiteStore } from '../lib/siteStore'
import { streetsCtx, useSiteStreets } from '../lib/siteStreets'
import { ArrowLeft, BookOpen, ClipboardCopy, Download, ExternalLink, Search } from '../components/icons'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { RuleCardView } from '../components/RuleCardView'
import { FlagChip, StateChip } from '../components/ui'
import { BUILT_NODES, CATEGORIES, nodeById, type Category } from '../data/registry'
import { RULE_CARDS } from '../data/ruleCards'
import { DEFAULT_EGRESS_PRESETS } from '../engine/egress'
import { DEFAULT_SYSTEMS_PRESETS } from '../engine/lifeSafety'
import { DEFAULT_LIFT_PRESETS } from '../engine/lifts'
import type { Flag } from '../engine/types'
import { DEFAULT_WIND_PRESETS } from '../engine/windStructure'
import { useEconomics } from '../hooks/useEconomics'
import { useEnergyCarbon } from '../hooks/useEnergyCarbon'
import { useFacade } from '../hooks/useFacade'
import { useMobility } from '../hooks/useMobility'
import { useSolar } from '../hooks/useSolarAccess'
import { saveFile } from '../lib/download'
import { evidenceGroups, mergeGroups } from '../lib/evidence/engines'
import { FLAG_LABEL, FLAGS, bibliography, buildHub, type EvidenceItem, type FalseItem, type SourceEntry } from '../lib/evidence/hub'
import { navigate } from '../lib/route'
import { useStore } from '../store'

type Tab = 'sources' | 'false' | 'open' | 'team'
const nodeName = (id: string) => nodeById(id)?.name ?? id
const catOf = (id?: string) => (id ? nodeById(id)?.category : undefined)

function openNode(id: string) {
  const n = nodeById(id)
  const s = useStore.getState()
  if (n?.phase === 'advanced') s.setPhase('advanced')
  else if (n?.phase === 'basic') s.setPhase('basic')
  s.selectNode(id)
  navigate('guided')
}

function NodeLink({ id }: { id: string }) {
  return <button onClick={() => openNode(id)} aria-label={`Open ${nodeName(id)} in the app`} className="rounded border border-line px-1.5 py-0.5 text-meta text-slate-700 hover:border-accent hover:text-accent">{nodeName(id)}</button>
}

function CardLinks({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!ids.length) return null
  const card = RULE_CARDS.find((c) => c.id === open)
  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-1 text-meta text-muted">Rule cards:
        {ids.map((id) => <button key={id} onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} className={`rounded border px-1.5 py-0.5 ${open === id ? 'border-accent text-accent' : 'border-line text-slate-700 hover:border-accent'}`}>{RULE_CARDS.find((c) => c.id === id)?.title ?? id}</button>)}
      </div>
      {card && <div className="mt-1 max-w-xl"><RuleCardView card={card} lines={[]} /></div>}
    </div>
  )
}

function SourceCard({ s }: { s: SourceEntry }) {
  const m = s.meta
  return (
    <article className="rounded-lg border border-line bg-panel p-3 text-meta">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{m?.title || s.label}</h3>
          <div className="text-meta text-muted">{[m?.publisher, m?.year, m?.type].filter(Boolean).join(' · ') || s.label}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <FlagChip flag={s.weakest} />
          {m ? <span className={`rounded border px-1.5 py-0.5 text-meta ${m.opened ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{m.opened ? 'Opened in research' : 'Not opened'}</span>
            : <span className="rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-meta text-muted">Not in the research source lists</span>}
        </div>
      </div>
      {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-meta text-accent hover:underline"><ExternalLink size={11} />{s.url}</a>}
      {s.pages.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{s.pages.map((p) => <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-meta text-slate-700">{p}</span>)}</div>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-meta text-muted">Used by {s.nodes.map((n) => <NodeLink key={n} id={n} />)}</div>
      <div className="mt-1 text-meta text-muted">
        {FLAGS.filter((f) => s.counts[f]).map((f) => `${s.counts[f]} ${FLAG_LABEL[f].toLowerCase()}`).join(' · ') || 'Declared source (no live result cites it yet)'}
        {m?.ids.length ? ` · research ${m.ids.join(', ')}` : ''}
      </div>
      <CardLinks ids={s.cards} />
    </article>
  )
}

function FalseCard({ f }: { f: FalseItem }) {
  return (
    <article className="rounded-lg border-2 border-flag-false bg-panel p-3 text-meta">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-flag-false line-through decoration-1">{f.claim}</p>
        <FlagChip flag="false_assumption" />
      </div>
      <p className="mt-1 text-slate-800"><b>Correction:</b> {f.correction}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-meta text-muted">
        {f.node && <NodeLink id={f.node} />}
        {f.origin === 'research' ? <span>research packet {f.packet}{f.round && f.round !== '0' ? `, round ${f.round}` : ''}</span> : <span>{f.origin === 'result' ? 'a result flagged false' : 'kept in the node'}</span>}
        {f.source && (f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer" className="hover:text-accent">{f.source.label}{f.source.page ? `, ${f.source.page}` : ''}</a> : <span>{f.source.label}{f.source.page ? `, ${f.source.page}` : ''}</span>)}
      </div>
    </article>
  )
}

function ItemRow({ i }: { i: EvidenceItem }) {
  const cards = useMemo(() => RULE_CARDS.filter((c) => c.usedBy.includes(i.node) && i.resultId && c.results.some((p) => i.resultId!.startsWith(p.slice(p.indexOf(':') + 1)))).map((c) => c.id), [i])
  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-2 text-meta">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium">{i.label}</span>
        <span className="flex items-center gap-1">{i.state && <StateChip state={i.state} />}<FlagChip flag={i.flag} /></span>
      </div>
      {i.value && <div className="text-meta text-slate-700">{i.value}</div>}
      {i.note && <div className="mt-0.5 text-meta text-slate-600">{i.note}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-1 text-meta text-muted">
        <NodeLink id={i.node} />
        {i.source.url ? <a href={i.source.url} target="_blank" rel="noreferrer" className="hover:text-accent">{i.source.label}{i.source.page ? `, ${i.source.page}` : ''}</a> : <span>{i.source.label}{i.source.page ? `, ${i.source.page}` : ''}</span>}
      </div>
      <CardLinks ids={cards} />
    </div>
  )
}

const words = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/M2/g, 'm²').toLowerCase().replace(/^./, (c) => c.toUpperCase())
function PresetTable({ title, node, values, defaults }: { title: string; node: string; values: object; defaults: object }) {
  const d = defaults as Record<string, unknown>
  const rows = Object.entries(values as Record<string, unknown>).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean' || v === null)
  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2"><h3 className="text-meta font-semibold">{title}</h3><NodeLink id={node} /></div>
      <table className="w-full text-meta">
        <tbody>{rows.map(([k, v]) => {
          const changed = JSON.stringify(v) !== JSON.stringify(d[k])
          return <tr key={k} className="border-t border-line/60"><td className="py-0.5 pr-2">{words(k)}</td><td className="py-0.5 text-right tabular-nums">{String(v)}</td><td className="w-28 py-0.5 pl-2 text-meta text-muted">{changed ? <span className="rounded bg-amber-50 px-1 text-amber-900">changed (default {String(d[k])})</span> : 'default'}</td></tr>
        })}</tbody>
      </table>
    </section>
  )
}

export default function Sources() {
  useEffect(() => { document.title = 'Sources & assumptions · Tower Design Toolkit' }, [])
  const s = useStore(useShallow((x) => ({ towers: x.towers, fsrTier: x.fsrTier, transitLink: x.transitLink, liftPresets: x.liftPresets, egressPresets: x.egressPresets, publicRealm: x.publicRealm, cityInNature: x.cityInNature, windPresets: x.windPresets, systemsPresets: x.systemsPresets })))
  const mobility = useMobility()
  const facade = useFacade()
  const econ = useEconomics()
  const energy = useEnergyCarbon()
  const solar = useSolar((x) => x.out)
  const studyArea = useSiteStore((x) => x.fsrArea)
  const citySite = useStore((x) => x.citySite)
  const cityStreets = useSiteStreets(true).result
  const cityArea = projectSiteArea('city', studyArea, citySite).area
  const hub = useMemo(() => {
    const base = { fsrTier: s.fsrTier, transitLink: s.transitLink, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets, systemsPresets: s.systemsPresets }
    const live = { 'built.mobility': mobility.rules, 'built.facade': facade.rules, 'built.economics': [econ.presets, (econ.result as { charges?: { lines?: unknown } } | undefined)?.charges?.lines ?? []], ...(energy ? { 'built.energy-carbon': energy } : {}), ...(solar ? { 'built.solar-access': (solar as { lines?: unknown }).lines ?? [] } : {}) }
    return buildHub(mergeGroups(evidenceGroups({ ...base, project: 'vtc', towers: s.towers.vtc }), evidenceGroups({ ...base, project: 'city', towers: s.towers.city, studyArea: cityArea, cityRing: (citySite?.ring ?? null) as [number, number][] | null, cityStreets: streetsCtx(citySite, cityStreets) }), live))
  }, [s, mobility, facade, econ, energy, solar, cityArea, citySite, cityStreets])

  const [tab, setTab] = useState<Tab>('sources')
  const [flag, setFlag] = useState<Flag | 'all'>('all')
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [node, setNode] = useState<string>('all')
  const [q, setQ] = useState('')
  const [showResearch, setShowResearch] = useState(false)
  const [limit, setLimit] = useState(60)
  const [copied, setCopied] = useState(false)
  const text = q.trim().toLowerCase()
  const nodeOk = (n?: string) => (node === 'all' || n === node) && (cat === 'all' || catOf(n) === cat)
  const has = (t: string) => !text || t.toLowerCase().includes(text)

  const sources = hub.sources.filter((x) => (flag === 'all' || x.counts[flag] || (flag === 'verified' && !Object.keys(x.counts).length)) && x.nodes.some(nodeOk) && has(`${x.meta?.title ?? ''} ${x.label} ${x.meta?.publisher ?? ''} ${x.pages.join(' ')}`))
  const falses = hub.falseAssumptions.filter((f) => (showResearch || f.origin !== 'research') && (node === 'all' && cat === 'all' ? true : nodeOk(f.node)) && has(`${f.claim} ${f.correction} ${f.packet ?? ''}`))
  const openItems = hub.items.filter((i) => i.origin === 'result' && (flag === 'all' ? i.flag === 'unverified' || i.flag === 'unresolved' : i.flag === flag) && nodeOk(i.node) && has(`${i.label} ${i.value ?? ''} ${i.source.label}`))
  const teamItems = hub.items.filter((i) => i.origin === 'result' && i.flag === 'team_assumption' && nodeOk(i.node) && has(`${i.label} ${i.value ?? ''} ${i.source.label}`))
  const appFalse = hub.falseAssumptions.filter((f) => f.origin !== 'research').length

  const exportMd = () => saveFile('tower-studio-sources.md', bibliography(hub, 'markdown', (x) => sources.includes(x)))
  const board = () => bibliography(hub, 'board', (x) => sources.includes(x))
  const copyBoard = async () => { try { await navigator.clipboard.writeText(board()); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { saveFile('tower-studio-sources-board.txt', board()) } }

  const TABS: { id: Tab; label: string; n: number }[] = [
    { id: 'sources', label: 'Sources', n: sources.length },
    { id: 'false', label: 'False assumptions', n: falses.length },
    { id: 'open', label: flag === 'all' ? 'Unverified & unresolved' : FLAG_LABEL[flag], n: openItems.length },
    { id: 'team', label: 'Team assumptions & presets', n: teamItems.length },
  ]
  const select = 'rounded border border-line bg-panel px-2 py-1 text-meta outline-none focus:border-accent'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-paper text-ink">
      <header className="border-b border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('guided')} className="flex items-center gap-1 rounded px-1.5 py-1 text-meta text-muted hover:text-ink" title="Back to the design"><ArrowLeft size={14} />Design</button>
            <h1 className="flex items-center gap-1.5 text-base font-semibold"><BookOpen size={18} />Sources &amp; assumptions</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportMd} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-meta hover:border-accent hover:text-accent"><Download size={13} />Export bibliography (.md)</button>
            <button onClick={copyBoard} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-meta hover:border-accent hover:text-accent"><ClipboardCopy size={13} />{copied ? 'Copied' : 'Copy board text'}</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Results by evidence flag">
          {FLAGS.map((f) => (
            <button key={f} onClick={() => { setFlag(flag === f ? 'all' : f); if (f === 'false_assumption') setTab('false') }} aria-pressed={flag === f} aria-label={`Show ${FLAG_LABEL[f].toLowerCase()}: ${f === 'false_assumption' ? appFalse : hub.counts[f]}`}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-meta ${flag === f ? 'border-accent bg-accent/5' : 'border-line hover:border-slate-400'}`}>
              <FlagChip flag={f} /><b className="tabular-nums">{f === 'false_assumption' ? appFalse : hub.counts[f]}</b>
            </button>
          ))}
          <span className="text-meta text-muted">{hub.sources.length} sources · results across both projects · plus {hub.falseAssumptions.length - appFalse} false assumptions corrected in the research packets</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-chrome px-4 py-2">
        <div role="tablist" className="flex flex-wrap gap-1">
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-md px-2 py-1 text-meta ${tab === t.id ? 'bg-ink text-white' : 'text-slate-700 hover:bg-black/5'}`}>{t.label} <span className="tabular-nums opacity-70">{t.n}</span></button>)}
        </div>
        <span className="flex-1" />
        <label className="flex items-center gap-1 text-meta text-muted">Flag
          <select className={select} value={flag} onChange={(e) => setFlag(e.target.value as Flag | 'all')}><option value="all">All</option>{FLAGS.map((f) => <option key={f} value={f}>{FLAG_LABEL[f]}</option>)}</select></label>
        <label className="flex items-center gap-1 text-meta text-muted">Category
          <select className={select} value={cat} onChange={(e) => setCat(e.target.value as Category | 'all')}><option value="all">All</option>{(Object.keys(CATEGORIES) as Category[]).filter((c) => BUILT_NODES.some((n) => n.category === c)).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}</select></label>
        <label className="flex items-center gap-1 text-meta text-muted">Node
          <select className={select} value={node} onChange={(e) => setNode(e.target.value)}><option value="all">All built nodes</option>{BUILT_NODES.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
        <label className="flex items-center gap-1 rounded border border-line bg-panel px-2 py-1"><Search size={12} className="text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search sources and assumptions" className="w-40 bg-transparent text-meta outline-none" /></label>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto grid max-w-5xl gap-2">
          {tab === 'sources' && (sources.length ? sources.map((x) => <SourceCard key={x.key} s={x} />) : <p className="text-meta text-muted">No source matches these filters.</p>)}
          {tab === 'false' && (
            <>
              <p className="text-meta text-slate-700">Each was believed at some point and found wrong. It stays visible, struck through in magenta, with the correction the tool now uses.</p>
              <label className="flex items-center gap-1.5 text-meta"><input type="checkbox" checked={showResearch} onChange={(e) => { setShowResearch(e.target.checked); setLimit(60) }} />Include the {hub.falseAssumptions.length - appFalse} corrected in the research packets</label>
              {falses.slice(0, limit).map((f) => <FalseCard key={f.id} f={f} />)}
              {falses.length > limit && <button onClick={() => setLimit(limit + 100)} className="justify-self-start rounded border border-line px-2 py-1 text-meta hover:border-accent">Show more ({falses.length - limit} left)</button>}
              {!falses.length && <p className="text-meta text-muted">None match these filters.</p>}
            </>
          )}
          {tab === 'open' && (openItems.length ? openItems.slice(0, limit).map((i, k) => <ItemRow key={`${i.node}-${i.label}-${k}`} i={i} />) : <p className="text-meta text-muted">None match these filters.</p>)}
          {tab === 'open' && openItems.length > limit && <button onClick={() => setLimit(limit + 100)} className="justify-self-start rounded border border-line px-2 py-1 text-meta hover:border-accent">Show more ({openItems.length - limit} left)</button>}
          {tab === 'team' && (
            <>
              <p className="text-meta text-slate-700">Team assumptions are editable presets the team chose; no source sets them. Change them in their node.</p>
              <div className="grid gap-2 md:grid-cols-2">
                {nodeOk('built.core-lifts') && <PresetTable title="Lift presets" node="built.core-lifts" values={s.liftPresets} defaults={DEFAULT_LIFT_PRESETS} />}
                {nodeOk('built.egress') && <PresetTable title="Egress presets" node="built.egress" values={s.egressPresets} defaults={DEFAULT_EGRESS_PRESETS} />}
                {nodeOk('built.wind-procedure') && <PresetTable title="Wind procedure presets" node="built.wind-procedure" values={s.windPresets} defaults={DEFAULT_WIND_PRESETS} />}
                {nodeOk('built.life-safety') && <PresetTable title="Code & life safety presets" node="built.life-safety" values={s.systemsPresets ?? DEFAULT_SYSTEMS_PRESETS} defaults={DEFAULT_SYSTEMS_PRESETS} />}
              </div>
              <h2 className="mt-2 text-meta font-semibold">Results that rest on a team assumption ({teamItems.length})</h2>
              {teamItems.slice(0, limit).map((i, k) => <ItemRow key={`${i.node}-${i.label}-${k}`} i={i} />)}
              {teamItems.length > limit && <button onClick={() => setLimit(limit + 100)} className="justify-self-start rounded border border-line px-2 py-1 text-meta hover:border-accent">Show more ({teamItems.length - limit} left)</button>}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
