// The right panel's Properties tab while "Tower position" is open (lib/towerPosition.ts; Ruijie, 6 Nov: "on right side
// of the screen you have a property tab which shows the location information and you could enter the exact number
// from there"). The selected tower's position as numbers to type (each one applies at once, one undo step), where that
// is (map coordinates, the lot, the site), and the checks there. Icons with a word, the long text behind "?".
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Building2, Crosshair, LandPlot, Lock, MapPin, Move, RotateCw, Ruler, ScanLine, Target, Unlock } from './icons'
import { fromCity } from '../engine/geoLocate'
import { towerFootprint } from '../engine/massing'
import { ringMetrics } from '../engine/site'
import type { Tower } from '../engine/types'
import { useProposalReport } from '../hooks/useProposal'
import { byState, coneRows } from '../lib/fixes'
import { guideSite } from '../lib/import/placeModel'
import { alignToLot, loadLots, lotUnder, poseOf, setPose } from '../lib/towerEdit'
import { useTowerPosition } from '../lib/towerPosition'
import { fieldUnit, formatLength, useUnits } from '../lib/units'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import Help from './Help'
import IconTile from './IconTile'
import StatusRow from './StatusRow'

type Pt = [number, number]
const r2 = (v: number) => Math.round(v * 100) / 100

export default function TowerProperties() {
  const towers = useTowers()
  const { project, selected, selectTower, ground } = useStore(useShallow((s) => ({ project: s.project, selected: s.selectedTower, selectTower: s.selectTower, ground: s.groundElevation })))
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  useEffect(() => { if (project === 'city') void loadLots() }, [project])
  if (!t) return <p className="p-4 text-xs text-muted">No tower yet. Place one in the Form step.</p>
  return (
    <div className="grid gap-3 p-3 text-xs" data-testid="tower-properties">
      {towers.length > 1 && (
        <div role="group" aria-label="Tower" className="flex flex-wrap gap-1">
          {towers.map((x) => <button key={x.id} type="button" onClick={() => selectTower(x.id)} aria-pressed={x.id === t.id} className={`rounded-md border px-2 py-1 ${x.id === t.id ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line hover:border-accent'}`}>{x.name}</button>)}
        </div>
      )}
      <Position t={t} />
      <Where t={t} project={project} ground={ground} />
      <Checks t={t} />
      <ViewTiles t={t} />
    </div>
  )
}

/** x, y and the turn, typed: each applies at once (Ctrl+Z undoes it). */
function Position({ t }: { t: Tower }) {
  const project = useStore((s) => s.project)
  const unit = useUnits((s) => s.unit)
  const fu = fieldUnit('m', unit)
  const show = (m: number) => (fu ? fu.toShown(m) : m)
  const store = (v: number) => (fu ? fu.fromShown(v) : v)
  const sym = fu ? fu.label : 'm'
  const frame = project === 'city'
    ? 'Metres east (x) and north (y) of the project origin on the UTM 10N grid (EPSG:26910 491300 E, 5458600 N).'
    : 'Metres along the competition model grid; true north is 45° from it.'
  return (
    <section aria-labelledby="pp-pos" className="rounded-lg border border-line p-2.5">
      <h3 id="pp-pos" className="mb-1.5 flex items-center gap-1.5 font-semibold"><Move size={14} className="text-accent" aria-hidden />Position<Help label="About the position">{frame} Drag the tower in the view, click the ground to move it there, or type a value: every change applies at once, and Ctrl+Z undoes it.</Help></h3>
      <div className="grid grid-cols-3 gap-1.5">
        <Field label="x" unit={sym} value={show(t.x)} onCommit={(v) => setPose(t.id, { x: store(v) })} testId="pp-x" />
        <Field label="y" unit={sym} value={show(t.y)} onCommit={(v) => setPose(t.id, { y: store(v) })} testId="pp-y" />
        <Field label="Turn" unit="°" value={t.rotation} onCommit={(v) => setPose(t.id, { rotation: v })} testId="pp-turn" icon={<RotateCw size={11} aria-hidden />} />
      </div>
    </section>
  )
}

/** Where it stands: map coordinates, the lot, the site, the footprint and its base. */
function Where({ t, project, ground }: { t: Tower; project: 'vtc' | 'city'; ground: number }) {
  const unit = useUnits((s) => s.unit)
  const fp = ringMetrics(towerFootprint(t, true) as Pt[])
  const utm: Pt | null = project === 'city' ? [t.x + CITY_ORIGIN[0], t.y + CITY_ORIGIN[1]] : null
  const ll = utm ? fromCity(utm, 'EPSG:4326') : null
  const lot = project === 'city' ? lotUnder(t.x, t.y) : null
  const rows: { icon: typeof MapPin; label: string; value: string; help?: string }[] = [
    ...(ll ? [{ icon: MapPin, label: 'Lat, lon', value: `${ll[1].toFixed(5)}, ${ll[0].toFixed(5)}`, help: 'WGS84 from EPSG:26910 (NAD83 and WGS84 taken as equal, about 1 m).' }] : []),
    ...(utm ? [{ icon: Crosshair, label: 'UTM 10N', value: `${Math.round(utm[0])} E, ${Math.round(utm[1])} N`, help: 'EPSG:26910, metres.' }] : []),
    ...(project === 'city' ? [{ icon: LandPlot, label: 'Lot', value: lot ?? 'no lot under its centre (or the lots are loading)', help: 'City of Vancouver property parcel polygons (OGL-Vancouver, retrieved 2026-10-27): a dated snapshot, not a survey.' }] : [{ icon: LandPlot, label: 'Block', value: 'the competition block', help: 'Vancouver Tall Competition brief p.15.' }]),
    { icon: ScanLine, label: 'Footprint', value: `${Math.round(fp.area).toLocaleString('en-CA')} m² at grade` },
    { icon: Ruler, label: 'Base', value: project === 'city' ? `${formatLength(ground, unit, 1)} geodetic (CGVD28)` : 'grade (0 m)' },
  ]
  return (
    <section aria-labelledby="pp-where" className="rounded-lg border border-line p-2.5">
      <h3 id="pp-where" className="mb-1 flex items-center gap-1.5 font-semibold"><MapPin size={14} className="text-accent" aria-hidden />Where it stands</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="flex items-center gap-1 text-muted"><r.icon size={12} aria-hidden />{r.label}</dt>
            <dd className="flex items-center gap-1 tabular-nums">{r.value}{r.help && <Help label={`About ${r.label}`}>{r.help}</Help>}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The checks where it stands (site and land, the view cones in Real Vancouver), as status rows. */
function Checks({ t }: { t: Tower }) {
  const project = useStore((s) => s.project)
  const report = useProposalReport(t, poseOf(t))
  if (!report) return null
  const cones = project === 'city' ? [...coneRows(t.id, t.name, report.cones, report.base + t.height).rows].sort(byState) : []
  const open = cones.filter((r) => r.state !== 'pass').slice(0, 3), clear = cones.length - open.length
  return (
    <section aria-labelledby="pp-checks" className="rounded-lg border border-line p-2.5">
      <h3 id="pp-checks" className="mb-0.5 flex items-center gap-1.5 font-semibold"><Building2 size={14} className="text-accent" aria-hidden />Here</h3>
      <ul>
        {report.fit.map((f) => <StatusRow key={f.id} size="sm" state={f.state} title={f.title} value={f.value} flag={f.flag} detail={<><span className="block">{f.text}</span><span className="block text-muted">Source: {f.source}</span></>} />)}
        {project === 'city' && !cones.length && <StatusRow size="sm" state="pass" title="View cones" value="outside every protected view" />}
        {open.map((r) => <StatusRow key={r.id} size="sm" state={r.state} title={r.title} value={r.value} fix={r.fix} flag={r.flag} />)}
        {project === 'city' && clear > 0 && <StatusRow size="sm" state="pass" title={open.length ? `${clear} more cone${clear === 1 ? '' : 's'}` : 'View cones'} value={open.length ? 'clear' : `clear in ${clear}`} />}
      </ul>
    </section>
  )
}

/** Line up, centre, frame and lock: icon tiles with a word. */
function ViewTiles({ t }: { t: Tower }) {
  const locked = useTowerPosition((s) => s.locked)
  const site = guideSite()
  const centre = () => {
    if (!site) return
    const m = ringMetrics(site.ring).centre
    setPose(t.id, { x: r2(m[0]), y: r2(m[1]) })
  }
  return (
    <div role="group" aria-label="Position actions" className="flex flex-wrap gap-0.5">
      <IconTile size="sm" icon={LandPlot} word="Align" label="Line up with the lot" onClick={() => alignToLot(t.id)} hint="Turn and nudge it to the lot lines under it (the competition block on the competition site). Applies at once. Key: L." />
      <IconTile size="sm" icon={Target} word="Centre" label="Centre on the site" disabled={!site} onClick={centre} hint={site ? `Its centre on the centre of ${site.label}.` : 'Choose a site first.'} />
      <IconTile size="sm" icon={ScanLine} word="Frame" label="Frame the site again" onClick={() => useTowerPosition.setState((s) => ({ frame: s.frame + 1, locked: true }))} hint="The view frames the site and the tower again, at the fixed scale." />
      <IconTile size="sm" icon={locked ? Lock : Unlock} word={locked ? 'Locked' : 'Free'} label={locked ? 'Unlock the view' : 'Lock the view'} active={locked} aria-pressed={locked}
        onClick={() => useTowerPosition.setState({ locked: !locked })} hint={locked ? 'The view stays framed on the site (zoom and pan off; drag to orbit). Click to zoom and pan freely.' : 'Zoom and pan freely. Click to frame the site again and lock the scale.'} />
    </div>
  )
}

function Field({ label, unit, value, onCommit, testId, icon }: { label: string; unit: string; value: number; onCommit: (v: number) => void; testId: string; icon?: React.ReactNode }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft)
    setDraft(null)
    if (draft.trim() !== '' && Number.isFinite(v)) onCommit(v)
  }
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-muted">{icon}{label}</span>
      <span className="flex items-center rounded border border-line bg-panel focus-within:border-accent">
        <input type="number" inputMode="decimal" value={draft ?? String(r2(value))} aria-label={`${label} (${unit})`} data-testid={testId}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setDraft(null) }}
          className="w-full min-w-0 bg-transparent px-1.5 py-1 text-right tabular-nums outline-none" />
        <span className="pr-1.5 text-muted">{unit}</span>
      </span>
    </label>
  )
}
