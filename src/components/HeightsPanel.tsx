// Results for "Height references & suggestion" (built.heights, Real Vancouver), after Vista v37 (Ruijie Liu): the
// selected tower's site read against Vista's zoning height references and every view cone over it (City-sourced
// estimates and Vista study surfaces, kept visibly apart), Vista's stacked-block suggestion naming what controls it,
// the map layer, and the method with its limits. Engines: engine/heightPolicy.ts, engine/heightModel.ts.
import { readRule } from '../engine/heightPolicy'
import type { ConeSurface } from '../engine/heightModel'
import { POLICY_FILE } from '../engine/heightPolicy'
import { useHeightPolicy } from '../lib/heightData'
import { useStore, useTowers } from '../store'
import { useHeightSurface } from './HeightSurface'
import { FlagChip, Section } from './ui'
import { U } from './Units'
import { useTowerHeights } from './useHeights'
import ImagineSection from './heights/ImagineSection'

const m = (v: number, d = 1) => `${v.toFixed(d)} m`
const KIND: Record<ConeSurface['kind'], string> = { estimate: 'City-sourced estimate', study: 'Study surface (Vista Imagine default): assumption, not a City ceiling' }

export default function HeightsPanel() {
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const { heights, error, loading } = useTowerHeights(t)
  const { policy } = useHeightPolicy()
  const showMap = (mode: 'cones' | 'zoning' | 'suggestion') => useHeightSurface.setState({ on: true, mode, area: 'site', hover: null })
  if (error) return <Section title="Height references"><p role="alert" className="text-[11px] text-flag-unresolved">Zoning references did not load: {error}</p></Section>
  if (!t || loading || !heights) return <Section title="Height references"><p className="text-[11px] text-muted" role="status">Loading the zoning references and cone surfaces…</p></Section>
  const s = heights.stack
  const z = heights.zoning
  return (
    <>
      <Section title={`Height suggestion · ${t.name}`}>
        {!s || s.status === 'none' ? <p className="text-[11px]">{s?.notes[0] ?? 'Nothing to suggest here.'}</p>
          : s.status === 'unsupported' || s.status === 'no_positive_height' ? <p className="text-[11px]">{s.notes[0]}</p> : (
          <div className="space-y-1 text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <span>Now <b className="text-ink"><U>{m(s.currentHeightM)}</U></b> above the base (<U>{m(heights.base)}</U>)</span>
              <span>{s.status === 'partial' ? 'Cones allow' : 'Suggested'} up to <b className="text-ink"><U>{m(s.maxHeightM as number)}</U></b></span>
            </div>
            {s.controlling && <div className="flex flex-wrap items-center gap-1">Set by {s.controlling.label}{s.controlPart && s.controlPart !== 'whole tower' ? `, over block ${s.controlPart}` : ''} <FlagChip flag={s.controlling.flag} /></div>}
            {s.intrusion ? <div className="text-flag-unresolved">The tower is <U>{m(s.currentHeightM - (s.maxHeightM as number))}</U> over. Adjust in the left panel (Height suggestion) scales every block together, one undo step.</div>
              : <div>Clears by <U>{m((s.maxHeightM as number) - s.currentHeightM)}</U>.</div>}
            {s.notes.map((n) => <div key={n} className={/assumption|no zoning/i.test(n) ? 'text-flag-unresolved' : 'text-muted'}>{n}</div>)}
            <p className="text-[11px] text-muted">Vista's stacked-block rule: each block's top must clear the lowest surface over that block's own footprint by 0.1 m; blocks keep at least 1 m. A study height, not a City height entitlement.</p>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
          <span className="text-muted">On the map:</span>
          {(['suggestion', 'zoning', 'cones'] as const).map((k) => (
            <button key={k} type="button" onClick={() => showMap(k)} className="rounded border border-line bg-white px-1.5 py-0.5 text-ink hover:bg-slate-50">{k === 'suggestion' ? 'Suggestion' : k === 'zoning' ? 'Zoning heights' : 'View cones'}</button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted">The map readout gives the same answer at any point; clicking a parcel (Context layers › Parcels) reads its lot.</p>
      </Section>

      <Section title="Zoning height reference">
        <div className="space-y-1 text-[11px]">
          <p className="text-muted">Read over {heights.zoningOver === 'site' ? 'the study site (Vista view studies › Site boundary)' : "the tower's blocks (draw or pick a study site to read the whole lot)"}.</p>
          {z && (z.status === 'ready' ? <p>Basic height <b className="text-ink"><U>{m(z.heightM as number)}</U></b> ({z.controlling}), the lowest of the districts the site overlaps.</p>
            : <p className="text-flag-unresolved"><b>No zoning number</b>{z.status === 'partial' ? ': some of the districts here have one, not all' : ''}. No height is guessed.</p>)}
          {policy && z?.zones.map((zone) => {
            const r = readRule(policy, zone.ruleId, zone.zone), rule = policy.rules[zone.ruleId]
            return (
              <div key={zone.id} className="rounded border border-line px-1.5 py-1">
                <div className="flex flex-wrap items-center gap-1"><b className="text-ink">{zone.zone}</b> · {r.heightM !== null ? <><U>{m(r.heightM)}</U> basic height</> : r.label} <FlagChip flag={r.flag} /></div>
                <div className="text-muted">{r.detail}</div>
                {rule && typeof rule.conditions !== 'string' && rule.conditions.length > 0 && <ul className="ml-3 list-disc text-muted">{rule.conditions.map((c) => <li key={c}>{c}</li>)}</ul>}
                {rule?.sourceUrl && <a className="text-accent underline" href={rule.sourceUrl} target="_blank" rel="noreferrer">{/cd1-bylaws|guidelines\.vancouver/.test(rule.sourceUrl) ? 'City by-law index' : `By-law${rule.section ? ` ${rule.section}` : ''}`}</a>}
              </div>
            )
          })}
          {z?.notes.filter((n) => /coverage|budget|Invalid/.test(n)).map((n) => <p key={n} className="text-flag-unresolved">{n}</p>)}
        </div>
      </Section>

      <Section title="View cones over the tower">
        {heights.cones.length ? (
          <div className="space-y-1 text-[11px]">
            {heights.cones.map((h) => (
              <div key={h.surface.cone.id} className={`rounded border px-1.5 py-1 ${h.surface.kind === 'study' ? 'border-dashed border-line' : 'border-line'}`}>
                <div className="flex flex-wrap items-center gap-1">
                  <b className="text-ink">{h.surface.cone.id}</b> {h.surface.cone.name} · lowest <U>{m(h.z)}</U>{h.surface.u95 ? <> ±<U>{`${h.surface.u95} m`}</U></> : null} geodetic, <U>{m(h.z - heights.base)}</U> above the base
                  <FlagChip flag={h.surface.flag} />
                </div>
                <div className={h.surface.kind === 'study' ? 'text-flag-unresolved' : 'text-muted'}>{KIND[h.surface.kind]}</div>
                <details className="text-muted"><summary className="cursor-pointer">Source</summary>{h.surface.source}</details>
              </div>
            ))}
            <p className="text-[11px] text-muted">A "clears" next to a study surface only means it clears an assumption.</p>
          </div>
        ) : <p className="text-[11px]">No protected view cone over the tower.</p>}
      </Section>

      <ImagineSection />

      <Section title="Method and limits">
        <div className="space-y-1 text-[11px] text-muted">
          <p>Zoning references: {POLICY_FILE.vista} (SHA-256 {POLICY_FILE.sha256.slice(0, 8)}…), converted from Vista's frame to EPSG:26910 through latitude and longitude. A lot counts a district only above max(0.25 m², 0.01% of the lot), Vista's parcel rule. Numbers are Vista's transcriptions of the by-law schedules: unverified until someone opens them. DD, CD-1 and untranscribed districts have no number.</p>
          <p>View cones: the 8 City-sourced estimates stay as in the View-cone height check; the other 16 use Vista's Imagine default study surface, rebuilt on the Real Vancouver terrain. The suggestion is the lowest of the zoning number and every cone surface over the footprint, 0.1 m below it.</p>
          {policy && <ul className="ml-3 list-disc">{policy.meta.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
          {policy && <p>{policy.meta.attribution}</p>}
        </div>
      </Section>
    </>
  )
}
