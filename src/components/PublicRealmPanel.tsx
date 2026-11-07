// Massing stage, competition site: the few inputs the public realm checks need that Layer 0 cannot carry
// (research P06-M01, M03, M04). Every starting value is a team assumption to be replaced by the design.
import { cityFrontageInput, DEFAULT_PUBLIC_REALM, siteFrame, VTC_EDGES, VTC_SITE, type EdgeId, type FrontageInput, type PublicRealmInput } from '../engine/publicRealm'
import { DEFAULT_CITY_LINK } from '../engine/siteStreets'
import { setCityLink, setStation, setStreetSetting, useSiteStreets } from '../lib/siteStreets'
import { useStore } from '../store'
import { FlagChip, NumberField, Section, Toggle } from './ui'
import Help from './Help'
import SiteStreets from './site/SiteStreets'

const cell = 'w-full rounded border border-line bg-panel px-1 py-0.5 text-right text-[11px] tabular-nums'

export default function PublicRealmPanel() {
  const project = useStore((s) => s.project)
  return project === 'city' ? <CityPublicRealmPanel /> : <VtcPublicRealmPanel />
}

/**
 * Real Vancouver (7 Nov): the study site's streets with the type you pick, each street's frontage, the share of open
 * ground that is public, a mid-block link across or along the site, and whether a station entrance is on or next to it.
 * Every value is saved in the study site (undoable); starting values are team assumptions.
 */
function CityPublicRealmPanel() {
  const site = useStore((s) => s.citySite)
  const input = useStore((s) => s.publicRealm)
  const set = useStore((s) => s.set)
  const { result } = useSiteStreets()
  if (!site) return <Section title="Public realm (human scale, 40%)"><p className="text-xs text-muted">Choose a study site in the Site step: the street, frontage and link inputs read its streets.</p></Section>
  const streets = (result?.streets ?? []).filter((x) => x.kind === 'street')
  const L = site.link ?? DEFAULT_CITY_LINK
  const f = siteFrame(site.ring as [number, number][])
  const loc = site.ring.map((p) => f.toLocal(p as [number, number]))
  const axis = L.along ? 1 : 0
  const lo = Math.min(...loc.map((p) => p[axis])), hi = Math.max(...loc.map((p) => p[axis]))
  const span = [Math.ceil(lo + L.width / 2), Math.floor(hi - L.width / 2)]
  const upPr = (patch: Partial<PublicRealmInput>) => set({ publicRealm: { ...input, ...patch } })
  return (
    <Section title="Public realm (human scale, 40%)">
      <div className="grid gap-3 text-xs" data-testid="city-public-realm">
        <SiteStreets />
        {streets.length > 0 && (
          <div>
            <div className="mb-1 font-medium">Street frontage at grade</div>
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                <th className="py-0.5 font-medium">Street</th><th className="w-12 text-right font-medium">Active %</th><th className="w-12 text-right font-medium">Doors</th><th className="w-12 text-right font-medium">Canopy %</th><th className="w-12 text-right font-medium">Drive-ways</th>
              </tr></thead>
              <tbody>
                {streets.map((st) => {
                  const v = cityFrontageInput(st, site.streets?.[st.key])
                  const up = (patch: Partial<FrontageInput>) => setStreetSetting(st.key, patch)
                  return (
                    <tr key={st.key} className="border-t border-line/60">
                      <td className="py-1 pr-1" title={`${st.row.toFixed(1)} m right-of-way; ${Math.round(st.frontage)} m of site frontage`}>{st.name}</td>
                      <td className="px-0.5"><input type="number" step={5} min={0} max={100} value={Math.round(v.active * 100)} onChange={(ev) => up({ active: Math.min(1, Math.max(0, Number(ev.target.value) / 100)) })} className={cell} aria-label={`${st.name} active share`} /></td>
                      <td className="px-0.5"><input type="number" step={1} min={0} value={v.entrances} onChange={(ev) => up({ entrances: Math.max(0, Math.round(Number(ev.target.value))) })} className={cell} aria-label={`${st.name} entrances`} /></td>
                      <td className="px-0.5"><input type="number" step={5} min={0} max={100} value={Math.round(v.canopy * 100)} onChange={(ev) => up({ canopy: Math.min(1, Math.max(0, Number(ev.target.value) / 100)) })} className={cell} aria-label={`${st.name} weather protection share`} /></td>
                      <td className="px-0.5"><input type="number" step={1} min={0} value={v.crossings} onChange={(ev) => up({ crossings: Math.max(0, Math.round(Number(ev.target.value))) })} className={cell} aria-label={`${st.name} driveways and loading doors`} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">Shares of each street's building frontage<Help label="About frontage shares">Starting values follow the street's type (the competition's, scaled to this frontage); picking a type resets them. Hotel lobbies and transit entrances count as active; office and residential lobbies as semi-active.</Help></p>
          </div>
        )}

        <NumberField label="Unbuilt site that is public (secured by right-of-way)" unit="%" value={Math.round(input.openPublicShare * 100)} onChange={(v) => upPr({ openPublicShare: Math.min(1, Math.max(0, v / 100)) })} min={0} max={100} step={5}
          hint="The rest is drop-off, loading or private" />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">Mid-block connection</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted"><Toggle checked={L.enabled} onChange={() => setCityLink({ enabled: !L.enabled })} label="Mid-block connection" />{L.enabled ? 'On' : 'Off'}</span>
          </div>
          {L.enabled && (
            <div className="grid gap-2">
              <div className="flex rounded-md bg-black/5 p-0.5" role="radiogroup" aria-label="Link direction">
                {([false, true] as const).map((a) => (
                  <button key={String(a)} type="button" role="radio" aria-checked={L.along === a} onClick={() => setCityLink({ along: a, offset: 0 })}
                    className={`flex-1 rounded px-2 py-1 text-[11px] ${L.along === a ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{a ? 'Along the site' : 'Across the site'}</button>
                ))}
              </div>
              <NumberField label={L.along ? 'Position from the site centre, across its long side' : 'Position from the site centre, along its long side'} unit="m" value={L.offset}
                onChange={(v) => setCityLink({ offset: Math.min(span[1], Math.max(span[0], v)) })} min={span[0]} max={span[1]} step={1} />
              <NumberField label="Width, building face to building face" unit="m" value={L.width} onChange={(v) => setCityLink({ width: Math.max(1, v) })} step={0.1} hint="9.1 m on large sites and by station entrances (CDDG S1.12.2c)" />
              <label className="flex items-center gap-2"><input type="checkbox" checked={L.openToSky} onChange={() => setCityLink({ openToSky: !L.openToSky })} />Open to the sky</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={L.srw} onChange={() => setCityLink({ srw: !L.srw })} />Secured by a statutory right-of-way</label>
            </div>
          )}
        </div>

        <div>
          <label className="grid gap-1">
            <span className="flex items-center gap-1 font-medium">Station entrance on or next to the site<Help label="About the station entrance">The Toolkit has no station-entrance layer, so it asks. A station entrance on or next to the site makes a mid-block link required (CDDG S1.12.1b) and brings in the transit plaza (S4.4.1) and the entrance's lift, stair and active edges (G4.4.2).</Help></span>
            <select value={site.station ?? ''} onChange={(e) => setStation(e.target.value === '' ? null : e.target.value)} className="rounded border border-line bg-panel px-1.5 py-1 text-xs" aria-label="Station entrance on or next to the site" data-testid="city-station">
              <option value="">Not answered</option>
              <option value="none">None on or next to the site</option>
              {streets.map((st) => <option key={st.key} value={st.key}>On {st.name}</option>)}
            </select>
          </label>
          {site.station && site.station !== 'none' && (
            <div className="mt-2 grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Lifts" value={input.station.lifts} onChange={(v) => upPr({ station: { ...input.station, lifts: Math.max(0, Math.round(v)) } })} step={1} />
                <NumberField label="Stairs" value={input.station.stairs} onChange={(v) => upPr({ station: { ...input.station, stairs: Math.max(0, Math.round(v)) } })} step={1} />
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={input.station.activeEdges} onChange={() => upPr({ station: { ...input.station, activeEdges: !input.station.activeEdges } })} />Active uses and a view to the concourse</label>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Starting values for a first design: replace them with yours.</span></div>
      </div>
    </Section>
  )
}

function VtcPublicRealmPanel() {
  const input = useStore((s) => s.publicRealm)
  const set = useStore((s) => s.set)
  const up = (patch: Partial<PublicRealmInput>) => set({ publicRealm: { ...input, ...patch } })
  const upEdge = (id: EdgeId, patch: Partial<FrontageInput>) => up({ frontage: { ...input.frontage, [id]: { ...input.frontage[id], ...patch } } })
  const L = input.link
  const span = L.axis === 'ns' ? [VTC_SITE.xMin + L.width / 2, VTC_SITE.xMax - L.width / 2] : [VTC_SITE.yMin + L.width / 2, VTC_SITE.yMax - L.width / 2]

  return (
    <Section title="Public realm (human scale, 40%)">
      <div className="grid gap-3 text-xs">
        <div>
          <div className="mb-1 font-medium">Street frontage at grade</div>
          <table className="w-full text-[11px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="py-0.5 font-medium">Street</th><th className="w-12 text-right font-medium">Active %</th><th className="w-12 text-right font-medium">Doors</th><th className="w-12 text-right font-medium">Canopy %</th><th className="w-12 text-right font-medium">Drive-ways</th>
            </tr></thead>
            <tbody>
              {VTC_EDGES.map((e) => {
                const f = input.frontage[e.id]
                return (
                  <tr key={e.id} className="border-t border-line/60">
                    <td className="py-1 pr-1" title={`${e.row.toFixed(1)} m right-of-way`}>{e.street.replace(' (local)', '')}</td>
                    <td className="px-0.5"><input type="number" step={5} min={0} max={100} value={Math.round(f.active * 100)} onChange={(ev) => upEdge(e.id, { active: Math.min(1, Math.max(0, Number(ev.target.value) / 100)) })} className={cell} aria-label={`${e.street} active share`} /></td>
                    <td className="px-0.5"><input type="number" step={1} min={0} value={f.entrances} onChange={(ev) => upEdge(e.id, { entrances: Math.max(0, Math.round(Number(ev.target.value))) })} className={cell} aria-label={`${e.street} entrances`} /></td>
                    <td className="px-0.5"><input type="number" step={5} min={0} max={100} value={Math.round(f.canopy * 100)} onChange={(ev) => upEdge(e.id, { canopy: Math.min(1, Math.max(0, Number(ev.target.value) / 100)) })} className={cell} aria-label={`${e.street} weather protection share`} /></td>
                    <td className="px-0.5"><input type="number" step={1} min={0} value={f.crossings} onChange={(ev) => upEdge(e.id, { crossings: Math.max(0, Math.round(Number(ev.target.value))) })} className={cell} aria-label={`${e.street} driveways and loading doors`} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">Shares of each street's building frontage<Help label="About frontage shares">Hotel lobbies and transit entrances count as active; office and residential lobbies as semi-active.</Help></p>
        </div>

        <NumberField label="Unbuilt site that is public (secured by right-of-way)" unit="%" value={Math.round(input.openPublicShare * 100)} onChange={(v) => up({ openPublicShare: Math.min(1, Math.max(0, v / 100)) })} min={0} max={100} step={5}
          hint="The rest is drop-off, loading or private" />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">Mid-block connection</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted"><Toggle checked={L.enabled} onChange={() => up({ link: { ...L, enabled: !L.enabled } })} label="Mid-block connection" />{L.enabled ? 'On' : 'Off'}</span>
          </div>
          {L.enabled && (
            <div className="grid gap-2">
              <div className="flex rounded-md bg-black/5 p-0.5" role="radiogroup" aria-label="Link direction">
                {(['ns', 'ew'] as const).map((a) => (
                  <button key={a} role="radio" aria-checked={L.axis === a} onClick={() => up({ link: { ...L, axis: a, offset: 0 } })}
                    className={`flex-1 rounded px-2 py-1 text-[11px] ${L.axis === a ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{a === 'ns' ? 'North–south (retail street to north)' : 'East–west (arterial to east)'}</button>
                ))}
              </div>
              <NumberField label={L.axis === 'ns' ? 'Position east of the block centre' : 'Position north of the block centre'} unit="m" value={L.offset}
                onChange={(v) => up({ link: { ...L, offset: Math.min(span[1], Math.max(span[0], v)) } })} min={Math.ceil(span[0])} max={Math.floor(span[1])} step={1} />
              <NumberField label="Width, building face to building face" unit="m" value={L.width} onChange={(v) => up({ link: { ...L, width: Math.max(1, v) } })} step={0.1} hint="9.1 m on this site (CDDG S1.12.2c)" />
              <label className="flex items-center gap-2"><input type="checkbox" checked={L.openToSky} onChange={() => up({ link: { ...L, openToSky: !L.openToSky } })} />Open to the sky</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={L.srw} onChange={() => up({ link: { ...L, srw: !L.srw } })} />Secured by a statutory right-of-way</label>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 font-medium">Below-grade station entrance</div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Lifts" value={input.station.lifts} onChange={(v) => up({ station: { ...input.station, lifts: Math.max(0, Math.round(v)) } })} step={1} />
            <NumberField label="Stairs" value={input.station.stairs} onChange={(v) => up({ station: { ...input.station, stairs: Math.max(0, Math.round(v)) } })} step={1} />
          </div>
          <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={input.station.activeEdges} onChange={() => up({ station: { ...input.station, activeEdges: !input.station.activeEdges } })} />Active uses and a view to the concourse</label>
        </div>

        <div className="flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Starting values for a first design: replace them with yours.</span>
          <button onClick={() => set({ publicRealm: DEFAULT_PUBLIC_REALM })} className="ml-auto text-[10px] text-accent hover:underline">Reset</button>
        </div>
      </div>
    </Section>
  )
}
