// The Site step's palette (left panel, first in the Site step; Ruijie, 3 Nov): where the design starts. Top to bottom:
// in Real Vancouver an address (the project itself is the top bar's switch; 5 Nov: no project choice here);
// the map (place names that fly to their neighbourhood, PlaceNames.tsx, and the click menu in SiteMapMenu.tsx); the
// way on to Volume. The site as it stands is the right panel's Your site tab (SiteInfo.tsx). Site actions: lib/siteActions.ts.
// 4 Nov (Ruijie): the neighbourhood list ("Or start from a neighbourhood") is gone; the names on the map do its job.
import { ArrowRight, Combine, FileUp, MousePointerClick } from '../icons'
import type { Pt } from '../../engine/site'
import { tell, useSiteStep } from '../../lib/siteActions'
import { useSiteStore } from '../../lib/siteStore'
import { useImportStore } from '../../lib/import/store'
import { goToStep } from '../../lib/step'
import { useStore } from '../../store'
import { useCityData } from '../CityContext'
import { AddressSearch, placeSiteAt } from '../SitePanel'
import { SOLAR_NODE } from '../../hooks/useSolarAccess'
import { SolarAreaControls } from '../SolarArea'
import Help from '../Help'

const btn = 'flex items-center gap-1 rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent'
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')

/** A numbered step; `help` (how the step works) sits behind a "?" beside its title (Ruijie, 5 Nov). */
function Step({ n, title, help, children }: { n: string; title: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-3 py-2.5 first:border-t-0">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent">{n}</span>{title}{help && <Help label={`How to: ${title}`}>{help}</Help>}</h4>
      {children}
    </div>
  )
}

export default function SiteStart() {
  const project = useStore((s) => s.project)
  return (
    <div className="text-[11px]" data-testid="site-start">
      {project === 'city' ? <CityStart /> : <VtcSite />}
    </div>
  )
}

/**
 * The competition project's Site tool (Ruijie, 5 Nov: "for competition, keep the site tab but remove site selection"):
 * nothing to choose, the VTC block is fixed by the brief (shown in Your site, the right panel); the way on from here.
 */
function VtcSite() {
  return (
    <>
      <p className="px-3 pt-1 text-muted">The competition block is fixed by the brief: see Your site on the right.</p>
      <SiteFooter />
    </>
  )
}

/** The way on from the Site tool: a massing made elsewhere, or the Volume step. */
function SiteFooter() {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2.5">
      <ImportMassing />
      <button type="button" onClick={() => goToStep('volume')} className={`${btn} ml-auto border-accent bg-accent text-white`}>Next: Volume<ArrowRight size={12} /></button>
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
  // The tools only: the site as it stands is the right panel's Your site tab (Ruijie, 5 Nov: "keep the left side only
  // things"; site/SiteInfo.tsx).
  return (
    <>
      <Step n="1" title="Type an address" help="Type a street address or a neighbourhood. Place site here takes the City parcel at the address; Move Study tower here moves the tower without changing the site."><AddressSearch onPlace={onPlace} bare /></Step>
      <Step n="2" title="Or pick on the map" help={<PickOnMapHelp />}><PickOnMap /></Step>
      <SunArea />
      <SiteFooter />
    </>
  )
}

// ---------------------------------------------------------------- pick on the map
function PickOnMapHelp() {
  return (
    <>
      <span className="block"><b>Neighbourhood names</b> on the map fly there when clicked: the view fits the neighbourhood's whole boundary and marks it with a dashed line. Other place names (Gastown, Stanley Park…) fly to the place.</span>
      <span className="block">Click the map: a menu at the click offers <b>Build the massing here</b>, <b>Replace this building</b>, <b>Select several buildings to replace</b>, and <b>Use</b>, <b>Add</b> or <b>Remove this lot</b>. Shift-click buildings to select several at once.</span>
      <span className="block text-muted">Drawing a free boundary, typed coordinates and GeoJSON are in Results › Vista view studies › Study site. Neighbourhoods are the City's 22 local areas (Open Government Licence - Vancouver, retrieved 3 Nov 2026), kept in the app: nothing is sent.</span>
    </>
  )
}

function PickOnMap() {
  const { box, multi } = useSiteStep()
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
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
    </div>
  )
}

// ---------------------------------------------------------------- the sun-hours map's area (Ruijie, 4 Nov: "add a function to modify the boundary")
function SunArea() {
  const on = useStore((s) => !!s.enabled[SOLAR_NODE])
  if (!on) return null
  return <div className="border-t border-line px-3 py-2.5"><SolarAreaControls /></div>
}
