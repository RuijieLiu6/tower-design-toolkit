// After an upload or the first copy from Rhino: put the building on the site, give it its basement, confirm (Ruijie,
// 6 Nov: "once you click link rhino, instruct the user to posit the building on the specific location and confirm site";
// "once the model is brought into the tool figure out a way to define the basement level with the users"). Lives in the
// Rhino import tool, on both projects: the competition block there, the study site in Real Vancouver. The steps drive
// the toolkit's own placing (click the ground, Confirm in the toolbar), Move / Turn handles and lot alignment
// (lib/towerEdit.ts); lib/import/placeModel.ts keeps the model in one piece and tells the Rhino link where it now stands.
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeft, ArrowRight, Check, Crosshair, Eye, EyeOff, Layers2, Magnet, MapPin, Move, RotateCw, Target } from '../icons'
import { basementSummary, DEFAULT_BASEMENT, type Basement } from '../../engine/basement'
import type { Tower } from '../../engine/types'
import { linkProject } from '../../lib/interchange/live'
import { confirmPlacement, endPlaceGuide, guideSite, modelTowers, setGuideStep, siteFit, startPlaceGuide, usePlaceGuide } from '../../lib/import/placeModel'
import { alignToLot, setPose, toggleMode, useTowerEdit } from '../../lib/towerEdit'
import { useStore } from '../../store'
import { lookBelow } from '../basement/BasementTool'
import { useDig } from '../BelowGrade'
import Help from '../Help'
import StatusRow from '../StatusRow'
import { FlagChip } from '../ui'
import { flyToFit } from '../VistaLook'

const chip = (on: boolean) => `rounded-md border px-2 py-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${on ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink hover:border-accent'}`
const btn = 'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'
const LEVELS = [0, 1, 2, 3, 4, 5, 6]
const fmt = (v: number, d = 0) => v.toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })

export default function PlaceModelGuide() {
  const { project, model, towers, placing, citySite } = useStore(useShallow((s) => ({ project: s.project, model: s.models[s.project], towers: s.towers[s.project], placing: s.placing, citySite: s.citySite })))
  const g = usePlaceGuide()
  if (!model) return null
  const ts = modelTowers(useStore.getState(), project, model.id)
  if (!ts.length) return null
  const open = g.active && g.project === project && g.modelId === model.id
  void towers; void citySite // re-render on moves and on a new site
  if (!open) {
    const c = model.frame.placement.confirmed
    return (
      <div data-testid="place-status" className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-[11px]">
        {c ? <><Check size={13} className="shrink-0 text-emerald-700" aria-hidden /><span className="min-w-0 flex-1">Placed on {c.site}</span></>
          : <><MapPin size={13} className="shrink-0 text-amber-700" aria-hidden /><span className="min-w-0 flex-1">Not placed on the site yet</span></>}
        <button type="button" onClick={() => startPlaceGuide(project, model.id)} data-testid="place-again" className="shrink-0 text-accent hover:underline">{c ? 'Move again' : 'Place on site'}</button>
      </div>
    )
  }
  return <Guide lead={ts[0]} towers={ts} step={g.step} placing={placing} linked={linkProject() === project} fileName={model.source.fileName} />
}

function Guide({ lead, towers, step, placing, linked, fileName }: { lead: Tower; towers: Tower[]; step: 'place' | 'basement'; placing: boolean; linked: boolean; fileName: string }) {
  const project = useStore((s) => s.project)
  const { move, rotate } = useTowerEdit(useShallow((s) => ({ move: s.move, rotate: s.rotate })))
  const site = guideSite()
  const fit = site ? siteFit(towers, site.ring) : null
  const name = towers.length === 1 ? lead.name : `${towers.length} towers`
  const centre = () => {
    if (!site) return
    const c = towers.reduce((a, t) => [a[0] + t.x / towers.length, a[1] + t.y / towers.length], [0, 0])
    const m = site.ring.reduce((a, p) => [a[0] + p[0] / site.ring.length, a[1] + p[1] / site.ring.length], [0, 0])
    setPose(lead.id, { x: lead.x + m[0] - c[0], y: lead.y + m[1] - c[1] })
    // Real Vancouver: the view follows, the site and the building framed together.
    if (project === 'city') {
      const g = useStore.getState().groundElevation, top = Math.max(...towers.map((t) => t.height))
      flyToFit([...site.ring.map(([x, y]) => [x, y, g] as [number, number, number]), [m[0], m[1], g + top]], 250)
    }
  }
  return (
    <section data-testid="place-guide" aria-labelledby="place-guide-head" className="rounded-lg border border-accent/40 bg-accent/[0.06] p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-white"><MapPin size={13} aria-hidden /></span>
        <h3 id="place-guide-head" className="flex-1 text-[12px] font-semibold text-ink">Place your model on the site</h3>
        <Help label="About placing the model">
          {fileName} came in {project === 'city' ? 'centred on your study site' : 'on the competition block'}, unless the file had map coordinates. Put the building where it stands and give it its basement: every change applies at once (Ctrl+Z undoes it). Done closes the guide.
          The whole model moves as one piece.{linked ? " The Rhino link keeps this placement: Rhino's next changes land where you put the building." : ''} The placement is yours (team assumption) and is saved with the project.
        </Help>
        <button type="button" onClick={endPlaceGuide} className="text-[11px] text-muted hover:text-ink hover:underline" title="Close the guide; the model stays where it is. Place on site in this tool opens it again.">Later</button>
      </div>

      <ol className="mt-2 grid gap-1.5 text-[11px]">
        <li className="flex items-start gap-2">
          <Num n={1} done={!!site} />
          <div className="min-w-0 flex-1">
            {site ? <p><span className="text-muted">Site:</span> <b className="text-ink">{site.label}</b>{project === 'city' && <span className="text-muted"> · about {fmt(site.area)} m²</span>}</p>
              : <p className="text-amber-900">No site yet. Choose one with <b>Site</b> (the pin, above): search an address, then place the site on its lot.</p>}
          </div>
        </li>

        <li className="flex items-start gap-2">
          <Num n={2} done={step === 'basement'} current={step === 'place'} />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setGuideStep('place')} className="font-semibold text-ink hover:underline" aria-expanded={step === 'place'}>Where it stands</button>
            {step === 'place' ? (
              <div className="mt-1 grid gap-1.5">
                <p className="text-muted">Click the ground where {name} should stand: it moves there at once. Or drag its arrows (Move) and its ring (Turn). Ctrl+Z undoes a move.</p>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => useStore.getState().set({ placing: !placing })} aria-pressed={placing} data-testid="place-click" className={chip(placing)}><span className="flex items-center gap-1"><Crosshair size={12} aria-hidden />Click to place</span></button>
                  <button type="button" onClick={centre} disabled={!site} data-testid="place-centre" className={chip(false)}><span className="flex items-center gap-1"><Target size={12} aria-hidden />Centre on site</span></button>
                  <button type="button" onClick={() => alignToLot(lead.id)} data-testid="place-align" className={chip(false)} title="Turn and nudge it to line up with the lot under it (a proposal to confirm)"><span className="flex items-center gap-1"><Magnet size={12} aria-hidden />Line up with the lot</span></button>
                  <button type="button" onClick={() => toggleMode('move')} aria-pressed={move} className={chip(move)}><span className="flex items-center gap-1"><Move size={12} aria-hidden />Move</span></button>
                  <button type="button" onClick={() => toggleMode('rotate')} aria-pressed={rotate} className={chip(rotate)}><span className="flex items-center gap-1"><RotateCw size={12} aria-hidden />Turn</span></button>
                </div>
                {fit && <ul className="rounded-md border border-line bg-panel px-1.5"><StatusRow size="sm" state={fit.state} title="On the site" value={fit.state === 'pass' ? 'inside' : fit.state === 'warn' ? 'past the edge' : 'off the site'} detail={fit.text} testId="place-fit" /></ul>}
                <button type="button" onClick={() => setGuideStep('basement')} data-testid="place-next" className={`${btn} border-accent text-accent hover:bg-accent/10`}>Next: basement<ArrowRight size={13} aria-hidden /></button>
              </div>
            ) : <p className="text-muted">{fit ? fit.text : 'Placed'}.</p>}
          </div>
        </li>

        <li className="flex items-start gap-2">
          <Num n={3} done={false} current={step === 'basement'} />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setGuideStep('basement')} className="font-semibold text-ink hover:underline" aria-expanded={step === 'basement'}>Basement</button>
            {step === 'basement' ? <BasementStep t={lead} many={towers.length > 1} hasSite={!!site} /> : <p className="text-muted">{lead.basement?.levels ? `${lead.basement.levels} level${lead.basement.levels === 1 ? '' : 's'} below grade` : 'Levels below grade, if any'}.</p>}
          </div>
        </li>
      </ol>

      {step === 'basement' && (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-1.5">
          <button type="button" onClick={() => setGuideStep('place')} className={`${btn} border-line text-ink hover:border-accent`}><ArrowLeft size={13} aria-hidden />Back</button>
          <button type="button" onClick={() => confirmPlacement()} data-testid="place-confirm" className={`${btn} border-accent bg-accent text-white hover:bg-accent/90`}><Check size={13} aria-hidden />Done</button>
        </div>
      )}
    </section>
  )
}

function Num({ n, done, current }: { n: number; done: boolean; current?: boolean }) {
  return (
    <span aria-hidden className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${done ? 'bg-emerald-700 text-white' : current ? 'bg-accent text-white' : 'border border-line text-muted'}`}>
      {done ? <Check size={10} /> : n}
    </span>
  )
}

/** Levels below grade, where the dig goes and what it is for; the dig view shows it through the ground. */
function BasementStep({ t, many, hasSite }: { t: Tower; many: boolean; hasSite: boolean }) {
  const updateTower = useStore((s) => s.updateTower)
  const dig = useDig((s) => s.dig)
  const b = t.basement
  const levels = b?.levels ?? 0
  const set = (patch: Partial<Basement>) => {
    const next = { ...(b ?? DEFAULT_BASEMENT), ...patch, from: undefined }
    const site = next.extent === 'site' ? guideSite() : null
    updateTower(t.id, { basement: next.extent === 'site' && site ? { ...next, ring: site.ring } : next })
  }
  const sum = basementSummary(t)
  return (
    <div className="mt-1 grid gap-1.5" data-testid="place-basement">
      <p className="text-muted">How many levels does {many ? t.name : 'it'} have below grade? The ground is dug for them.</p>
      {b?.from === 'model' && <p className="rounded-md border border-line bg-panel px-1.5 py-1 text-muted">Set in your Rhino model (its window or the Below grade layer). Rhino's next change sets it again, so change it there to keep it.</p>}
      <div role="group" aria-label="Levels below grade" className="flex flex-wrap gap-1">
        {LEVELS.map((n) => <button key={n} type="button" onClick={() => set({ levels: n })} aria-pressed={levels === n} data-testid={`place-levels-${n}`} className={chip(levels === n)}>{n === 0 ? 'None' : n}</button>)}
      </div>
      {levels > 0 && b && (
        <>
          <div role="group" aria-label="Where the dig goes" className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-muted">Under</span>
            <button type="button" onClick={() => set({ extent: 'tower' })} aria-pressed={b.extent === 'tower'} className={chip(b.extent === 'tower')}>the tower</button>
            <button type="button" onClick={() => set({ extent: 'podium' })} aria-pressed={b.extent === 'podium'} className={chip(b.extent === 'podium')}>the podium</button>
            <button type="button" onClick={() => set({ extent: 'site' })} aria-pressed={b.extent === 'site'} disabled={!hasSite} data-testid="place-dig-site" className={chip(b.extent === 'site')} title={hasSite ? 'To the site boundary' : 'Choose a site first'}>the whole site</button>
          </div>
          <div role="group" aria-label="Basement use" className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-muted">For</span>
            <button type="button" onClick={() => set({ use: 'parking' })} aria-pressed={b.use === 'parking'} className={chip(b.use === 'parking')}>parking</button>
            <button type="button" onClick={() => set({ use: 'mixed' })} aria-pressed={b.use === 'mixed'} className={chip(b.use === 'mixed')}>parking, storage, plant</button>
          </div>
          {sum && (
            <p className="flex flex-wrap items-center gap-x-1.5 tabular-nums text-ink">
              <Layers2 size={12} className="text-accent" aria-hidden />{fmt(sum.depth, 1)} m deep · {fmt(sum.areaPerLevel)} m² a level · ≈ {fmt(sum.stalls)} stalls <FlagChip flag="team_assumption" />
            </p>
          )}
          <button type="button" onClick={() => { useDig.setState({ dig: !dig }); if (!dig) lookBelow(t) }} aria-pressed={dig}
            className={`${btn} ${dig ? 'border-accent bg-accent text-white' : 'border-line text-ink hover:border-accent'}`}>{dig ? <EyeOff size={13} aria-hidden /> : <Eye size={13} className="text-accent" aria-hidden />}{dig ? 'Hide the dig' : 'See it under the ground'}</button>
          <p className="text-muted">Floor-to-floor {fmt(b.f2f, 1)} m; change it and the ramp in Form › Basement.</p>
        </>
      )}
    </div>
  )
}
