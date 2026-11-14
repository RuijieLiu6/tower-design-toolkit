// The set-up panel under the Workflow card (Sinnie, 12 Nov: "implement these two panels, maintain the toolkit UI only,
// learn how the tower design tool lays out information"): like the Tower Workspace's set-up column, one tab per thing the
// model is made of, Site · Form · Program · Material. Each tab is what the model holds for it, in the toolkit's own
// components and tokens: Site is Select site · Import site (SiteChoose; 12 Nov, the Your site card left this panel); Form lists the towers tallest first (pick, delete, place one);
// Program shows each tower's stack of uses and the project mix; Material gives each tower a facade material.
// The tab follows the phase (Site, Form, Program) and stays where the user puts it otherwise.
// 12 Nov (screenshots, "the UI should stay the same as the original toolkit"): tabs Site · Massing · Material · Program;
// Massing = Masses (eye, delete) + floor area / tallest / coverage + Draw a mass / Clear all + Import a model (3DM file,
// live link to Rhino); Material and Program = one dropdown a mass + set-all chips / the mix in m².
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChevronDown, Eye, EyeOff, Trash2 } from '../icons'
import { USES, type Tower, type UseId } from '../../engine/types'
import { gfaByUse, towerFootprint } from '../../engine/massing'
import { polyArea } from '../../engine/site'
import type { PhaseId } from '../../lib/phases'
import { pickTower } from '../../lib/towerEdit'
import { useHiddenTowers } from '../../lib/hiddenTowers'
import { useProjectSiteArea } from '../../lib/siteArea'
import { useDisplayMode } from '../../lib/displayMode'
import { useTransfer } from '../../lib/porting/transfer'
import { connectRhino, useRhinoState } from '../../lib/interchange/rhinoLink'
import { breakStep } from '../../lib/project/history'
import { useStore } from '../../store'
import { placeFirstTower } from '../tools/NoTower'

const SiteChoose = lazy(() => import('../site/SiteChoose'))
const ToolPanel = lazy(() => import('../tools/ToolPanel'))
type SetupTab = 'site' | 'massing' | 'material' | 'program'
const TABS: { id: SetupTab; label: string }[] = [{ id: 'site', label: 'Site' }, { id: 'massing', label: 'Massing' }, { id: 'material', label: 'Material' }, { id: 'program', label: 'Program' }]
const FOLLOW: Partial<Record<PhaseId, SetupTab>> = { site: 'site', form: 'massing', program: 'program' }

/** Facade materials (illustrative; no check reads them yet). */
export const MATERIALS: Record<string, { label: string; short: string; color: string }> = {
  concrete: { label: 'Concrete', short: 'Concrete', color: '#d6d3cd' },
  glass: { label: 'Glass curtain wall', short: 'Glass', color: '#bcd3e3' },
  timber: { label: 'Mass timber', short: 'Timber', color: '#e3c9a0' },
  brick: { label: 'Brick', short: 'Brick', color: '#c99a8c' },
  metal: { label: 'Metal panel', short: 'Metal', color: '#c4c7cc' },
}
const DEFAULT_MATERIAL = 'glass'

const section = 'border-b border-line px-3 py-3'
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')
const select = 'h-8 w-32 shrink-0 rounded-lg border-0 bg-subtle px-2 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60'
const iconBtn = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'
const Dot = ({ color }: { color: string }) => <i aria-hidden className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />

export default function SetupPanel({ phase }: { phase: PhaseId }) {
  const [tab, setTab] = useState<SetupTab>(FOLLOW[phase] ?? 'massing')
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
        {tab === 'site' && <Suspense fallback={<div aria-busy="true" className="min-h-16" />}><SiteChoose /></Suspense>}
        {tab === 'massing' && <MassingTab />}
        {tab === 'program' && <ProgramTab />}
        {tab === 'material' && <MaterialTab />}
      </div>
    </section>
  )
}

/** A section with a folding title: chevron, title, a note on the right. */
function Section({ title, note, children, testId }: { title: string; note?: ReactNode; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={section} data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mb-2 flex w-full items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <ChevronDown size={12} aria-hidden className={`shrink-0 text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="flex-1 text-control font-semibold text-ink">{title}</span>
        {note != null && <span className="text-meta text-muted">{note}</span>}
      </button>
      {open && children}
    </div>
  )
}

function useTowerList() {
  const { towers, selected, present } = useStore(useShallow((s) => ({ towers: s.towers[s.project], selected: s.selectedTower, present: s.phase === 'present' })))
  const sorted = useMemo(() => [...towers].sort((a, b) => b.height - a.height || a.name.localeCompare(b.name)), [towers])
  return { towers: sorted, selected, present }
}
const NoTower = () => <p className="text-meta text-muted">No mass yet: Draw a mass in the Massing tab, or Place on the tower rail.</p>
const floorsOf = (t: Tower) => Math.max(1, Math.round(t.height / t.f2f))
const mainUse = (t: Tower): UseId => (t.bands.length ? t.bands.reduce((a, b) => (b.share > a.share ? b : a)).use : t.podiumUse)

/** One mass's line: its dot, its name (picks it), then what the tab adds. */
function MassRow({ t, on, color, children }: { t: Tower; on: boolean; color: string; children: ReactNode }) {
  return (
    <li className={`flex min-h-10 items-center gap-2 rounded-lg px-2 ${on ? 'bg-selected' : ''}`}>
      <Dot color={color} />
      <button type="button" onClick={() => pickTower(t.id)} aria-current={on ? 'true' : undefined} className="min-w-0 flex-1 truncate text-left text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">{t.name}</button>
      {children}
    </li>
  )
}

function MassingTab() {
  const { towers, selected, present } = useTowerList()
  const remove = useStore((s) => s.removeTower)
  const placing = useStore((s) => s.placing)
  const hidden = useHiddenTowers((s) => s.hidden)
  const toggle = useHiddenTowers((s) => s.toggle)
  const site = useProjectSiteArea()
  const [ask, setAsk] = useState(false)
  const gfa = useMemo(() => Object.values(gfaByUse(towers)).reduce((a, b) => a + b, 0), [towers])
  const ground = useMemo(() => towers.reduce((s, t) => s + Math.max(polyArea([towerFootprint(t)]), t.podiumHeight > 0 ? polyArea([towerFootprint(t, true)]) : 0), 0), [towers])
  const tallest = towers[0]?.height ?? 0
  const clearAll = () => { if (!ask) { setAsk(true); return } breakStep(); towers.forEach((t) => remove(t.id)); breakStep(); setAsk(false) }
  const btn = 'flex h-10 flex-1 items-center justify-center rounded-xl border border-line bg-panel text-control outline-none hover:border-boundary focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
  return (
    <>
      {/* 12 Nov ("this should show up under massing in the left panel not right"): the Form step's tools (Generate,
          Place your tower, the massing tools) sit here; the right panel's Properties shows the picked tower. */}
      <div className="border-b border-line" data-testid="setup-form-tools"><Suspense fallback={<div aria-busy="true" className="min-h-16" />}><ToolPanel embedded step="volume" /></Suspense></div>
      {towers.length > 0 && <Section title="Masses" note={`${towers.length} · tallest first`} testId="setup-masses">
        {towers.length ? (
          <ul className="space-y-0.5" data-testid="setup-towers">
            {towers.map((t) => (
              <MassRow key={t.id} t={t} on={selected === t.id} color={USES[mainUse(t)].color}>
                <span className="shrink-0 text-meta tabular-nums text-muted">{floorsOf(t)} st · {Math.round(t.height)} m</span>
                <button type="button" onClick={() => toggle(t.id)} aria-label={`${hidden[t.id] ? 'Show' : 'Hide'} ${t.name}`} title={hidden[t.id] ? 'Show in the view' : 'Hide from the view (it still counts in the checks)'} className={iconBtn}>
                  {hidden[t.id] ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}</button>
                <button type="button" disabled={present} onClick={() => { breakStep(); remove(t.id); breakStep() }} aria-label={`Delete ${t.name}`} title="Delete (Undo brings it back)" className={`${iconBtn} hover:text-red-700`}><Trash2 size={15} aria-hidden /></button>
              </MassRow>
            ))}
          </ul>
        ) : null}
      </Section>}
      <div className={section}>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-control" data-testid="setup-massing-stats">
          <dt className="text-muted">Floor area</dt><dd className="text-right tabular-nums text-ink">{fmt(gfa)} m²</dd>
          <dt className="text-muted">Tallest</dt><dd className="text-right tabular-nums text-ink">{tallest.toFixed(1)} m</dd>
          <dt className="text-muted">Coverage</dt>
          <dd className="text-right tabular-nums text-ink" title={site.area ? `Ground footprint ${fmt(ground)} m² over a site of ${fmt(site.area)} m²` : site.source}>{site.area ? `${Math.round((ground / site.area) * 100)}%` : '–'}</dd>
        </dl>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={present} aria-pressed={placing} onClick={() => (placing ? useStore.getState().set({ placing: false }) : placeFirstTower())} title="Adds a mass; click on the site where it should stand (Esc keeps it where it is)"
            className={`${btn} ${placing ? 'border-accent bg-selected text-accent-hover' : 'text-ink'}`}>{placing ? 'Click to set it' : 'Draw a mass'}</button>
          <button type="button" disabled={present || !towers.length} onClick={clearAll} onBlur={() => setAsk(false)} title="Delete every mass (Undo brings them back)" className={`${btn} text-red-700`}>{ask ? 'Click again to clear' : 'Clear all'}</button>
        </div>
      </div>
      <ImportModel />
    </>
  )
}

function ImportModel() {
  const last = useRhinoState((s) => s.last)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const connect = async () => { setBusy(true); setNote(null); try { setNote(await connectRhino()) } finally { setBusy(false) } }
  return (
    <Section title="Import a model" testId="setup-import">
      <div className="flex items-center gap-3">
        <button type="button" onClick={(e) => useTransfer.getState().open('import', e.currentTarget, { purpose: 'model' })}
          style={{ background: '#26262b', color: '#fff' }} className="h-9 shrink-0 rounded-lg px-4 text-control font-medium outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent">Choose a .3dm file</button>
        <span className="text-meta text-muted">no file chosen</span>
      </div>
      <p className="mt-2 text-meta text-muted">.3dm, .obj, .gltf or .ifc. Each layer becomes tower massing or site context. Read in this browser; nothing is uploaded.</p>
      <div className="mt-3 border-t border-line pt-3">
        <button type="button" onClick={connect} disabled={busy} title="In Rhino, run the tdt_link.py script, then click here to read its model"
          className="flex items-center gap-2 text-control font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Dot color={last ? '#16a34a' : '#9ca3af'} />{busy ? 'Looking for Rhino…' : 'Live link to Rhino'}</button>
        {note && <p role="status" className="mt-1.5 text-meta text-muted">{note}</p>}
      </div>
    </Section>
  )
}

function MaterialTab() {
  const { towers, selected, present } = useTowerList()
  const update = useStore((s) => s.updateTower)
  const mat = (t: Tower) => (t.material && MATERIALS[t.material] ? t.material : DEFAULT_MATERIAL)
  return (
    <>
      <Section title="Material by mass">
        {towers.length ? (
          <ul className="space-y-1" data-testid="setup-material">
            {towers.map((t) => (
              <MassRow key={t.id} t={t} on={selected === t.id} color={MATERIALS[mat(t)].color}>
                <select value={mat(t)} disabled={present} onChange={(e) => update(t.id, { material: e.target.value })} aria-label={`Material of ${t.name}`} className={select}>
                  {Object.keys(MATERIALS).map((k) => <option key={k} value={k}>{MATERIALS[k].short}</option>)}</select>
              </MassRow>
            ))}
          </ul>
        ) : <NoTower />}
      </Section>
      {!present && towers.length > 0 && (
        <div className={section}>
          <span className="mb-1.5 block text-meta text-muted">Set every mass to</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(MATERIALS).map((k) => (
              <button key={k} type="button" onClick={() => towers.forEach((t) => update(t.id, { material: k }))}
                className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 text-meta text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                <Dot color={MATERIALS[k].color} />{MATERIALS[k].short}</button>
            ))}
          </div>
          <p className="mt-2 text-meta text-muted">The material is kept with the project for the boards and your notes. No check reads it yet.</p>
        </div>
      )}
    </>
  )
}

/** Gross floor area a home (team assumption), for the homes count under the mix. */
const HOME_M2 = 78

function ProgramTab() {
  const { towers, selected, present } = useTowerList()
  const update = useStore((s) => s.updateTower)
  const mode = useDisplayMode((s) => s.mode)
  const setMode = useDisplayMode((s) => s.setMode)
  const by = useMemo(() => gfaByUse(towers), [towers])
  const uses = (Object.keys(USES) as UseId[]).filter((u) => by[u] > 0)
  const total = uses.reduce((s, u) => s + by[u], 0)
  const colour = mode === 'program'
  return (
    <>
      <Section title="Program by mass">
        {towers.length ? (
          <ul className="space-y-1" data-testid="setup-program">
            {towers.map((t) => {
              const mixed = new Set(t.bands.map((b) => b.use)).size > 1
              return (
                <MassRow key={t.id} t={t} on={selected === t.id} color={USES[mainUse(t)].color}>
                  <select value={mixed ? '' : mainUse(t)} disabled={present} aria-label={`Program of ${t.name}`} title={mixed ? t.bands.map((b) => USES[b.use].label).join(' · ') : undefined}
                    onChange={(e) => { if (e.target.value) update(t.id, { bands: [{ use: e.target.value as UseId, share: 1 }] }) }} className={select}>
                    {mixed && <option value="">Mixed</option>}
                    {(Object.keys(USES) as UseId[]).map((u) => <option key={u} value={u}>{USES[u].label}</option>)}
                  </select>
                </MassRow>
              )
            })}
          </ul>
        ) : <NoTower />}
      </Section>
      {total > 0 && (
        <Section title="Mix" note={`${fmt(total)} m²`} testId="setup-mix">
          <div className="mb-3 flex h-2 overflow-hidden rounded-full">
            {uses.map((u) => <span key={u} title={USES[u].label} style={{ width: `${(by[u] / total) * 100}%`, background: USES[u].color }} />)}
          </div>
          <div className="space-y-1.5 text-control">
            {uses.map((u) => (
              <div key={u} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted"><Dot color={USES[u].color} />{USES[u].label}</span>
                <span className="tabular-nums text-ink">{fmt(by[u])} m² · {Math.round((by[u] / total) * 100)}%</span>
              </div>
            ))}
            {by.residential > 0 && (
              <div className="flex items-center justify-between" title="Residential floor area over 78 m² gross a home (team assumption)">
                <span className="text-muted">Homes, {HOME_M2} m² gross each</span><span className="tabular-nums text-ink">{fmt(by.residential / HOME_M2)}</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-control text-muted">
            <span id="colour-by-program">Colour the model by program</span>
            <button type="button" role="switch" aria-checked={colour} aria-labelledby="colour-by-program" onClick={() => setMode(colour ? 'massing' : 'program')}
              className={`relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${colour ? 'bg-accent' : 'bg-line'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${colour ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </Section>
      )}
    </>
  )
}
