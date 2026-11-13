// The set-up panel under the Workflow card (Sinnie, 12 Nov: "implement these two panels, maintain the toolkit UI only,
// learn how the tower design tool lays out information"): like the Tower Workspace's set-up column, one tab per thing the
// model is made of, Site · Form · Program · Material. Each tab is what the model holds for it, in the toolkit's own
// components and tokens: Site is Your site (SiteInfo); Form lists the towers tallest first (pick, delete, place one);
// Program shows each tower's stack of uses and the project mix; Material gives each tower a facade material.
// The tab follows the phase (Site, Form, Program) and stays where the user puts it otherwise.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Building2, Trash2 } from '../icons'
import { USES, type Tower, type UseId } from '../../engine/types'
import type { PhaseId } from '../../lib/phases'
import { pickTower } from '../../lib/towerEdit'
import { useStore } from '../../store'

const SiteInfo = lazy(() => import('../site/SiteInfo'))
type SetupTab = 'site' | 'form' | 'program' | 'material'
const TABS: { id: SetupTab; label: string }[] = [{ id: 'site', label: 'Site' }, { id: 'form', label: 'Form' }, { id: 'program', label: 'Program' }, { id: 'material', label: 'Material' }]
const FOLLOW: Partial<Record<PhaseId, SetupTab>> = { site: 'site', form: 'form', program: 'program' }

/** Facade materials (illustrative; no check reads them yet). */
export const MATERIALS: Record<string, { label: string; color: string }> = {
  glass: { label: 'Glass curtain wall', color: '#9fc3d6' },
  concrete: { label: 'Concrete', color: '#b8b5ae' },
  timber: { label: 'Mass timber', color: '#c9a477' },
  brick: { label: 'Brick', color: '#b5654a' },
  metal: { label: 'Metal panel', color: '#8d949c' },
}
const DEFAULT_MATERIAL = 'glass'

const floorsOf = (t: Tower) => Math.max(1, Math.round(t.height / t.f2f))
const section = 'border-b border-line px-3 py-3'
const h3 = 'mb-2 flex items-center gap-2 text-control font-semibold text-ink'
const row = (on: boolean) => `flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-selected' : 'hover:bg-subtle'}`

export default function SetupPanel({ phase }: { phase: PhaseId }) {
  const [tab, setTab] = useState<SetupTab>(FOLLOW[phase] ?? 'form')
  useEffect(() => { const f = FOLLOW[phase]; if (f) setTab(f) }, [phase])
  return (
    <section aria-label="Set-up" data-testid="setup-panel" className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Set-up" className="flex border-b border-line px-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`setup-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="setup-body" onClick={() => setTab(t.id)} data-testid={`setup-tab-${t.id}`}
            className={`flex-1 px-1.5 py-2.5 text-control font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${tab === t.id ? 'border-b-2 border-accent text-ink' : 'text-muted hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      <div id="setup-body" role="tabpanel" aria-labelledby={`setup-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {tab === 'site' && <Suspense fallback={<p className="p-4 text-meta text-muted">Loading your site…</p>}><SiteInfo /></Suspense>}
        {tab === 'form' && <FormTab />}
        {tab === 'program' && <ProgramTab />}
        {tab === 'material' && <MaterialTab />}
      </div>
    </section>
  )
}

function useTowerList() {
  const { towers, selected, present } = useStore(useShallow((s) => ({ towers: s.towers[s.project], selected: s.selectedTower, present: s.phase === 'present' })))
  const sorted = useMemo(() => [...towers].sort((a, b) => b.height - a.height || a.name.localeCompare(b.name)), [towers])
  return { towers: sorted, selected, present }
}
const NoTower = () => <p className="text-meta text-muted">No tower yet. Place one with Place on the tower rail (right panel) to set its form, program and material.</p>

function FormTab() {
  const { towers, selected, present } = useTowerList()
  const remove = useStore((s) => s.removeTower)
  const [ask, setAsk] = useState<string | null>(null)
  const tallest = towers[0]?.height ?? 0
  const floors = towers.reduce((n, t) => n + floorsOf(t), 0)
  return (
    <>
      <div className={section}>
        <h3 className={h3}>Towers <span className="font-normal text-muted">{towers.length} · tallest first</span></h3>
        {towers.length ? (
          <ul className="space-y-0.5" data-testid="setup-towers">
            {towers.map((t) => (
              <li key={t.id} className="flex items-center gap-1">
                <button type="button" onClick={() => pickTower(t.id)} aria-current={selected === t.id ? 'true' : undefined} className={row(selected === t.id)}>
                  <Building2 size={14} aria-hidden className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.name}</span>
                  <span className="shrink-0 text-meta text-muted">{floorsOf(t)} fl · {Math.round(t.height)} m</span>
                </button>
                {!present && (ask === t.id
                  ? <button type="button" onClick={() => { remove(t.id); setAsk(null) }} onBlur={() => setAsk(null)} className="h-8 shrink-0 rounded-lg bg-error-surface px-2 text-meta font-medium text-error outline-none focus-visible:ring-2 focus-visible:ring-accent">Delete?</button>
                  : <button type="button" onClick={() => setAsk(t.id)} aria-label={`Delete ${t.name}`} title="Delete this tower (Undo brings it back)" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-error focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={14} aria-hidden /></button>)}
              </li>
            ))}
          </ul>
        ) : <NoTower />}
      </div>
      <div className={section}>
        <div className="flex justify-between text-meta"><span className="text-muted">Tallest</span><b className="text-ink">{Math.round(tallest)} m</b></div>
        <div className="mt-0.5 flex justify-between text-meta"><span className="text-muted">Tower floors, all towers</span><b className="text-ink">{floors}</b></div>
      </div>
    </>
  )
}

/** Each tower's floors by use: the bands share the tower floors, the podium counts as its own use. */
function useMix(towers: Tower[]) {
  return useMemo(() => {
    const by: Partial<Record<UseId, number>> = {}
    for (const t of towers) {
      const fl = floorsOf(t), pod = Math.max(0, Math.round(t.podiumHeight / t.f2f))
      by[t.podiumUse] = (by[t.podiumUse] ?? 0) + pod
      for (const b of t.bands) by[b.use] = (by[b.use] ?? 0) + b.share * Math.max(0, fl - pod)
    }
    const total = Object.values(by).reduce((s, v) => s + (v ?? 0), 0)
    return { by, total }
  }, [towers])
}

function ProgramTab() {
  const { towers, selected, present } = useTowerList()
  const update = useStore((s) => s.updateTower)
  const { by, total } = useMix(towers)
  if (!towers.length) return <div className={section}><NoTower /></div>
  return (
    <>
      <div className={section}>
        <h3 className={h3}>Program by tower</h3>
        <ul className="space-y-2" data-testid="setup-program">
          {towers.map((t) => {
            const sum = t.bands.reduce((s, b) => s + b.share, 0) || 1
            return (
              <li key={t.id}>
                <button type="button" onClick={() => pickTower(t.id)} className={row(selected === t.id)}>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.name}</span>
                  <span className="flex h-2.5 w-24 shrink-0 overflow-hidden rounded-full border border-line" aria-label={t.bands.map((b) => `${USES[b.use].label} ${Math.round((b.share / sum) * 100)}%`).join(', ')}>
                    {t.bands.map((b, i) => <span key={i} style={{ width: `${(b.share / sum) * 100}%`, background: USES[b.use].color }} />)}
                  </span>
                </button>
                <label className="mt-1 flex items-center justify-between gap-2 px-2 text-meta text-muted">Podium
                  <select value={t.podiumUse} disabled={present} onChange={(e) => update(t.id, { podiumUse: e.target.value as UseId })} aria-label={`Podium use of ${t.name}`}
                    className="h-7 w-40 rounded-lg border border-line bg-panel px-1.5 text-meta text-ink">{(Object.keys(USES) as UseId[]).map((u) => <option key={u} value={u}>{USES[u].label}</option>)}</select>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-meta text-muted">The tower's own stack of uses is set in the Program phase (Program tool).</p>
      </div>
      <div className={section}>
        <h3 className={h3}>Mix <span className="font-normal text-muted">by floors</span></h3>
        <div className="mb-2 flex h-3 overflow-hidden rounded-full border border-line">
          {(Object.keys(USES) as UseId[]).filter((u) => by[u]).map((u) => <span key={u} title={USES[u].label} style={{ width: `${((by[u] ?? 0) / total) * 100}%`, background: USES[u].color }} />)}
        </div>
        {(Object.keys(USES) as UseId[]).filter((u) => by[u]).map((u) => (
          <div key={u} className="flex items-center justify-between text-meta">
            <span className="flex items-center gap-1.5 text-ink"><i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: USES[u].color }} />{USES[u].label}</span>
            <b className="text-ink">{Math.round(by[u] ?? 0)} fl · {Math.round(((by[u] ?? 0) / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </>
  )
}

function MaterialTab() {
  const { towers, selected, present } = useTowerList()
  const update = useStore((s) => s.updateTower)
  if (!towers.length) return <div className={section}><NoTower /></div>
  const mat = (t: Tower) => t.material && MATERIALS[t.material] ? t.material : DEFAULT_MATERIAL
  return (
    <>
      <div className={section}>
        <h3 className={h3}>Material by tower</h3>
        <ul className="space-y-0.5" data-testid="setup-material">
          {towers.map((t) => (
            <li key={t.id} className={`${row(selected === t.id)} cursor-default`}>
              <i aria-hidden className="block h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: MATERIALS[mat(t)].color }} />
              <button type="button" onClick={() => pickTower(t.id)} className="min-w-0 flex-1 truncate text-left font-medium text-ink outline-none">{t.name}</button>
              <select value={mat(t)} disabled={present} onChange={(e) => update(t.id, { material: e.target.value })} aria-label={`Material of ${t.name}`}
                className="h-7 w-36 shrink-0 rounded-lg border border-line bg-panel px-1.5 text-meta text-ink">{Object.keys(MATERIALS).map((k) => <option key={k} value={k}>{MATERIALS[k].label}</option>)}</select>
            </li>
          ))}
        </ul>
      </div>
      {!present && (
        <div className={section}>
          <span className="mb-1.5 block text-meta text-muted">Set every tower to</span>
          <div className="flex flex-wrap gap-1">
            {Object.keys(MATERIALS).map((k) => (
              <button key={k} type="button" onClick={() => towers.forEach((t) => update(t.id, { material: k }))}
                className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-panel px-2 text-meta text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                <i aria-hidden className="block h-2.5 w-2.5 rounded-sm" style={{ background: MATERIALS[k].color }} />{MATERIALS[k].label}</button>
            ))}
          </div>
          <p className="mt-2 text-meta text-muted">The material is kept with the project for the boards and your notes. No check reads it yet.</p>
        </div>
      )}
    </>
  )
}
