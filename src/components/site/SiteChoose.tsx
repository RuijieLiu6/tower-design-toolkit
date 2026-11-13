// The Site tab of the set-up panel (Sinnie, 12 Nov: "in the site left panel, users should have options to: select site or
// import site"; the Your site card is gone from here). Two choices: Select site (an address, the map, or the default
// block: the Site step's own tools, SiteStart.tsx) and Import site (a boundary file: GeoJSON, as Results › Study site).
import { useEffect, useRef, useState } from 'react'
import { FileUp } from '../icons'
import { TOOL_ICONS } from '../../data/icons'
import IconTile from '../IconTile'
import type { Pt } from '../../engine/site'
import { ringMetrics, validateRing } from '../../engine/site'
import { readSiteBoundary, setSiteBoundary } from '../../lib/siteImport'
import { tell, useSiteStep } from '../../lib/siteActions'
import { useStore } from '../../store'
import { useCityData } from '../CityContext'
import { AddressSearch, placeSiteAt, zoomTo } from '../SitePanel'
import { DefaultSite, PickOnMap } from './SiteStart'

type Choice = 'select' | null
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')

export default function SiteChoose() {
  const project = useStore((s) => s.project)
  const site = useStore((s) => s.citySite)
  const { data } = useCityData()
  const [choice, setChoice] = useState<Choice>(site ? null : 'select')
  const fileRef = useRef<HTMLInputElement>(null)
  // Select site open = the map may choose another site; a new site closes it and locks the map again.
  useEffect(() => { useSiteStep.setState({ reselect: choice === 'select' }) }, [choice])
  useEffect(() => () => useSiteStep.setState({ reselect: false }), [])
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } if (site) setChoice(null) }, [site])
  if (project !== 'city') return <p className="px-3 py-3 text-meta text-muted">The competition block is fixed by the brief: nothing to select or import.</p>
  const onPlace = (p: Pt, label: string, source: string) => placeSiteAt(p, label, source, data?.footprints)
  const onFile = async (f: File | undefined) => {
    if (!f) return
    try { zoomTo(setSiteBoundary(f.name, await readSiteBoundary(f))); setChoice(null) }
    catch (err) { tell(`Could not import the site: ${(err as Error).message}`) }
    if (fileRef.current) fileRef.current.value = ''
  }
  const area = site && !validateRing(site.ring) ? ringMetrics(site.ring).area : null
  return (
    <div data-testid="site-choose" className="text-meta">
      {/* The toolkit's own tool icons (IconTile: GlassIcon with the filled drawing, hue from the word), as the Site step. */}
      <div className="flex gap-2 px-3 pt-3">
        <IconTile icon={TOOL_ICONS['site']} word="Site" label="Select site" data-testid="site-select" aria-expanded={choice === 'select'} active={choice === 'select'}
          onClick={() => setChoice(choice === 'select' ? null : 'select')} hint="Type an address, click a lot or buildings on the map, or take the default block." />
        <IconTile icon={FileUp} word="Import" label="Import site" data-testid="site-import" onClick={() => fileRef.current?.click()}
          hint="The site boundary from a GeoJSON file (EPSG:26910 or WGS84). Read in this browser; nothing is uploaded." />
        <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Site boundary GeoJSON file" />
      </div>
      {site && area != null && <p data-testid="site-current" className="truncate px-3 pt-2 text-muted" title={site.label ?? undefined}>Current: <span className="text-ink">{site.label ?? 'Study site'}</span> · {fmt(area)} m²</p>}
      {choice === 'select' && (
        <div data-testid="site-select-tools" className="mt-2 space-y-3 border-t border-line px-3 py-3">
          <div><h4 className="mb-1 font-semibold text-ink">Address</h4><AddressSearch onPlace={onPlace} bare /></div>
          <div><h4 className="mb-1 font-semibold text-ink">On the map</h4><PickOnMap /></div>
          <DefaultSite bare />
        </div>
      )}
    </div>
  )
}
