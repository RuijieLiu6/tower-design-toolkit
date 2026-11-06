// "Brief & plan" (workflow study §7.1, tool 1 for VTC students; Phase 1 #9): the brief's key dates and its suggested
// deliverables (p.30, "a suggestion only"), each with where Tower Design Toolkit makes it today, what is not built yet
// (the 4 Nov run-through gaps, said plainly) and how many frames on the boards carry it. Reads the boards; changes nothing.
import { CalendarClock, CircleCheck, CircleDashed, Presentation } from '../icons'
import { coverage, deadlineInfo, DELIVERABLES, MILESTONES, type DeliverableId } from '../../engine/boards'
import { useBoardStore } from '../../lib/boardStore'
import { useStore } from '../../store'
import Help from '../Help'

/** Where each deliverable is made in the tool today; `gap` = not built yet (run-through 4 Nov, LOG.md G1–G8). */
const WHERE: Record<DeliverableId, { how: string; gap?: string }> = {
  programme: { how: 'Drawings: Programme stacking diagram (zones, levels, areas, key); or a Clay capture' },
  structure: { how: 'Schematic X-ray: core and outrigger floors (Structure check)', gap: 'a labelled structure diagram is not built yet' },
  massing: { how: 'Present: Axonometric preset, then Capture' },
  wind: { how: 'Pedestrian wind: massing screen, captured in Massing (screening, not CFD)' },
  solar: { how: 'Sun & shadow preview, captured at the brief’s times' },
  sustain: { how: 'Energy & carbon: put its evidence frame on a board' },
  site: { how: 'Not in the tool yet', gap: 'a to-scale site plan drawing' },
  ground: { how: 'Drawings: Ground floor (podium) plan', gap: 'entrances, frontage and the public edge are not drawn yet' },
  'plan-low': { how: 'Drawings: the zone marked "lower-level plan"' },
  'plan-mid': { how: 'Drawings: the zone marked "mid-level plan"' },
  'plan-up': { how: 'Drawings: the zone marked "upper-level plan"' },
  sections: { how: 'Drawings: Sections A–A and B–B, at right angles through the core' },
  skyline: { how: 'Present: "Skyline from the south (toward QE Park)"', gap: 'the true QE Park view needs Real Vancouver’s viewpoint' },
  midcity: { how: 'Present: "Mid-city view" preset (camera choice: team assumption)' },
  street: { how: 'Present: "Street: retail high street"' },
  policy: { how: 'Any check’s evidence frame, from the board composer' },
}

export default function BriefPlan() {
  const boards = useBoardStore((s) => s.boards)
  const setPhase = useStore((s) => s.setPhase)
  const cov = coverage(boards)
  const d = deadlineInfo(Date.now())
  const met = DELIVERABLES.filter((x) => cov[x.id] >= x.min).length
  const groups = [...new Set(DELIVERABLES.map((x) => x.group))]
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="grid gap-3 px-4 pb-3 pt-1 text-xs">
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><CalendarClock size={13} aria-hidden />Key dates · brief p.25</div>
        <ul className="grid gap-0.5">
          {MILESTONES.map((m) => (
            <li key={m.date} className={`flex justify-between gap-2 ${m.date < today ? 'text-muted line-through decoration-muted/50' : ''}`}><span>{m.label}</span><span className="tabular-nums">{new Date(`${m.date}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span></li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-muted" role="status">{d.closed ? 'Upload has closed.' : <>Upload closes in <b className="text-ink tabular-nums">{Math.floor(d.days)}</b> days: {d.vancouver} in Vancouver.</>}</p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Suggested deliverables · p.30<Help label="About the deliverables list">The brief calls this list "a suggestion only". Each line says where the tool makes it; amber is what is not built yet.</Help></span>
          <span className="tabular-nums text-[11px] text-muted">{met} of {DELIVERABLES.length} on the boards</span>
        </div>
        {groups.map((g) => (
          <div key={g} className="mb-1.5">
            <div className="text-[11px] font-semibold">{g}</div>
            <ul className="grid gap-1">
              {DELIVERABLES.filter((x) => x.group === g).map((x) => {
                const w = WHERE[x.id], done = cov[x.id] >= x.min
                return (
                  <li key={x.id} className="flex items-start gap-1.5">
                    {done ? <CircleCheck size={13} className="mt-0.5 shrink-0 text-emerald-700" aria-label="On the boards" /> : <CircleDashed size={13} className="mt-0.5 shrink-0 text-muted" aria-label="Not on the boards yet" />}
                    <span className="min-w-0">
                      <span className="font-medium">{x.label}</span>{x.min > 1 ? <span className="text-muted"> ({cov[x.id]} of {x.min})</span> : null}
                      <span className="block text-[11px] text-muted">{w.how}</span>
                      {w.gap && <span className="block text-[11px] text-amber-800">Not built yet: {w.gap}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setPhase('present')} className="flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
        <Presentation size={13} aria-hidden />Go to Present: boards and captures
      </button>
    </div>
  )
}
