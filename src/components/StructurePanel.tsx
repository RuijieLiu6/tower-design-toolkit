// Results for "Structure: system & seismic" (research P10-M01, M03, M05): seismic route, core continuity and regularity,
// outrigger floors you place, and a lateral-system shortlist. Screening only; the engineer of record decides.
import { useMemo, useState } from 'react'
import { SEISMIC_FALSE_ASSUMPTIONS, structureCheck, structureTabOf, suggestOutriggers, type StructureTab } from '../engine/structure'
import { useLeadView, viewOf } from '../lib/leadViews'
import { CONTINUITY_RULE, windProcedure, type Fit } from '../engine/windStructure'
import { storeyCore, type CoreCentre } from '../engine/storeyWeight'
import { coreSide, coreStepsOf, coreTopZ, floorsAboveCore, towerFloors } from '../engine/massing'
import { aperturesOf, levelRuns } from '../engine/openingField'
import type { Aperture, CoreStep, StructureCarry, Tower } from '../engine/types'
import { CANTILEVER_MAX, LOGGIA_MAX_OPEN, type ColumnStart } from '../engine/continuity'
import { VTC_NORTH_DEG } from '../context'
import { useStore, useTowers } from '../store'
import { FalseAssumptions } from './WindStructurePanel'
import { FlagChip, Section } from './ui'
import { Evidence, FlagDot, MethodFold, RuleRows, Stat, Stats } from './ResultViz'

export function useStructures() {
  const towers = useTowers()
  const presets = useStore((s) => s.windPresets)
  const north = useStore((s) => (s.project === 'vtc' ? VTC_NORTH_DEG : 0))
  return useMemo(() => towers.map((t) => structureCheck(t, windProcedure(t, presets), undefined, north)), [towers, presets, north])
}

const FIT: Record<Fit, { label: string; cls: string }> = {
  shortlist: { label: '✓ Shortlist', cls: 'border-success/30 bg-success-surface text-success' },
  check: { label: '! Check', cls: 'border-warning/30 bg-warning-surface text-warning' },
  out: { label: '✕ Out', cls: 'border-line bg-pending-surface text-pending' },
}

/** Pick outrigger levels: type them, or take the suggestion at about 1/2 and 2/3 of the height. */
function OutriggerPicker({ t, placed }: { t: Tower; placed: number[] }) {
  const updateTower = useStore((s) => s.updateTower)
  const levels = useMemo(() => towerFloors(t).filter((f) => !f.podium).map((f) => f.level), [t])
  const [text, setText] = useState('')
  const suggestion = suggestOutriggers(t)
  const set = (l: number[]) => updateTower(t.id, { outriggerFloors: [...new Set(l)].filter((x) => levels.includes(x)).sort((a, b) => a - b) })
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta">
      <div className="font-semibold">Outrigger floors</div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {placed.length === 0 && <span className="text-muted">None placed.</span>}
        {placed.map((l) => (
          <button key={l} onClick={() => set(placed.filter((x) => x !== l))} title="Remove" className="rounded border border-line px-1.5 py-0.5 hover:border-red-300 hover:text-red-800">L{l} ×</button>
        ))}
      </div>
      <form className="mt-1.5 flex flex-wrap items-center gap-1" onSubmit={(e) => { e.preventDefault(); set([...placed, ...text.split(/[^0-9]+/).filter(Boolean).map(Number)]); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`level ${levels[0] ?? ''}–${levels[levels.length - 1] ?? ''}`} aria-label="Outrigger levels"
          className="w-24 rounded border border-line bg-panel px-1.5 py-0.5 outline-none focus:border-accent" />
        <button type="submit" className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Add</button>
        {suggestion.length > 0 && !suggestion.every((l) => placed.includes(l)) && (
          <button type="button" onClick={() => set([...placed, ...suggestion])} className="rounded border border-dashed border-line px-2 py-0.5 text-muted hover:border-accent hover:text-accent">
            Suggest {suggestion.map((l) => `L${l}`).join(', ')}
          </button>
        )}
      </form>
      <MethodFold title="About the suggestion"><div className="flex items-start gap-1"><FlagChip flag="team_assumption" /><span>Suggestion at about 1/2 and 2/3 of the height is precedent practice, not a rule. Shown in Schematic as red truss bands; the floor keeps its use.</span></div></MethodFold>
    </div>
  )
}

/**
 * Declare a diagrid (gap G79): its module (storeys a member rises between node rings) and the member angle aimed for.
 * The grid is laid on the storey outlines and drawn on the model; the lines above read it. Each edit applies at once
 * (Ctrl+Z undoes it).
 */
function DiagridPicker({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  const d = t.diagrid
  const set = (patch: Partial<NonNullable<Tower['diagrid']>>) => updateTower(t.id, { diagrid: { module: 6, ...(d ?? {}), ...patch } })
  const num = (label: string, value: number | undefined, min: number, max: number, on: (v: number | undefined) => void, tip: string, placeholder = '') => (
    <label className="flex items-center gap-1 text-muted" title={tip}>{label}
      <input type="number" min={min} max={max} step={1} value={value ?? ''} placeholder={placeholder} aria-label={`Diagrid ${label}`}
        onChange={(e) => { if (e.target.value === '') return on(undefined); const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) on(Math.max(min, Math.min(max, v))) }}
        className="w-14 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums text-ink outline-none focus:border-accent" />
    </label>
  )
  return (
    <div className="mt-2 grid gap-1.5 rounded-md border border-line p-2 text-meta" data-testid="diagrid">
      <label className="flex items-center gap-2" title="A triangulated perimeter grid laid on the storey outlines, drawn on the model; read in the lines above">
        <input type="checkbox" checked={!!d} onChange={(e) => updateTower(t.id, { diagrid: e.target.checked ? { module: 6 } : undefined })} aria-label="Diagrid" />
        <span className="font-semibold">Diagrid</span><FlagChip flag="unverified" />
      </label>
      {d && (
        <div className="flex flex-wrap items-center gap-2">
          {num('module', d.module, 1, 20, (v) => v && set({ module: v }), 'Storeys a member rises between two node rings')}
          {num('angle °', d.angle, 30, 85, (v) => set({ angle: v }), 'The member angle aimed for (from horizontal); the grid takes the whole number of bays nearest it', '65')}
          {num('from L', d.fromLevel, 1, 400, (v) => set({ fromLevel: v }), 'First diagrid storey (blank: the first tower storey)', 'base')}
          {num('to L', d.toLevel, 1, 400, (v) => set({ toLevel: v }), 'Last diagrid storey (blank: the top storey)', 'top')}
        </div>
      )}
    </div>
  )
}

/** An imported model carries no core: where the structure checks place it (read from the model), or a centre you type. */
function CorePicker({ t, core }: { t: Tower; core: CoreCentre }) {
  const updateTower = useStore((s) => s.updateTower)
  const placed = !!t.coreCentre
  const set = (k: 0 | 1, v: number) => { if (!Number.isFinite(v)) return; const c: [number, number] = [core.x, core.y]; c[k] = v; updateTower(t.id, { coreCentre: c }) }
  const field = (k: 0 | 1, label: string) => (
    <label className="flex items-center gap-1 text-muted">{label}
      <span className="flex items-center rounded border border-line bg-panel">
        <input type="number" step={0.5} value={Number((k ? core.y : core.x).toFixed(2))} aria-label={`Core centre ${label}`}
          onChange={(e) => set(k, Number(e.target.value))} className="w-16 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
        <span className="pr-1.5">m</span>
      </span>
    </label>
  )
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold">Core centre</span><FlagChip flag="team_assumption" /></div>
      <div className="mt-1 line-clamp-2 text-muted" title={core.how}>{placed ? 'Placed by hand' : 'Read from the model'}: {core.how}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {field(0, 'x')}{field(1, 'y')}
        {placed && <button type="button" onClick={() => updateTower(t.id, { coreCentre: undefined })} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Read from the model</button>}
      </div>
      <MethodFold title="About the core centre"><p>In the tower’s own frame (metres from the tower origin, before its rotation). The off-centre weight lines, the X-ray core, the drawings and the export use it. Read from the model: a garden storey that is the core alone, else the centre of the typical tower storey.</p></MethodFold>
    </div>
  )
}

/**
 * A core that steps with the tiers (gap G18): from a level up, a smaller square core (and its centre, optional). Each
 * storey's homes, net area, daylight depth, weight, off-centre line and lift fit then read its own core.
 */
function CoreSteps({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  const steps = coreStepsOf(t)
  const tower = towerFloors(t).filter((f) => !f.podium)
  const at = storeyCore(t)
  const set = (next: CoreStep[]) => updateTower(t.id, { coreSteps: next.length ? next : undefined })
  const edit = (k: number, patch: Partial<CoreStep>) => set(steps.map((s, i) => (i === k ? { ...s, ...patch } : s)))
  const add = () => {
    const last = steps[steps.length - 1]
    const from = last ? Math.min(tower[tower.length - 1]?.level ?? last.fromLevel + 1, last.fromLevel + 10) : tower[Math.floor(tower.length / 2)]?.level ?? 1
    set([...steps, { fromLevel: from, side: Math.max(4, Math.round((last?.side ?? coreSide(t)) * 0.75 * 2) / 2) }])
  }
  const num = (label: string, value: number, on: (v: number) => void, step = 0.5, unit = 'm') => (
    <label className="flex items-center gap-1 text-muted">{label}
      <span className="flex items-center rounded border border-line bg-panel">
        <input type="number" step={step} value={Number(value.toFixed(2))} aria-label={`Core step ${label}`}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) on(v) }} className="w-14 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
        {unit && <span className="pr-1.5">{unit}</span>}
      </span>
    </label>
  )
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold">Core steps</span><FlagChip flag="team_assumption" /></div>
      <div className="mt-1 text-muted">{steps.length ? `Below L${steps[0].fromLevel}: ${coreSide(t).toFixed(1)} m core` : `One ${coreSide(t).toFixed(1)} m core for the whole height`}</div>
      {steps.map((s, k) => (
        <div key={k} className="mt-1.5 flex flex-wrap items-center gap-2">
          {num('from L', s.fromLevel, (v) => edit(k, { fromLevel: Math.max(1, Math.round(v)) }), 1, '')}
          {num('side', s.side, (v) => edit(k, { side: Math.max(2, v) }))}
          {num('x', at(s.fromLevel).x, (v) => edit(k, { centre: [v, at(s.fromLevel).y] }))}
          {num('y', at(s.fromLevel).y, (v) => edit(k, { centre: [at(s.fromLevel).x, v] }))}
          <button type="button" onClick={() => set(steps.filter((_, i) => i !== k))} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent" aria-label={`Remove the core step from L${s.fromLevel}`}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={add} className="mt-1.5 rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Add a step</button>
      <MethodFold title="About core steps"><p>From each step’s level up, the core is a square of that side, centred at x, y in the tower’s own frame (until you type a centre, the centre of the core below). Homes and hotel keys, net-to-gross, daylight depth, storey weights and the off-centre lines read each storey’s own core; “Core holds the lifts” checks each core against the lift rises that pass through it; continuity checks each upper core stands inside the one below, and Type 3 flags a step over 130%.</p></MethodFold>
    </div>
  )
}

/**
 * Tool cycle 12 (R7 Ridge Gate): the core may end below an opening or a crown. Storeys above the core top have no core,
 * so no lift or core stair reaches them; the exit stairs each ear declares are read by the egress line "ear-exits".
 */
function CoreTop({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  const floors = useMemo(() => towerFloors(t), [t])
  const top = coreTopZ(t)
  const above = floorsAboveCore(t, floors)
  const setTop = (v: number | undefined) => updateTower(t.id, { coreTop: v != null && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : undefined })
  const fromLevel = (l: number) => { const f = floors.find((x) => x.level === Math.round(l)); if (f) setTop(f.z0) }
  const field = 'flex items-center rounded border border-line bg-panel'
  const input = 'bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none'
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta" data-testid="core-top">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold">Core top</span><FlagChip flag="team_assumption" /></div>
      <div className="mt-1 text-muted">{above.length && top != null ? `Ends at +${top.toFixed(1)} m: ${levelRuns(above.map((f) => f.level))} have no core` : 'The core runs to the roof'}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-muted" title="Height above grade where the core ends">at
          <span className={field}><input type="number" step={0.1} min={0} value={top ?? ''} placeholder="roof" aria-label="Core top height"
            onChange={(e) => setTop(e.target.value === '' ? undefined : Number(e.target.value))} className={`w-20 ${input}`} /><span className="pr-1.5">m</span></span>
        </label>
        <label className="flex items-center gap-1 text-muted" title="The first storey with no core: the core ends at its floor">or below L
          <span className={field}><input type="number" step={1} min={1} value={above[0]?.level ?? ''} placeholder="—" aria-label="First storey above the core top"
            onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) fromLevel(v) }} className={`w-14 ${input}`} /></span>
        </label>
        {top != null && <button type="button" onClick={() => setTop(undefined)} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">To the roof</button>}
      </div>
      {above.length > 0 && (
        <label className="mt-1.5 flex items-center gap-1 text-muted" title="Exit stairs in each part of a storey the core does not reach (each ear); read by Egress">Exit stairs in each ear
          <span className={field}><input type="number" step={1} min={0} value={t.earStairs ?? 0} aria-label="Exit stairs in each ear"
            onChange={(e) => { const v = Math.max(0, Math.round(Number(e.target.value))); updateTower(t.id, { earStairs: Number.isFinite(v) && v > 0 ? v : undefined }) }} className={`w-12 ${input}`} /></span>
        </label>
      )}
      <MethodFold title="About the core top"><p>A storey whose mid-height lies above the core top has no core: no core area (its net area is the whole plate), no core walls in the storey weights, no lift and no core stair. Core holds the lifts stops the lift rises at the last storey with a core and flags the storeys above; Egress asks each part of those storeys for two exits of its own; the core-alone frequency stops the cantilever at the core top and carries the storeys above as a rigid crown (an upper bound). The lateral-system change line says what carries the load above the core top.</p></MethodFold>
    </div>
  )
}

/**
 * Tool cycle 12 (R7 Ridge Gate): openings cut through the tower along a line of sight. The lines above read each one:
 * the core clear of it, the sky through it and what spans its head; Egress asks its ears for their own exits.
 */
function Openings({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  const list = t.apertures ?? []
  const set = (next: Aperture[]) => updateTower(t.id, { apertures: next.length ? next : undefined })
  const edit = (k: number, patch: Partial<Aperture>) => set(list.map((a, i) => (i === k ? { ...a, ...patch } : a)))
  const add = () => {
    const z0 = coreTopZ(t) ?? Math.round(t.height * 0.9)
    set([...list, { label: 'Gate', z0, z1: Math.min(t.height, z0 + 16), bearing: 0, width: Math.round(coreSide(t)) }])
  }
  const num = (label: string, value: number | undefined, on: (v: number | undefined) => void, o: { step?: number; unit?: string; tip: string; w?: string }) => (
    <label className="flex items-center gap-1 text-muted" title={o.tip}>{label}
      <span className="flex items-center rounded border border-line bg-panel">
        <input type="number" step={o.step ?? 0.5} value={value ?? ''} aria-label={`Opening ${label}`}
          onChange={(e) => { const v = Number(e.target.value); on(e.target.value === '' ? undefined : Number.isFinite(v) ? v : undefined) }} className={`${o.w ?? 'w-16'} bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none`} />
        {o.unit && <span className="pr-1.5">{o.unit}</span>}
      </span>
    </label>
  )
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta" data-testid="openings">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold">Openings</span><FlagChip flag="team_assumption" /></div>
      {!list.length && <div className="mt-1 text-muted">None declared.</div>}
      {list.map((a, k) => (
        <div key={k} className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-line pt-1.5 first-of-type:border-0">
          <input value={a.label ?? ''} onChange={(e) => edit(k, { label: e.target.value || undefined })} placeholder={`opening ${k + 1}`} aria-label="Opening name"
            className="w-24 rounded border border-line bg-panel px-1.5 py-0.5 text-ink outline-none focus:border-accent" />
          {num('sill', a.z0, (v) => v != null && edit(k, { z0: v }), { unit: 'm', tip: 'Sill height above grade' })}
          {num('head', a.z1, (v) => v != null && edit(k, { z1: v }), { unit: 'm', tip: 'Head height above grade' })}
          {num('width', a.width, (v) => v != null && v > 0 && edit(k, { width: v }), { unit: 'm', tip: 'Clear width across the line of sight', w: 'w-14' })}
          {num('bearing', a.bearing, (v) => edit(k, { bearing: v }), { step: 0.1, unit: '°', tip: 'The line of sight through it, degrees clockwise from true north (either way along it)', w: 'w-14' })}
          {num('seen from', a.distance, (v) => edit(k, { distance: v != null && v > 0 ? v : undefined }), { step: 10, unit: 'm', tip: 'Distance to the viewpoint it is aimed at (blank: 2 km)', w: 'w-20' })}
          <label className="flex items-center gap-1 text-muted" title="Judge its sky against the overcast line (250 arcmin², 7% contrast) instead of 100 arcmin² (13%)">
            <input type="checkbox" checked={!!a.overcast} onChange={(e) => edit(k, { overcast: e.target.checked || undefined })} aria-label="Judge under overcast" />overcast
          </label>
          <button type="button" onClick={() => set(list.filter((_, i) => i !== k))} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent" aria-label={`Remove opening ${k + 1}`}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={add} className="mt-1.5 rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Add an opening</button>
      {list.length > aperturesOf(t).length && <div className="mt-1 text-warning">An opening needs a width and a head above its sill to be read.</div>}
      <MethodFold title="About openings"><p>An opening is a slab of space its width wide, from sill to head, running straight through the plan along its bearing, centred on the core at the sill. The model must have the cut (a drawn or imported form; a parametric box has none). The lines read the core inside it, its own clear area and how large that looks straight on from its viewpoint, and what spans its head as a tie between the ears beside it; Egress asks each ear the core does not reach for two exits.</p></MethodFold>
    </div>
  )
}

/** P1 #13 floor reach: an interior column ring at about half the core-to-facade reach (Ching p.10), which halves the slab span. */
function ColumnRing({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  const r = t.columnRing
  const range = r && r !== true ? r : null
  // The ring's storeys (tool cycle 11): blank ends run to the bottom or the top; both blank is every storey.
  const setEnd = (key: 'from' | 'to', v: string) => {
    const next = { ...(range ?? {}), [key]: v === '' ? undefined : Math.max(1, Math.round(Number(v))) }
    updateTower(t.id, { columnRing: next.from == null && next.to == null ? true : next })
  }
  return (
    <div className="mt-2 grid gap-1.5 rounded-md border border-line p-2 text-meta" data-testid="column-ring">
      <label className="flex items-center gap-2" title="A ring of columns at about half the reach from the core to the facade, on storeys past one flat plate (9.1 m, Ching p.8): the slab spans half the reach and thins.">
        <input type="checkbox" checked={!!r} onChange={(e) => updateTower(t.id, { columnRing: e.target.checked || undefined })} aria-label="Interior column ring" />
        <span className="font-semibold">Interior column ring</span><FlagChip flag="unverified" />
      </label>
      {!!r && (
        <div className="flex items-center gap-1.5 text-muted" title="Only these storeys get the ring, for example the turning top; blank runs to the bottom or the top">
          Storeys
          <input type="number" min={1} step={1} value={range?.from ?? ''} placeholder="bottom" onChange={(e) => setEnd('from', e.target.value)} className="w-16 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums text-ink" aria-label="Column ring: lowest storey" />
          to
          <input type="number" min={1} step={1} value={range?.to ?? ''} placeholder="top" onChange={(e) => setEnd('to', e.target.value)} className="w-16 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums text-ink" aria-label="Column ring: highest storey" />
        </div>
      )}
    </div>
  )
}

const CARRY_KINDS: { id: StructureCarry['kind']; label: string; tip: string }[] = [
  { id: 'loggia', label: 'Loggia', tip: 'The columns of the storey under an open band continue, free-standing, through its open storeys and carry this storey: no column starts' },
  { id: 'transfer', label: 'Transfer', tip: 'This storey’s columns start on a transfer girder or truss at its floor: declared and costed' },
  { id: 'hung', label: 'Hung', tip: 'These storeys hang from a truss above them: declared and costed' },
]

/**
 * Declared carries (tool cycle 12, the "no column starts" reader): what holds up a storey that overhangs the column
 * lines below. Each edit applies at once (Ctrl+Z undoes it); a suggested loggia is one click.
 */
function Carries({ t, starts }: { t: Tower; starts: ColumnStart[] }) {
  const updateTower = useStore((s) => s.updateTower)
  const list = t.carries ?? []
  const set = (next: StructureCarry[]) => updateTower(t.id, { carries: next.length ? next : undefined })
  const edit = (k: number, patch: Partial<StructureCarry>) => set(list.map((c, i) => (i === k ? { ...c, ...patch } : c)))
  const suggest = starts.filter((s) => s.suggest && !list.some((c) => c.level === s.level)).map((s) => s.suggest!)
  const open = starts.find((s) => !s.carry && !s.ring)
  const num = (label: string, value: number | undefined, on: (v: number | undefined) => void, tip: string, placeholder = '') => (
    <label className="flex items-center gap-1 text-muted" title={tip}>{label}
      <input type="number" min={1} step={1} value={value ?? ''} placeholder={placeholder} aria-label={`Carry ${label}`}
        onChange={(e) => { const v = e.target.value === '' ? undefined : Math.max(1, Math.round(Number(e.target.value))); if (v === undefined || Number.isFinite(v)) on(v) }}
        className="w-14 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums text-ink outline-none focus:border-accent" />
    </label>
  )
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta" data-testid="carries">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold" title={`What holds up a storey that reaches more than ${CANTILEVER_MAX} m past the column lines below`}>Declared carries</span><FlagChip flag="team_assumption" /></div>
      {list.length === 0 && <div className="mt-1 text-muted">None declared.</div>}
      {list.map((c, k) => (
        <div key={k} className="mt-1.5 flex flex-wrap items-center gap-2">
          <select value={c.kind} onChange={(e) => edit(k, { kind: e.target.value as StructureCarry['kind'] })} aria-label="Carry kind" title={CARRY_KINDS.find((x) => x.id === c.kind)?.tip}
            className="rounded border border-line bg-panel px-1 py-0.5 text-ink outline-none focus:border-accent">
            {CARRY_KINDS.map((x) => <option key={x.id} value={x.id} title={x.tip}>{x.label}</option>)}
          </select>
          {num('L', c.level, (v) => v && edit(k, { level: v }), 'The storey it carries (the one that overhangs)')}
          {c.kind === 'loggia' && num('open from L', c.from, (v) => edit(k, { from: v }), `The lowest open storey the columns cross (blank: the storey below); more than ${LOGGIA_MAX_OPEN} needs ties`, String(c.level - 1))}
          {c.kind === 'hung' && num('to L', c.to, (v) => edit(k, { to: v }), 'The highest hung storey (blank: this storey only)', String(c.level))}
          <button type="button" onClick={() => set(list.filter((_, i) => i !== k))} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent" aria-label={`Remove the carry of L${c.level}`}>Remove</button>
        </div>
      ))}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => set([...list, { kind: 'loggia', level: open?.level ?? 2 }])} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Add a carry</button>
        {suggest.map((s) => (
          <button key={s.level} type="button" onClick={() => set([...list, s])} title={`The columns of L${s.from! - 1} continue through the open storeys and carry L${s.level}`}
            className="rounded border border-dashed border-line px-2 py-0.5 text-muted hover:border-accent hover:text-accent">
            Loggia {s.from === s.level - 1 ? `L${s.from}` : `L${s.from}–L${s.level - 1}`} → L{s.level}
          </button>
        ))}
      </div>
      <MethodFold title="About declared carries"><p>A storey whose outline reaches more than {CANTILEVER_MAX} m (team) past the column lines below would start new columns. A loggia carry says the columns of the storey under an open band continue through it to carry the storey above, so no column starts (the stop at its roof counts as on the carry). A transfer or hung storeys say the columns start on a girder or truss, or hang from one: still a start, but declared, for the engineer to design. Outrigger and belt floors (Lateral &amp; sway) and the column ring are read as carries too.</p></MethodFold>
    </div>
  )
}

/**
 * Structure in three tabs (node placement, 21 Nov 2026), picked in the results strip beside Wind procedure
 * (lib/leadViews.ts): System & seismic (category, route, irregularities, the shortlist), Lateral & sway (core alone,
 * P-Δ, off-centre weight and sustained sway, core steps, outriggers) and Floors & spans (floor reach, dead load from the
 * span, the column ring, column starts and stops, the declared carries). The lines keep their ids; each shows under one
 * tab (engine/structure.ts STRUCTURE_TABS).
 */
export default function StructurePanel() {
  const results = useStructures()
  const tab = useLeadView((s) => viewOf('built.structure', s.view)?.id ?? 'seismic') as StructureTab
  return (
    <div data-structure-tab={tab}>
      {results.map((r) => {
        const rules = r.rules.filter((x) => structureTabOf(x.id) === tab)
        return (
          <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
            {tab === 'seismic' && <>
              <div className="mb-2"><Stats cols={2}>
                <Stat label="Seismic Category" value={`${r.seismicCategory}`} color="#946200" tip="Dynamic analysis required; core walls continuous to the foundation" />
                <Stat label="Period Ta (seismic only)" value={`≈ ${r.Ta.toFixed(2)}`} unit="s" />
              </Stats></div>
              <RuleRows rules={rules} />
              <h4 className="mb-1 mt-3 text-meta font-semibold text-slate-700" title="A shortlist, never a single best">Lateral systems at SC4 (shortlist)</h4>
              <ul className="grid min-w-0 gap-1">
                {r.systems.map((s) => (
                  <li key={s.id} className="flex min-w-0 items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-meta" title={`${s.name}: ${s.reason}\nCode route: ${s.route}\nSource: ${s.source.label}${s.source.page ? `, ${s.source.page}` : ''}`}>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span><FlagDot flag={s.flag} />
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-meta font-semibold ${FIT[s.fit].cls}`}>{FIT[s.fit].label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5"><Evidence title="Why each system fits or not" items={r.systems.map((s) => ({ id: s.id, label: s.name, flag: s.flag, value: s.reason, note: `Code route: ${s.route}`, source: s.source, card: false }))} /></div>
              <MethodFold><p>{CONTINUITY_RULE}</p><p>Seismic Category {r.seismicCategory}: dynamic analysis required; core walls continuous to the foundation; Ta ≈ {r.Ta.toFixed(2)} s (seismic only).</p></MethodFold>
            </>}
            {tab === 'lateral' && <>
              <RuleRows rules={rules} />
              {(r.tower.imported || r.tower.coreCentre) && <CorePicker t={r.tower} core={r.weights.core} />}
              <CoreSteps t={r.tower} />
              <CoreTop t={r.tower} />
              <Openings t={r.tower} />
              <OutriggerPicker t={r.tower} placed={r.outriggers} />
              <DiagridPicker t={r.tower} />
            </>}
            {tab === 'floors' && <>
              <RuleRows rules={rules} />
              <ColumnRing t={r.tower} />
              <Carries t={r.tower} starts={r.continuity.starts} />
            </>}
          </Section>
        )
      })}
      {tab === 'seismic' && <FalseAssumptions items={SEISMIC_FALSE_ASSUMPTIONS} />}
      <Section title="Read with care" folded>
        <p className="text-meta text-slate-700">Screening only: no member sizing, forces or drifts as design values. Research packet P10 had two critique rounds and no final gate, so code readings it corrected are shown as unverified. Slenderness and the wind procedure are in the node Wind procedure (slenderness).</p>
      </Section>
    </div>
  )
}
