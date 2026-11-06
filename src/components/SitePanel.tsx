// Study site tools for Real Vancouver (after Vista v34 step 1, Ruijie Liu): find an address or neighbourhood, type a
// coordinate, draw the boundary or take it from existing buildings or a GeoJSON file, and see the City parcels under
// it with the area FSR uses. Every number carries its source and flag; the site is a study boundary, not a legal one.
import { Crosshair, Download, FileUp, MapPin, MousePointerClick, PencilLine, Search, Trash2, WifiOff } from './icons'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { fromCity, INPUT_CRS, parsePasted, siteFromGeoJson, siteToGeoJson, toCity, type InputCrs } from '../engine/geoLocate'
import { overlapArea, pointInRing, polyArea, ringMetrics, siteFromFootprints, validateRing, type Pt } from '../engine/site'
import {
  PRIVACY, addressLabel, cityPlace, createLookup, hasConsent, isOnline, loadCityRecords, loadLocalAreas, matchAreas, setConsent, suggest, titleStreet,
  type CityRecord, type LocalArea, type Place,
} from '../lib/addressSearch'
import { saveFile } from '../lib/download'
import { loadParcelLayer, parcelLabel, useSiteAnalysis, type ParcelLayer } from '../lib/siteParcels'
import { idsToIndices, newSite, useSiteStore, type StudySite } from '../lib/siteStore'
import { replacedFor, type Outline } from '../lib/siteActions'
import { breakStep } from '../lib/project/history'
import { useResults } from '../hooks/useResults'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { useCityData } from './CityContext'
import { FlagChip, Section } from './ui'
import Fold from './Fold'

const fmt = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d }))
const local = (utm: [number, number]): Pt => [utm[0] - CITY_ORIGIN[0], utm[1] - CITY_ORIGIN[1]]
const btn = 'flex items-center gap-1 rounded-md border px-2 py-1 text-xs'
const say = (text: string, kind: 'info' | 'error' = 'info') => useSiteStore.getState().set({ message: { text, kind } })

/** Zoom the 3D view to a local point (model frame, z up). */
/**
 * Flies the view in on an address (Ruijie, 6 Nov: "when you type an address allow the view to zoom in around the
 * specific site"): north up, about one block around the point (a 180 m square), inside the part of the view the
 * overlays leave free, as a picked neighbourhood flies (VistaLook flyToFit).
 */
function zoomTo(p: Pt, half = 90) {
  const g = useStore.getState().groundElevation
  const pts: [number, number, number][] = [[p[0] - half, p[1] - half, g], [p[0] + half, p[1] + half, g]]
  void import('./VistaLook').then((m) => m.flyToFit(pts, 2 * half))
}

/** Frames a site's lot: the parcel and a margin around it, so its neighbours read. */
function zoomToRing(ring: Pt[]) {
  const g = useStore.getState().groundElevation
  const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]), m = 40
  const pts: [number, number, number][] = [[Math.min(...xs) - m, Math.min(...ys) - m, g], [Math.max(...xs) + m, Math.max(...ys) + m, g]]
  void import('./VistaLook').then((mod) => mod.flyToFit(pts, 160))
}

/** The parcel containing a point (outer ring, not in a courtyard), or null. */
function parcelAt(layer: ParcelLayer, p: Pt): number | null {
  for (let i = 0; i < layer.polys.length; i++) {
    const f = layer.polys[i]
    if (pointInRing(p, f.outer as Pt[]) && !f.holes.some((h) => pointInRing(p, h as Pt[]))) return i
  }
  return null
}

/**
 * Place a site from a point: the City parcel there (Vista "Place site here" / "Use as study site"), as one undo step.
 * With the model's footprints, the buildings standing on the lot are shown as replaced (Site step, 3 Nov).
 */
export async function placeSiteAt(p: Pt, label: string, source: string, footprints?: readonly Outline[]) {
  let layer: ParcelLayer
  try { layer = await loadParcelLayer() } catch (e) { say(`The City parcel layer did not load (${(e as Error).message}).`, 'error'); return }
  const i = parcelAt(layer, p)
  if (i === null) { say(`No City parcel at ${label} (a street, water, or outside the parcel layer, which covers downtown). Draw the boundary or pick buildings instead.`, 'error'); return }
  const ring = layer.polys[i].outer as Pt[]
  const prev = useSiteStore.getState().site
  const replaced = footprints ? replacedFor(ring, prev, footprints) : []
  breakStep()
  useSiteStore.getState().setSite(newSite(ring, 'parcels', `City parcel at ${parcelLabel(layer, i)} (found from ${source})`, { label, parcelLayer: layer.sha, replaced, parcelsAdd: [i] }))
  breakStep()
  useSiteStore.getState().set({ pending: null, tool: null, marker: { at: p, label, kind: 'address', source } })
  zoomToRing(ring)
  say(`Site set to the City parcel at ${parcelLabel(layer, i)}: ${fmt(polyArea([ring]))} m²${replaced.length ? `; ${replaced.length} building${replaced.length === 1 ? '' : 's'} on it shown as demolished` : ''}. An address point finds the parcel; the parcel is a dated City snapshot, not a survey.`)
}

export default function SitePanel() {
  const project = useStore((s) => s.project)
  if (project !== 'city') return <Section title="Study site"><p className="text-[11px] text-muted">The competition site is fixed by the brief. Study sites are for the Real Vancouver project.</p></Section>
  return <CitySite />
}

function CitySite() {
  const { site, match, area, layer, error, staleChoices } = useSiteAnalysis()
  const s = useSiteStore()
  const { fsr } = useResults()
  const { data } = useCityData()
  const siteAt = (p: Pt, label: string, source: string) => placeSiteAt(p, label, source, data?.footprints)
  return (
    <>
      <Section title="Study site (after Vista)" help="Find a place, then set the site: the City parcel at an address or coordinate, a boundary you draw, existing buildings you replace, or a GeoJSON file. Vista's site step (Ruijie Liu), on City parcels and footprints in EPSG:26910.">
        {s.message && <p className={`mt-1.5 rounded px-2 py-1 text-[11px] ${s.message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{s.message.text}</p>}
        {error && <p role="alert" className="mt-1 text-[11px] text-red-700">Parcel layer did not load: {error}</p>}
      </Section>
      <AddressSearch onPlace={siteAt} />
      <Coordinates onPlace={siteAt} />
      <Boundary site={site} analysis={{ match, area, layer }} />
      {site && <Parcels site={site} layer={layer} match={match} stale={staleChoices} />}
      {site && area && (
        <Section title="Site area for FSR">
          <div className="text-[11px]"><b>{fmt(area.area)} m²</b> from the {area.basis === 'parcels' ? 'joined City parcels' : 'site boundary'} · FSR <b>{fmt(fsr.total / area.area, 2)}</b> ({fmt(fsr.total)} m² gross floor area, all towers)</div>
          <div className="mt-1 flex items-start gap-1.5"><FlagChip flag={area.flag} /><span className="text-[11px] text-muted">{area.source}</span></div>
          {area.parcelArea !== null && (
            <div className="mt-1.5 flex gap-3 text-[11px]">
              {(['parcels', 'boundary'] as const).map((b) => (
                <label key={b} className="flex items-center gap-1"><input type="radio" name="area-basis" checked={site.areaBasis === b} onChange={() => useSiteStore.getState().setSite({ ...site, areaBasis: b })} />
                  {b === 'parcels' ? `Parcels ${fmt(area.parcelArea)} m²` : `Boundary ${fmt(area.boundaryArea)} m²`}</label>
              ))}
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted">The Design tab's FSR line still divides by the competition site until this site joins the project file (Needed: shared edit).</p>
        </Section>
      )}
    </>
  )
}

// ---------------------------------------------------------------- address and neighbourhood search (online only)
type Item = { label: string; note: string; place?: Place; street?: string; approximate?: boolean }
/** Address and neighbourhood search; `bare` drops the section frame (the Site step's palette has its own heading). */
export function AddressSearch({ onPlace, bare = false }: { onPlace: (p: Pt, label: string, source: string) => void; bare?: boolean }) {
  const listId = `site-address-list-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [consent, setC] = useState(hasConsent())
  const [online, setOnline] = useState(isOnline())
  const [q, setQ] = useState('')
  const [records, setRecords] = useState<CityRecord[] | null>(null)
  const [areas, setAreas] = useState<LocalArea[] | null>(null)
  const [remote, setRemote] = useState<{ state: string; places: Place[]; reason?: string }>({ state: 'idle', places: [] })
  const [chosen, setChosen] = useState<Place | null>(null)
  const [open, setOpen] = useState(false)
  const lookup = useRef(createLookup())
  const site = useSiteStore((s) => s.site)
  useEffect(() => {
    const on = () => setOnline(isOnline())
    window.addEventListener('online', on); window.addEventListener('offline', on)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); lookup.current.cancel() }
  }, [])
  useEffect(() => {
    if (!consent || !online) return
    loadCityRecords().then(setRecords, () => setRecords([]))
    loadLocalAreas().then(setAreas, () => setAreas([]))
  }, [consent, online])
  const localItems = useMemo(() => {
    const items: Item[] = []
    if (records && q.trim()) {
      const r = suggest(records, q)
      if (r.kind === 'streets') r.items.forEach((x) => items.push({ label: x.label, note: r.approximate ? 'Similar street · add a number' : 'Street · add a number', street: x.street, approximate: r.approximate }))
      if (r.kind === 'match' || r.kind === 'guess') r.items.forEach((x) => items.push({ label: addressLabel(x), note: r.kind === 'guess' ? 'Similar City address (check it)' : 'City civic address point', place: cityPlace(x, r.kind === 'guess') }))
    }
    if (areas) matchAreas(areas, q).forEach((a) => items.push({ label: a.name, note: 'City local area', place: { label: a.name, utm: toCity(a.lon, a.lat, 'EPSG:4326'), lon: a.lon, lat: a.lat, kind: 'neighbourhood', source: 'local-area' } }))
    return items
  }, [records, areas, q])
  const merged = useMemo(() => {
    const seen = new Set(localItems.map((i) => i.label.toLowerCase()))
    const extra = remote.places.filter((p) => !seen.has(p.label.replace(/, Vancouver, BC$/i, '').toLowerCase())).map((p): Item => ({ label: p.label, note: p.kind === 'area' ? 'Street or intersection (BC Address Geocoder)' : 'Parcel reference point (BC Address Geocoder)', place: p }))
    return [...localItems, ...extra].slice(0, 10)
  }, [localItems, remote])
  const onType = (v: string) => {
    setQ(v); setOpen(true); setChosen(null)
    if (!consent) return
    lookup.current.search(v, (st) => setRemote(st.state === 'ready' ? { state: 'ready', places: st.places } : st.state === 'error' ? { state: 'error', places: [], reason: st.reason } : { state: st.state, places: [] }))
  }
  const choose = (i: (typeof merged)[number]) => {
    setOpen(false)
    if (i.street) { setQ(`${titleStreet(i.street)} `); say(`Add a street number before ${titleStreet(i.street)}, or keep typing.`); return }
    if (!i.place) return
    const p = local_(i.place)
    setQ(i.label); setChosen(i.place)
    useSiteStore.getState().set({ marker: { at: p, label: i.label, kind: i.place.kind === 'address' ? 'address' : i.place.kind === 'neighbourhood' ? 'neighbourhood' : 'street', source: i.place.source }, message: null })
    // An address: about one block around it; a street or a neighbourhood: wider.
    zoomTo(p, i.place.kind === 'address' ? 90 : i.place.kind === 'neighbourhood' ? 700 : 250)
    say(i.place.kind === 'address' ? `${i.label} is marked on the plan. Your site has not moved: choose "Place site here" to use the City parcel there.` : `${i.label} is marked on the plan (a ${i.place.kind === 'neighbourhood' ? 'local area' : 'street'} reference, not an address).`)
  }
  const body = (
    <>
      {!consent ? (
        // The consent point stays readable in the fold's title (Ruijie, 6 Nov: long texts behind a summary title); the
        // services, what is sent, the licences and the offline note are one click away.
        <div className="rounded-md border border-line bg-black/[0.02] p-2 text-[11px]" data-testid="search-consent">
          <Fold summary={<span className="text-ink">Online search: <b>what you type is sent to the BC Address Geocoder</b>.</span>}>
            <p>The Province of British Columbia's BC Address Geocoder gives the live suggestions. City of Vancouver civic address points and local areas are downloaded once from the <b>City open-data portal</b> (no typed text). Nothing else leaves this browser. It works only online; drawing, picking and coordinates work offline.</p>
            <p>Geocoder <a className="underline" href={PRIVACY.geocoderPrivacy} target="_blank" rel="noreferrer">privacy statement</a> and <a className="underline" href={PRIVACY.geocoderLicence} target="_blank" rel="noreferrer">licence</a> · City data under the <a className="underline" href={PRIVACY.cityLicence} target="_blank" rel="noreferrer">Open Government Licence - Vancouver</a>.</p>
          </Fold>
          <button type="button" className={`${btn} mt-1.5 border-accent bg-accent text-white`} onClick={() => { setConsent(true); setC(true) }}><Search size={12} />Search online</button>
        </div>
      ) : !online ? (
        <p className="flex items-center gap-1 text-[11px] text-amber-900"><WifiOff size={12} />You are offline. Address search needs the network; type coordinates, draw the site or pick buildings instead.</p>
      ) : (
        <div className="relative">
          <input type="search" value={q} onChange={(e) => onType(e.target.value)} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' && merged[0]) choose(merged[0]); if (e.key === 'Escape') setOpen(false) }}
            placeholder="e.g. 1128 W Georgia, or West End" role="combobox" aria-expanded={open && merged.length > 0} aria-controls={listId} aria-autocomplete="list" aria-label="Address or neighbourhood"
            className="w-full rounded border border-line bg-panel px-2 py-1 text-xs" />
          {open && merged.length > 0 && (
            <ul id={listId} role="listbox" className="absolute z-20 mt-0.5 max-h-60 w-full overflow-y-auto rounded-md border border-line bg-white text-[11px] shadow-lg">
              {merged.map((i, k) => (
                <li key={`${i.label}-${k}`} role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} className="cursor-pointer px-2 py-1 hover:bg-accent/10">
                  <span className="text-ink">{i.label}</span> <span className="text-[11px] text-muted">· {i.note}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-muted" role="status">{records === null ? 'Loading City addresses…' : remote.state === 'loading' ? 'Asking the BC Address Geocoder…' : remote.state === 'error' ? (remote.reason === 'offline' ? 'Offline: City list only.' : `Geocoder did not answer (${remote.reason}); City list only.`) : `${records.length.toLocaleString('en-CA')} City addresses in the downtown box${areas ? `, ${areas.length} local areas` : ''}.`}</p>
          {chosen && chosen.kind === 'address' && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button type="button" className={`${btn} border-line hover:border-accent`} onClick={() => zoomTo(local_(chosen))}><MapPin size={12} />Zoom to address</button>
              <button type="button" className={`${btn} border-accent bg-accent text-white`} onClick={() => onPlace(local_(chosen), chosen.label, chosen.source === 'city' ? 'City civic address point' : 'BC Address Geocoder parcel point')}><Crosshair size={12} />Place site here</button>
              <MoveTowerButton at={local_(chosen)} />
            </div>
          )}
          {chosen?.approximate && <p className="mt-1 text-[11px] text-amber-900">A similar address, not the one typed: check it before using it.</p>}
        </div>
      )}
      <PendingConfirm onPlace={onPlace} />
    </>
  )
  return bare ? <div>{body}</div> : <Section title="Find an address or neighbourhood">{body}</Section>
}
const local_ = (p: Place) => local(p.utm)

function MoveTowerButton({ at }: { at: Pt }) {
  const sel = useStore((s) => s.selectedTower)
  const towers = useTowers()
  const t = towers.find((k) => k.id === sel)
  if (!t) return null
  return <button type="button" className={`${btn} border-line hover:border-accent`} onClick={() => { useStore.getState().updateTower(t.id, { x: at[0], y: at[1] }); say(`${t.name} moved to the marked point. The base follows the terrain there when the ground is set to the terrain.`) }}>Move {t.name} here</button>
}

/** Vista asks before a typed or found point replaces the site; Cancel keeps the existing one. */
function PendingConfirm({ onPlace }: { onPlace: (p: Pt, label: string, source: string) => void }) {
  const pending = useSiteStore((s) => s.pending)
  if (!pending) return null
  return (
    <div role="dialog" aria-label="Replace the study site" className="mt-2 rounded-md border border-accent bg-accent/5 p-2 text-[11px]">
      <p>Use the City parcel at <b>{pending.label}</b> as the study site? This replaces your current site.</p>
      <div className="mt-1.5 flex gap-1.5">
        <button type="button" className={`${btn} border-accent bg-accent text-white`} onClick={() => onPlace(pending.at, pending.label, pending.source)}>Use as study site</button>
        <button type="button" className={`${btn} border-line`} onClick={() => useSiteStore.getState().set({ pending: null, message: { text: 'Cancelled: the site is unchanged.', kind: 'info' } })}>Cancel</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- typed coordinates (Vista georeference-ui.js)
function Coordinates({ onPlace }: { onPlace: (p: Pt, label: string, source: string) => void }) {
  const [crs, setCrs] = useState<InputCrs>('EPSG:4326')
  const [x, setX] = useState(''), [y, setY] = useState('')
  const [paste, setPaste] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const site = useSiteStore((s) => s.site)
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const def = INPUT_CRS.find((c) => c.id === crs)!
  const read = (): Pt => {
    if (!x.trim() || !y.trim()) throw new Error('Enter both coordinates.')
    return local(toCity(Number(x), Number(y), crs))
  }
  const current = (): [Pt, string] => {
    if (site && !validateRing(site.ring)) return [ringMetrics(site.ring).centre, 'Study site centroid']
    const t = towers.find((k) => k.id === sel) ?? towers[0]
    return [[t.x, t.y], `${t.name} centre`]
  }
  const fill = (c: InputCrs = crs) => { const [p, role] = current(); const q = fromCity([p[0] + CITY_ORIGIN[0], p[1] + CITY_ORIGIN[1]], c); const d = INPUT_CRS.find((k) => k.id === c)!.digits; setX(q[0].toFixed(d)); setY(q[1].toFixed(d)); setNote(`${role}.`) }
  const [cp, role] = current()
  const ll = fromCity([cp[0] + CITY_ORIGIN[0], cp[1] + CITY_ORIGIN[1]], 'EPSG:4326')
  return (
    <Section title="Geographic location">
      <div className="text-[11px]"><b>{role}</b>: {ll[1].toFixed(6)}° N, {(-ll[0]).toFixed(6)}° W · UTM 10N {fmt(cp[0] + CITY_ORIGIN[0], 2)} E, {fmt(cp[1] + CITY_ORIGIN[1], 2)} N</div>
      <form className="mt-1.5 grid gap-1.5" onSubmit={(e) => { e.preventDefault(); try { const p = read(); useSiteStore.getState().set({ marker: { at: p, label: 'Coordinate location', kind: 'coordinate', source: crs } }); zoomTo(p); setNote('Located on the plan. Your study site has not moved.') } catch (err) { setNote((err as Error).message) } }}>
        <label className="grid gap-0.5 text-[11px]"><span className="text-muted">Input coordinates</span>
          <select value={crs} onChange={(e) => { const c = e.target.value as InputCrs; try { if (x && y) { const p = toCity(Number(x), Number(y), crs), q = fromCity(p, c), d = INPUT_CRS.find((k) => k.id === c)!.digits; setX(q[0].toFixed(d)); setY(q[1].toFixed(d)) } } catch { /* leave the fields */ } setCrs(c) }} className="rounded border border-line bg-panel px-1.5 py-1 text-xs">
            {INPUT_CRS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="grid gap-0.5 text-[11px]"><span className="text-muted">{def.x}</span><input type="number" step="any" value={x} onChange={(e) => setX(e.target.value)} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label={def.x} /></label>
          <label className="grid gap-0.5 text-[11px]"><span className="text-muted">{def.y}</span><input type="number" step="any" value={y} onChange={(e) => setY(e.target.value)} className="rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label={def.y} /></label>
        </div>
        <input type="text" value={paste} placeholder='Paste "49.2857° N, 123.1236° W" or "E 491636 N 5458756"' onChange={(e) => { setPaste(e.target.value); const r = parsePasted(e.target.value); if (r) { setCrs(r.crs); setX(String(r.x)); setY(String(r.y)); setNote(r.note) } }} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]" aria-label="Paste coordinates" />
        <div className="flex flex-wrap gap-1.5">
          <button type="submit" className={`${btn} border-line hover:border-accent`}><MapPin size={12} />Show on model</button>
          <button type="button" className={`${btn} border-line hover:border-accent`} onClick={() => { try { const p = read(); if (site) useSiteStore.getState().set({ pending: { at: p, label: `${x}, ${y} (${crs})`, source: `typed ${crs} coordinates` } }); else onPlace(p, `${x}, ${y} (${crs})`, `typed ${crs} coordinates`) } catch (err) { setNote((err as Error).message) } }}><Crosshair size={12} />Use as study site</button>
          <button type="button" className={`${btn} border-line hover:border-accent`} onClick={() => fill()}>Use current position</button>
        </div>
      </form>
      {note && <p role="status" className="mt-1 text-[11px] text-ink">{note}</p>}
      <div className="mt-1 flex items-start gap-1.5"><FlagChip flag={crs === 'EPSG:26910' ? 'verified' : 'unverified'} /><span className="text-[11px] text-muted">{crs === 'EPSG:26910' ? 'UTM 10N is the City data\'s own frame here.' : 'Longitude/latitude is taken as NAD83(CSRS); WGS84 differs by about 1–2 m in Vancouver.'} Plan position only: no vertical datum is implied.</span></div>
    </Section>
  )
}

// ---------------------------------------------------------------- the boundary: draw, pick buildings, GeoJSON
function Boundary({ site, analysis }: { site: StudySite | null; analysis: Pick<ReturnType<typeof useSiteAnalysis>, 'match' | 'area' | 'layer'> }) {
  const s = useSiteStore()
  const { data } = useCityData()
  const fileRef = useRef<HTMLInputElement>(null)
  const replacedIdx = useMemo(() => (site && data ? idsToIndices(data.footprints, site.replaced) : []), [site, data])
  /** Existing buildings mostly inside the site (at least half of their footprint): candidates to replace. */
  const inside = useMemo(() => {
    if (!site || !data || validateRing(site.ring)) return []
    const m = ringMetrics(site.ring), [x0, y0, x1, y1] = m.bounds, out: number[] = []
    data.footprints.forEach((f, i) => {
      const o = f.outer as Pt[]
      if (!o.length || o.every(([x]) => x < x0) || o.every(([x]) => x > x1) || o.every(([, y]) => y < y0) || o.every(([, y]) => y > y1)) return
      const a = polyArea([o]), ov = overlapArea(site.ring, [o])
      if (a > 0 && ov / a >= 0.5) out.push(i)
    })
    return out
  }, [site, data])
  const usePicked = () => {
    if (!data || !s.picked.length) return
    const r = siteFromFootprints(s.picked.map((i) => data.footprints[i]))
    if (!r) { say('Those buildings have no usable outline.', 'error'); return }
    const ids = [...new Set(s.picked.map((i) => data.footprints[i].id))]
    s.setSite(newSite(r.ring, 'buildings', `${s.picked.length} existing building${s.picked.length === 1 ? '' : 's'} replaced as the site: ${r.note}`, { replaced: ids }))
    s.set({ tool: null, picked: [], message: { text: `Site taken from ${s.picked.length} building${s.picked.length === 1 ? '' : 's'}; they show as demolished unless you keep them.`, kind: 'info' } })
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      if (f.size > 2_000_000) throw new Error('The file is larger than a site boundary (2 MB).')
      const r = siteFromGeoJson(JSON.parse(await f.text()), CITY_ORIGIN)
      s.setSite(newSite(r.ring, 'geojson', `GeoJSON ${f.name.slice(0, 60)}${r.name ? ` (${r.name.slice(0, 40)})` : ''}, ${r.crs} → EPSG:26910`, { label: r.name }))
      s.set({ tool: null, message: { text: [`Boundary imported: ${fmt(ringMetrics(r.ring).area)} m². ${r.provenance.operation} ${r.provenance.accuracy}`, ...r.notes].join(' '), kind: 'info' } })
      zoomTo(ringMetrics(r.ring).centre)
    } catch (err) { say(`Could not import the boundary: ${(err as Error).message}`, 'error') }
    if (fileRef.current) fileRef.current.value = ''
  }
  const exportSite = () => {
    if (!site) return
    const { match, area, layer } = analysis
    const g = siteToGeoJson({ ring: site.ring, name: site.label ?? 'Study site', source: site.source, sourceNote: site.note, area: ringMetrics(site.ring).area, parcelArea: area?.parcelArea ?? null,
      parcels: match && layer ? match.included.map((i) => parcelLabel(layer, i)) : [], origin: CITY_ORIGIN })
    saveFile('study-site.geojson', JSON.stringify(g, null, 1))
  }
  const m = site && !validateRing(site.ring) ? ringMetrics(site.ring) : null
  return (
    <Section title="Site boundary">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={s.tool === 'draw'} className={`${btn} ${s.tool === 'draw' ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`} onClick={() => s.set({ tool: s.tool === 'draw' ? null : 'draw', draft: [], picked: [], message: s.tool === 'draw' ? null : { text: 'Click the corners on the plan. Click the first corner, double-click or press Enter to close; Backspace removes the last; Esc cancels.', kind: 'info' } })}><PencilLine size={12} />{s.tool === 'draw' ? `Drawing (${s.draft.length})…` : 'Draw on the plan'}</button>
        <button type="button" aria-pressed={s.tool === 'pick'} className={`${btn} ${s.tool === 'pick' ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`} onClick={() => s.set({ tool: s.tool === 'pick' ? null : 'pick', draft: [], picked: [], message: s.tool === 'pick' ? null : { text: 'Click one or more existing buildings to replace; then "Use as site".', kind: 'info' } })}><MousePointerClick size={12} />{s.tool === 'pick' ? `Picking (${s.picked.length})…` : 'Pick buildings to replace'}</button>
        <button type="button" className={`${btn} border-line hover:border-accent`} onClick={() => fileRef.current?.click()}><FileUp size={12} />Import GeoJSON</button>
        <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Site boundary GeoJSON file" />
        {site && <button type="button" className={`${btn} border-line hover:border-accent`} onClick={exportSite}><Download size={12} />Export GeoJSON</button>}
        {site && <button type="button" className={`${btn} border-line text-muted hover:text-red-700`} onClick={() => { s.setSite(null); s.set({ message: { text: 'Study site cleared.', kind: 'info' } }) }}><Trash2 size={12} />Clear</button>}
      </div>
      {s.tool === 'pick' && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          <span>{s.picked.length} picked</span>
          <button type="button" disabled={!s.picked.length} className={`${btn} border-accent bg-accent text-white disabled:opacity-50`} onClick={usePicked}>Use as site</button>
        </div>
      )}
      {s.tool === 'draw' && s.draft.length >= 3 && <button type="button" className={`${btn} mt-1.5 border-accent bg-accent text-white`} onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))}>Close the boundary</button>}
      {site && m && (
        <div className="mt-2 rounded-md bg-black/[0.03] p-2 text-[11px]">
          <div><b>{fmt(m.area)} m²</b> · perimeter {fmt(m.perimeter, 1)} m · {site.ring.length} corners</div>
          <div className="text-muted">{site.note}</div>
          {site.label && <div className="text-muted">Placed from {site.label}</div>}
          {(replacedIdx.length > 0 || site.replaced.length > 0) && (
            <label className="mt-1 flex items-center gap-1.5"><input type="checkbox" checked={site.keepReplaced} onChange={(e) => s.setSite({ ...site, keepReplaced: e.target.checked })} />
              Keep the {site.replaced.length} replaced building{site.replaced.length === 1 ? '' : 's'} (otherwise shown as demolished)</label>
          )}
          {site.source !== 'buildings' && inside.length > 0 && site.replaced.length === 0 && (
            <button type="button" className="mt-1 text-[11px] text-accent underline" onClick={() => data && s.setSite({ ...site, replaced: [...new Set(inside.map((i) => data.footprints[i].id))], keepReplaced: false })}>Replace the {inside.length} existing building{inside.length === 1 ? '' : 's'} on the site</button>
          )}
          {site.replaced.length > 0 && <div className="mt-1 flex items-start gap-1.5"><FlagChip flag="team_assumption" /><span className="text-[11px] text-muted">Hypothetical removal; not evidence of vacancy or redevelopment eligibility. Demolished outlines are drawn in red.</span></div>}
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------- parcels under the site (Vista import-parcels.js)
function Parcels({ site, layer, match, stale }: { site: StudySite; layer: ParcelLayer | null; match: ReturnType<typeof useSiteAnalysis>['match']; stale: boolean }) {
  if (!layer) return <Section title="Parcels under the site"><p className="text-[11px] text-muted">Loading the City parcel layer…</p></Section>
  if (!match) return <Section title="Parcels under the site"><p className="text-[11px] text-muted">The boundary is not a simple polygon, so no parcels can be matched.</p></Section>
  const toggle = (i: number, kind: string) => {
    const add = new Set(site.parcelsAdd), skip = new Set(site.parcelsSkip)
    if (kind === 'inside') { if (skip.has(i)) skip.delete(i); else skip.add(i) } else { if (add.has(i)) add.delete(i); else add.add(i) }
    useSiteStore.getState().setSite({ ...site, parcelsAdd: [...add], parcelsSkip: [...skip], parcelLayer: layer.sha })
  }
  const shown = match.hits.filter((h) => h.kind !== 'touching')
  const touching = match.hits.length - shown.length
  return (
    <Section title="Parcels under the site">
      {stale && <p className="mb-1 text-[11px] text-amber-900">Your parcel choices were made on another version of the parcel layer and are not applied.</p>}
      <div className="grid gap-1">
        {shown.map((h) => (
          <label key={h.index} className="flex items-center gap-1.5 text-[11px]">
            <input type="checkbox" checked={match.included.includes(h.index)} onChange={() => toggle(h.index, h.kind)} />
            <span className="min-w-0 flex-1 truncate">{parcelLabel(layer, h.index)}</span>
            <span className="tabular-nums text-muted">{fmt(h.area)} m² · {Math.round(h.share * 100)}% in</span>
            <span className={`rounded px-1 text-[11px] ${h.kind === 'inside' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{h.kind}</span>
          </label>
        ))}
        {!shown.length && <p className="text-[11px] text-muted">No parcel lies mostly in the site.</p>}
      </div>
      {touching > 0 && <p className="mt-1 text-[11px] text-muted">{touching} neighbouring parcel{touching === 1 ? '' : 's'} only touch the boundary (under 5%) and are left out.</p>}
      <p className={`mt-1.5 text-[11px] ${match.join.status === 'review' ? 'text-amber-900' : ''}`}>{match.join.reason}{match.join.status === 'joined' ? ` ${fmt(match.join.area)} m².` : ''}</p>
      <div className="mt-1 flex items-start gap-1.5"><FlagChip flag="unverified" /><span className="text-[11px] text-muted">City Property parcel polygons (OGL-Vancouver, 2026-10-27 snapshot), a dated approximate cadastral layer, not a survey. "Inside" ≥ 95% in the site, "partial" ≥ 5% (team presets); joined only along exactly shared lot lines, never snapped (Vista).</span></div>
    </Section>
  )
}
