// Site limits in the Your site tab (17 Nov 2026, Sinnie; was Height limits; zoning on the tower's form and the building
// code from data/siteCode.ts added the same day, no mass needed): first what this site itself may reach, read from the
// toolkit's own data (the zoning basic height of the lot, the lowest protected view cone over it, the lower of the
// two), then downtown Vancouver's height policy as researched (data/downtownHeights.ts), one line per fact with its
// source behind "?". The competition site shows the brief's band instead of a zoning reading.
import { useMemo, useState } from 'react'
import { readRule } from '../../engine/heightPolicy'
import { surfacesOver } from '../../engine/heightModel'
import { HEIGHT_BAND_M } from '../../engine/vtcRules'
import type { Pt } from '../../engine/vista'
import { DOWNTOWN_HEIGHTS, LAYER_NAME, type HeightFact } from '../../data/downtownHeights'
import { SITE_CODE } from '../../data/siteCode'

const FACTS = [...DOWNTOWN_HEIGHTS, ...SITE_CODE]
import { useSiteStore } from '../../lib/siteStore'
import { CITY_ORIGIN, useStore } from '../../store'
import { useCityHeights } from '../useHeights'
import { ExternalLink, Ruler } from '../icons'
import Help from '../Help'
import { FlagChip } from '../ui'

const card = 'm-3 rounded-lg border border-accent/35 bg-accent/[0.05] px-3 py-2.5 text-meta shadow-sm'
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')

/** The site's own readings: zoning basic height, lowest cone ceiling above the ground, and the lower of the two. */
function SiteReadings() {
  const site = useSiteStore((s) => s.site)
  const base = useStore((s) => s.groundElevation)
  const { policy, surfaces, groundAt, error } = useCityHeights(true)
  const r = useMemo(() => {
    if (!site || site.ring.length < 3 || !policy || !surfaces) return null
    const ring = site.ring as Pt[]
    const zoning = policy.zoning([ring])
    const rule = readRule(policy, zoning.controlling, zoning.zones.find((z) => z.ruleId === zoning.controlling)?.zone)
    const abs = ring.map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as Pt)
    const cones = surfacesOver(abs, surfaces)
    const low = cones[0]
    const g = low ? groundAt?.(low.at) ?? base : base
    const coneAbove = low ? low.z - g : null
    const z = zoning.status === 'ready' ? zoning.heightM : null
    const limit = z != null && coneAbove != null ? Math.min(z, coneAbove) : z ?? coneAbove
    const by = limit == null ? null : z != null && (coneAbove == null || z <= coneAbove) ? 'zoning' : 'cone'
    return { zoning, rule, cones, low, coneAbove, limit, by }
  }, [site, policy, surfaces, groundAt, base])
  if (error) return <p className="text-muted">Height data could not load: {error}</p>
  if (!r) return <p className="text-muted" role="status">Reading the zoning and the view cones…</p>
  const tile = 'min-w-0 rounded-md border border-line bg-white/70 px-2 py-1.5'
  return (
    <div className="@container"><div className="grid grid-cols-1 gap-1.5 @[20rem]:grid-cols-3" data-testid="site-height-readings">
      <div className={tile} data-reading="zoning">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Zoning</p>
        <p className="font-mono text-base font-semibold leading-tight text-ink">{r.rule.heightM != null ? `${r.rule.heightM} m` : '–'}</p>
        <p className="truncate text-muted" title={r.rule.detail}>{r.rule.heightM != null ? r.rule.label.replace(/^.*?\(/, '').replace(/\)$/, '') : r.rule.label}</p>
      </div>
      <div className={tile} data-reading="cone">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">View cone</p>
        <p className="font-mono text-base font-semibold leading-tight text-ink">{r.coneAbove != null ? `${fmt(r.coneAbove)} m` : 'none'}</p>
        <p className="truncate text-muted" title={r.low ? `${r.low.surface.cone.name}: ${r.low.surface.label}` : 'No protected view passes over this site'}>{r.low ? `${r.low.surface.cone.id} · above ground` : 'no cone over the site'}</p>
      </div>
      <div className={tile} data-reading="limit">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Lower of the two</p>
        <p className="font-mono text-base font-semibold leading-tight text-ink">{r.limit != null ? `${fmt(r.limit)} m` : '–'}</p>
        <p className="truncate text-muted">{r.by === 'zoning' ? 'zoning controls' : r.by === 'cone' ? 'the cone controls' : 'no number yet'}</p>
      </div>
    </div></div>
  )
}

function Fact({ f }: { f: HeightFact }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-1.5 py-1" data-fact={f.id}>
      {/* the label, then its figure under it: the panel is narrow, so neither is cut short (17 Nov) */}
      <span className="min-w-0">
        <span className="block text-ink">{f.label.replace(/^[^·]+· /, '')}</span>
        <span className="block font-mono text-xs font-semibold leading-snug text-ink">{f.value}</span>
      </span>
      <Help label={`About: ${f.label}`}><span className="block">{f.note}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={f.flag} /><a href={f.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">{f.source.label}<ExternalLink size={10} aria-hidden /></a></span>
        <span className="mt-0.5 block text-muted">How it was read: {f.source.read}.</span></Help>
    </li>
  )
}

/** The Site limits summary (17 Nov 2026): height readings, zoning on the tower's form, the building code; no mass needed. */
export default function SiteHeights() {
  const project = useStore((s) => s.project)
  const [more, setMore] = useState(false)
  const layers = (['zoning', 'form', 'code', 'policy', 'views', 'built'] as const)
  return (
    <section aria-labelledby="site-heights-title" data-testid="site-heights" className={card}>
      <h3 id="site-heights-title" className="flex items-center gap-1.5 text-xs font-semibold text-accent"><Ruler size={14} aria-hidden />Site limits
        <Help label="About the site limits">What zoning and the building code set for a tower on this site, read from the site alone (no mass needed). Height: the Downtown Official Development Plan's zoning height for the lot and the protected view cones over it, from the toolkit's own data. Tower form: the Downtown South Guidelines' separation, floor plate and setbacks. Building code: the Vancouver Building By-law 2025 rules every downtown tower meets, from the Downtown Massing Tool's rule data. All flagged unverified: check against the by-laws before quoting. Place a tower and the Site limits tool measures it against them.</Help>
      </h3>
      <div className="mt-1.5 grid gap-2">
        {project === 'city' ? <SiteReadings /> : (
          <div className="rounded-md border border-line bg-white/70 px-2 py-1.5" data-testid="vtc-height-band">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">The brief</p>
            <p className="font-mono text-base font-semibold leading-tight text-ink">{HEIGHT_BAND_M[0]}–{HEIGHT_BAND_M[1]} m</p>
            <p className="text-muted">800–1,000 ft: above every downtown policy height; the competition sets its own.</p>
          </div>
        )}
        <ul className="divide-y divide-line" data-testid="downtown-heights">
          {layers.filter((l) => more || l === 'zoning' || l === 'form' || l === 'code').map((l) => (
            <li key={l} className="py-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{LAYER_NAME[l]}</p>
              <ul>{FACTS.filter((f) => f.layer === l).map((f) => <Fact key={f.id} f={f} />)}</ul>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="justify-self-start text-meta text-accent hover:underline">{more ? 'Fewer' : 'Higher buildings, views, sun, the tallest built'}</button>
      </div>
    </section>
  )
}
