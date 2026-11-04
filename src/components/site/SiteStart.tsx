// The Site step's palette (left panel, first in the Site step; Ruijie, 3 Nov): where the design starts. Top to bottom:
// the project (Real Vancouver, any address in the model, or the competition block, fixed by the brief); an address;
// a neighbourhood (the City's 22 local areas, bundled, plus Vista's place names); picking on the map (the click menu in
// SiteMapMenu.tsx); then the site as it stands, with Undo and the way on to Volume. Site actions: lib/siteActions.ts.
import { ArrowRight, Combine, Compass, FileUp, Landmark, MapPin, MousePointerClick, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ringMetrics, validateRing, type Pt } from '../../engine/site'
import { cameraOver, useLocalAreas, type Neighbourhood } from '../../lib/localAreas'
import { breakStep, undo, useHistory } from '../../lib/project/history'
import { tell, useSiteStep } from '../../lib/siteActions'
import { useSiteAnalysis } from '../../lib/siteParcels'
import { useSiteStore } from '../../lib/siteStore'
import { useImportStore } from '../../lib/import/store'
import { goToStep } from '../../lib/step'
import { viewLimit } from '../../lib/viewLimit'
import { useStore } from '../../store'
import { useCityData } from '../CityContext'
import { AddressSearch, placeSiteAt } from '../SitePanel'
import { FlagChip } from '../ui'
import { flyTo } from '../VistaLook'

const btn = 'flex items-center gap-1 rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent'
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-3 py-2.5 first:border-t-0">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent">{n}</span>{title}</h4>
      {children}
    </div>
  )
}

export default function SiteStart() {
  const project = useStore((s) => s.project)
  return (
    <div className="text-[11px]" data-testid="site-start">
      <ProjectChoice />
      {project === 'city' ? <CityStart /> : <VtcSite />}
    </div>
  )
}

function ProjectChoice() {
  const project = useStore((s) => s.project)
  const choose = (p: 'city' | 'vtc') => {
    if (useStore.getState().project === p) return
    useStore.getState().setProject(p)
    tell(p === 'vtc' ? 'Competition site: the VTC block, fixed by the brief.' : 'Real Vancouver: find an address, pick a neighbourhood, or click the map.')
  }
  return (
    <div className="px-3 pb-2 pt-1">
      <p className="mb-1.5 text-muted">Start by choosing where the tower goes.</p>
      <div role="radiogroup" aria-label="Where the site is" className="grid grid-cols-2 gap-1.5">
        {([['city', 'Real Vancouver', 'Any address in the model'], ['vtc', 'Competition site (VTC block)', 'Fixed by the brief']] as const).map(([id, label, sub]) => (
          <button key={id} type="button" role="radio" aria-checked={project === id} onClick={() => choose(id)}
            className={`rounded-md border px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${project === id ? 'border-accent bg-accent/10' : 'border-line hover:border-accent'}`}>
            <span className="block text-xs font-semibold text-ink">{label}</span><span className="block text-muted">{sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function VtcSite() {
  return (
    <div className="px-3 pb-3">
      <p>The competition site is the VTC block, fixed by the brief: the tower stands inside it and the competition rules (Results) read it.</p>
      <div className="mt-1.5 flex items-start gap-1.5"><FlagChip flag="verified" /><span className="text-muted">Vancouver Tall Competition brief (the block and its rules: engine/vtcRules).</span></div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ImportMassing />
        <button type="button" onClick={() => goToStep('volume')} className={`${btn} ml-auto border-accent bg-accent text-white`}>Next: Volume<ArrowRight size={12} /></button>
      </div>
    </div>
  )
}

/** Starting from a massing made elsewhere (Rhino, SketchUp, Revit…): the import dialog, also in Volume › Towers & site. */
function ImportMassing() {
  return (
    <button type="button" onClick={() => useImportStore.getState().openDialog()} title="Import a massing model (3DM, OBJ, glTF, IFC)"
      className={`${btn} border-line hover:border-accent`}><FileUp size={12} />Import a massing</button>
  )
}

function CityStart() {
  const { data } = useCityData()
  const onPlace = (p: Pt, label: string, source: string) => placeSiteAt(p, label, source, data?.footprints)
  return (
    <>
      <Step n="1" title="Type an address"><AddressSearch onPlace={onPlace} bare /></Step>
      <Step n="2" title="Or start from a neighbourhood"><Neighbourhoods /></Step>
      <Step n="3" title="Or pick on the map"><PickOnMap /></Step>
      <SiteNow />
    </>
  )
}

// ---------------------------------------------------------------- neighbourhoods: the City's 22 local areas + Vista's places
interface VistaPlace { text: string; x: number; y: number; ext: boolean }
const WATER = /Inlet|Bay|Creek|Lagoon|Harbour$/
function useVistaPlaces(): VistaPlace[] {
  const [places, setPlaces] = useState<VistaPlace[]>([])
  useEffect(() => {
    let live = true
    fetch('./data/vista_labels.json').then((r) => (r.ok ? r.json() : null)).then((d: { labels?: VistaPlace[] } | null) => live && setPlaces((d?.labels ?? []).filter((l) => !WATER.test(l.text) || l.text === 'Coal Harbour')), () => {})
    return () => { live = false }
  }, [])
  return places
}

/** Fly to a place and mark it, as the address search does; the site does not move. */
function goTo(label: string, at: Pt, bounds: [number, number, number, number], kind: 'neighbourhood' | 'street', source: string, area: string | null) {
  const s = useStore.getState()
  flyTo(cameraOver(bounds, s.groundElevation))
  useSiteStore.getState().set({ marker: { at, label, kind, source } })
  useSiteStep.setState({ area })
  tell(`${label} is in view and marked. Your site has not moved: type an address there, or click the map to pick a lot or a building.`)
}

function inModel(b: [number, number, number, number]): boolean {
  const r = viewLimit.rect
  return !r || !(b[2] < r.x0 || b[0] > r.x1 || b[3] < r.y0 || b[1] > r.y1)
}

function Neighbourhoods() {
  const areas = useLocalAreas()
  const places = useVistaPlaces()
  const picked = useSiteStep((s) => s.area)
  const marker = useSiteStore((s) => s.marker)
  const { data } = useCityData() // the model's extent is known once the city has loaded
  const sorted = useMemo(() => (areas ?? []).map((a) => ({ a, inside: inModel(a.bounds) })), [areas, data]) // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (a: Neighbourhood) => goTo(a.name, a.at, a.bounds, 'neighbourhood', 'City local area (OGL-Vancouver, 2026-11-03)', a.name)
  return (
    <div>
      {areas === null ? <p className="text-muted">Loading the City's local areas…</p> : !areas.length ? <p className="text-red-800">The local areas did not load.</p> : (
        <div className="flex flex-wrap gap-1" role="group" aria-label="City local areas">
          {sorted.map(({ a, inside }) => (
            <button key={a.name} type="button" onClick={() => pick(a)} aria-pressed={picked === a.name} title={inside ? `Fly to ${a.name}` : `${a.name} is outside the 3D model's buildings; the view goes to its edge`}
              className={`rounded-full border px-2 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${picked === a.name ? 'border-accent bg-accent text-white' : inside ? 'border-line bg-white hover:border-accent' : 'border-dashed border-line text-muted hover:border-accent'}`}>
              {a.name}
            </button>
          ))}
        </div>
      )}
      {places.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-muted"><Landmark size={11} className="mr-1 inline" aria-hidden />Places on Vista's map ({places.length})</summary>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Vista place names">
            {places.map((p) => (
              <button key={p.text} type="button" onClick={() => goTo(p.text, [p.x, p.y], [p.x - 350, p.y - 350, p.x + 350, p.y + 350], 'street', "Vista's place label (Ruijie Liu)", null)}
                aria-pressed={marker?.label === p.text} className="rounded-full border border-line bg-white px-2 py-0.5 outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">{p.text}</button>
            ))}
          </div>
        </details>
      )}
      <p className="mt-1.5 text-muted">Nothing is sent: the 22 local areas are the City's boundaries (Open Government Licence - Vancouver, retrieved 3 Nov 2026), kept in the app. Dashed: outside the 3D model's buildings.</p>
    </div>
  )
}

// ---------------------------------------------------------------- pick on the map
function PickOnMap() {
  const { box, multi } = useSiteStep()
  return (
    <div>
      <p>Click the map: a menu at the click offers <b>Build the massing here</b>, <b>Replace this building</b>, <b>Select several buildings to replace</b>, and <b>Use</b>, <b>Add</b> or <b>Remove this lot</b>. Shift-click buildings to select several at once.</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={multi} onClick={() => {
          if (multi) { useSiteStore.getState().set({ tool: null, picked: [] }); useSiteStep.setState({ multi: false }); return }
          useSiteStore.getState().set({ tool: 'pick', picked: [], draft: [], message: null }); useSiteStep.setState({ multi: true, box: false })
          tell('Click the buildings to replace, then Done at the top of the view.')
        }} className={`${btn} ${multi ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}><MousePointerClick size={12} />{multi ? 'Selecting buildings…' : 'Select buildings to replace'}</button>
        <button type="button" aria-pressed={box} onClick={() => {
          useSiteStep.setState({ box: !box, boxDraft: null, multi: false })
          if (!box) { useSiteStore.getState().set({ tool: null, picked: [] }); tell('Drag a box across the lots to combine; every lot it touches joins (one block at a time). Esc cancels.') }
        }} className={`${btn} ${box ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}><Combine size={12} />{box ? 'Drawing a box…' : 'Draw a box over lots'}</button>
      </div>
      <p className="mt-1.5 text-muted">Drawing a free boundary, typed coordinates and GeoJSON are in Results › Vista view studies › Study site.</p>
    </div>
  )
}

// ---------------------------------------------------------------- the site as it stands
function SiteNow() {
  const { site, area, match } = useSiteAnalysis()
  const message = useSiteStore((s) => s.message)
  const { canUndo } = useHistory()
  const ok = !!site && !validateRing(site.ring)
  const m = ok ? ringMetrics(site!.ring) : null
  const lots = match?.included.length ?? 0
  return (
    <div className="border-t border-line bg-black/[0.02] px-3 py-2.5" aria-live="polite">
      <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ink"><MapPin size={12} className="text-accent" aria-hidden />Your site</h4>
      {ok && m ? (
        <div data-testid="site-summary">
          <div><b className="text-ink">{fmt(area?.area ?? m.area)} m²</b> {area ? `(${area.basis === 'parcels' ? `${lots} City lot${lots === 1 ? '' : 's'} joined` : 'boundary'})` : ''}{site!.label ? ` · ${site!.label}` : ''}</div>
          <div className="text-muted">{site!.note}</div>
          {site!.replaced.length > 0 && <div>{site!.replaced.length} existing building{site!.replaced.length === 1 ? '' : 's'} {site!.keepReplaced ? 'kept' : 'shown as demolished'} <FlagChip flag="team_assumption" /></div>}
          {area && <div className="mt-0.5 flex items-start gap-1.5"><FlagChip flag={area.flag} /><span className="text-muted">{area.source}</span></div>}
        </div>
      ) : <p className="text-muted">No study site yet. The design tower can still be placed anywhere (Volume step).</p>}
      {message && <p data-testid="site-message" className={`mt-1.5 rounded px-2 py-1 ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{message.text}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={!canUndo} onClick={() => { if (undo()) tell('Undone.') }} className={`${btn} border-line hover:border-accent disabled:opacity-50`}><Undo2 size={12} />Undo</button>
        {ok && <button type="button" onClick={() => { const s = useSiteStore.getState(); breakStep(); s.setSite(null); breakStep(); tell('Study site cleared (Undo brings it back).', { undoable: true }) }} className={`${btn} border-line text-muted hover:text-red-700`}><Trash2 size={12} />Clear site</button>}
        {ok && m && <button type="button" onClick={() => flyTo(cameraOver(m.bounds, useStore.getState().groundElevation))} className={`${btn} border-line hover:border-accent`}><Compass size={12} />Show the site</button>}
        <ImportMassing />
        <button type="button" onClick={() => goToStep('volume')} className={`${btn} ml-auto border-accent bg-accent text-white`}>Next: Volume<ArrowRight size={12} /></button>
      </div>
    </div>
  )
}
