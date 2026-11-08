// Results of the parking, loading and bicycle node (research P09-M02, M05). By-law rows stay grey until a person has
// transcribed and checked the Parking By-law sections (the City site blocks automated reading).
import { Plus, Trash2 } from './icons'
import type { ReactNode } from 'react'
import { type EdgeId } from '../engine/publicRealm'
import type { RuleResult } from '../engine/types'
import { useMobility } from '../hooks/useMobility'
import { useMobilityStore } from '../lib/mobilityStore'
import { useStore } from '../store'
import SiteAccessPlan from './SiteAccessPlan'
import { FlagChip, Section, StateChip } from './ui'
import { U } from './Units'

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-meta"><b><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-meta text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-meta text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

function Count({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="grid gap-0.5 text-meta"><span className="text-muted">{label}</span>
      <input type="number" min={0} value={value ?? ''} placeholder="–" onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
        className="w-full rounded border border-line bg-panel px-1.5 py-0.5 text-right tabular-nums" aria-label={label} />
    </label>
  )
}

function Group({ title, ids, rules, children }: { title: string; ids: (id: string) => boolean; rules: RuleResult[]; children?: ReactNode }) {
  const list = rules.filter((r) => ids(r.id))
  if (!list.length && !children) return null
  return <Section title={title}>{children}<div className="grid gap-2">{list.map((r) => <Card key={r.id} r={r} />)}</div></Section>
}

export default function MobilityResults() {
  const { rules, program, maxStalls } = useMobility()
  const m = useMobilityStore()
  const project = useStore((s) => s.project)
  const publicRealm = useStore((s) => s.publicRealm)
  const bays = (m.loadingB ?? 0) + (m.loadingC ?? 0)
  // Curb cuts per street from the access sketch, against what the active-frontage check counts.
  const cuts = (['south', 'west', 'north', 'east'] as EdgeId[]).map((e) => ({ e, plan: m.access.filter((a) => a.edge === e).length, pr: publicRealm.frontage[e].crossings }))
  const differ = cuts.some((c) => c.plan !== c.pr)
  return (
    <>
      <div className="mx-4 mt-3 rounded-md border border-slate-300 bg-slate-100 px-2 py-1.5 text-meta text-slate-700">
        The Parking By-law sections could not be opened (the City site returns HTTP 403 to automated reading, not bypassed). Rates below are search extracts (unverified), ranges where sources disagree, or unresolved; no by-law row turns green until two people have transcribed and checked its section.
      </div>
      <Section title="This design">
        <div className="grid grid-cols-3 gap-2 text-meta">
          <div><div className="text-muted">Commercial GFA</div><div className="font-semibold tabular-nums">{Math.round(program.nonResGfa).toLocaleString()} m²</div></div>
          <div><div className="text-muted">Homes (estimate)</div><div className="font-semibold tabular-nums">{program.dwellings.toLocaleString()}</div></div>
          <div><div className="text-muted">Hotel keys (estimate)</div><div className="font-semibold tabular-nums">{program.hotelKeys.toLocaleString()}</div></div>
        </div>
        <p className="mt-1 text-meta text-muted">Homes and keys from net area at the lift presets' m² per home and per key (team assumptions). Parking maximum on this GFA: up to {maxStalls.toLocaleString()} stalls (unverified extract).</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Count label="Car stalls" value={m.carStalls} onChange={(v) => m.set({ carStalls: v })} />
          <Count label="Accessible stalls" value={m.accessibleStalls} onChange={(v) => m.set({ accessibleStalls: v })} />
          <Count label="Class A bikes" value={m.bikeA} onChange={(v) => m.set({ bikeA: v })} />
          <Count label="Loading, Class B" value={m.loadingB} onChange={(v) => m.set({ loadingB: v })} />
          <Count label="Loading, Class C" value={m.loadingC} onChange={(v) => m.set({ loadingC: v })} />
          <Count label="Class B bikes" value={m.bikeB} onChange={(v) => m.set({ bikeB: v })} />
        </div>
      </Section>
      <Group title="Parking" ids={(id) => ['mob-min', 'mob-max', 'mob-toa', 'mob-accessible', 'mob-visitor', 'mob-ev'].includes(id)} rules={rules} />
      <Group title="Loading and drop-off" ids={(id) => id === 'mob-loading' || id === 'mob-passenger' || id === 'mob-dock'} rules={rules}>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <Count label="Trucks in the busiest hour" value={m.trucksPerHour} onChange={(v) => m.set({ trucksPerHour: v })} />
          <Count label="Minutes per truck at the dock" value={m.dwellMin} onChange={(v) => m.set({ dwellMin: v })} />
        </div>
      </Group>
      <Group title="Bicycles" ids={(id) => id.startsWith('mob-bike')} rules={rules} />
      {project === 'vtc' && (
        <Group title="Site access and transit" ids={(id) => id.startsWith('mob-access-') || id === 'mob-transit'} rules={rules}>
          <div className="mb-2">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-meta">
              <span className="text-muted">Drag a pin along the block edge, or select one and click a street.</span>
              <button onClick={() => m.addAccess('loading')} className="flex items-center gap-0.5 text-accent hover:underline"><Plus size={11} />Loading</button>
              <button onClick={() => m.addAccess('ramp')} className="flex items-center gap-0.5 text-accent hover:underline"><Plus size={11} />Ramp</button>
              <button onClick={() => m.addAccess('dropoff')} className="flex items-center gap-0.5 text-accent hover:underline"><Plus size={11} />Drop-off</button>
              {m.selected && <button onClick={() => m.removeAccess(m.selected!)} className="ml-auto flex items-center gap-0.5 text-muted hover:text-red-700"><Trash2 size={11} />Remove selected</button>}
            </div>
            <SiteAccessPlan bays={bays} />
            {differ && (
              <div className="mt-1.5 flex items-center gap-2 rounded bg-amber-50 px-2 py-1 text-meta text-amber-900">
                <span className="flex-1">The active-frontage check counts {cuts.map((c) => `${c.pr} on ${c.e}`).join(', ')} curb cuts; this sketch has {cuts.map((c) => `${c.plan} on ${c.e}`).join(', ')}.</span>
                <button onClick={() => useStore.getState().set({ publicRealm: { ...publicRealm, frontage: Object.fromEntries(cuts.map((c) => [c.e, { ...publicRealm.frontage[c.e], crossings: c.plan }])) as typeof publicRealm.frontage } })}
                  className="shrink-0 rounded bg-amber-700 px-2 py-0.5 text-white">Use these</button>
              </div>
            )}
          </div>
        </Group>
      )}
    </>
  )
}
