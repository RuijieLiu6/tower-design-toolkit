// Massing stage, competition site: the few inputs the public realm checks need that Layer 0 cannot carry
// (research P06-M01, M03, M04). Every starting value is a team assumption to be replaced by the design.
import { DEFAULT_PUBLIC_REALM, VTC_EDGES, VTC_SITE, type EdgeId, type FrontageInput, type PublicRealmInput } from '../engine/publicRealm'
import { useStore } from '../store'
import { FlagChip, NumberField, Section, Toggle } from './ui'

const cell = 'w-full rounded border border-line bg-panel px-1 py-0.5 text-right text-[11px] tabular-nums'

export default function PublicRealmPanel() {
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
          <p className="mt-1 text-[10px] text-muted">Shares of the building frontage on each street. Hotel lobbies and transit entrances count active; office and residential lobbies semi-active.</p>
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
