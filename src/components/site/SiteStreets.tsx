// The streets along the Real Vancouver study site (Ruijie, 7 Nov): each with its City name, its right-of-way measured
// across to the facing lots, the site's frontage on it, and the street type the user picks (Retail · Arterial · Local),
// never guessed. A lane is marked as a lane. Shown in Your site and in Ground & public realm; the public realm checks
// read the same types (lib/siteStreets.ts keeps them in the study site, so they save and undo with the design).
import type { SiteStreet, CityStreetType } from '../../engine/siteStreets'
import { useStore } from '../../store'
import { setStreetType, STREETS_SOURCE, useSiteStreets } from '../../lib/siteStreets'
import Help from '../Help'
import { Route } from '../icons'
import { U } from '../Units'
import type { PlanStreet } from './SitePlan'

export const STREET_TYPE_LABEL: Record<CityStreetType, string> = { retail: 'Retail', arterial: 'Arterial', local: 'Local' }
export const STREET_TYPE_HINT: Record<CityStreetType, string> = {
  retail: 'Retail high street: continuous shopfronts, about 90% active frontage, no driveways',
  arterial: 'Arterial: a main through street, about 70% active frontage, no driveways',
  local: 'Local street: quieter; driveways and loading may come off it',
}
export const STREET_TYPE_COLOR: Record<CityStreetType | 'none' | 'lane', string> = { retail: '#c0367a', arterial: '#d98b1c', local: '#1d5fa8', none: '#8a8f98', lane: '#a3aab3' }

export const rowHint = (s: SiteStreet) => s.basis === 'parcels'
  ? `${s.row.toFixed(1)} m right-of-way, measured across to the facing lots (${s.rowRange[0].toFixed(1)}–${s.rowRange[1].toFixed(1)} m over ${s.rays} lines); unverified until surveyed`
  : `${s.row.toFixed(1)} m: twice the distance to the City centreline (no facing lot found); unverified`

/** The streets as plan bands, coloured by the type picked (grey dashed: not picked). */
export function planStreets(streets: SiteStreet[], types: Record<string, { type: CityStreetType | null } | undefined>): PlanStreet[] {
  return streets.map((s) => {
    const t = s.kind === 'lane' ? 'lane' : types[s.key]?.type ?? 'none'
    return { edges: s.edges, row: s.row, color: STREET_TYPE_COLOR[t], dashed: t === 'none', label: s.name }
  })
}

export default function SiteStreets() {
  const site = useStore((s) => s.citySite)
  const { result, status, error } = useSiteStreets()
  if (!site) return null
  const head = (
    <div className="mb-1 flex items-center gap-1.5 text-meta font-semibold text-ink">
      <Route size={13} className="text-accent" aria-hidden />Streets
      <Help label="About the streets">Names from the City street centrelines. Each width is measured across the street to the lots facing the site, along lines every 4 m. The Toolkit has no City street classification, so you pick each type: the public realm checks read it. Source: {STREETS_SOURCE}.</Help>
    </div>
  )
  if (status === 'error') return <div data-testid="site-streets" className="mt-2">{head}<p className="text-red-800">The street layer did not load ({error}).</p></div>
  if (!result) return <div data-testid="site-streets" className="mt-2">{head}<p className="text-muted">Finding the streets along the site…</p></div>
  if (!result.streets.length) return <div data-testid="site-streets" className="mt-2">{head}<p className="text-muted">No street along this site (shared lot lines or open ground all round).</p></div>
  const open = result.streets.filter((s) => s.kind === 'street' && !site.streets?.[s.key]?.type).length
  return (
    <div data-testid="site-streets" className="mt-2">
      {head}
      <ul className="grid gap-1">
        {result.streets.map((st) => {
          const type = site.streets?.[st.key]?.type ?? null
          return (
            <li key={st.key} data-street={st.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: STREET_TYPE_COLOR[st.kind === 'lane' ? 'lane' : type ?? 'none'] }} />
              <span className="min-w-0 flex-1 truncate font-medium text-ink" title={`${st.name}: the site has ${Math.round(st.frontage)} m of frontage on it`}>{st.name}</span>
              <span className="tabular-nums text-muted" title={rowHint(st)}><U>{`${st.row.toFixed(1)} m`}</U></span>
              {st.kind === 'lane' ? <span className="w-[150px] text-center text-muted" title="A lane: no streetwall or frontage rules; access and loading belong here">Lane</span> : (
                <div role="radiogroup" aria-label={`${st.name} street type`} className="flex w-[150px] gap-0.5">
                  {(['retail', 'arterial', 'local'] as const).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={type === t} title={STREET_TYPE_HINT[t]}
                      onClick={() => setStreetType(st.key, type === t ? null : t)}
                      className={`flex-1 rounded-md px-1 py-0.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${type === t ? 'bg-accent font-semibold' : 'bg-white/45 text-muted hover:text-ink'}`}>{STREET_TYPE_LABEL[t]}</button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {open > 0 && <p className="mt-1 text-meta text-muted">{open === 1 ? 'One street has' : `${open} streets have`} no type yet: the street rules that depend on it stay open.</p>}
    </div>
  )
}
