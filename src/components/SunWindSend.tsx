// "Send to Sun & Wind Studio" in the Export menu (Ruijie, 6 Nov 2026: "link the toolkit to sun & wind studio"): the
// selected tower goes to Sinnie Choi's Sun & Wind Studio in one click, by window-to-window message (nothing uploaded).
// The Toolkit opens Sun & Wind Studio as ?from=toolkit; its receiver (toolkit.js, branch ruijie/tower-toolkit-link)
// answers {type: 'sw-ready'}; the Toolkit posts {type: 'tdt-model', payload} to that origin only, and the receiver
// answers {type: 'sw-imported', ok, summary}. A second click re-sends to the window already open. Until Sinnie merges the
// branch her live page has no receiver, so after 15 s the menu says so and the JSON downloads (which her page already
// imports) are the way over. Payload: lib/interchange/sunWind.ts.
import { useEffect } from 'react'
import { create } from 'zustand'
import { Download, ExternalLink, Loader2, Sun } from './icons'
import Help from './Help'
import { VTC_NORTH_DEG } from '../context'
import { utm10ToLatLon } from '../engine/vista'
import { useImportStore } from '../lib/import/store'
import { useSiteGeometry } from '../lib/siteGeometry'
import { nearbyBuildings, sunWindFile, sunWindPayload, sunWindSiteFile, SW_BRANCH, SW_CONTEXT_RADIUS, SW_PROTOCOL, SW_URL, type ContextBuilding, type SwPayload } from '../lib/interchange/sunWind'
import { buildingSource } from '../lib/vistaBuildings'
import { CITY_ORIGIN, useStore } from '../store'
import { useCityObstacles } from './CityContext'

const URL_KEY = 'tdt.sunwind.url'
const WINDOW_NAME = 'tdt-sun-wind-studio'
const WAIT_MS = 15000

type Status = 'idle' | 'opening' | 'sending' | 'sent' | 'noanswer' | 'error'
interface SunWindState { status: Status; message: string; address: string }
const savedAddress = () => { try { return localStorage.getItem(URL_KEY) || SW_URL } catch { return SW_URL } }
export const useSunWind = create<SunWindState>(() => ({ status: 'idle', message: '', address: savedAddress() }))
const say = (status: Status, message: string) => useSunWind.setState({ status, message })

/** The Real Vancouver buildings, fed by CityFeed while the menu is open in Real Vancouver. */
let cityFeed: ((centre: [number, number]) => ContextBuilding[]) | null = null

/** Sun & Wind Studio's address with ?from=toolkit, or null when it is not an http(s) address. */
export function studioUrl(address: string): URL | null {
  try {
    const u = new URL(address.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    u.search = ''; u.hash = ''
    u.searchParams.set('from', 'toolkit')
    return u
  } catch { return null }
}

let rev = 0
function payload(): SwPayload | null {
  const s = useStore.getState()
  const towers = s.towers[s.project]
  const t = towers.find((k) => k.id === s.selectedTower) ?? towers[0]
  if (!t) return null
  const meshes = useImportStore.getState().meshes
  const city = s.project === 'city'
  const [lat, lon] = city ? utm10ToLatLon([CITY_ORIGIN[0] + t.x, CITY_ORIGIN[1] + t.y]) : [49.2827, -123.1207]
  return sunWindPayload(towers, {
    project: s.project, selectedId: t.id, northDeg: city ? 0 : VTC_NORTH_DEG, groundElevation: city ? s.groundElevation : 0,
    meshOf: (id) => meshes[id], rev: ++rev,
    ...(city ? { context: cityFeed ? cityFeed([t.x, t.y]) : [], siteRing: useSiteGeometry.getState().site.city?.ring ?? null, latLon: [lat, lon] as [number, number] } : {}),
  })
}

// ---------- the link ----------
const link = { win: null as Window | null, origin: '', ready: false, timer: undefined as ReturnType<typeof setTimeout> | undefined, waiting: false, listening: false }

function post() {
  const p = payload()
  if (!p || !link.win) { say('error', 'Nothing to send: add a tower first.'); return }
  link.waiting = false
  say('sending', `Sending ${p.tower.name} (${p.tower.storeys} storeys${p.site ? `, ${p.site.meshes.length} buildings around it` : ''})…`)
  link.win.postMessage({ type: 'tdt-model', protocol: SW_PROTOCOL, payload: p }, link.origin)
  clearTimeout(link.timer)
  link.timer = setTimeout(() => say('error', 'Sun & Wind Studio took the model but did not confirm the import. Check its Model tab.'), 30000)
}

function onMessage(e: MessageEvent) {
  if (!link.win || e.source !== link.win || e.origin !== link.origin) return
  const d = e.data as { type?: unknown; protocol?: unknown; ok?: unknown; summary?: unknown } | null
  if (!d || typeof d !== 'object') return
  if (d.type === 'sw-ready' && d.protocol === SW_PROTOCOL) {
    link.ready = true
    if (link.waiting) post()
  } else if (d.type === 'sw-imported') {
    clearTimeout(link.timer)
    say(d.ok === true ? 'sent' : 'error', String(d.summary ?? '').slice(0, 800) || (d.ok === true ? 'Imported in Sun & Wind Studio.' : 'Sun & Wind Studio could not import the model.'))
  }
}

export function sendToSunWind() {
  if (!link.listening) { window.addEventListener('message', onMessage); link.listening = true }
  const url = studioUrl(useSunWind.getState().address)
  if (!url) { say('error', 'The Sun & Wind Studio address is not a web address.'); return }
  // The window is already open and answered: send again (a design change), no reload.
  if (link.win && !link.win.closed && link.ready && link.origin === url.origin) { link.win.focus(); post(); return }
  const win = window.open(url.toString(), WINDOW_NAME)
  if (!win) { say('error', 'The browser blocked the new window. Allow pop-ups for this site, or use the download below.'); return }
  link.win = win; link.origin = url.origin; link.ready = false; link.waiting = true
  say('opening', 'Opening Sun & Wind Studio…')
  clearTimeout(link.timer)
  link.timer = setTimeout(() => {
    if (!link.waiting) return
    link.waiting = false
    say('noanswer', `Sun & Wind Studio did not answer. The one-click receiver is on the branch ${SW_BRANCH} until Sinnie merges it into her live page. Until then, download the model below and choose it in Sun & Wind Studio's Model tab.`)
  }, WAIT_MS)
}

function download(text: string, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export function downloadForSunWind(which: 'model' | 'site') {
  const p = payload()
  if (!p) { say('error', 'Nothing to send: add a tower first.'); return }
  const base = `sun-wind-${p.project}-${p.tower.name.replace(/[^\w-]+/g, '-').toLowerCase()}`
  if (which === 'model') { download(sunWindFile(p), `${base}.json`); say('idle', `Saved ${base}.json: in Sun & Wind Studio, Model tab › Choose a file.`); return }
  const site = sunWindSiteFile(p)
  if (site) { download(site, `${base}-site.json`); say('idle', `Saved ${base}-site.json (${p.site!.meshes.length} buildings): in Sun & Wind Studio, Site tab › choose the file, then the model.`) }
}

/** Keeps cityFeed current with the Real Vancouver buildings (without those removed under the design). */
function CityFeed() {
  const { data, hidden } = useCityObstacles()
  useEffect(() => {
    if (!data?.heights) { cityFeed = null; return }
    const clearance = data.vista?.clearance ?? null
    cityFeed = (centre) => nearbyBuildings(data.footprints, data.heights, centre, SW_CONTEXT_RADIUS, { hidden, clearance, placeholders: data.placeholders, source: (i) => buildingSource(data, i) })
    return () => { cityFeed = null }
  }, [data, hidden])
  return null
}

/** The Export menu section. */
export default function SunWindSend({ item }: { item: string }) {
  const { status, message, address } = useSunWind()
  const project = useStore((s) => s.project)
  const busy = status === 'opening' || status === 'sending'
  const setAddress = (v: string) => { useSunWind.setState({ address: v }); try { if (v.trim() && v.trim() !== SW_URL) localStorage.setItem(URL_KEY, v.trim()); else localStorage.removeItem(URL_KEY) } catch { /* private window */ } }
  return (
    <div className="border-t border-line pt-1" data-testid="sunwind">
      {project === 'city' && <CityFeed />}
      <div className="relative">
        <button role="menuitem" type="button" disabled={busy} onClick={sendToSunWind} className={`${item} pr-7`} data-testid="sunwind-send">
          {busy ? <Loader2 size={13} className="mt-0.5 animate-spin" /> : <Sun size={13} className="mt-0.5" />}
          <span><b>Send to Sun &amp; Wind Studio</b><br /><span className="text-meta text-muted">Sinnie Choi's sun, shadow, wind, daylight and energy studies; opens in a new window{project === 'city' ? `, with the buildings within ${SW_CONTEXT_RADIUS} m` : ', on its competition block'}</span></span>
        </button>
        <span className="absolute right-1.5 top-1.5"><Help label="How the Sun & Wind Studio link works">
          <p>The selected tower goes over as one solid per storey with its program (Toolkit uses mapped to Sun &amp; Wind Studio's list, a team assumption); the other design towers go as context.{project === 'city' ? ` In Real Vancouver the buildings within ${SW_CONTEXT_RADIUS} m (heights by source, seated on flat ground) replace its competition site.` : ' Both tools share the competition block frame, so the tower lands where it is here.'}</p>
          <p className="mt-1">The model passes from this window to Sun &amp; Wind Studio's window in this browser; nothing is uploaded. Press again after a design change to update it.</p>
          <p className="mt-1">One click needs the receiver on Sinnie's branch {SW_BRANCH} (not yet on her live page). The downloads work with her live page today.</p>
        </Help></span>
      </div>
      {message && <p role="status" aria-live="polite" data-testid="sunwind-status" className={`px-2 pb-1 text-meta ${status === 'error' || status === 'noanswer' ? 'text-flag-false' : status === 'sent' ? 'text-ink' : 'text-muted'}`}>{message}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 pb-1 text-meta">
        <button type="button" onClick={() => downloadForSunWind('model')} className="inline-flex items-center gap-1 text-accent hover:underline" data-testid="sunwind-download"><Download size={11} />Model for Sun &amp; Wind Studio (.json)</button>
        {project === 'city' && <button type="button" onClick={() => downloadForSunWind('site')} className="inline-flex items-center gap-1 text-accent hover:underline"><Download size={11} />Surroundings as its site (.json)</button>}
        <a href={SW_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink size={11} />Open it</a>
      </div>
      <details className="px-2 pb-1 text-meta text-muted">
        <summary className="cursor-pointer">Address</summary>
        <label className="mt-1 grid gap-0.5"><span>Sun &amp; Wind Studio page (a local copy of the branch for testing)</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} className="rounded border border-line bg-white px-1 py-0.5 font-mono text-meta text-ink" aria-label="Sun & Wind Studio address" />
        </label>
        {address.trim() !== SW_URL && <button type="button" onClick={() => setAddress(SW_URL)} className="mt-0.5 text-accent hover:underline">Back to Sinnie's live page</button>}
      </details>
    </div>
  )
}
