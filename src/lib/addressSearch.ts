// Address and neighbourhood search for Real Vancouver (after Vista v34 address-search.js, Ruijie Liu). Online only:
// City civic address points and local areas come from the City of Vancouver open-data portal (one export per session,
// no typed text in it), and typed text goes to the BC Address Geocoder for live suggestions. Typo-tolerant matching
// runs here, on City records, and every suggestion is an actual City record or geocoder result; approximate ones are
// labelled as suggestions. An address point is a reference for finding a site, never a parcel boundary.
// Pure helpers first (tested), then the network layer (consent, offline, timeouts, stale-response guards).
import { toUtm10 } from '../engine/relaxAviation'

/** Search area: the Real Vancouver footprint box joined with Vista's downtown box (lon/lat, degrees). */
export const SEARCH_BOX = { west: -123.15, south: 49.262, east: -123.085, north: 49.301 }
export const GEOCODER = 'https://geocoder.api.gov.bc.ca/addresses.geojson'
export const CITY_ADDRESSES = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/property-addresses/exports/json'
export const CITY_AREAS = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/local-area-boundary/exports/json'
export const PRIVACY = {
  geocoderPrivacy: 'https://www2.gov.bc.ca/gov/content?id=9E890E16955E4FF4BF3B0E07B4722932',
  geocoderLicence: 'https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61',
  cityLicence: 'https://opendata.vancouver.ca/pages/licence/',
}
const CIVIC = new Set(['CIVIC_NUMBER', 'UNIT', 'SITE', 'OCCUPANT'])

export const withinBox = (lon: number, lat: number) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= SEARCH_BOX.west && lon <= SEARCH_BOX.east && lat >= SEARCH_BOX.south && lat <= SEARCH_BOX.north

/** BC Address Geocoder request (Vista searchUrl; area box widened to this model). */
export function geocoderUrl(raw: string, autoComplete = false): string {
  const address = String(raw || '').trim()
  const url = new URL(GEOCODER)
  url.searchParams.set('addressString', autoComplete || /\bvancouver\b/i.test(address) ? address : `${address}, Vancouver, BC`)
  url.searchParams.set('maxResults', '8')
  url.searchParams.set('minScore', autoComplete ? '50' : '80')
  url.searchParams.set('outputSRS', '4326')
  url.searchParams.set('locationDescriptor', 'parcelPoint')
  url.searchParams.set('interpolation', 'none')
  url.searchParams.set('echo', 'false')
  url.searchParams.set('localities', 'Vancouver')
  url.searchParams.set('bbox', `${SEARCH_BOX.west},${SEARCH_BOX.south},${SEARCH_BOX.east},${SEARCH_BOX.north}`)
  if (autoComplete) {
    url.searchParams.set('autoComplete', 'true'); url.searchParams.set('fuzzyMatch', 'true'); url.searchParams.set('exactSpelling', 'false'); url.searchParams.set('brief', 'true')
    url.searchParams.set('matchPrecision', 'CIVIC_NUMBER,UNIT,SITE,OCCUPANT,STREET,INTERSECTION')
  }
  return url.href
}

export interface Place {
  label: string
  /** EPSG:26910 (the City numbers). */
  utm: [number, number]
  lon: number
  lat: number
  kind: 'address' | 'area' | 'neighbourhood'
  source: 'city' | 'geocoder' | 'local-area'
  score?: number
  precision?: string
  descriptor?: string
  accuracy?: string
  approximate?: boolean
}

/** Geocoder FeatureCollection to checked places (Vista candidates): inside the box, in Vancouver, scored, civic or a street/intersection reference. */
export function geocoderPlaces(data: unknown, autoComplete = false): Place[] {
  const d = data as { type?: string; features?: unknown[] } | null
  if (!d || d.type !== 'FeatureCollection' || !Array.isArray(d.features)) return []
  const seen = new Set<string>(), out: Place[] = []
  for (const f of d.features as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown[] } }[]) {
    const p = f?.properties, c = f?.geometry?.coordinates
    if (!p || f?.geometry?.type !== 'Point' || !Array.isArray(c)) continue
    const lon = Number(c[0]), lat = Number(c[1]), score = Number(p.score)
    const label = String(p.fullAddress || '').trim(), precision = String(p.matchPrecision || '').toUpperCase()
    const inVancouver = p.localityName ? String(p.localityName).toLowerCase() === 'vancouver' : /, Vancouver, BC$/i.test(label)
    const civic = CIVIC.has(precision)
    if (!withinBox(lon, lat) || !inVancouver || !Number.isFinite(score) || score < (autoComplete ? 50 : 80) || (!civic && !(autoComplete && (precision === 'STREET' || precision === 'INTERSECTION')))) continue
    if (!label || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    out.push({ label, utm: toUtm10(lat, lon), lon, lat, kind: civic ? 'address' : 'area', source: 'geocoder', score, precision,
      descriptor: String(p.locationDescriptor || ''), accuracy: String(p.locationPositionalAccuracy || '') })
  }
  return out.slice(0, 8)
}

// ---------------------------------------------------------------- typo-tolerant suggestions on City records (Vista)
export interface CityRecord { number: string; street: string; lon: number; lat: number }
/** City data abbreviates ST and AV but spells out ROAD, BOULEVARD, DRIVE, PLACE and CRESCENT (Vista). */
const WORDS: Record<string, string> = { STREET: 'ST', STR: 'ST', AVENUE: 'AV', AVE: 'AV', DR: 'DRIVE', CRES: 'CRESCENT', PL: 'PLACE', BLVD: 'BOULEVARD', RD: 'ROAD', WEST: 'W', EAST: 'E', NORTH: 'N', SOUTH: 'S' }
export const normalizeStreet = (text: string) => String(text || '').toUpperCase().replace(/[.,]/g, ' ').replace(/\bVANCOUVER\b.*$/, '').split(/\s+/).filter(Boolean).map((w) => WORDS[w] || w).join(' ')
export function parseQuery(raw: string): { number: string; street: string } {
  const t = String(raw || '').split(',')[0].trim().replace(/^(\d+)([NSEW])\b/i, '$1 $2').replace(/^(\d+)\s*-\s*(\d+)/, '$2')
  const m = /^(\d+)\s*(.*)$/.exec(t)
  return m ? { number: m[1], street: normalizeStreet(m[2]) } : { number: '', street: normalizeStreet(t) }
}
export const titleStreet = (street: string) => street.split(' ').map((w) => (/^[NSEW]$|^\d+(ST|ND|RD|TH)$/.test(w) ? w.replace(/(ST|ND|RD|TH)$/, (x) => x.toLowerCase()) : w[0] + w.slice(1).toLowerCase())).join(' ')
export const addressLabel = (r: CityRecord) => `${r.number} ${titleStreet(r.street)}`

export function cityRecords(rows: unknown): CityRecord[] {
  const out: CityRecord[] = [], seen = new Set<string>()
  for (const r of Array.isArray(rows) ? rows as { civic_number?: unknown; std_street?: unknown; geo_point_2d?: { lon?: unknown; lat?: unknown } }[] : []) {
    const number = String(r?.civic_number || '').trim(), street = String(r?.std_street || '').trim().toUpperCase()
    const lon = Number(r?.geo_point_2d?.lon), lat = Number(r?.geo_point_2d?.lat)
    if (!/^\d+$/.test(number) || !street || !withinBox(lon, lat)) continue
    const key = `${number} ${street}`
    if (seen.has(key)) continue
    seen.add(key); out.push({ number, street, lon, lat })
  }
  return out
}

/** Damerau (optimal string alignment) distance: insertions, deletions, substitutions and adjacent swaps (Vista). */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => { const row = new Array<number>(n + 1).fill(0); row[0] = i; return row })
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
  }
  return d[m][n]
}
const sharedPrefix = (a: string, b: string) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k }

/** Every query word must match an unused street word by prefix, or within 1 edit (3–5 letters) / 2 edits (6+) of a prefix. */
export function streetMatch(query: string, street: string): { distance: number } | null {
  if (!query) return { distance: 0 }
  const words = street.split(' '), used = new Set<number>()
  let distance = 0
  for (const token of query.split(' ')) {
    let best: { i: number; d: number } | null = null
    words.forEach((word, i) => {
      if (used.has(i)) return
      let d = word.startsWith(token) ? 0 : Infinity
      const allowance = token.length < 3 ? 0 : token.length < 6 ? 1 : 2
      if (allowance && d) for (let n = Math.max(1, token.length - allowance); n <= Math.min(word.length, token.length + allowance); n++) d = Math.min(d, editDistance(token, word.slice(0, n)))
      if (d <= allowance && (!best || d < best.d)) best = { i, d }
    })
    if (!best) return null
    used.add((best as { i: number }).i); distance += (best as { d: number }).d
  }
  return { distance }
}

export type Suggestions =
  | { kind: 'none'; items: [] }
  | { kind: 'streets'; approximate: boolean; items: { street: string; label: string }[] }
  | { kind: 'match' | 'guess'; items: CityRecord[] }

/** Vista suggest(): exact street matches first; with a number, matching civic numbers, else close guesses (labelled). */
export function suggest(records: CityRecord[], raw: string, limit = 8): Suggestions {
  const q = parseQuery(raw)
  if (!records.length || (!q.number && !q.street)) return { kind: 'none', items: [] }
  const streets = [...new Set(records.map((r) => r.street))]
  const scored = streets.map((street) => ({ street, match: streetMatch(q.street, street) })).filter((s): s is { street: string; match: { distance: number } } => !!s.match)
  scored.sort((a, b) => a.match.distance - b.match.distance || a.street.localeCompare(b.street))
  if (!q.number) {
    if (!scored.length) return { kind: 'none', items: [] }
    const exact = scored.filter((s) => s.match.distance === 0), selected = exact.length ? exact : scored.filter((s) => s.match.distance === scored[0].match.distance)
    return { kind: 'streets', approximate: !exact.length, items: selected.slice(0, limit).map((s) => ({ street: s.street, label: titleStreet(s.street) })) }
  }
  const streetScores = new Map(scored.map((s) => [s.street, s.match.distance]))
  const match = records.filter((r) => r.number.startsWith(q.number) && streetScores.get(r.street) === 0)
    .sort((a, b) => (a.number === q.number ? 0 : 1) - (b.number === q.number ? 0 : 1) || a.number.length - b.number.length || +a.number - +b.number || a.street.localeCompare(b.street))
  if (match.length) return { kind: 'match', items: match.slice(0, limit) }
  const guesses = records.filter((r) => streetScores.has(r.street))
    .map((r) => ({ r, s: streetScores.get(r.street)!, d: r.number.startsWith(q.number) ? 0 : editDistance(q.number, r.number), p: sharedPrefix(q.number, r.number), gap: Math.abs(+r.number - +q.number) }))
    .filter((x) => x.d <= Math.max(1, Math.floor(q.number.length / 2)))
    .sort((a, b) => a.d - b.d || a.s - b.s || b.p - a.p || a.gap - b.gap || a.r.street.localeCompare(b.r.street)).slice(0, Math.min(limit, 4)).map((x) => x.r)
  return guesses.length ? { kind: 'guess', items: guesses } : { kind: 'none', items: [] }
}

export interface LocalArea { name: string; lon: number; lat: number }
/** Local areas whose name matches the text by prefix or within one edit per word (neighbourhood search). */
export function matchAreas(areas: LocalArea[], raw: string): LocalArea[] {
  const t = String(raw || '').trim().toUpperCase()
  if (t.length < 2 || /^\d/.test(t)) return []
  return areas.map((a) => ({ a, m: streetMatch(t.replace(/[^A-Z\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim(), a.name.toUpperCase().replace(/-/g, ' ')) }))
    .filter((x) => x.m).sort((x, y) => x.m!.distance - y.m!.distance || x.a.name.localeCompare(y.a.name)).slice(0, 4).map((x) => x.a)
}

export function cityPlace(r: CityRecord, approximate: boolean): Place {
  return { label: addressLabel(r), utm: toUtm10(r.lat, r.lon), lon: r.lon, lat: r.lat, kind: 'address', source: 'city', descriptor: 'cityAddress', approximate }
}

// ---------------------------------------------------------------- network layer (consent, offline, timeouts)
const CONSENT_KEY = 'ts.addressSearch.consent'
export function hasConsent(): boolean { try { return localStorage.getItem(CONSENT_KEY) === '1' } catch { return false } }
export function setConsent(on: boolean) { try { if (on) localStorage.setItem(CONSENT_KEY, '1'); else localStorage.removeItem(CONSENT_KEY) } catch { /* storage blocked: ask each session */ } }
export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

async function getJson(fetcher: Fetcher, url: string, ms: number): Promise<unknown> {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), ms)
  try {
    const r = await fetcher(url, { signal: abort.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally { clearTimeout(timer) }
}

let records: Promise<CityRecord[]> | null = null, areas: Promise<LocalArea[]> | null = null, retryAt = 0
/** City civic addresses in the search box, once per session (no typed text is sent; about 0.9 MB). Failures retry after 30 s. */
export function loadCityRecords(fetcher: Fetcher = fetch as unknown as Fetcher): Promise<CityRecord[]> {
  if (records) return records
  if (Date.now() < retryAt) return Promise.resolve([])
  const u = new URL(CITY_ADDRESSES)
  u.searchParams.set('select', 'civic_number,std_street,geo_point_2d')
  u.searchParams.set('where', `in_bbox(geo_point_2d, ${SEARCH_BOX.south}, ${SEARCH_BOX.west}, ${SEARCH_BOX.north}, ${SEARCH_BOX.east})`)
  records = getJson(fetcher, u.href, 15000).then(cityRecords).catch((e) => { records = null; retryAt = Date.now() + 30000; throw e })
  return records
}
/** The City's 22 local areas (names and label points), once per session. */
export function loadLocalAreas(fetcher: Fetcher = fetch as unknown as Fetcher): Promise<LocalArea[]> {
  if (areas) return areas
  const u = new URL(CITY_AREAS)
  u.searchParams.set('select', 'name,geo_point_2d')
  areas = getJson(fetcher, u.href, 15000).then((rows) => (Array.isArray(rows) ? rows : []).map((r: { name?: unknown; geo_point_2d?: { lon?: unknown; lat?: unknown } }) => ({ name: String(r?.name ?? ''), lon: Number(r?.geo_point_2d?.lon), lat: Number(r?.geo_point_2d?.lat) }))
    .filter((a) => a.name && Number.isFinite(a.lon) && Number.isFinite(a.lat))).catch((e) => { areas = null; throw e })
  return areas
}

export type LookupState = { state: 'short' } | { state: 'loading' } | { state: 'ready'; places: Place[] } | { state: 'error'; reason: 'timeout' | 'network' | 'offline' }

/**
 * Live geocoder suggestions (Vista createSuggestionLookup): debounced, aborted when the text changes, stale answers
 * dropped, a small cache (40 queries, 5 minutes); failures are not cached so a later try can recover.
 */
export function createLookup({ fetcher = fetch as unknown as Fetcher, delay = 320, timeout = 8000, now = Date.now, online = isOnline }: { fetcher?: Fetcher; delay?: number; timeout?: number; now?: () => number; online?: () => boolean } = {}) {
  let revision = 0, timer: ReturnType<typeof setTimeout> | null = null, controller: AbortController | null = null
  const cache = new Map<string, { places: Place[]; at: number }>()
  const cancel = () => { revision++; if (timer) clearTimeout(timer); timer = null; controller?.abort(); controller = null }
  function search(raw: string, update: (s: LookupState) => void) {
    cancel()
    const query = String(raw || '').trim(), key = query.toLowerCase().replace(/\s+/g, ' '), mine = revision
    if (query.length < 3 || query.length > 180) { update({ state: 'short' }); return }
    const hit = cache.get(key)
    if (hit && now() - hit.at < 300000) { update({ state: 'ready', places: hit.places }); return }
    if (!online()) { update({ state: 'error', reason: 'offline' }); return }
    update({ state: 'loading' })
    timer = setTimeout(async () => {
      timer = null
      const c = new AbortController(); controller = c
      let timedOut = false
      const deadline = setTimeout(() => { timedOut = true; c.abort() }, timeout)
      try {
        const r = await fetcher(geocoderUrl(query, true), { signal: c.signal })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const places = geocoderPlaces(await r.json(), true)
        if (mine !== revision) return
        cache.delete(key); cache.set(key, { places, at: now() })
        if (cache.size > 40) cache.delete(cache.keys().next().value!)
        update({ state: 'ready', places })
      } catch {
        if (mine === revision) update({ state: 'error', reason: timedOut ? 'timeout' : online() ? 'network' : 'offline' })
      } finally { clearTimeout(deadline); if (controller === c) controller = null }
    }, delay)
  }
  return { search, cancel }
}
