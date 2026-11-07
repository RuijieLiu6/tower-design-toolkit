// "Your site", a tab of the right panel (Ruijie, 5 Nov: "move the property and information tab on the right side of the
// screen and keep the left side only things"): the site as it stands, opened by itself in the Site step
// (RightPanel.tsx). The left panel's Site tool keeps the tools that set it (SiteStart.tsx). Real Vancouver: the area,
// its basis, the address, the flags and the last action's message, with Undo, Clear site and Show the site. The
// competition: the VTC block, fixed by the brief. Below the site, the towers on it (Ruijie, 5 Nov: "once you add volume
// in the map, allow the right site panel to indicate that a tower is added; once the user click on the right side
// button they can name the components and delete them"): each with a "New" mark when just added (lib/towerAdds.ts),
// and an edit button on the right that opens its name and Delete.
import { useState } from 'react'
import { Building2, Check, Compass, Crosshair, FileUp, LandPlot, Lock, MapPin, Pencil, Sparkles, Trash2, Undo2 } from '../icons'
import { towerFloors } from '../../engine/massing'
import { ringMetrics, validateRing } from '../../engine/site'
import { breakStep, undo, useHistory } from '../../lib/project/history'
import { tell } from '../../lib/siteActions'
import { useSiteAnalysis } from '../../lib/siteParcels'
import { useSiteStore } from '../../lib/siteStore'
import { seenTower, useTowerAdds } from '../../lib/towerAdds'
import { useStore, useTowers } from '../../store'
import { useCityData } from '../CityContext'
import Help from '../Help'
import SitePlan, { TowerGlyph } from './SitePlan'
import { VTC_SITE } from '../../lib/siteGeometry'
import { VTC_NORTH_DEG } from '../../context'
import { FlagChip } from '../ui'
import { U } from '../Units'
import { flyToFit } from '../VistaLook'
import { onGround } from './PlaceNames'
import { goToStep } from '../../lib/step'
import { placeFirstTower } from '../tools/NoTower'

const btn = 'flex items-center gap-1 rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent'
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')
const card = 'm-3 rounded-lg border border-accent/35 bg-accent/[0.05] px-3 py-2.5 text-[11px] shadow-sm'

export default function SiteInfo() {
  const project = useStore((s) => s.project)
  return (
    <>
      {project === 'city' ? <SiteNow /> : <VtcSite />}
      <TowerList />
    </>
  )
}

/** The towers on the site: select one, see which are new, rename or delete them (Undo brings a deleted one back). */
function TowerList() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const added = useTowerAdds((s) => s.added)
  const [editing, setEditing] = useState<string | null>(null)
  const [gone, setGone] = useState<string | null>(null)
  const rename = (id: string, name: string, was: string) => { const n = name.trim(); if (n && n !== was) useStore.getState().updateTower(id, { name: n }) }
  const remove = (id: string, name: string) => {
    breakStep(); useStore.getState().removeTower(id); breakStep()
    setEditing(null); setGone(name)
  }
  return (
    <section aria-labelledby="site-towers-title" data-testid="site-towers" className="mx-3 mb-3 rounded-lg border border-line bg-white px-3 py-2.5 text-[11px]">
      <h3 id="site-towers-title" className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Building2 size={14} className="text-accent" aria-hidden />Towers on this site<span className="font-normal text-muted">({towers.length})</span>
        <Help label="About the towers list">Every tower or volume you add (Form step, an upload, a Rhino link) shows here, marked New at first. Click a tower to select it; the pencil on the right opens its name and Delete. Undo brings a deleted tower back. Deleting the last one leaves the site empty again, ready to place a new tower.</Help>
      </h3>
      {towers.length === 0 && (
        <div data-testid="site-towers-empty" className="mt-1.5 flex items-center gap-2 text-muted">
          No tower yet.
          <button type="button" onClick={() => { goToStep('volume'); placeFirstTower() }} className={`${btn} ml-auto border-line text-ink hover:border-accent`}><Crosshair size={12} />Place a tower</button>
        </div>
      )}
      <ul className="mt-1.5 grid gap-1">
        {towers.map((t, _i, all) => {
          const isNew = !!added[t.id], open = editing === t.id
          const floors = towerFloors(t).length
          return (
            <li key={t.id} data-testid="site-tower" className={`rounded-md border ${t.id === selected ? 'border-accent/50 bg-accent/[0.05]' : 'border-line'} ${isNew ? 'ring-1 ring-amber-400' : ''}`}>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <TowerGlyph t={t} max={Math.max(...all.map((x) => x.height))} />
                <button type="button" onClick={() => { useStore.getState().selectTower(t.id); seenTower(t.id) }} className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-current={t.id === selected ? 'true' : undefined}>
                  <span className="flex items-center gap-1.5"><b className="truncate text-ink">{t.name}</b>{isNew && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">New</span>}</span>
                  <span className="flex items-center gap-1 text-muted"><U>{`${Math.round(t.height)} m`}</U> · {floors} floor{floors === 1 ? '' : 's'}
                    {t.imported && <span className="ml-0.5 flex items-center gap-0.5" title={t.imported.format === 'generated' ? 'Generated from a brief' : 'From your model'}>{t.imported.format === 'generated' ? <Sparkles size={11} aria-hidden /> : <FileUp size={11} aria-hidden />}{t.imported.format === 'generated' ? 'generated' : 'your model'}</span>}</span>
                </button>
                <button type="button" onClick={() => { setEditing(open ? null : t.id); seenTower(t.id) }} aria-expanded={open} aria-label={`Rename or delete ${t.name}`} title="Rename or delete"
                  className={`shrink-0 rounded-md border p-1 outline-none focus-visible:ring-2 focus-visible:ring-accent ${open ? 'border-accent bg-accent text-white' : 'border-line text-muted hover:border-accent hover:text-ink'}`}><Pencil size={12} /></button>
              </div>
              {open && (
                <form className="flex flex-wrap items-center gap-1.5 border-t border-line px-2 py-1.5" onSubmit={(e) => { e.preventDefault(); rename(t.id, new FormData(e.currentTarget).get('name') as string, t.name); setEditing(null) }}>
                  <label className="flex min-w-0 flex-1 items-center gap-1"><span className="text-muted">Name</span>
                    <input name="name" defaultValue={t.name} maxLength={60} autoFocus onBlur={(e) => rename(t.id, e.target.value, t.name)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null) }}
                      className="min-w-0 flex-1 rounded border border-line bg-panel px-1.5 py-0.5 text-xs text-ink" /></label>
                  <button type="submit" className={`${btn} border-line hover:border-accent`}><Check size={12} />Save</button>
                  <button type="button" onClick={() => remove(t.id, t.name)} title={`Delete ${t.name} (Undo brings it back)`}
                    className={`${btn} border-line text-red-700 hover:border-red-400 disabled:opacity-40`}><Trash2 size={12} />Delete</button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
      {gone && <p role="status" className="mt-1.5 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-amber-900">Deleted {gone}.<button type="button" onClick={() => { if (undo()) setGone(null) }} className="ml-auto flex items-center gap-1 rounded border border-amber-300 px-1.5 py-0.5 hover:bg-amber-100"><Undo2 size={11} />Undo</button></p>}
    </section>
  )
}

/** Real Vancouver: the study site as it stands. */
function SiteNow() {
  const { site, area, match } = useSiteAnalysis()
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const { data } = useCityData()
  const message = useSiteStore((s) => s.message)
  const { canUndo } = useHistory()
  const ok = !!site && !validateRing(site.ring)
  const m = ok ? ringMetrics(site!.ring) : null
  const lots = match?.included.length ?? 0
  // The site's note once: the area's source line often repeats it word for word, with its flag.
  const note = site?.note && !(area?.source ?? '').includes(site.note) ? site.note : null
  return (
    <section aria-labelledby="your-site-title" aria-live="polite" data-testid="site-info" className={card}>
      <h3 id="your-site-title" className="flex items-center gap-1.5 text-xs font-semibold text-accent"><MapPin size={14} aria-hidden />Your site</h3>
      {ok && m ? (
        <div data-testid="site-summary" className="mt-1 flex items-start gap-2.5">
          <SitePlan ring={site!.ring as [number, number][]} towers={towers} selected={selected} label={`Plan of the study site with ${towers.length} tower${towers.length === 1 ? '' : 's'}`} />
          <div className="grid min-w-0 gap-1">
            <span className="text-lg font-semibold leading-tight tabular-nums text-ink">{fmt(area?.area ?? m.area)} m²</span>
            {site!.label && <div className="text-xs font-medium text-ink">{site!.label}</div>}
            <div className="flex flex-wrap items-center gap-1">
              {area && <span className="flex items-center gap-1 rounded border border-line px-1 py-0.5" title={area.basis === 'parcels' ? 'Area from the City lots joined under the site' : 'Area from the drawn boundary'}><LandPlot size={11} className="text-accent" aria-hidden />{area.basis === 'parcels' ? `${lots} lot${lots === 1 ? '' : 's'}` : 'boundary'}</span>}
              {site!.replaced.length > 0 && <span className="flex items-center gap-1 rounded border border-line px-1 py-0.5" title={`${site!.replaced.length} existing building${site!.replaced.length === 1 ? '' : 's'} ${site!.keepReplaced ? 'kept standing' : 'shown as demolished'} (team assumption)`}><Building2 size={11} className={site!.keepReplaced ? 'text-muted' : 'text-red-700'} aria-hidden />{site!.replaced.length} {site!.keepReplaced ? 'kept' : 'replaced'}</span>}
              {area && <FlagChip flag={area.flag} />}
              {(note || area) && <Help label="About the site's area and source">{note && <span className="block">{note}</span>}{area && <span className="block">{area.source}</span>}</Help>}
            </div>
          </div>
        </div>
      ) : <p className="mt-1 flex items-center gap-1 text-xs text-ink">No site yet: choose one in the Site step.<Help label="About the study site">Type an address or click the map in the Site step's Site tool. The tower can still be placed anywhere (Form step); the site checks wait for a site.</Help></p>}
      {message && <p data-testid="site-message" className={`mt-1.5 rounded px-2 py-1 ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{message.text}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={!canUndo} onClick={() => { if (undo()) tell('Undone.') }} className={`${btn} border-line hover:border-accent disabled:opacity-50`}><Undo2 size={12} />Undo</button>
        {ok && <button type="button" onClick={() => { const s = useSiteStore.getState(); breakStep(); s.setSite(null); breakStep(); tell('Study site cleared (Undo brings it back).', { undoable: true }) }} className={`${btn} border-line text-muted hover:text-red-700`}><Trash2 size={12} />Clear site</button>}
        {ok && m && <button type="button" onClick={() => flyToFit(onGround([site!.ring], data?.grids))} className={`${btn} border-line hover:border-accent`}><Compass size={12} />Show the site</button>}
      </div>
    </section>
  )
}

/** The competition: the VTC block, fixed by the brief; nothing to choose. */
function VtcSite() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  return (
    <section aria-labelledby="vtc-site-title" data-testid="vtc-site" className={card}>
      <h3 id="vtc-site-title" className="flex items-center gap-1.5 text-xs font-semibold text-accent"><MapPin size={14} aria-hidden />Your site
        <Help label="About the competition site">The competition site is the VTC block, fixed by the brief: the tower stands inside it and the competition rules (Results) read it. To study a site of your own, switch the project to Real Vancouver in the top bar.</Help></h3>
      <div className="mt-1 flex items-start gap-2.5">
        <SitePlan ring={VTC_SITE.ring as [number, number][]} towers={towers} selected={selected} northDeg={VTC_NORTH_DEG} label={`Plan of the competition block with ${towers.length} tower${towers.length === 1 ? '' : 's'}; true north ${VTC_NORTH_DEG} degrees from the grid`} />
        <div className="grid gap-1">
          <div className="text-sm font-semibold text-ink">The VTC block, fixed by the brief</div>
          <span className="text-muted">144.8 × 79.2 m</span>
          <div className="flex items-center gap-1"><span className="flex items-center gap-1 rounded border border-line px-1 py-0.5" title="Set by the brief: nothing to choose"><Lock size={11} className="text-accent" aria-hidden />fixed</span><FlagChip flag="verified" />
            <Help label="Source of the competition site">Vancouver Tall Competition brief (the block and its rules: engine/vtcRules).</Help></div>
        </div>
      </div>
    </section>
  )
}
